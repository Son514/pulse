import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateSession, jsonError, jsonNoStore } from "@/lib/auth";
import { isSessionId } from "@/lib/session";
import { PENDING_TTL_MS } from "@/lib/presence";
import type { SignalType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

const MAX_PAYLOAD = 64 * 1024; // SDP/ICE are small; cap to be safe.
const MAX_PENDING_SIGNALS = 100; // per recipient, until they drain the mailbox

const PAIR_SELECT = {
  busy: true,
  peerId: true,
  pendingPeerId: true,
  pendingSince: true,
} as const;

type PairRow = {
  busy: boolean;
  peerId: string | null;
  pendingPeerId: string | null;
  pendingSince: Date | null;
};

// POST /api/signal — body { fromId, toId, type, payload? }
// Authenticated AND paired: control messages are only accepted between the two
// sessions the server has recorded as requesting/connected. This stops a valid
// user from flipping an unrelated user's busy flag or ending their call.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid body");
  }

  const { fromId, toId, type, payload } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isSessionId(fromId) || !isSessionId(toId)) {
    return jsonError(400, "invalid ids");
  }
  if (fromId === toId) return jsonError(400, "cannot signal yourself");
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return jsonError(400, "invalid type");
  }
  if (
    payload !== undefined &&
    payload !== null &&
    (typeof payload !== "string" || payload.length > MAX_PAYLOAD)
  ) {
    return jsonError(400, "invalid payload");
  }

  const auth = await authenticateSession(request, fromId);
  if (auth instanceof Response) return auth;

  const signalType = type as SignalType;
  const payloadStr = typeof payload === "string" ? payload : null;

  const sender = await prisma.presence.findUnique({
    where: { id: fromId },
    select: PAIR_SELECT,
  });
  if (!sender) return jsonError(401, "unknown session");

  const target = await prisma.presence.findUnique({
    where: { id: toId },
    select: PAIR_SELECT,
  });

  // A session that has left is gone; only a request has a meaningful answer.
  if (!target) {
    if (signalType === "request") {
      await sendDecline(toId, fromId);
      return jsonNoStore({ ok: true, autoDeclined: true });
    }
    if (signalType === "decline" || signalType === "end") {
      await freeSession(fromId);
      return jsonNoStore({ ok: true, offline: true });
    }
    return jsonError(404, "target offline");
  }

  const senderPendingWith = isPendingWith(sender, toId);
  const targetPendingWith = isPendingWith(target, fromId);
  const activePair = sender.peerId === toId && target.peerId === fromId;
  const pendingPair = senderPendingWith && targetPendingWith;

  if (signalType === "request") {
    if (target.busy) {
      await sendDecline(toId, fromId);
      return jsonNoStore({ ok: true, autoDeclined: true });
    }
    // A different outstanding request makes this target temporarily busy.
    if (target.pendingPeerId && !targetPendingWith) {
      await sendDecline(toId, fromId);
      return jsonNoStore({ ok: true, autoDeclined: true });
    }
    if (sender.busy) return jsonError(409, "already in a connection");
    if (sender.pendingPeerId && !senderPendingWith) {
      return jsonError(409, "already requesting");
    }
    if (await mailboxFull(toId)) return jsonError(429, "mailbox full");

    const now = new Date();
    await prisma.presence.update({
      where: { id: fromId },
      data: { pendingPeerId: toId, pendingSince: now },
    });
    await prisma.presence.update({
      where: { id: toId },
      data: { pendingPeerId: fromId, pendingSince: now },
    });
    await createSignal(fromId, toId, signalType, payloadStr);
    return jsonNoStore({ ok: true });
  }

  if (signalType === "accept") {
    if (!pendingPair) return jsonError(409, "no pending request");
    await prisma.presence.update({
      where: { id: fromId },
      data: {
        busy: true,
        peerId: toId,
        pendingPeerId: null,
        pendingSince: null,
      },
    });
    await prisma.presence.update({
      where: { id: toId },
      data: {
        busy: true,
        peerId: fromId,
        pendingPeerId: null,
        pendingSince: null,
      },
    });
    await createSignal(fromId, toId, signalType, payloadStr);
    return jsonNoStore({ ok: true });
  }

  if (signalType === "decline") {
    if (!pendingPair) return jsonError(409, "no pending request");
    await clearPair(fromId, toId);
    await createSignal(fromId, toId, signalType, payloadStr);
    return jsonNoStore({ ok: true });
  }

  if (signalType === "end") {
    // Cancelling a request and hanging up an active call are both valid, but
    // only between the paired sessions.
    if (!activePair && !pendingPair) return jsonError(409, "not connected");
    await clearPair(fromId, toId);
    await createSignal(fromId, toId, signalType, payloadStr);
    return jsonNoStore({ ok: true });
  }

  // offer / answer / ice — only inside an active connection.
  if (!activePair) return jsonError(409, "not connected");
  if (await mailboxFull(toId)) return jsonError(429, "mailbox full");

  await createSignal(fromId, toId, signalType, payloadStr);
  return jsonNoStore({ ok: true });
}

function isPendingWith(row: PairRow, otherId: string): boolean {
  return (
    row.pendingPeerId === otherId &&
    row.pendingSince !== null &&
    Date.now() - row.pendingSince.getTime() <= PENDING_TTL_MS
  );
}

async function mailboxFull(toId: string): Promise<boolean> {
  const pending = await prisma.signal.count({ where: { toId } });
  return pending >= MAX_PENDING_SIGNALS;
}

async function createSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  payload: string | null,
) {
  await prisma.signal.create({ data: { fromId, toId, type, payload } });
}

async function clearPair(a: string, b: string) {
  const data = {
    busy: false,
    peerId: null,
    pendingPeerId: null,
    pendingSince: null,
  };
  await prisma.presence.updateMany({
    where: { id: { in: [a, b] } },
    data,
  });
}

async function freeSession(id: string) {
  await prisma.presence.updateMany({
    where: { id },
    data: {
      busy: false,
      peerId: null,
      pendingPeerId: null,
      pendingSince: null,
    },
  });
}

// Helper: deliver an auto-decline from `target` back to `initiator`.
async function sendDecline(targetId: string, initiatorId: string) {
  await prisma.signal.create({
    data: { fromId: targetId, toId: initiatorId, type: "decline", payload: null },
  });
}

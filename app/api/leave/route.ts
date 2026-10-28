import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonNoStore } from "@/lib/auth";
import { bearerToken, isSessionId, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id, token }. Removes the presence row and any
// pending signals to/from this user. Called via navigator.sendBeacon on tab
// close, so the body may arrive as text and the token may live in the body
// (sendBeacon cannot set an Authorization header). If the user was pairing with
// someone, the server frees that partner from its own recorded state.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> | undefined;
  try {
    const text = await request.text();
    const parsed = text ? JSON.parse(text) : undefined;
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = undefined;
  }

  if (!body) return jsonError(400, "invalid body");

  const { id } = body;
  if (!isSessionId(id)) return jsonError(400, "invalid id");

  const token =
    bearerToken(request) ??
    (typeof body.token === "string" ? body.token : null);
  if (!token) return jsonError(401, "missing token");
  if (!verifySessionToken(id, token)) return jsonError(401, "invalid token");

  // Read the server's own pairing before deleting the row; never trust a
  // client-supplied peer id here.
  const row = await prisma.presence.findUnique({
    where: { id },
    select: { peerId: true, pendingPeerId: true },
  });

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });
  await prisma.presence.deleteMany({ where: { id } });

  // Free the real partner right away instead of making them wait for
  // staleness / WebRTC failure detection.
  const partner = row?.peerId ?? row?.pendingPeerId ?? null;
  if (partner && isSessionId(partner) && partner !== id) {
    await prisma.presence.updateMany({
      where: { id: partner },
      data: {
        busy: false,
        peerId: null,
        pendingPeerId: null,
        pendingSince: null,
      },
    });
    await prisma.signal.create({
      data: { fromId: id, toId: partner, type: "end", payload: null },
    });
  }

  return jsonNoStore({ ok: true });
}

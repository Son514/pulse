import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS, PENDING_TTL_MS } from "@/lib/presence";
import { isValidLatLng } from "@/lib/geo";
import { bearerToken, isSessionId, verifySessionToken } from "@/lib/session";
import { jsonError, jsonNoStore } from "@/lib/auth";
import type { PollResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poll?id=&lat=&lng= — the single endpoint that drives the live map.
// Requires the caller's bearer token. It (1) heartbeats the caller, (2) reaps
// stale presence + orphan signals, (3) returns filtered online peers, and
// (4) drains this user's mailbox.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");

  if (!isSessionId(id)) return jsonError(400, "invalid id");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "missing token");
  if (!verifySessionToken(id, token)) return jsonError(401, "invalid token");

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  const latParam = params.get("lat");
  const lngParam = params.get("lng");
  const lat = latParam ? Number(latParam) : NaN;
  const lng = lngParam ? Number(lngParam) : NaN;

  // 1) Heartbeat the caller. If their row was reaped while the tab slept (or
  // was restored from bfcache), re-create it from the supplied offset coords.
  // The signed token proves the caller owns this id.
  const existing = await prisma.presence.findUnique({
    where: { id },
    select: { id: true },
  });

  if (existing) {
    await prisma.presence.updateMany({
      where: { id },
      data: { lastSeen: new Date(now) },
    });
  } else if (isValidLatLng(lat, lng)) {
    try {
      await prisma.presence.create({
        data: { id, lat: lat as number, lng: lng as number, busy: false, lastSeen: new Date(now) },
      });
    } catch {
      // Concurrent poll re-created it first; just heartbeat.
      await prisma.presence.updateMany({
        where: { id },
        data: { lastSeen: new Date(now) },
      });
    }
  } else {
    return jsonError(401, "unknown session");
  }

  // 2) Reap stale presence rows, expired pending requests, and orphaned
  // signals (independent deletes — no atomicity needed, and avoids
  // transactions over a PgBouncer pooler).
  await prisma.presence.updateMany({
    where: { pendingSince: { lt: new Date(now - PENDING_TTL_MS) } },
    data: { pendingPeerId: null, pendingSince: null },
  });
  await prisma.presence.deleteMany({ where: { lastSeen: { lt: staleCutoff } } });
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

  // 3) Online peers, excluding self.
  const peers = await prisma.presence.findMany({
    where: {
      id: { not: id },
      lastSeen: { gte: staleCutoff },
    },
    select: { id: true, lat: true, lng: true, busy: true },
  });

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const response: PollResponse = {
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      busy: p.busy,
    })),
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return jsonNoStore(response);
}

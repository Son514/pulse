import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { bearerToken, issueSessionToken, isSessionId, verifySessionToken } from "@/lib/session";
import { jsonError, jsonNoStore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { id, lat, lng, token? } (raw coords).
// Applies a 1–3 km privacy offset and upserts the presence row. New sessions
// receive a signed bearer token; re-joining an existing id requires it.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid body");
  }

  const { id, lat, lng, token: bodyToken } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isSessionId(id)) return jsonError(400, "invalid id");
  if (!isValidLatLng(lat, lng)) return jsonError(400, "invalid coordinates");

  const token =
    typeof bodyToken === "string" ? bodyToken : bearerToken(request);
  const offset = applyPrivacyOffset(lat as number, lng as number);

  const existing = await prisma.presence.findUnique({
    where: { id },
    select: { id: true },
  });

  if (existing) {
    if (!token || !verifySessionToken(id, token)) {
      return jsonError(401, "invalid token");
    }
    await prisma.presence.update({
      where: { id },
      data: { lat: offset.lat, lng: offset.lng, lastSeen: new Date() },
    });
    // The caller already holds the token; never re-issue it.
    return jsonNoStore({ ok: true, lat: offset.lat, lng: offset.lng });
  }

  const newToken = issueSessionToken(id);
  try {
    await prisma.presence.create({
      data: {
        id,
        lat: offset.lat,
        lng: offset.lng,
        busy: false,
        lastSeen: new Date(),
      },
    });
  } catch {
    // Lost a race for the same id — only the token holder may continue.
    if (!token || !verifySessionToken(id, token)) {
      return jsonError(401, "session exists");
    }
    await prisma.presence.update({
      where: { id },
      data: { lat: offset.lat, lng: offset.lng, lastSeen: new Date() },
    });
    return jsonNoStore({ ok: true, lat: offset.lat, lng: offset.lng });
  }

  // Return the offset coordinates so the client renders its own pin in exactly
  // the same spot everyone else sees (never the raw geolocation position).
  return jsonNoStore({
    ok: true,
    lat: offset.lat,
    lng: offset.lng,
    token: newToken,
  });
}

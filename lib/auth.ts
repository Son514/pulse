import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bearerToken, isSessionId, verifySessionToken } from "@/lib/session";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonNoStore(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function jsonError(status: number, error: string): Response {
  return jsonNoStore({ error }, status);
}

export type Authenticated = { ok: true; id: string };

/**
 * Authenticates a session from an `Authorization: Bearer` token bound to `id`
 * and confirms the presence row still exists. Returns a 400/401 Response
 * otherwise, so routes can `return auth` directly.
 */
export async function authenticateSession(
  request: NextRequest,
  id: unknown,
): Promise<Authenticated | Response> {
  if (!isSessionId(id)) return jsonError(400, "invalid id");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "missing token");
  if (!verifySessionToken(id, token)) return jsonError(401, "invalid token");

  const presence = await prisma.presence.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!presence) return jsonError(401, "unknown session");

  return { ok: true, id };
}

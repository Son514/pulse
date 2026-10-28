import { expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

export interface Session {
  id: string;
  token: string;
  lat: number;
  lng: number;
}

export const DEFAULT_COORDS = { lat: 51.5074, lng: -0.1278 };

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Creates a fresh anonymous session and returns its credential pair. */
export async function createSession(
  request: APIRequestContext,
  coords: { lat: number; lng: number } = DEFAULT_COORDS,
): Promise<Session> {
  const id = randomUUID();
  const res = await request.post("/api/join", { data: { id, ...coords } });
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.token, "join must issue a per-session token").toEqual(
    expect.any(String),
  );
  expect(body.token.length).toBeGreaterThan(30);
  return { id, token: body.token as string, ...coords };
}

export async function poll(
  request: APIRequestContext,
  session: Session,
  queryId = session.id,
) {
  return request.get(
    `/api/poll?id=${queryId}&lat=${session.lat}&lng=${session.lng}`,
    { headers: bearer(session.token) },
  );
}

export async function signal(
  request: APIRequestContext,
  session: Session,
  toId: string,
  type: string,
  payload?: string,
  fromId = session.id,
) {
  return request.post("/api/signal", {
    headers: bearer(session.token),
    data: { fromId, toId, type, payload },
  });
}

export async function leave(
  request: APIRequestContext,
  session: Session,
  peerId?: string,
) {
  return request.post("/api/leave", {
    data: { id: session.id, token: session.token, peerId },
  });
}

/** Tracks sessions so each test can clean up after itself. */
export function track(request: APIRequestContext) {
  const sessions: Session[] = [];
  return {
    async create(
      coords?: { lat: number; lng: number },
    ): Promise<Session> {
      const session = await createSession(request, coords);
      sessions.push(session);
      return session;
    },
    async cleanup() {
      for (const session of sessions.splice(0)) {
        await request.post("/api/leave", {
          data: { id: session.id, token: session.token },
        });
      }
    },
  };
}

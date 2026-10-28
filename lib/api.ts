// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types";

export interface JoinResult {
  lat: number;
  lng: number;
  token?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function join(
  id: string,
  lat: number,
  lng: number,
): Promise<JoinResult> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, lat, lng }),
  });
  if (!res.ok) throw new ApiError(res.status, `join failed: ${res.status}`);
  return res.json();
}

export async function poll(
  id: string,
  token: string,
  lat?: number,
  lng?: number,
): Promise<PollResponse> {
  const params = new URLSearchParams({ id });
  if (lat !== undefined && lng !== undefined) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
  }
  const res = await fetch(`/api/poll?${params.toString()}`, {
    cache: "no-store",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new ApiError(res.status, `poll failed: ${res.status}`);
  return res.json();
}

export async function sendSignal(
  fromId: string,
  token: string,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  await fetch("/api/signal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ fromId, toId, type, payload }),
  });
}

// Fire-and-forget leave that survives the tab closing. The token rides in the
// body because sendBeacon cannot set an Authorization header.
export function leave(id: string, token: string | null): void {
  const body = JSON.stringify({ id, token });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/leave", body);
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? authHeaders(token) : {}),
      },
      body,
      keepalive: true,
    });
  }
}

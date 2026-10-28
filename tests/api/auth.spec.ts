import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  bearer,
  DEFAULT_COORDS,
  leave,
  poll,
  signal,
  track,
  type Session,
} from "./helpers";

let tracker: ReturnType<typeof track>;
let session: () => Promise<Session>;

test.beforeEach(async ({ request }) => {
  tracker = track(request);
  session = () => tracker.create();
});

test.afterEach(async () => {
  await tracker.cleanup();
});

test("join issues a session token and poll never echoes it", async ({
  request,
}) => {
  const me = await session();
  expect(me.token).not.toBe(me.id);

  const res = await poll(request, me);
  expect(res.status()).toBe(200);
  expect(await res.text()).not.toContain(me.token);
});

test("poll requires a credential", async ({ request }) => {
  const me = await session();
  const res = await request.get(`/api/poll?id=${me.id}`);
  expect(res.status()).toBe(401);
});

test("poll rejects a token issued for another session", async ({ request }) => {
  const attacker = await session();
  const victim = await session();

  const res = await poll(request, attacker, victim.id);
  expect(res.status()).toBe(401);
});

test("poll rejects malformed and unknown tokens", async ({ request }) => {
  const me = await session();
  const url = `/api/poll?id=${me.id}`;

  expect((await request.get(url, { headers: bearer("not-a-token") })).status()).toBe(401);
  expect(
    (await request.get(url, { headers: bearer("a".repeat(43)) })).status(),
  ).toBe(401);
});

test("a third party cannot drain another session's mailbox", async ({
  request,
}) => {
  const a = await session();
  const b = await session();
  const attacker = await session();

  expect((await signal(request, a, b.id, "request")).status()).toBe(200);

  const stolen = await poll(request, attacker, b.id);
  expect(stolen.status()).toBe(401);

  const inbox = await (await poll(request, b)).json();
  expect(inbox.signals.map((s: { type: string }) => s.type)).toContain("request");
});

test("signal requires a credential", async ({ request }) => {
  const a = await session();
  const b = await session();

  const res = await request.post("/api/signal", {
    data: { fromId: a.id, toId: b.id, type: "request" },
  });
  expect(res.status()).toBe(401);
});

test("a caller cannot forge a signal as another session", async ({ request }) => {
  const a = await session();
  const b = await session();
  const attacker = await session();

  const forged = await signal(
    request,
    attacker,
    b.id,
    "request",
    undefined,
    a.id,
  );
  expect(forged.status()).toBe(401);

  const inbox = await (await poll(request, b)).json();
  expect(inbox.signals).toHaveLength(0);
});

test("a forged accept cannot flip busy flags", async ({ request }) => {
  const a = await session();
  const b = await session();
  const attacker = await session();

  expect((await signal(request, attacker, b.id, "accept", undefined, a.id)).status()).toBe(401);

  const peers = await (await poll(request, a)).json();
  const peer = peers.peers.find((p: { id: string }) => p.id === b.id);
  expect(peer.busy).toBe(false);
});

test("leave requires a credential and cannot target another session", async ({
  request,
}) => {
  const a = await session();
  const b = await session();

  expect(
    (await request.post("/api/leave", { data: { id: a.id } })).status(),
  ).toBe(401);

  expect(
    (await request.post("/api/leave", { data: { id: b.id, token: a.token } }))
      .status(),
  ).toBe(401);

  const peers = await (await poll(request, b)).json();
  expect(peers.peers.some((p: { id: string }) => p.id === a.id)).toBe(true);
});

test("leave with the right credential removes presence and signals", async ({
  request,
}) => {
  const a = await session();
  const b = await session();

  expect((await signal(request, b, a.id, "request")).status()).toBe(200);
  expect((await leave(request, a)).status()).toBe(200);

  const peers = await (await poll(request, b)).json();
  expect(peers.peers.some((p: { id: string }) => p.id === a.id)).toBe(false);
});

test("leave accepts the beacon clipboard body shape", async ({ request }) => {
  const a = await session();
  const b = await session();

  const res = await request.post("/api/leave", {
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    data: JSON.stringify({ id: a.id, token: a.token }),
  });
  expect(res.status()).toBe(200);

  const peers = await (await poll(request, b)).json();
  expect(peers.peers.some((p: { id: string }) => p.id === a.id)).toBe(false);
});

test("join cannot take over an existing session", async ({ request }) => {
  const a = await session();
  const attacker = await session();

  const noToken = await request.post("/api/join", {
    data: { id: a.id, ...DEFAULT_COORDS },
  });
  expect(noToken.status()).toBe(401);

  const wrongToken = await request.post("/api/join", {
    data: { id: a.id, ...DEFAULT_COORDS, token: attacker.token },
  });
  expect(wrongToken.status()).toBe(401);

  const rejoin = await request.post("/api/join", {
    data: { id: a.id, lat: 40.7, lng: -74, token: a.token },
  });
  expect(rejoin.status()).toBe(200);

  // The original token still owns the session.
  expect((await poll(request, a)).status()).toBe(200);
});

test("signal to an offline target is handled without creating mail", async ({
  request,
}) => {
  const a = await session();
  const ghost = randomUUID();

  const res = await signal(request, a, ghost, "request");
  expect(res.status()).toBe(200);
  expect((await res.json()).autoDeclined).toBe(true);

  const inbox = await (await poll(request, a)).json();
  expect(inbox.signals.map((s: { type: string }) => s.type)).toContain(
    "decline",
  );
});

test("the mailbox has a bounded queue", async ({ request }) => {
  const a = await session();
  const b = await session();

  // Establish an active pair so offers are authorized.
  expect((await signal(request, a, b.id, "request")).status()).toBe(200);
  expect((await signal(request, b, a.id, "accept")).status()).toBe(200);

  let lastStatus = 200;
  for (let i = 0; i < 101; i++) {
    const res = await signal(request, a, b.id, "offer", "v=0");
    lastStatus = res.status();
    if (lastStatus === 429) break;
  }
  expect(lastStatus).toBe(429);
});

test("a stranger cannot accept, decline or end someone else's connection", async ({
  request,
}) => {
  const a = await session();
  const b = await session();
  const c = await session();

  expect((await signal(request, a, b.id, "request")).status()).toBe(200);
  expect((await signal(request, b, a.id, "accept")).status()).toBe(200);

  expect((await signal(request, c, b.id, "accept")).status()).toBe(409);
  expect((await signal(request, c, b.id, "decline")).status()).toBe(409);
  expect((await signal(request, c, b.id, "end")).status()).toBe(409);

  const peers = await (await poll(request, a)).json();
  expect(peers.peers.find((p: { id: string }) => p.id === b.id).busy).toBe(
    true,
  );
});

test("media signals require an active pair", async ({ request }) => {
  const a = await session();
  const b = await session();

  expect((await signal(request, a, b.id, "offer", "v=0")).status()).toBe(409);

  expect((await signal(request, a, b.id, "request")).status()).toBe(200);
  expect((await signal(request, b, a.id, "accept")).status()).toBe(200);
  expect((await signal(request, a, b.id, "offer", "v=0")).status()).toBe(200);
});

test("leave cannot free an unrelated peer via a supplied id", async ({
  request,
}) => {
  const a = await session();
  const b = await session();
  const c = await session();

  expect((await signal(request, a, b.id, "request")).status()).toBe(200);
  expect((await signal(request, b, a.id, "accept")).status()).toBe(200);
  await poll(request, b); // drain the stale request

  // C tries to name B as its partner while leaving.
  expect((await leave(request, c, b.id)).status()).toBe(200);

  const peers = await (await poll(request, a)).json();
  expect(peers.peers.find((p: { id: string }) => p.id === b.id).busy).toBe(
    true,
  );

  const inbox = await (await poll(request, b)).json();
  expect(inbox.signals).toHaveLength(0);
});

test("leave frees the server-recorded partner", async ({ request }) => {
  const a = await session();
  const b = await session();

  expect((await signal(request, a, b.id, "request")).status()).toBe(200);
  expect((await signal(request, b, a.id, "accept")).status()).toBe(200);
  await poll(request, b); // drain the request

  expect((await leave(request, a)).status()).toBe(200);

  const inbox = await (await poll(request, b)).json();
  expect(inbox.signals.map((s: { type: string }) => s.type)).toContain("end");

  const peers = await (await poll(request, b)).json();
  expect(peers.peers.some((p: { id: string }) => p.id === a.id)).toBe(false);
});

test("request / accept / end still works with credentials", async ({
  request,
}) => {
  const a = await session();
  const b = await session();

  expect((await signal(request, a, b.id, "request")).status()).toBe(200);
  expect((await signal(request, b, a.id, "accept")).status()).toBe(200);

  const during = await (await poll(request, a)).json();
  expect(during.peers.find((p: { id: string }) => p.id === b.id).busy).toBe(
    true,
  );

  expect((await signal(request, a, b.id, "end")).status()).toBe(200);

  const after = await (await poll(request, a)).json();
  expect(after.peers.find((p: { id: string }) => p.id === b.id).busy).toBe(
    false,
  );
});

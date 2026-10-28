import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { bearer, DEFAULT_COORDS, track, type Session } from "./helpers";

let tracker: ReturnType<typeof track>;
let session: () => Promise<Session>;

test.beforeEach(async ({ request }) => {
  tracker = track(request);
  session = () => tracker.create();
});

test.afterEach(async () => {
  await tracker.cleanup();
});

test("join rejects non-UUID session ids", async ({ request }) => {
  for (const id of ["nope", "123", "a".repeat(64), ""]) {
    const res = await request.post("/api/join", {
      data: { id, ...DEFAULT_COORDS },
    });
    expect(res.status(), `id=${id}`).toBe(400);
  }
});

test("join rejects invalid coordinates", async ({ request }) => {
  const id = randomUUID();
  const bad = [
    { lat: 91, lng: 0 },
    { lat: -91, lng: 0 },
    { lat: 0, lng: 181 },
    { lat: "51.5", lng: 0 },
    { lat: 51.5, lng: null },
    { lat: 51.5 },
  ];
  for (const coords of bad) {
    const res = await request.post("/api/join", { data: { id, ...coords } });
    expect(res.status(), JSON.stringify(coords)).toBe(400);
  }
});

test("join rejects malformed JSON and an empty body", async ({ request }) => {
  const malformed = await request.post("/api/join", {
    headers: { "Content-Type": "application/json" },
    data: "{not json",
  });
  expect(malformed.status()).toBe(400);

  const empty = await request.post("/api/join");
  expect(empty.status()).toBe(400);
});

test("poll rejects a malformed id", async ({ request }) => {
  const me = await session();
  const res = await request.get("/api/poll?id=not-a-uuid", {
    headers: bearer(me.token),
  });
  expect(res.status()).toBe(400);
});

test("signal validates type, target and payload", async ({ request }) => {
  const a = await session();
  const b = await session();

  const badType = await request.post("/api/signal", {
    headers: bearer(a.token),
    data: { fromId: a.id, toId: b.id, type: "explode" },
  });
  expect(badType.status()).toBe(400);

  const badTarget = await request.post("/api/signal", {
    headers: bearer(a.token),
    data: { fromId: a.id, toId: "not-a-uuid", type: "request" },
  });
  expect(badTarget.status()).toBe(400);

  const huge = await request.post("/api/signal", {
    headers: bearer(a.token),
    data: { fromId: a.id, toId: b.id, type: "offer", payload: "x".repeat(65 * 1024) },
  });
  expect(huge.status()).toBe(400);
});

test("signal rejects malformed JSON", async ({ request }) => {
  const a = await session();
  const res = await request.post("/api/signal", {
    headers: { ...bearer(a.token), "Content-Type": "application/json" },
    data: "{nope",
  });
  expect(res.status()).toBe(400);
});

test("leave validates the id and ignores malformed JSON", async ({
  request,
}) => {
  const a = await session();

  const badId = await request.post("/api/leave", {
    data: { id: "not-a-uuid", token: a.token },
  });
  expect(badId.status()).toBe(400);

  const malformed = await request.post("/api/leave", {
    headers: { "Content-Type": "application/json" },
    data: "{nope",
  });
  expect(malformed.status()).toBe(400);
});

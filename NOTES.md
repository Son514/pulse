# Pulse — Engineering Notes

## Phase 1 — Make it run

**Blocker: every API route returned 500.** `node_modules/.prisma` was missing, so
`@prisma/client` could not load. `npm run build` generated it, but `npm run dev`
did not. Fixed by generating the client and adding `predev` + `postinstall`
hooks so a fresh clone cannot start without it.

**Bugs found and fixed**

- `poll` heartbeated **every** presence row (`updateMany({ where: {} })`), so no
  session ever went stale and dots stayed on the map forever. Scoped the
  heartbeat to the caller's id.
- `busy` was set on `accept` but never cleared on `end`, so after one call a user
  stayed busy forever: dimmed dot, all new requests auto-declined. `end` now
  frees both peers.
- The caller's own pin was drawn at the raw geolocation while everyone else saw
  the 1–3 km offset position. `join` now returns the offset coords and the client
  uses them for the "YOU" pin.
- If a peer closed their tab, the survivor stayed in a phantom chat with
  `busy: true`. The poll loop now detects the missing peer, sends `end`, and
  tears down; `leave` also notifies the partner immediately.
- Chat messages were sent as `{ t: "msg" }` but the receiver only handled
  `{ t: "chat" }` — messages were silently dropped.
- ICE candidates were flushed **before** `setRemoteDescription`, so early
  candidates were always discarded. They now flush afterwards.
- Video renegotiation had no perfect-negotiation rollback: both sides add camera
  tracks at once, so offers collide and `setRemoteDescription` could throw.
  Added polite-peer rollback and collision handling.
- A failed WebRTC connection did not notify the other side; `disconnected` was
  ignored. Failure now sends `end`; `disconnected` gets an 8s grace period.
- A session whose row was reaped (asleep tab, bfcache) stayed invisible until a
  reload. Poll now re-registers the session from its offset coords.
- A missing/invalid Mapbox token produced a silent blank map; auth/style errors
  now show a readable message instead.

## Phase 2 — Make it good

- **Direction:** "signal in the dark" — a radar/aurora HUD over a dark map. Teal
  signals, amber self, ember for hang-ups; Geist Sans + mono micro-labels.
- **Entry gate:** atmospheric radar sweep, drifting signals, glowing CTA,
  privacy chips, locating/error states.
- **Map:** brand/live-count HUD, custom marker system (core + ring + halo using
  `transform`/`opacity`), hover tooltips, busy dots dimmed/dashed, recenter +
  zoom, legend, quiet-map card with invite copy, loading and error states.
- **Chat:** desktop drawer / mobile bottom sheet, peer-coloured avatar, message
  timestamps, quick replies, pill composer, end/video controls.
- **Video:** full-bleed remote video, PiP local preview, live/P2P chrome, mute
  and camera toggles propagated to the peer over the data channel.
- **A11y/perf:** `role="dialog"` prompts with initial focus and Escape, stable
  focus across polls, keyboard-focusable dots, `aria-live` toasts, visible focus
  rings, `prefers-reduced-motion`, opacity/transform animations only.

## Phase 3 — Make it secure

### Threat model

Pulse has no accounts. The only assets are (a) the signaling mailbox (SDP/ICE),
(b) presence coordinates, and (c) the ability to tear down someone's call. The
session id is **public** — every peer sees every id in `/api/poll` — so it can
never act as a credential.

### Findings (live proof-of-concept against the pre-fix API)

| Severity | Finding | Exploit |
| --- | --- | --- |
| Critical | Ids were the only credential | Any peer could impersonate any other |
| Critical | `/api/poll?id=` drained any mailbox | Steal SDP/ICE or silently break calls |
| High | `/api/signal` trusted `fromId` | Forge accept/decline/end, flip `busy` |
| High | `/api/leave` deleted any id | Kick any user off the map |
| High | `/api/join` upserted any id | Move another user's pin |
| High | Control signals were not bound to a connection | A valid user could flip an unrelated user's `busy` state or end their call |
| Medium | No id/shape validation outside join | Garbage rows, 500s |
| Medium | Unbounded signal queue | Mailbox flooding / DB DoS |
| Medium | No security headers | Clickjacking, MIME sniffing, no CSP/HSTS |
| Low | TTL cleanup only runs on poll | Rows linger if traffic stops |
| Low | No Sybil protection | Fake dots via repeated joins |

### Fixes

- **Signed, stateless session tokens.** On a new join the server issues an
  HMAC-SHA256 token bound to the session id (`SESSION_SECRET`, 24h TTL). The
  client keeps it in memory and sends it as `Authorization: Bearer` (or in the
  leave body, because `sendBeacon` cannot set headers). No token material is
  stored in Postgres, keeping the server stateless.
- **Identity enforcement.** `poll`, `signal` and `leave` verify the token against
  the claimed id; forged `fromId`, cross-session polling and cross-session leave
  are rejected. Policy: **401** for missing/invalid credentials (uniform, no
  existence oracle).
- **Server-side pairing.** `accept`, `decline`, `end` and all media signals are
  only accepted between the two sessions recorded as requesting/connected
  (`pendingPeerId` / `peerId`). `leave` derives the partner from the server's
  record, not from the client. Pending requests expire after 45s. This stops a
  valid user from messing with an unrelated user's call or busy state.
- **Input validation.** UUID ids, coordinate ranges, signal types, payload cap
  (64 KB), malformed JSON and empty bodies all return 400.
- **Abuse limits.** A recipient's mailbox is capped at 100 pending signals
  (429); control messages (`end`/`decline`) always get through so busy state can
  always be freed.
- **Headers.** `nosniff`, `DENY` framing, strict referrer policy, a permissions
  policy limited to camera/mic/geolocation, HSTS, COOP, and a Mapbox-compatible
  CSP in **Report-Only** mode. API responses are `Cache-Control: no-store` and
  do not opt into cross-origin access.

### Verification

`npm run test:api` runs 29 Playwright HTTP tests against a real Postgres and the
real Next server (no browser). Written against the hardened contract, the first
25 tests produced **22 failures / 3 passes** on the vulnerable code; after the
fixes every test passes (**29/29**). It covers: token issuance, 401 on
missing/invalid tokens, cross-session poll/signal/leave, join takeover, forged
busy flips, connection pairing, beacon-shaped leave, request/accept/end, offline
targets, the 100-signal cap, id/coordinate/payload validation, security headers
and no-store caching. CI runs it on a Postgres service container
(`.github/workflows/api-tests.yml`).

### Residual risks

- **Sybil joins:** anyone can create many sessions; no accounts or attestation.
  A per-IP join throttle would need shared state (upstream WAF/Redis).
- **No global rate limit:** the mailbox cap bounds queue growth, but request
  volume is not throttled per client.
- **Token revocation:** signed tokens live 24h and cannot be revoked before
  expiry; sessions are ephemeral by design.
- **CSP is Report-Only** until violations are reviewed; flipping to enforce is a
  follow-up after a real-traffic soak.
- **Mapbox attribution** sits under the mobile chat sheet when it is open.
- **STUN-only** WebRTC: some strict networks cannot connect media (documented
  limitation).

## Phase 4 — Make it better

**Signal Lock — the connection moment.** When two strangers connect:

- The map frames both offset pins, leaving room for the chat drawer.
- A great-circle arc (96 sampled points) draws between them with a wide glow, a
  bright core, and a comet travelling along the path.
- A two-note chime plays (optional; the mute preference lives in the HUD and in
  `localStorage` only).
- A `LOCKING ON → LINKED · ≈ 5,571 km` banner appears; the chat waits ~2.2s so
  the moment lands before the interface takes over.
- The distance stays in the chat header and empty state, reinforcing that there
  is a real person on the other side of the planet.
- **Find a spark** picks a random open stranger, flies to their dot, pulses a
  reticle around it, and sends the normal connection request.

Everything is client-side: no backend changes, one animation frame loop, and the
distance is computed from the already-randomised offset coordinates (so it is
approximate by design). Reduced motion skips the camera move, the draw delay and
the banner, opening the chat immediately. The chime is muted with a button and
never persisted server-side.

Trade-offs: the cinematic adds ~2s before the chat; the banner explains the
wait, and the animation is skipped for reduced motion. A modified client could
bypass the delay — it is product theatre, not a security boundary.

What I would build next with more time: a 3-minute "Spark" with mutual
extension, a day/night terminator on the map, and a true 3D globe projection.

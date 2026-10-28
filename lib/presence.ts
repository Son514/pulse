// How long a presence row survives without a heartbeat (poll). After this the
// dot is treated as offline and removed — implements "dot disappears when the
// user leaves" even if their tab closed without a clean leave.
export const STALE_MS = 15_000;

// Orphan signals (mailbox messages never drained) are cleaned up after this.
export const SIGNAL_TTL_MS = 60_000;

// A pending connection request that is never accepted/declined is forgotten
// after this, so it cannot block the requester or target forever.
export const PENDING_TTL_MS = 45_000;

// Client poll interval. Kept here so client + server reason about the same cadence.
export const POLL_INTERVAL_MS = 1_500;

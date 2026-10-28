-- Server-side pairing for connection authorization.
-- Ephemeral state only; no user data.
ALTER TABLE "Presence" ADD COLUMN "peerId" TEXT;
ALTER TABLE "Presence" ADD COLUMN "pendingPeerId" TEXT;
ALTER TABLE "Presence" ADD COLUMN "pendingSince" TIMESTAMP(3);

CREATE INDEX "Presence_pendingSince_idx" ON "Presence"("pendingSince");

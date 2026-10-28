// Signed, stateless session tokens.
//
// The session id is public (every peer sees it on the map), so it can never be
// the credential. On join we issue an HMAC-signed token bound to that id; the
// client keeps it in memory and presents it as a bearer token. The server can
// verify it without storing anything, which keeps Pulse stateless.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;
const SIGNATURE_LENGTH = 43; // base64url of a 32-byte HMAC
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secret(): Buffer {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return Buffer.from(value, "utf8");
}

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function issueSessionToken(id: string): string {
  const issuedAt = Date.now();
  const nonce = randomBytes(16).toString("base64url");
  return `${issuedAt}.${nonce}.${sign(id, issuedAt, nonce)}`;
}

export function verifySessionToken(
  id: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [issuedAtRaw, nonce, signature] = parts;
  if (!/^\d{1,16}$/.test(issuedAtRaw)) return false;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;

  const issuedAt = Number(issuedAtRaw);
  const now = Date.now();
  if (!Number.isSafeInteger(issuedAt)) return false;
  if (issuedAt > now + 60_000) return false; // tolerate small clock skew
  if (now - issuedAt > TOKEN_TTL_MS) return false;

  if (signature.length !== SIGNATURE_LENGTH) return false;

  const expected = Buffer.from(sign(id, issuedAt, nonce), "base64url");
  const given = Buffer.from(signature, "base64url");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function bearerToken(request: {
  headers: { get(name: string): string | null };
}): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function sign(id: string, issuedAt: number, nonce: string): string {
  return createHmac("sha256", secret())
    .update(`pulse.v1.${id}.${issuedAt}.${nonce}`)
    .digest("base64url");
}

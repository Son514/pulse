// Apply the Prisma schema to the production database during a Vercel build.
//
// Prisma Client is generated in postinstall, but schema changes are not applied
// automatically. Production builds run this after generate so a deployment can
// never ship against an out-of-date ephemeral schema. It is a no-op locally and
// on preview deployments.
import { execFileSync } from "node:child_process";
import path from "node:path";

const isVercelProduction =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (!isVercelProduction) {
  process.exit(0);
}

// Prefer the Prisma-specific URL (usually direct/unpooled); fall back to the
// app's pooled URL.
const databaseUrl =
  process.env.PRISMA_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("[deploy] No database URL available; skipping prisma db push.");
  process.exit(0);
}

const prismaBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);

console.log("[deploy] Applying the Prisma schema to the production database…");
execFileSync(prismaBin, ["db", "push"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
console.log("[deploy] Prisma schema is in sync.");

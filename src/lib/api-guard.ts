/**
 * API guardrails shared by every route handler.
 *
 * Sanitisation / abuse protection:
 *  - `limitOr429`: per-IP sliding-window rate limit (in-memory).
 *  - `parseQuery`: strict zod validation of query params — unknown or
 *    malformed values are rejected with 400 instead of reaching the DB.
 *  - `jsonOk` / `jsonErr`: uniform JSON envelopes + security headers
 *    (no-store for anything derived from user input, short shared-cache
 *    windows for public aggregates only).
 *  - `guardWrite`: blocks mutating endpoints on read-only deployments
 *    (e.g. Vercel serverless with a build-time embedded SQLite snapshot)
 *    so writes fail fast with a clear message instead of a 500.
 */

import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

/* ------------------------- rate limiting ------------------------- */

const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  for (const [k, hits] of buckets) {
    const alive = hits.filter((t) => now - t < WINDOW_MS);
    if (alive.length) buckets.set(k, alive);
    else buckets.delete(k);
  }
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/**
 * Returns a 429 response when the caller exceeded `limit` requests per
 * minute, otherwise `null` — usage: `const limited = limitOr429(req, "cases");`
 */
export function limitOr429(req: NextRequest, scope: string, limit = 120): NextResponse | null {
  const now = Date.now();
  sweep(now);
  const key = `${scope}:${clientIp(req)}`;
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - hits[0])) / 1000);
    return NextResponse.json(
      { error: "Too many requests — slow down." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
    );
  }
  hits.push(now);
  buckets.set(key, hits);
  return null;
}

/* ------------------------- query validation ------------------------- */

export function parseQuery<T extends z.ZodTypeAny>(req: NextRequest, schema: T): z.infer<T> | null {
  const raw: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    raw[k] = v.slice(0, 200); // hard cap on any param length
  });
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/* ------------------------- responses ------------------------- */

const BASE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function jsonOk(data: unknown, opts?: { cacheSecs?: number; status?: number }) {
  const headers = { ...BASE_HEADERS };
  if (opts?.cacheSecs) {
    headers["Cache-Control"] = `private, max-age=${opts.cacheSecs}, stale-while-revalidate=${opts.cacheSecs * 4}`;
  } else {
    headers["Cache-Control"] = "no-store";
  }
  return NextResponse.json({ data }, { status: opts?.status ?? 200, headers });
}

export function jsonErr(message: string, status = 400) {
  return NextResponse.json({ error: message.slice(0, 300) }, { status, headers: BASE_HEADERS });
}

/* ------------------------- read-only guard ------------------------- */

/**
 * Vercel/serverless deployments run the app with a build-time embedded
 * SQLite snapshot: reads work, writes cannot persist. Detect that and
 * fail fast with an actionable message.
 */
export function isReadOnlyDeployment(): boolean {
  if (process.env.DB_READONLY === "1") return true;
  // VERCEL=1 is injected into every serverless function; a writable
  // deployment would point DATABASE_URL at a real server (Turso/Postgres…).
  return Boolean(process.env.VERCEL) && Boolean(process.env.DATABASE_URL?.startsWith("file:"));
}

export function guardWrite(): NextResponse | null {
  if (isReadOnlyDeployment()) {
    return jsonErr(
      "This is a read-only demo deployment (embedded database snapshot). Run locally or connect a writable DATABASE_URL to enable changes.",
      503,
    );
  }
  return null;
}

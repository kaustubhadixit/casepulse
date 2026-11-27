import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { forceTick, getStatus, requestTick } from "@/lib/live";
import { limitOr429, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync — live-engine status + recent sync log entries.
 *
 * There is no refresh schedule anymore: the engine polls upstream change
 * cursors continuously (see src/lib/live.ts). A request carrying
 * `Authorization: Bearer <CRON_SECRET>` (attached automatically by Vercel
 * Cron) triggers an immediate forceTick instead of just reporting — the
 * per-minute keep-alive cron in vercel.json uses this.
 */
export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "sync-log");
  if (limited) return limited;

  const auth = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    try {
      const status = await forceTick();
      return NextResponse.json({ ok: true, ...status });
    } catch (err) {
      console.error("cron tick failed", err);
      return jsonErr("Sync failed", 500);
    }
  }

  requestTick();
  try {
    const [logs, status] = await Promise.all([
      db.syncLog.findMany({ orderBy: { ranAt: "desc" }, take: 10 }),
      Promise.resolve(getStatus()),
    ]);
    return NextResponse.json({
      data: logs.map((l) => ({
        id: l.id,
        ranAt: l.ranAt.toISOString(),
        source: l.source,
        recordsIngested: l.recordsIngested,
        casesUpdated: l.casesUpdated,
        notes: l.notes,
      })),
      live: status,
    });
  } catch (err) {
    console.error("sync GET failed", err);
    return NextResponse.json({ error: "Failed to load sync logs" }, { status: 500 });
  }
}

/**
 * POST /api/sync — run one full upstream check NOW (admin session, or the
 * x-cron-key header matching SYNC_CRON_KEY for external schedulers).
 *
 * This is the same continuous engine, just poked immediately: it consults
 * the change cursor, ingests whatever changed, and returns the engine
 * status. On read-only deployments the results land in the live overlay
 * instead of the database.
 */
export async function POST(request: NextRequest) {
  const limited = limitOr429(request, "sync-run", 6);
  if (limited) return limited;

  const admin = await requireAdmin();
  const cronKey = request.headers.get("x-cron-key");
  const validCron = Boolean(process.env.SYNC_CRON_KEY) && cronKey === process.env.SYNC_CRON_KEY;
  if (!admin && !validCron) {
    return NextResponse.json({ error: "Admin session or valid cron key required" }, { status: 403 });
  }
  try {
    const status = await forceTick();
    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    console.error("sync POST failed", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

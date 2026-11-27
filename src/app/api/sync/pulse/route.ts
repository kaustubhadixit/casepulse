import { NextRequest } from "next/server";
import { limitOr429, jsonOk, jsonErr } from "@/lib/api-guard";
import { getStatus, requestTick } from "@/lib/live";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync/pulse — keep-alive tick (vercel.json cron target).
 *
 * This is NOT a scheduled data refresh: it only nudges the continuous engine
 * (which itself decides, via the upstream change cursor, whether anything
 * changed). On serverless the per-minute cron keeps a warm instance polling;
 * on a long-running server the in-process loop already runs continuously and
 * this is a no-op. Vercel Cron attaches `Authorization: Bearer $CRON_SECRET`
 * automatically when that env var is set, but the endpoint stays public and
 * rate-limited — a pulse is idempotent and internally throttled.
 */
export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "sync-pulse", 60);
  if (limited) return limited;
  try {
    requestTick();
    return jsonOk(getStatus());
  } catch {
    return jsonErr("Pulse failed", 500);
  }
}

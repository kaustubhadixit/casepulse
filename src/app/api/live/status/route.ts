import { NextRequest } from "next/server";
import { limitOr429, jsonOk, jsonErr } from "@/lib/api-guard";
import { getStatus, startEngine } from "@/lib/live";

export const dynamic = "force-dynamic";

/**
 * GET /api/live/status — engine snapshot (phase, cadence, cursor, sources).
 * Cheap in-memory read used by the header LIVE badge as an SSE fallback.
 * Starts the engine if needed but never nudges an upstream check (the badge
 * polls frequently; nudges belong to actual data reads).
 */
export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "live-status", 240);
  if (limited) return limited;
  try {
    startEngine();
    return jsonOk(getStatus());
  } catch {
    return jsonErr("Failed to read live status", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { probeSource } from "@/lib/sources";
import { cached } from "@/lib/cache";
import { limitOr429, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/**
 * Source registry + live health: GET /api/sources
 * Shows which free public feeds the pipeline can currently reach, their
 * refresh cadence, and where to get keys — the "where does the data come
 * from" answer, machine-readable. Probes are cached 60s (they hit upstream).
 */
export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "sources");
  if (limited) return limited;
  try {
    const payload = await cached("api:sources", 60_000, async () => {
      const [cl, ptab, pv] = await Promise.all([
        probeSource("courtlistener"),
        probeSource("ptab"),
        probeSource("patentsview"),
      ]);
      return {
        data: [
      {
        id: "courtlistener",
        name: "CourtListener RECAP (Free Law Project)",
        kind: "US district-court patent dockets — change cursor + search",
        url: "https://www.courtlistener.com/api/",
        signup: "https://www.courtlistener.com/register/",
        env: "COURTLISTENER_TOKEN",
        free: true,
        refresh: "continuous — fetched as data change (budget-aware poll: ~1/min hot, ≤15 min idle)",
        status: cl.online ? "online" : cl.status === "no-key" ? "no-key" : `error-${cl.status}`,
        notes: "Register a free account, then copy your API token from your profile settings.",
      },
      {
        id: "uspto-ptab",
        name: "USPTO Open Data Portal — PTAB API",
        kind: "PTAB / AIA trial proceedings",
        url: "https://data.uspto.gov/apis/getting-started",
        signup: "https://data.uspto.gov/apikey",
        env: "USPTO_PTAB_KEY",
        free: true,
        refresh: "daily",
        status: ptab.online ? "online" : ptab.status === "no-key" ? "no-key" : `error-${ptab.status}`,
        notes: "Create a free USPTO.gov account, then request/activate an ODP API key (identity verification involved).",
      },
      {
        id: "patentsview",
        name: "USPTO PatentsView (Open Data Portal)",
        kind: "Patent bibliographic enrichment",
        url: "https://data.uspto.gov/apis/getting-started",
        signup: "https://data.uspto.gov/apikey",
        env: "PATENTSVIEW_API_KEY",
        free: true,
        refresh: "weekly (bibliographic bulk refresh)",
        status: pv.online ? "online" : pv.status === "no-key" ? "no-key" : `error-${pv.status}`,
        notes: "Same USPTO ODP key process as PTAB — one account covers both sources.",
      },
      {
        id: "synthetic",
        name: "PatentPulse synthetic generator (built-in fallback)",
        kind: "simulated filings across all jurisdictions",
        url: null,
        signup: null,
        env: null,
        free: true,
        refresh: "demo mode only — activates when no upstream key is configured",
        status: "standby",
        notes: "Keeps the live feed evolving when no upstream keys are configured; records are labeled source=synthetic.",
      },
    ],
        cadence: {
          mode: "continuous — no scheduled refresh",
          changeCursor: "CourtListener date_modified__gt cursor, polled only as data changes",
          push: "SSE /api/live/stream streams case:new / case:update to browsers instantly",
          trafficNudge: "every read API call may trigger an immediate upstream check",
          keepAlive: "request budget: 4/min · 40/hour · 110/day caps, planned around the 5/min · 50/hour · 125/day token plan",
        },
      };
    });
    return NextResponse.json(
      { data: payload.data, cadence: payload.cadence },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (err) {
    console.error("sources GET failed", err);
    return jsonErr("Failed to load sources", 500);
  }
}

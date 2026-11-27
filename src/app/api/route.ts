import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** API index — quick reference of the public REST surface. */
export async function GET() {
  return NextResponse.json({
    name: "PatentPulse API",
    version: "1.0.0",
    description: "IP litigation monitoring & analytics — functional study clone with fully synthetic data.",
    endpoints: {
      auth: ["POST /api/auth/register", "POST /api/auth/login", "POST /api/auth/logout", "GET /api/auth/me"],
      cases: [
        "GET /api/cases?q&jurisdiction&court&status&tech&from&to&sort&page&pageSize",
        "POST /api/cases (admin)",
        "GET /api/cases/:id",
        "PUT /api/cases/:id (admin)",
        "DELETE /api/cases/:id (admin)",
      ],
      patents: ["GET /api/patents?q&tech&sort&page", "GET /api/patents/:id"],
      parties: ["GET /api/parties?q&type&sort&page", "GET /api/parties/:slug"],
      lawFirms: ["GET /api/law-firms?q"],
      stats: ["GET /api/stats?jurisdiction", "GET /api/stats/trends?jurisdiction&months"],
      feed: ["GET /api/feed?limit"],
      news: ["GET /api/news?category&limit"],
      watchlist: ["GET /api/watchlist", "POST /api/watchlist", "DELETE /api/watchlist?caseId="],
      live: ["GET /api/live/stream (SSE — case:new / case:update / status)", "GET /api/live/status"],
      sync: ["GET /api/sync (status + logs)", "POST /api/sync (admin — immediate check)", "GET /api/sync/pulse (keep-alive tick)"],
      health: ["GET /api/health"],
    },
  });
}

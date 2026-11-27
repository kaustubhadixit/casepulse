import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requestTick, getOverlay } from "@/lib/live";
import { toSummary } from "@/lib/caseService";
import { cached } from "@/lib/cache";
import { limitOr429, parseQuery, jsonOk, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(5).max(50).default(20),
});

/**
 * Live IP activity feed: blends fresh filings, recent docket events, news
 * and (on read-only deployments) the in-memory live overlay streamed by the
 * continuous engine. Cached 20s; the engine nudges a fresh upstream check
 * (non-blocking) and pushes case:new events over SSE.
 */
export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "feed");
  if (limited) return limited;

  const q = parseQuery(request, querySchema);
  if (!q) return jsonErr("Invalid limit");

  requestTick();

  const limit = q.limit;
  try {
    const items = await cached(`api:feed:${limit}`, 30_000, async () => {
      const [recentCases, recentEvents] = await Promise.all([
        db.case.findMany({
          orderBy: { filingDate: "desc" },
          take: Math.ceil(limit * 0.6),
          include: { parties: { include: { party: { select: { name: true } } } } },
        }),
        db.caseEvent.findMany({
          orderBy: { date: "desc" },
          take: Math.ceil(limit * 0.6),
          include: { case: { include: { parties: { include: { party: { select: { name: true } } } } } } },
        }),
      ]);

      type FeedItem = {
        type: "FILING" | "EVENT";
        date: string;
        title: string;
        caseId: string;
        caseNumber: string;
        jurisdiction: string;
        court: string;
        status: string;
        cause: string | null;
        detail: string;
      };

      const out: FeedItem[] = [];
      for (const c of recentCases) {
        out.push({
          type: "FILING",
          date: c.filingDate.toISOString(),
          title: c.title,
          caseId: c.id,
          caseNumber: c.caseNumber,
          jurisdiction: c.jurisdiction,
          court: c.court,
          status: c.status,
          cause: c.cause,
          detail: `New filing — ${c.court}`,
        });
      }
      for (const e of recentEvents) {
        const c = toSummary({
          ...e.case,
          parties: e.case.parties.map((p) => ({ role: p.role, party: { name: p.party.name } })),
        });
        out.push({
          type: "EVENT",
          date: e.date.toISOString(),
          title: c.title,
          caseId: c.id,
          caseNumber: c.caseNumber,
          jurisdiction: c.jurisdiction,
          court: c.court,
          status: c.status,
          cause: c.cause,
          detail: `${e.kind}: ${e.description}`,
        });
      }
      out.sort((a, b) => b.date.localeCompare(a.date));

      // read-only deployments: merge the engine's in-memory live overlay
      // (upstream changes fetched on change, held per instance)
      const overlay = getOverlay();
      if (overlay.length) {
        const existingNumbers = new Set(out.map((o) => o.caseNumber));
        for (const ov of overlay) {
          if (existingNumbers.has(ov.caseNumber)) continue;
          existingNumbers.add(ov.caseNumber);
          out.push({
            type: "FILING",
            date: ov.dateModified,
            title: ov.title,
            caseId: ov.id,
            caseNumber: ov.caseNumber,
            jurisdiction: ov.jurisdiction,
            court: ov.court,
            status: ov.status,
            cause: ov.cause,
            detail: `New filing — ${ov.court} (live overlay)`,
          });
        }
        out.sort((a, b) => b.date.localeCompare(a.date));
      }

      return out.slice(0, limit);
    });

    return jsonOk(items, { cacheSecs: 20 });
  } catch (err) {
    console.error("feed GET failed", err);
    return jsonErr("Failed to load feed", 500);
  }
}

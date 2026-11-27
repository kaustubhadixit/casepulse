import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PLAINTIFF_ROLES } from "@/lib/constants";
import { requestTick } from "@/lib/live";
import { cached } from "@/lib/cache";
import { limitOr429, parseQuery, jsonOk, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  jurisdiction: z.enum(["DISTRICT_COURT", "PTAB", "UPC", "EPO_OPPOSITION", "ITC", "SEP"]).optional(),
});

/** Dashboard overview KPIs (optionally scoped to one jurisdiction). Cached 45s. */
export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "stats");
  if (limited) return limited;

  const q = parseQuery(request, querySchema);
  if (!q) return jsonErr("Invalid query parameters");

  requestTick(); // traffic-driven nudge — engine checks upstream on change

  const jurisdiction = q.jurisdiction;
  try {
    const payload = await cached(`api:stats:${jurisdiction ?? "all"}`, 45_000, async () => {
      const where = jurisdiction ? { jurisdiction } : {};

      const [total, active, byJurisdiction, byStatus, courts, partiesCount, damagesAgg, newThisMonth, patentsAsserted, npeGroups, lastSync] =
        await Promise.all([
          db.case.count({ where }),
          db.case.count({ where: { ...where, status: { in: ["Active", "Instituted", "Opposition Pending"] } } }),
          db.case.groupBy({ by: ["jurisdiction"], _count: true }),
          db.case.groupBy({ by: ["status"], where, _count: true, orderBy: { _count: { status: "desc" } } }),
          db.case.groupBy({ by: ["court"], where, _count: true }),
          db.party.count(),
          db.case.aggregate({ where: { ...where, damagesAwarded: { not: null } }, _sum: { damagesAwarded: true }, _count: true }),
          db.case.count({
            where: { ...where, filingDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
          }),
          db.patent.count({ where: { cases: { some: {} } } }),
          // NPE share of distinct plaintiff-side entities (aggregated in SQL, not row-by-row)
          db.party.groupBy({
            by: ["type"],
            where: { caseLinks: { some: { role: { in: PLAINTIFF_ROLES as unknown as string[] } } } },
            _count: true,
          }),
          db.syncLog.findFirst({ orderBy: { ranAt: "desc" } }),
        ]);

      const plaintiffEntities = npeGroups.reduce((s, g) => s + g._count, 0);
      const npeShare = plaintiffEntities
        ? Math.round(((npeGroups.find((g) => g.type === "NPE")?._count ?? 0) / plaintiffEntities) * 100)
        : 0;

      return {
        totalCases: total,
        activeCases: active,
        newThisMonth,
        courtsCovered: courts.length,
        uniquePatentsAsserted: patentsAsserted,
        parties: partiesCount,
        totalDamagesAwarded: damagesAgg._sum.damagesAwarded ?? 0,
        casesWithDamages: damagesAgg._count,
        npeShare,
        byJurisdiction: byJurisdiction.map((j) => ({ jurisdiction: j.jurisdiction, count: j._count })),
        byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })).filter((s) => s.status),
        lastSync: lastSync ? { ranAt: lastSync.ranAt.toISOString(), source: lastSync.source, notes: lastSync.notes } : null,
      };
    });

    return jsonOk(payload, { cacheSecs: 30 });
  } catch (err) {
    console.error("stats GET failed", err);
    return jsonErr("Failed to load stats", 500);
  }
}

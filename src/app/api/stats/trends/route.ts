import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PLAINTIFF_ROLES } from "@/lib/constants";
import { cached } from "@/lib/cache";
import { limitOr429, parseQuery, jsonOk, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  jurisdiction: z.enum(["DISTRICT_COURT", "PTAB", "UPC", "EPO_OPPOSITION", "ITC", "SEP"]).optional(),
  months: z.coerce.number().int().min(6).max(48).default(24),
});

/** Trend series powering the analytics dashboards. Cached 2 min. */
export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "trends");
  if (limited) return limited;

  const q = parseQuery(request, querySchema);
  if (!q) return jsonErr("Invalid query parameters");

  const { jurisdiction, months } = q;
  try {
    const payload = await cached(`api:trends:${jurisdiction ?? "all"}:${months}`, 120_000, async () => {
      const where = jurisdiction ? { jurisdiction } : {};

      // slim projection + a single party-link pass (no nested includes)
      const [cases, links] = await Promise.all([
        db.case.findMany({
          where,
          select: { filingDate: true, court: true, techArea: true, status: true, damagesAwarded: true },
          orderBy: { filingDate: "asc" },
        }),
        db.caseParty.findMany({
          where: jurisdiction ? { case: { jurisdiction } } : {},
          select: { role: true, party: { select: { name: true, type: true } } },
          take: 100_000,
        }),
      ]);

      // monthly filing series
      const index = new Map<string, { count: number; damages: number }>();
      for (const c of cases) {
        const key = c.filingDate.toISOString().slice(0, 7);
        const entry = index.get(key) ?? { count: 0, damages: 0 };
        entry.count++;
        entry.damages += c.damagesAwarded ?? 0;
        index.set(key, entry);
      }
      const series: { month: string; count: number; damages: number }[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const e = index.get(key) ?? { count: 0, damages: 0 };
        series.push({ month: key, ...e });
      }

      // groupings
      const courts = new Map<string, number>();
      const techs = new Map<string, number>();
      const statuses = new Map<string, number>();
      const plaintiffs = new Map<string, number>();
      const defendants = new Map<string, number>();
      const plaintiffTypes = { NPE: 0, COMPANY: 0, UNIVERSITY: 0, INDIVIDUAL: 0 } as Record<string, number>;

      for (const c of cases) {
        courts.set(c.court, (courts.get(c.court) ?? 0) + 1);
        if (c.techArea) techs.set(c.techArea, (techs.get(c.techArea) ?? 0) + 1);
        statuses.set(c.status, (statuses.get(c.status) ?? 0) + 1);
      }
      for (const l of links) {
        if (PLAINTIFF_ROLES.includes(l.role)) {
          plaintiffs.set(l.party.name, (plaintiffs.get(l.party.name) ?? 0) + 1);
          if (l.party.type in plaintiffTypes) plaintiffTypes[l.party.type]++;
        } else {
          defendants.set(l.party.name, (defendants.get(l.party.name) ?? 0) + 1);
        }
      }

      const top = (m: Map<string, number>, n: number) =>
        [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, n);

      return {
        series,
        topCourts: top(courts, 10),
        topTechAreas: top(techs, 10),
        statuses: top(statuses, 12),
        topPlaintiffs: top(plaintiffs, 10),
        topDefendants: top(defendants, 10),
        plaintiffTypes,
        total: cases.length,
      };
    });

    return jsonOk(payload, { cacheSecs: 60 });
  } catch (err) {
    console.error("trends GET failed", err);
    return jsonErr("Failed to load trends", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { cached } from "@/lib/cache";
import { limitOr429, parseQuery, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const querySchema = z.object({ q: z.string().trim().max(120).optional() });

/** Law-firm analytics: caseload by side + monthly EPO opposition filings (last 10 months). Cached 60s. */
export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "law-firms");
  if (limited) return limited;
  try {
    const p = parseQuery(request, querySchema);
    if (!p) return jsonErr("Invalid query parameters");
    const q = p.q;

    const payload = await cached(`api:law-firms:${q ?? ""}`, 60_000, async () => {
      const firms = await db.lawFirm.findMany({
        where: q ? { name: { contains: q } } : undefined,
        include: { caseLinks: { include: { case: { select: { jurisdiction: true, filingDate: true } } } } },
      });

    // last 10 months (YYYY-MM) for the opposition trend
    const months: string[] = [];
    const now = new Date();
    for (let i = 9; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const monthKey = (iso: Date) => `${iso.getFullYear()}-${String(iso.getMonth() + 1).padStart(2, "0")}`;

    const data = firms
      .map((f) => {
        const plaintiffCases = f.caseLinks.filter((l) => l.side === "PLAINTIFF").length;
        const defendantCases = f.caseLinks.filter((l) => l.side === "DEFENDANT").length;
        const oppositions = f.caseLinks.filter((l) => l.side === "PLAINTIFF" && l.case.jurisdiction === "EPO_OPPOSITION");
        const monthly = months.map((m) => ({
          month: m,
          count: oppositions.filter((o) => monthKey(o.case.filingDate) === m).length,
        }));
        return {
          id: f.id,
          slug: f.slug,
          name: f.name,
          city: f.city,
          country: f.country,
          totalCases: f.caseLinks.length,
          plaintiffCases,
          defendantCases,
          oppositionsFiled: oppositions.length,
          monthlyOppositions: monthly,
        };
      })
      .sort((a, b) => b.totalCases - a.totalCases || a.name.localeCompare(b.name));

    const aggregateMonthly = months.map((m) => ({
      month: m,
      count: data.reduce((sum, f) => sum + (f.monthlyOppositions.find((x) => x.month === m)?.count ?? 0), 0),
    }));

      return { data, months, aggregateMonthly };
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    console.error("law-firms GET failed", err);
    return jsonErr("Failed to load law firms", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PLAINTIFF_ROLES } from "@/lib/constants";
import { cached } from "@/lib/cache";
import { limitOr429, parseQuery, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.enum(["COMPANY", "NPE", "UNIVERSITY", "INDIVIDUAL"]).optional(),
  sort: z.enum(["cases", "name", "recent"]).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(5).max(50).optional(),
});

export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "parties");
  if (limited) return limited;
  try {
    const q = parseQuery(request, querySchema);
    if (!q) return jsonErr("Invalid query parameters");
    const { q: search, type, sort = "cases", page = 1, pageSize = 12 } = q;

    const result = await cached(`api:parties:${search ?? ""}:${type ?? ""}:${sort}:${page}:${pageSize}`, 60_000, async () => {
      const where: Record<string, unknown> = {};
      if (search) where.name = { contains: search };
      if (type) where.type = type;

      const parties = await db.party.findMany({
        where,
        include: { caseLinks: { include: { case: { select: { filingDate: true, status: true, damagesAwarded: true } } } } },
      });

      const rows = parties
        .map((p) => {
          const asPlaintiff = p.caseLinks.filter((l) => PLAINTIFF_ROLES.includes(l.role)).length;
          const asDefendant = p.caseLinks.length - asPlaintiff;
          const activeCases = p.caseLinks.filter((l) => ["Active", "Instituted", "Opposition Pending", "Appeal Pending"].includes(l.case.status)).length;
          const lastFiling = p.caseLinks.length ? Math.max(...p.caseLinks.map((l) => l.case.filingDate.getTime())) : null;
          const damages = p.caseLinks.reduce((sum, l) => sum + (l.case.damagesAwarded ?? 0), 0);
          return {
            id: p.id,
            slug: p.slug,
            name: p.name,
            type: p.type,
            hqCountry: p.hqCountry,
            totalCases: p.caseLinks.length,
            asPlaintiff,
            asDefendant,
            activeCases,
            damagesInvolved: damages,
            lastFiling: lastFiling ? new Date(lastFiling).toISOString() : null,
          };
        })
        .sort((a, b) => {
          if (sort === "name") return a.name.localeCompare(b.name);
          if (sort === "recent") return (b.lastFiling ?? "").localeCompare(a.lastFiling ?? "");
          return b.totalCases - a.totalCases || a.name.localeCompare(b.name);
        });

      const total = rows.length;
      return {
        data: rows.slice((page - 1) * pageSize, page * pageSize),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    console.error("parties GET failed", err);
    return jsonErr("Failed to load companies", 500);
  }
}

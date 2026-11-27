import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { cached } from "@/lib/cache";
import { limitOr429, parseQuery, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  tech: z.string().trim().max(80).optional(),
  sort: z.enum(["asserted", "recent", "number"]).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(5).max(50).optional(),
});

export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "patents");
  if (limited) return limited;
  try {
    const p = parseQuery(request, querySchema);
    if (!p) return jsonErr("Invalid query parameters");
    const { q, tech, sort = "asserted", page = 1, pageSize = 12 } = p;

    const result = await cached(`api:patents:${q ?? ""}:${tech ?? ""}:${sort}:${page}:${pageSize}`, 60_000, async () => {
      const where: Record<string, unknown> = {};
      if (q) where.OR = [{ number: { contains: q } }, { title: { contains: q } }, { assignee: { contains: q } }];
      if (tech) where.techArea = tech;

      const patents = await db.patent.findMany({
        where,
        include: { cases: { include: { case: { select: { filingDate: true, status: true } } } } },
      });

      const rows = patents
        .map((pat) => {
          const asserted = pat.cases.length;
          const lastAsserted = pat.cases.length ? pat.cases.map((c) => c.case.filingDate.getTime()).sort((a, b) => b - a)[0] : null;
          return {
            id: pat.id,
            number: pat.number,
            title: pat.title,
            techArea: pat.techArea,
            assignee: pat.assignee,
            status: pat.status,
            claimCount: pat.claimCount,
            grantDate: pat.grantDate?.toISOString() ?? null,
            assertedCount: asserted,
            activeCases: pat.cases.filter((c) => ["Active", "Instituted", "Opposition Pending"].includes(c.case.status)).length,
            lastAsserted: lastAsserted ? new Date(lastAsserted).toISOString() : null,
          };
        })
        .sort((a, b) => {
          if (sort === "recent") return (b.lastAsserted ?? "").localeCompare(a.lastAsserted ?? "");
          if (sort === "number") return b.number.localeCompare(a.number);
          return b.assertedCount - a.assertedCount || (b.lastAsserted ?? "").localeCompare(a.lastAsserted ?? "");
        });

      const total = rows.length;
      const data = rows.slice((page - 1) * pageSize, page * pageSize);
      const techAreas = (await db.patent.groupBy({ by: ["techArea"] })).map((t) => t.techArea).filter(Boolean);

      return {
        data,
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
        techAreas,
      };
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    console.error("patents GET failed", err);
    return jsonErr("Failed to load patents", 500);
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { cached } from "@/lib/cache";
import { limitOr429, parseQuery, jsonOk, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  category: z.enum(["LITIGATION", "PTAB", "UPC", "OPPOSITION", "SEP", "ITC", "MARKET"]).optional(),
  limit: z.coerce.number().int().min(5).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "news");
  if (limited) return limited;

  const q = parseQuery(request, querySchema);
  if (!q) return jsonErr("Invalid query parameters");

  try {
    const items = await cached(`api:news:${q.category ?? "all"}:${q.limit}`, 60_000, async () => {
      const rows = await db.newsItem.findMany({
        where: q.category ? { category: q.category } : undefined,
        orderBy: { publishedAt: "desc" },
        take: q.limit,
      });
      return rows.map((n) => ({
        id: n.id,
        title: n.title,
        summary: n.summary,
        category: n.category,
        sourceName: n.sourceName,
        url: n.url,
        publishedAt: n.publishedAt.toISOString(),
      }));
    });
    return jsonOk(items, { cacheSecs: 30 });
  } catch (err) {
    console.error("news GET failed", err);
    return jsonErr("Failed to load news", 500);
  }
}

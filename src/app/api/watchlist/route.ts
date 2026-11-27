import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { toSummary } from "@/lib/caseService";
import { limitOr429, guardWrite } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "watchlist");
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const items = await db.watchlistItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { case: { include: { parties: { include: { party: { select: { name: true } } } } } } },
    });
    return NextResponse.json({
      data: items.map((w) => ({ ...toSummary(w.case), note: w.note, watchedAt: w.createdAt.toISOString() })),
    });
  } catch (err) {
    console.error("watchlist GET failed", err);
    return NextResponse.json({ error: "Failed to load watchlist" }, { status: 500 });
  }
}

const addSchema = z.object({ caseId: z.string().regex(/^[a-zA-Z0-9_-]{5,40}$/), note: z.string().max(300).optional() });

export async function POST(request: NextRequest) {
  const limited = limitOr429(request, "watchlist-write", 30);
  if (limited) return limited;
  const readonly = guardWrite();
  if (readonly) return readonly;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const parsed = addSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "caseId is required" }, { status: 400 });
    const { caseId, note } = parsed.data;
    const exists = await db.case.findUnique({ where: { id: caseId } });
    if (!exists) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    await db.watchlistItem.upsert({
      where: { userId_caseId: { userId: user.id, caseId } },
      create: { userId: user.id, caseId, note },
      update: { note },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("watchlist POST failed", err);
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const limited = limitOr429(request, "watchlist-write", 30);
  if (limited) return limited;
  const readonly = guardWrite();
  if (readonly) return readonly;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const caseId = request.nextUrl.searchParams.get("caseId");
    if (!caseId || !/^[a-zA-Z0-9_-]{5,40}$/.test(caseId)) return NextResponse.json({ error: "caseId is required" }, { status: 400 });
    await db.watchlistItem.deleteMany({ where: { userId: user.id, caseId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("watchlist DELETE failed", err);
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }
}

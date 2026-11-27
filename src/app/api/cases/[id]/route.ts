import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUser, requireAdmin } from "@/lib/auth";
import { toSummary } from "@/lib/caseService";
import { limitOr429, guardWrite, jsonErr } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{5,40}$/);

export async function GET(request: NextRequest, { params }: Params) {
  const limited = limitOr429(request, "case-detail");
  if (limited) return limited;
  try {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return jsonErr("Case not found", 404);
    const c = await db.case.findUnique({
      where: { id },
      include: {
        parties: { include: { party: true } },
        patents: { include: { patent: true } },
        lawFirms: { include: { lawFirm: true } },
        events: { orderBy: { date: "desc" } },
      },
    });
    if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });

    // related cases: share a party or a patent
    const partyIds = c.parties.map((p) => p.partyId);
    const patentIds = c.patents.map((p) => p.patentId);
    const related = await db.case.findMany({
      where: {
        id: { not: c.id },
        OR: [{ parties: { some: { partyId: { in: partyIds } } } }, { patents: { some: { patentId: { in: patentIds } } } }],
      },
      include: { parties: { include: { party: { select: { name: true } } } }, patents: true },
      orderBy: { filingDate: "desc" },
      take: 5,
    });

    const watchCount = await db.watchlistItem.count({ where: { caseId: c.id } });
    const user = await getAuthUser();
    const watched = user ? Boolean(await db.watchlistItem.findUnique({ where: { userId_caseId: { userId: user.id, caseId: c.id } } })) : false;

    return NextResponse.json({
      data: {
        ...toSummary(c),
        parties: c.parties.map((p) => ({
          name: p.party.name,
          slug: p.party.slug,
          type: p.party.type,
          role: p.role,
          hqCountry: p.party.hqCountry,
          description: p.party.description,
        })),
        patents: c.patents.map((p) => ({
          id: p.patent.id,
          number: p.patent.number,
          title: p.patent.title,
          techArea: p.patent.techArea,
          assignee: p.patent.assignee,
          grantDate: p.patent.grantDate?.toISOString() ?? null,
          claimCount: p.patent.claimCount,
          status: p.patent.status,
        })),
        lawFirms: c.lawFirms.map((l) => ({ name: l.lawFirm.name, city: l.lawFirm.city, country: l.lawFirm.country, side: l.side })),
        events: c.events.map((e) => ({ id: e.id, date: e.date.toISOString(), kind: e.kind, description: e.description })),
        relatedCases: related.map((r) => ({
          id: r.id,
          caseNumber: r.caseNumber,
          title: r.title,
          jurisdiction: r.jurisdiction,
          status: r.status,
          filingDate: r.filingDate.toISOString(),
          sharedPatents: r.patents.filter((p) => patentIds.includes(p.patentId)).length,
        })),
        watchCount,
        watched,
      },
    });
  } catch (err) {
    console.error("case GET failed", err);
    return NextResponse.json({ error: "Failed to load case" }, { status: 500 });
  }
}

const updateSchema = z.object({
  title: z.string().min(3).max(300).optional(),
  court: z.string().min(2).max(120).optional(),
  courtDetail: z.string().max(120).nullable().optional(),
  judge: z.string().max(120).nullable().optional(),
  status: z.string().min(2).max(80).optional(),
  cause: z.string().max(160).nullable().optional(),
  techArea: z.string().max(80).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  damagesAwarded: z.number().nonnegative().nullable().optional(),
  filingDate: z.string().optional(),
  closedDate: z.string().nullable().optional(),
});

export async function PUT(request: NextRequest, { params }: Params) {
  const limited = limitOr429(request, "case-write", 30);
  if (limited) return limited;
  const readonly = guardWrite();
  if (readonly) return readonly;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  try {
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;
    const data: Record<string, unknown> = {};
    for (const key of ["title", "court", "courtDetail", "judge", "status", "cause", "techArea", "summary", "damagesAwarded"] as const) {
      if (d[key] !== undefined) data[key] = d[key];
    }
    if (d.filingDate) {
      const fd = new Date(d.filingDate);
      if (isNaN(fd.getTime())) return NextResponse.json({ error: "Invalid filing date" }, { status: 400 });
      data.filingDate = fd;
    }
    if (d.closedDate !== undefined) data.closedDate = d.closedDate ? new Date(d.closedDate) : null;

    const existing = await db.case.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (d.status && d.status !== existing.status) {
      await db.caseEvent.create({
        data: { caseId: id, date: new Date(), kind: "ORDER", description: `Case status updated: ${existing.status} → ${d.status}.` },
      });
    }
    const updated = await db.case.update({
      where: { id },
      data,
      include: { parties: { include: { party: { select: { name: true } } } } },
    });
    return NextResponse.json({ data: toSummary(updated) });
  } catch (err) {
    console.error("case PUT failed", err);
    return NextResponse.json({ error: "Failed to update case" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const limited = limitOr429(request, "case-write", 30);
  if (limited) return limited;
  const readonly = guardWrite();
  if (readonly) return readonly;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  try {
    const { id } = await params;
    const existing = await db.case.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    await db.case.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("case DELETE failed", err);
    return NextResponse.json({ error: "Failed to delete case" }, { status: 500 });
  }
}

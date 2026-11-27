import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PLAINTIFF_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;
    const party = await db.party.findUnique({
      where: { slug },
      include: {
        caseLinks: {
          include: {
            case: {
              include: {
                parties: { include: { party: { select: { id: true, name: true, slug: true } } } },
                lawFirms: { include: { lawFirm: true } },
              },
            },
          },
        },
      },
    });
    if (!party) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const links = party.caseLinks;
    const asPlaintiff = links.filter((l) => PLAINTIFF_ROLES.includes(l.role)).length;
    const asDefendant = links.length - asPlaintiff;
    const activeCases = links.filter((l) => ["Active", "Instituted", "Opposition Pending", "Appeal Pending"].includes(l.case.status)).length;
    const damages = links.reduce((sum, l) => sum + (l.case.damagesAwarded ?? 0), 0);

    // top opponents across this party's cases
    const opponents = new Map<string, number>();
    for (const l of links) {
      const isPlaintiffSide = PLAINTIFF_ROLES.includes(l.role);
      for (const p of l.case.parties) {
        const sameSide = PLAINTIFF_ROLES.includes(p.role) === isPlaintiffSide;
        if (sameSide || p.party.id === party.id) continue;
        opponents.set(p.party.name, (opponents.get(p.party.name) ?? 0) + 1);
      }
    }
    const topOpponents = [...opponents.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // law firms that represented this party (same side)
    const firms = new Map<string, { name: string; city: string | null; side: string; count: number }>();
    for (const l of links) {
      const isPlaintiffSide = PLAINTIFF_ROLES.includes(l.role);
      for (const f of l.case.lawFirms) {
        const matches = isPlaintiffSide ? f.side === "PLAINTIFF" : f.side === "DEFENDANT";
        if (!matches) continue;
        const key = f.lawFirm.name;
        const entry = firms.get(key) ?? { name: f.lawFirm.name, city: f.lawFirm.city, side: f.side, count: 0 };
        entry.count++;
        firms.set(key, entry);
      }
    }

    const patents = await db.patent.findMany({ where: { assignee: party.name }, orderBy: { grantDate: "desc" }, take: 8 });

    const recentCases = links
      .map((l) => l.case)
      .sort((a, b) => b.filingDate.getTime() - a.filingDate.getTime())
      .slice(0, 12)
      .map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        title: c.title,
        jurisdiction: c.jurisdiction,
        court: c.court,
        status: c.status,
        filingDate: c.filingDate.toISOString(),
        role: links.find((l) => l.caseId === c.id)?.role ?? "PLAINTIFF",
      }));

    return NextResponse.json({
      data: {
        party: { id: party.id, slug: party.slug, name: party.name, type: party.type, hqCountry: party.hqCountry, hqCity: party.hqCity, description: party.description },
        stats: { totalCases: links.length, asPlaintiff, asDefendant, activeCases, damagesInvolved: damages },
        topOpponents,
        lawFirms: [...firms.values()].sort((a, b) => b.count - a.count).slice(0, 6),
        patents: patents.map((p) => ({ id: p.id, number: p.number, title: p.title, techArea: p.techArea, grantDate: p.grantDate?.toISOString() ?? null, status: p.status })),
        recentCases,
      },
    });
  } catch (err) {
    console.error("party GET failed", err);
    return NextResponse.json({ error: "Failed to load company" }, { status: 500 });
  }
}

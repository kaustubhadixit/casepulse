import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const patent = await db.patent.findUnique({
      where: { id },
      include: { cases: { include: { case: { include: { parties: { include: { party: { select: { name: true } } } } } } } } },
    });
    if (!patent) return NextResponse.json({ error: "Patent not found" }, { status: 404 });

    return NextResponse.json({
      data: {
        id: patent.id,
        number: patent.number,
        title: patent.title,
        techArea: patent.techArea,
        assignee: patent.assignee,
        status: patent.status,
        claimCount: patent.claimCount,
        abstract: patent.abstract,
        filingDate: patent.filingDate?.toISOString() ?? null,
        grantDate: patent.grantDate?.toISOString() ?? null,
        cases: patent.cases.map((c) => ({
          id: c.case.id,
          caseNumber: c.case.caseNumber,
          title: c.case.title,
          jurisdiction: c.case.jurisdiction,
          court: c.case.court,
          status: c.case.status,
          filingDate: c.case.filingDate.toISOString(),
          plaintiffs: c.case.parties.filter((p) => ["PLAINTIFF", "PETITIONER", "OPPONENT"].includes(p.role)).map((p) => p.party.name),
          defendants: c.case.parties.filter((p) => !["PLAINTIFF", "PETITIONER", "OPPONENT"].includes(p.role)).map((p) => p.party.name),
        })),
      },
    });
  } catch (err) {
    console.error("patent GET failed", err);
    return NextResponse.json({ error: "Failed to load patent" }, { status: 500 });
  }
}

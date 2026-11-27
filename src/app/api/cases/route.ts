import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { listCases, caseFacets, toSummary } from "@/lib/caseService";
import { requestTick, getOverlay } from "@/lib/live";
import { cached } from "@/lib/cache";
import { limitOr429, parseQuery, jsonOk, jsonErr, guardWrite } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  jurisdiction: z.enum(["DISTRICT_COURT", "PTAB", "UPC", "EPO_OPPOSITION", "ITC", "SEP"]).optional(),
  court: z.string().trim().max(120).optional(),
  status: z.string().trim().max(80).optional(),
  tech: z.string().trim().max(80).optional(),
  party: z.string().trim().max(120).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(["recent", "newest", "oldest", "damages", "updated"]).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(5).max(50).optional(),
});

export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "cases");
  if (limited) return limited;
  try {
    const q = parseQuery(request, querySchema);
    if (!q) return jsonErr("Invalid query parameters");

    requestTick(); // traffic nudge for the continuous engine

    const [result, facets] = await Promise.all([
      listCases(q),
      cached(`api:facets:${q.jurisdiction ?? "all"}`, 120_000, () => caseFacets(q.jurisdiction)),
    ]);

    // read-only deployments: merge the live overlay (newest first, filtered)
    const overlay = getOverlay().filter((ov) => {
      if (q.jurisdiction && ov.jurisdiction !== q.jurisdiction) return false;
      if (q.court && !ov.court.toLowerCase().includes(q.court.toLowerCase())) return false;
      if (q.status && ov.status !== q.status) return false;
      if (q.q) {
        const needle = q.q.toLowerCase();
        const hay = `${ov.title} ${ov.caseNumber} ${ov.plaintiffs.join(" ")} ${ov.defendants.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    if (overlay.length) {
      const dbNumbers = new Set(result.data.map((c) => c.caseNumber));
      const fresh = overlay.filter((ov) => !dbNumbers.has(ov.caseNumber));
      if (fresh.length) {
        result.data = [...fresh, ...result.data].slice(0, result.pagination.pageSize);
        result.pagination.total += fresh.length;
        result.pagination.totalPages = Math.max(1, Math.ceil(result.pagination.total / result.pagination.pageSize));
      }
    }

    return NextResponse.json(
      { ...result, facets },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (err) {
    console.error("cases GET failed", err);
    return jsonErr("Failed to load cases", 500);
  }
}

const createSchema = z.object({
  title: z.string().min(3).max(300),
  caseNumber: z.string().max(60).optional(),
  jurisdiction: z.enum(["DISTRICT_COURT", "PTAB", "UPC", "EPO_OPPOSITION", "ITC", "SEP"]),
  court: z.string().min(2).max(120),
  courtDetail: z.string().max(120).optional().nullable(),
  judge: z.string().max(120).optional().nullable(),
  status: z.string().min(2).max(80).default("Active"),
  cause: z.string().max(160).optional().nullable(),
  techArea: z.string().max(80).optional().nullable(),
  filingDate: z.string().min(8),
  damagesAwarded: z.number().nonnegative().optional().nullable(),
  summary: z.string().max(2000).optional().nullable(),
  plaintiffs: z.array(z.string()).min(1),
  defendants: z.array(z.string()).min(1),
  patentNumbers: z.array(z.string()).optional(),
});

/** Resolve or create a Party by name (sanitised, slug-capped). */
async function findOrCreateParty(name: string, _role: string) {
  const clean = name.replace(/[.,]$/g, "").trim().slice(0, 160);
  if (!clean || clean.length < 2) return null;
  const existing = await db.party.findFirst({ where: { name: clean } });
  if (existing) return existing;
  const slug =
    clean
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `p-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  try {
    return await db.party.create({
      data: {
        slug,
        name: clean,
        type: /\b(llc|inc|corp|ltd|gmbh|ag|bv|plc)\b/i.test(clean) && /\b(ip|patent|licensing|innovation|holdings|technology)\b/i.test(clean) ? "NPE" : "COMPANY",
      },
    });
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const limited = limitOr429(request, "cases-write", 30);
  if (limited) return limited;
  const readonly = guardWrite();
  if (readonly) return readonly;

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;
    const filingDate = new Date(d.filingDate);
    if (isNaN(filingDate.getTime())) return NextResponse.json({ error: "Invalid filing date" }, { status: 400 });

    // auto-generate a docket number when none supplied
    let caseNumber = d.caseNumber?.trim();
    if (!caseNumber) {
      const yy = filingDate.getUTCFullYear() % 100;
      caseNumber =
        d.jurisdiction === "PTAB"
          ? `IPR${filingDate.getUTCFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`
          : d.jurisdiction === "UPC"
            ? `UPC_CFI_${Math.floor(Math.random() * 399) + 100}/${filingDate.getUTCFullYear()}`
            : d.jurisdiction === "ITC"
              ? `337-TA-${Math.floor(Math.random() * 130) + 1350}`
              : d.jurisdiction === "EPO_OPPOSITION"
                ? `OPP-${Math.floor(Math.random() * 87000000) + 12000000}`
                : `1:${String(yy).padStart(2, "0")}-cv-${String(Math.floor(Math.random() * 98900) + 100).padStart(5, "0")}`;
      let suffix = 1;
      let candidate = caseNumber;
      while (await db.case.findUnique({ where: { caseNumber: candidate } })) {
        candidate = `${caseNumber}-${++suffix}`;
      }
      caseNumber = candidate;
    } else if (await db.case.findUnique({ where: { caseNumber } })) {
      return NextResponse.json({ error: "A case with this docket number already exists" }, { status: 409 });
    }

    const plaintiffRole =
      d.jurisdiction === "PTAB" ? "PETITIONER" : d.jurisdiction === "EPO_OPPOSITION" ? "OPPONENT" : "PLAINTIFF";
    const defendantRole =
      d.jurisdiction === "PTAB" ? "RESPONDENT" : d.jurisdiction === "EPO_OPPOSITION" ? "PROPRIETOR" : "DEFENDANT";

    const c = await db.case.create({
      data: {
        caseNumber,
        title: d.title,
        jurisdiction: d.jurisdiction,
        court: d.court,
        courtDetail: d.courtDetail ?? null,
        judge: d.judge ?? null,
        status: d.status || "Active",
        cause: d.cause ?? null,
        techArea: d.techArea ?? null,
        summary: d.summary ?? null,
        damagesAwarded: d.damagesAwarded ?? null,
        filingDate,
        source: "manual",
      },
      include: { parties: { include: { party: { select: { name: true } } } } },
    });

    for (const name of d.plaintiffs) {
      const party = await findOrCreateParty(name, plaintiffRole);
      if (party) await db.caseParty.create({ data: { caseId: c.id, partyId: party.id, role: plaintiffRole } });
    }
    for (const name of d.defendants) {
      const party = await findOrCreateParty(name, defendantRole);
      if (party) await db.caseParty.create({ data: { caseId: c.id, partyId: party.id, role: defendantRole } });
    }
    for (const number of d.patentNumbers ?? []) {
      const clean = number.trim();
      if (!clean) continue;
      let patent = await db.patent.findUnique({ where: { number: clean } });
      if (!patent) {
        patent = await db.patent.create({
          data: {
            number: clean,
            title: d.techArea ? `Patent asserted in ${c.caseNumber}` : "Patent asserted",
            techArea: d.techArea ?? null,
            assignee: d.plaintiffs[0] ?? null,
            filingDate,
            grantDate: filingDate,
            claimCount: 20,
            status: "Active",
          },
        });
      }
      await db.casePatent.create({ data: { caseId: c.id, patentId: patent.id } });
    }
    await db.caseEvent.create({
      data: { caseId: c.id, date: filingDate, kind: "FILING", description: `${d.cause ?? "Complaint"} filed.` },
    });
    const refreshed = await db.case.findUniqueOrThrow({
      where: { id: c.id },
      include: { parties: { include: { party: { select: { name: true } } } } },
    });
    return NextResponse.json({ data: toSummary(refreshed) }, { status: 201 });
  } catch (err) {
    console.error("cases POST failed", err);
    return NextResponse.json({ error: "Failed to create case" }, { status: 500 });
  }
}

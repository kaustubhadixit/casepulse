import { db } from "@/lib/db";
import { cacheInvalidate } from "@/lib/cache";
import {
  fetchCourtListenerDockets,
  fetchPatentBiblio,
  type RawFiling,
  type CLChangedDocket,
} from "@/lib/sources";

/**
 * Ingestion primitives for the LIVE sync engine (src/lib/live.ts).
 *
 * There is no schedule in here on purpose — the live engine polls upstream
 * change cursors continuously (as data changes) and calls these functions to
 * persist what it finds:
 *
 *   - ingestExternalFiling()   → persist a brand-new upstream case
 *   - ingestDocketUpdate()     → apply a change to an already-tracked case
 *   - createDemoCase() et al.  → labeled synthetic fallback, demo mode only
 *   - runBackfill()            → one-shot historical bootstrap (build script)
 *
 * Upstream adapters live in src/lib/sources/ (CourtListener RECAP search +
 * change cursor, USPTO PTAB, PatentsView enrichment). Nothing here depends
 * on GreyB or its data suppliers.
 */

const DISTRICT_DIV: Record<string, string> = {
  "E.D. Tex.": "2",
  "W.D. Tex.": "6",
  "D. Del.": "1",
  "N.D. Cal.": "3",
  "C.D. Cal.": "8",
  "D.N.J.": "2",
  "N.D. Ill.": "1",
  "S.D.N.Y.": "1",
  "D. Mass.": "1",
  "M.D. Fla.": "8",
  "E.D. Va.": "1",
  "W.D. Wash.": "2",
  "N.D. Tex.": "3",
  "D. Colo.": "1",
};

const TECH_AREAS = [
  "Consumer Electronics",
  "Semiconductors",
  "Telecommunications",
  "Software & E-Commerce",
  "Digital Media",
  "Pharmaceuticals & Biotech",
  "Medical Devices",
  "Chemistry & Materials",
  "Food & Nutrition",
  "Automotive & Mobility",
  "Industrial Manufacturing",
  "Clean Energy",
  "Networking",
  "Wearables & IoT",
  "Agricultural Tech",
];

const JUDGES = [
  "Hon. Adaline Mercer",
  "Hon. Marcus Thorne",
  "Hon. Priya Raghunathan",
  "Hon. Daniel Osei",
  "Hon. Lillian Brandt",
  "Hon. Cormac Doyle",
  "Hon. Sofia Marchetti",
  "Hon. Harold Wexley",
  "Hon. Amara Nwosu",
  "Hon. Julian Ferreira",
  "Hon. Beatrice Lindqvist",
  "Hon. Thomas Ardmore",
  "Hon. Celeste Dupont",
  "Hon. Nathaniel Cross",
  "Hon. Imani Walker",
];

const UPC_DIVISIONS = [
  "UPC — Local Division Munich",
  "UPC — Local Division Düsseldorf",
  "UPC — Local Division Mannheim",
  "UPC — Local Division Paris",
  "UPC — Local Division Milan",
  "UPC — Local Division The Hague",
  "UPC — Local Division Hamburg",
  "UPC — Nordic-Baltic Regional Division",
  "UPC — Central Division (Paris)",
];

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rand(a.length)];
const pickMany = <T,>(a: T[], n: number): T[] => {
  const c = [...a];
  const o: T[] = [];
  for (let i = 0; i < n && c.length; i++) o.push(c.splice(rand(c.length), 1)[0]);
  return o;
};

async function uniqueCaseNumber(gen: () => string): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const n = gen();
    if (!(await db.case.findUnique({ where: { caseNumber: n } }))) return n;
  }
  return `PP-${Date.now()}-${rand(9999)}`;
}

async function randomParties(type: string, n: number) {
  const rows = await db.party.findMany({ where: { type } });
  return pickMany(rows, n);
}

/* ---------------- upstream → model mapping ---------------- */

/** Conservative entity-type heuristic for imported party names (labeled as heuristic in the UI). */
function classifyPartyType(name: string): "NPE" | "COMPANY" | "UNIVERSITY" | "INDIVIDUAL" {
  if (/\b(university|college|institute of technology|research council)\b/i.test(name)) return "UNIVERSITY";
  const hasEntitySuffix = /\b(llc|l\.l\.c|inc|corp|ltd|limited|co\.|gmbh|ag|bv|s\.a|plc)\b/i.test(name);
  const npeSignal = /\b(ip|intellectual property|licensing|licensors?|innovation|invention|patents?|holdings|royalty)\b/i.test(name);
  if (hasEntitySuffix && npeSignal) return "NPE";
  if (!hasEntitySuffix && /^\b[A-Z][a-z]+(\s+[A-Z][a-z]+)*\b/.test(name) && !/\b(trust|estate)\b/i.test(name)) {
    // sole individuals like "John Smith" — no entity marker at all
    if (!name.split(/\s+/).some((w) => w === w.toUpperCase() && w.length > 1)) return "INDIVIDUAL";
  }
  return "COMPANY";
}

async function upsertParty(name: string): Promise<{ id: string; name: string } | null> {
  const clean = name.replace(/[.,]$/g, "").trim().slice(0, 160);
  if (!clean || clean.length < 2) return null;
  const slug = clean
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `p-${Date.now()}-${rand(9999)}`;
  const existing = await db.party.findFirst({ where: { name: clean } });
  if (existing) return existing;
  try {
    return await db.party.create({
      data: { slug, name: clean, type: classifyPartyType(clean) },
    });
  } catch {
    return null;
  }
}

export interface IngestResult {
  ingested: boolean;
  id?: string;
  caseNumber?: string;
  title?: string;
  court?: string;
  jurisdiction?: string;
  url?: string | null;
}

/** Persist one real upstream filing as a Case (+parties, news item). Idempotent. */
export async function ingestExternalFiling(f: RawFiling, sourceLabel: string): Promise<IngestResult> {
  if (!f.caseNumber || f.caseNumber === "UNKNOWN") return { ingested: false };
  const dup =
    (f.sourceId ? await db.case.findUnique({ where: { sourceId: f.sourceId } }) : null) ??
    (await db.case.findFirst({ where: { caseNumber: f.caseNumber, court: f.court } }));
  if (dup) return { ingested: false };

  // resolve every named party (cap per side keeps abuse safe)
  const plaintiffNames = (f.plaintiffNames.length ? f.plaintiffNames : ["Unknown plaintiff"]).slice(0, 6);
  const defendantNames = (f.defendantNames.length ? f.defendantNames : ["Unknown defendant"]).slice(0, 6);
  const plaintiffs = (await Promise.all(plaintiffNames.map((n) => upsertParty(n)))).filter(
    (p): p is { id: string; name: string } => Boolean(p),
  );
  const defendants = (await Promise.all(defendantNames.map((n) => upsertParty(n)))).filter(
    (p): p is { id: string; name: string } => Boolean(p),
  );
  if (!plaintiffs.length || !defendants.length) return { ingested: false };

  const techArea = null;
  const caseNumber = f.caseNumber.includes("cv") || f.jurisdictionType === "PTAB"
    ? f.caseNumber
    : await uniqueCaseNumber(() => f.caseNumber);

  const c = await db.case.create({
    data: {
      caseNumber,
      sourceId: f.sourceId || null,
      title: f.title || `${plaintiffs[0].name} v. ${defendants[0].name}`,
      jurisdiction: f.jurisdictionType,
      court: f.court || "U.S. District Court",
      courtDetail: f.courtCitation ?? f.courtCode ?? null,
      judge: f.judge,
      status: "Active",
      cause: f.cause ?? "Patent Infringement (35 U.S.C. § 271)",
      techArea,
      summary: `${plaintiffs[0].name} asserts patent rights against ${defendants.map((d) => d.name).join(", ")} before the ${f.court || "court"}. Imported from ${sourceLabel}.`,
      filingDate: new Date(f.filingDate),
      source: f.jurisdictionType === "PTAB" ? "uspto-ptab" : "courtlistener",
    },
  });

  const pRole = f.jurisdictionType === "PTAB" ? "PETITIONER" : "PLAINTIFF";
  const dRole = f.jurisdictionType === "PTAB" ? "RESPONDENT" : "DEFENDANT";
  for (const p of plaintiffs) await db.caseParty.create({ data: { caseId: c.id, partyId: p.id, role: pRole } }).catch(() => {});
  for (const d of defendants) await db.caseParty.create({ data: { caseId: c.id, partyId: d.id, role: dRole } }).catch(() => {});

  // enrich + link asserted patents when the upstream provides numbers
  for (const num of f.patentNumbers ?? []) {
    const biblio = await fetchPatentBiblio(num).catch(() => ({
      ok: false as const,
      title: undefined,
      assignee: undefined,
      filingDate: undefined,
      abstract: undefined,
    }));
    const patent =
      (await db.patent.findUnique({ where: { number: num } })) ??
      (await db.patent
        .create({
          data: {
            number: num,
            title: biblio?.ok && biblio.title ? biblio.title : `Patent ${num}`,
            techArea,
            assignee: biblio?.ok && biblio.assignee ? biblio.assignee : defendants[0].name,
            status: "Active",
            abstract: biblio?.ok && biblio.abstract ? String(biblio.abstract).slice(0, 500) : null,
          },
        })
        .catch(() => null));
    if (patent) await db.casePatent.create({ data: { caseId: c.id, patentId: patent.id } }).catch(() => {});
  }

  await db.caseEvent.create({
    data: { caseId: c.id, date: new Date(f.filingDate), kind: "FILING", description: `Docket imported from ${sourceLabel}.` },
  }).catch(() => {});

  await db.newsItem.create({
    data: {
      title: `${plaintiffs[0].name} files against ${defendants.map((d) => d.name).join(", ")} (${caseNumber})`,
      summary: `New ${f.jurisdictionType === "PTAB" ? "PTAB petition" : "patent complaint"} ingested from ${sourceLabel}. Docket: ${caseNumber}.`,
      category: f.jurisdictionType === "PTAB" ? "PTAB" : "LITIGATION",
      sourceName: sourceLabel,
      url: f.url ?? null,
    },
  }).catch(() => {});

  return {
    ingested: true,
    id: c.id,
    caseNumber,
    title: c.title,
    court: c.court,
    jurisdiction: c.jurisdiction,
    url: f.url ?? null,
  };
}

/**
 * Apply a change-cursor docket update to an already-tracked case:
 * judge assignment / reassignment and docket termination are the material
 * changes RECAP surfaces on the docket object. Returns true when something
 * actually changed (a CaseEvent is written and the case row updated).
 */
export async function ingestDocketUpdate(d: CLChangedDocket, existing: { id: string; judge: string | null; status: string; closedDate: Date | null }): Promise<boolean> {
  if (!existing) return false;
  const patch: Record<string, unknown> = {};
  const notes: { kind: string; description: string }[] = [];

  if (d.assignedTo && d.assignedTo !== existing.judge) {
    patch.judge = d.assignedTo.slice(0, 120);
    notes.push({
      kind: "UPDATE",
      description: existing.judge
        ? `Docket update: case reassigned to ${patch.judge} (previously ${existing.judge}).`
        : `Docket update: ${patch.judge} assigned to the case.`,
    });
  }
  if (d.dateTerminated && !existing.closedDate) {
    patch.closedDate = new Date(d.dateTerminated);
    patch.status = /dismiss/i.test(d.cause ?? "") ? "Dismissed" : "Terminated";
    notes.push({ kind: "UPDATE", description: `Docket update: case terminated (${d.dateTerminated}).` });
  }
  if (!notes.length) return false;

  await db.case.update({ where: { id: existing.id }, data: patch }).catch(() => {});
  for (const n of notes) {
    await db.caseEvent
      .create({ data: { caseId: existing.id, date: new Date(d.dateModified), kind: n.kind, description: n.description } })
      .catch(() => {});
  }
  return true;
}

/* ---------------- synthetic fallback generator (demo mode) ---------------- */

/** Create one fresh filing across a random (or given) jurisdiction. */
export async function createDemoCase(jurisdiction?: string) {
  const j =
    jurisdiction ??
    pick([
      "DISTRICT_COURT",
      "DISTRICT_COURT",
      "DISTRICT_COURT",
      "PTAB",
      "PTAB",
      "EPO_OPPOSITION",
      "UPC",
      "ITC",
      "SEP",
    ]);

  const now = new Date();
  const filingDate = new Date(now.getTime() - rand(3) * 864e5);
  const techArea = pick(TECH_AREAS);
  const plaintiffs = await randomParties(pick(["NPE", "NPE", "COMPANY"]), 1);
  if (!plaintiffs.length) return null;
  const plaintiff = plaintiffs[0];

  let defendants = await randomParties("COMPANY", rand(2) + 1);
  defendants = defendants.filter((d) => d.id !== plaintiff.id);
  if (!defendants.length) defendants = await randomParties("COMPANY", 1);
  if (!defendants.length) return null;

  // patents: reuse one of the plaintiff's existing patents or mint a fresh one
  let patents = await db.patent.findMany({ where: { assignee: plaintiff.name } });
  let minted = false;
  if (!patents.length || Math.random() < 0.3) {
    const number = `US ${(rand(2900000) + 9300000).toLocaleString("en-US")} B2`;
    const p = await db.patent.create({
      data: {
        number,
        title: `System and method for adaptive ${pick(["data synchronization", "power management", "signal processing", "resource scheduling", "content delivery"])} in ${techArea.toLowerCase()} applications`,
        techArea,
        assignee: plaintiff.name,
        filingDate: new Date(now.getTime() - (rand(1500) + 900) * 864e5),
        grantDate: new Date(now.getTime() - (rand(700) + 60) * 864e5),
        claimCount: 12 + rand(14),
        status: "Active",
        abstract: `The disclosure relates to ${techArea.toLowerCase()}. Embodiments improve efficiency, reliability or cost of existing approaches.`,
      },
    });
    patents = [p];
    minted = true;
  }
  const asserted = pickMany(patents, rand(2) + 1);

  let court = "E.D. Tex.";
  let courtDetail: string | null = null;
  let caseNumber = "";
  let cause = "Patent Infringement (35 U.S.C. § 271)";
  let judge: string | null = pick(JUDGES);
  let plaintiffRole = "PLAINTIFF";
  let defendantRole = "DEFENDANT";
  const yy = filingDate.getUTCFullYear() % 100;

  switch (j) {
    case "PTAB":
      court = "Patent Trial and Appeal Board";
      courtDetail = pick(["Arlington, VA", "Detroit, MI", "San Jose, CA"]);
      cause = pick(["Inter Partes Review", "Post-Grant Review"]) + " Petition";
      caseNumber = await uniqueCaseNumber(() => `${cause.startsWith("Inter") ? "IPR" : "PGR"}${filingDate.getUTCFullYear()}-${String(10000 + rand(89000)).slice(0, 5)}`);
      judge = `APJ ${pick(JUDGES).replace("Hon. ", "")}`;
      plaintiffRole = "PETITIONER";
      defendantRole = "RESPONDENT";
      break;
    case "UPC":
      court = pick(UPC_DIVISIONS);
      cause = "Infringement Action (Art. 32(1)(a) UPCA)";
      caseNumber = await uniqueCaseNumber(() => `UPC_CFI_${100 + rand(399)}/${filingDate.getUTCFullYear()}`);
      break;
    case "EPO_OPPOSITION":
      court = "EPO Opposition Division";
      courtDetail = pick(["Munich", "The Hague", "Berlin"]);
      cause = "Opposition under Art. 99 EPC";
      caseNumber = await uniqueCaseNumber(() => `OPP-${12000000 + rand(87000000)}`);
      judge = null;
      plaintiffRole = "OPPONENT";
      defendantRole = "PROPRIETOR";
      break;
    case "ITC":
      court = "U.S. International Trade Commission";
      courtDetail = "Office of Unfair Import Investigations";
      cause = "Section 337 Investigation";
      caseNumber = await uniqueCaseNumber(() => `337-TA-${1350 + rand(130)}`);
      break;
    case "SEP":
      court = pick(["E.D. Tex.", "W.D. Tex.", "D. Del.", "N.D. Cal.", "S.D.N.Y."]);
      cause = "SEP Infringement & FRAND Terms";
      caseNumber = await uniqueCaseNumber(() => `${DISTRICT_DIV[court] ?? "1"}:${String(yy).padStart(2, "0")}-cv-${String(100 + rand(98900)).padStart(5, "0")}`);
      break;
    default:
      court = pick(Object.keys(DISTRICT_DIV));
      caseNumber = await uniqueCaseNumber(() => `${DISTRICT_DIV[court]}:${String(yy).padStart(2, "0")}-cv-${String(100 + rand(98900)).padStart(5, "0")}`);
      break;
  }

  const title = `${plaintiff.name} v. ${defendants.map((d) => d.name).join(", ")}`;
  const c = await db.case.create({
    data: {
      caseNumber,
      title,
      jurisdiction: j,
      court,
      courtDetail,
      judge,
      status: "Active",
      cause,
      techArea,
      summary: `${plaintiff.name} asserts ${asserted.length} patent${asserted.length > 1 ? "s" : ""} against ${defendants.map((d) => d.name).join(", ")} before the ${court}.`,
      filingDate,
      source: "synthetic",
    },
  });

  await db.caseParty.create({ data: { caseId: c.id, partyId: plaintiff.id, role: plaintiffRole } });
  for (const d of defendants) await db.caseParty.create({ data: { caseId: c.id, partyId: d.id, role: defendantRole } });

  const firms = await db.lawFirm.findMany({});
  for (const f of pickMany(firms, 1)) await db.caseLawFirm.create({ data: { caseId: c.id, lawFirmId: f.id, side: "PLAINTIFF" } });
  for (const f of pickMany(firms, 1)) await db.caseLawFirm.create({ data: { caseId: c.id, lawFirmId: f.id, side: "DEFENDANT" } });

  for (const p of asserted) await db.casePatent.create({ data: { caseId: c.id, patentId: p.id } });

  await db.caseEvent.create({
    data: { caseId: c.id, date: filingDate, kind: "FILING", description: `${cause} filed by ${plaintiff.name}.` },
  });

  if (Math.random() < 0.6) {
    await db.newsItem.create({
      data: {
        title: `${plaintiff.name} files ${j === "EPO_OPPOSITION" ? "opposition" : j === "PTAB" ? "petition" : "new complaint"} against ${defendants[0].name}`,
        summary: `New ${j.replace("_", " ").toLowerCase()} filing detected by the PatentPulse data pipeline${minted ? ", including a first-time asserted patent" : ""}. Docket: ${caseNumber}.`,
        category: j === "DISTRICT_COURT" ? "LITIGATION" : j,
        sourceName: "PatentPulse Newsroom",
      },
    });
  }

  return c;
}

const PROGRESS_EVENTS: { kind: string; description: string }[] = [
  { kind: "SCHEDULING", description: "Scheduling order entered; trial date set." },
  { kind: "MARKMAN", description: "Markman hearing held on disputed claim terms." },
  { kind: "ORDER", description: "Motion to transfer venue denied." },
  { kind: "RULING", description: "Claim construction rulings issued." },
  { kind: "ANSWER", description: "Answer and counterclaims filed." },
  { kind: "INSTITUTION", description: "Trial instituted on all challenged claims." },
  { kind: "APPEAL", description: "Notice of appeal filed." },
];

/** Advance a few active cases (new docket events, occasional status change). Demo mode only. */
export async function advanceDemoCases(max: number) {
  const active = await db.case.findMany({
    where: { status: { in: ["Active", "Instituted", "Opposition Pending"] } },
    take: 40,
    orderBy: { filingDate: "asc" },
  });
  const targets = pickMany(active, Math.min(max, active.length));
  let updated = 0;
  for (const c of targets) {
    const ev = pick(PROGRESS_EVENTS);
    await db.caseEvent.create({
      data: { caseId: c.id, date: new Date(), kind: ev.kind, description: ev.description },
    });
    let status = c.status;
    if (Math.random() < 0.22) {
      status = c.jurisdiction === "PTAB" ? pick(["FWD Issued — All Claims Unpatentable", "Terminated — Settled"]) : c.jurisdiction === "EPO_OPPOSITION" ? pick(["Patent Revoked", "Patent Maintained as Amended", "Opposition Rejected"]) : pick(["Settled", "Dismissed", "Appeal Pending"]);
    }
    await db.case.update({ where: { id: c.id }, data: { status, closedDate: status === "Active" || status === "Instituted" || status === "Opposition Pending" ? null : new Date() } });
    updated++;
  }
  return updated;
}

/* ---------------- one-shot historical backfill ---------------- */

/**
 * One-shot historical backfill: page through the CourtListener RECAP search
 * results (100 per page) and ingest everything not yet in the DB. Used by
 * scripts/backfill-cl.ts and the Vercel build to bootstrap a fresh
 * deployment with real data; continuous updates then flow through the
 * live engine's change cursor.
 */
export async function runBackfill(pages = 5, pageSize = 100): Promise<{ ingested: number; pages: number; skipped: number }> {
  let cursor: string | undefined;
  let ingested = 0;
  let skipped = 0;
  let used = 0;
  for (let i = 0; i < pages; i++) {
    const res = await fetchCourtListenerDockets(pageSize, { cursor });
    if (!res.ok || !res.filings.length) break;
    for (const f of res.filings) {
      const r = await ingestExternalFiling(f, "CourtListener RECAP");
      if (r.ingested) ingested++;
      else skipped++;
    }
    used++;
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
    await new Promise((r) => setTimeout(r, 350)); // stay polite to the free API
  }
  await db.syncLog.create({
    data: {
      source: "backfill (courtlistener)",
      recordsIngested: ingested,
      casesUpdated: 0,
      notes: `backfill: ${used} page(s), ${skipped} already present`,
    },
  });
  cacheInvalidate("api:");
  return { ingested, pages: used, skipped };
}

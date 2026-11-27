/**
 * Upstream data-source adapters.
 *
 * Every adapter targets a FREE, documented public API and degrades gracefully:
 * missing key / network error / rate limit → returns { ok: false } and the
 * sync engine falls back to the next source in the chain (ending with the
 * synthetic simulator), so the live feed never goes dark.
 *
 * Sources (all free):
 *  1. CourtListener RECAP Search API (Free Law Project)
 *     https://www.courtlistener.com/api/  — free account token required.
 *     Real US federal district-court docket metadata, updated continuously
 *     as RECAP mirrors PACER. Verified query shape (v4):
 *       GET /api/rest/v4/search/?q="patent infringement"&type=r
 *         &order_by=dateFiled+desc&page_size=N
 *       → returns caseName, party[], court, court_id, court_citation_string,
 *         docketNumber, dateFiled, cause, assignedTo, docket_absolute_url…
 *       Supports court=txed,ded,… and filed_after/filed_before filters.
 *       (NOTE: a bare `court=fd` filter returns 0 hits — do not use.)
 *  2. USPTO Open Data Portal — PTAB API (api.uspto.gov/ptab-api)
 *     Free API key from https://developer.uspto.gov/. Real PTAB/AIA trial
 *     proceedings metadata, refreshed by USPTO daily.
 *  3. USPTO PatentsView (search.patentsview.org) — free API key.
 *     Patent bibliographic data used to enrich asserted-patent records.
 *
 * None of these are GreyB feeds: the pipeline is fully independent of the
 * original site and its data suppliers.
 */

export const CL_BASE = "https://www.courtlistener.com/api/rest/v4";
export const PTAB_BASE = "https://api.uspto.gov/ptab-api";
export const PV_BASE = "https://search.patentsview.org/api/v1";

const DEFAULT_TIMEOUT_MS = 12_000;

async function fetchJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { __error: true, status: res.status, body: body.slice(0, 200) };
    }
    return await res.json();
  } catch (err) {
    return { __error: true, status: 0, body: String((err as Error).message ?? err) };
  } finally {
    clearTimeout(t);
  }
}

export interface RawFiling {
  sourceId: string; // upstream unique id (docket id / proceeding id)
  caseNumber: string; // normalized docket number
  title: string; // plaintiff v. defendant
  court: string; // human court name
  courtCode?: string; // CL court id e.g. "txnd"
  courtCitation?: string; // e.g. "N.D. Tex."
  filingDate: string; // ISO
  cause?: string | null;
  judge?: string | null;
  jurisdictionType: "DISTRICT_COURT" | "PTAB";
  plaintiffNames: string[];
  defendantNames: string[];
  patentNumbers?: string[];
  url?: string | null;
}

/* ---------------- 1. CourtListener RECAP search ---------------- */

/**
 * Pull the most recently filed patent-infringement dockets from the
 * CourtListener RECAP Search API (v4). Anonymous calls are rejected with
 * 401, so a COURTLISTENER_TOKEN from a free account is required.
 *
 * Docs: https://www.courtlistener.com/api/
 * Free signup: https://www.courtlistener.com/register/
 */
export async function fetchCourtListenerDockets(
  limit = 40,
  opts?: { daysBack?: number; cursor?: string },
): Promise<{ ok: boolean; filings: RawFiling[]; error?: string; nextCursor?: string | null }> {
  const token = process.env.COURTLISTENER_TOKEN;
  if (!token) return { ok: false, filings: [], error: "COURTLISTENER_TOKEN not configured" };

  const params = new URLSearchParams({
    q: '"patent infringement"',
    type: "r",
    order_by: "dateFiled desc",
    page_size: String(Math.min(100, Math.max(1, limit))),
  });
  if (opts?.daysBack) {
    const from = new Date(Date.now() - opts.daysBack * 864e5).toISOString().slice(0, 10);
    params.set("filed_after", from);
  }
  if (opts?.cursor) params.set("cursor", opts.cursor);

  const data = await fetchJson(`${CL_BASE}/search/?${params.toString()}`, { Authorization: `Token ${token}` });
  if (data.__error) return { ok: false, filings: [], error: `HTTP ${data.status}: ${data.body}` };

  const results: any[] = data?.results ?? [];
  const filings: RawFiling[] = [];
  for (const r of results) {
    const caseName = cleanPartyName(r.caseName ?? "");
    if (!caseName) continue;
    const parties = Array.isArray(r.party) ? r.party.map((p: unknown) => String(p)).filter(Boolean) : [];
    const { plaintiffs, defendants } = splitParties(caseName, parties);
    filings.push({
      sourceId: String(r.docket_id ?? r.id ?? ""),
      caseNumber: String(r.docketNumber ?? "UNKNOWN").trim() || "UNKNOWN",
      title: caseName,
      court: r.court ?? "U.S. District Court",
      courtCode: r.court_id,
      courtCitation: r.court_citation_string ?? undefined,
      filingDate: String(r.dateFiled ?? new Date().toISOString()).slice(0, 10),
      cause: r.cause ?? "Patent Infringement (35 U.S.C. § 271)",
      judge: r.assignedTo ?? null,
      jurisdictionType: "DISTRICT_COURT",
      plaintiffNames: plaintiffs,
      defendantNames: defendants,
      patentNumbers: extractPatentNumbers(r),
      url: r.docket_absolute_url ? `https://www.courtlistener.com${r.docket_absolute_url}` : null,
    });
  }
  return {
    ok: true,
    filings,
    nextCursor: data?.next ? new URL(data.next).searchParams.get("cursor") : null,
  };
}

/** Patent numbers sometimes appear in the cause or docket suffix — pull US 7/8-digit patterns from recap documents. */
function extractPatentNumbers(r: any): string[] | undefined {
  const docs: any[] = Array.isArray(r.recap_documents) ? r.recap_documents : [];
  const found = new Set<string>();
  for (const d of docs.slice(0, 3)) {
    const text = String(d?.description ?? "");
    for (const m of text.matchAll(/U\.?S\.?\s*Patent\s*(?:No\.?|Number)\s*[:#]?\s*(\d{7,8})/gi)) {
      found.add(`US ${m[1]} B2`);
    }
  }
  return found.size ? [...found].slice(0, 4) : undefined;
}

/* ---------------- 1b. CourtListener change cursor (RECAP core API) ---------------- */

export interface CLChangedDocket {
  id: string;
  caseName: string;
  docketNumber: string;
  courtId: string | null;
  courtName: string | null;
  cause: string | null;
  natureOfSuit: string | null;
  jurisdictionType: string | null;
  dateFiled: string | null;
  dateTerminated: string | null;
  dateModified: string; // ISO — the change-cursor clock
  assignedTo: string | null;
  url: string | null;
}

/**
 * CHANGE-CURSOR lane — the heart of the near-live pipeline.
 *
 * `GET /api/rest/v4/dockets/?date_modified__gt=<cursor>` returns every RECAP
 * docket modified AFTER the cursor timestamp. RECAP data changes continuously
 * (as PACER filings and docket entries are mirrored), so polling this cursor
 * with a short adaptive interval means we fetch *as the data changes*, not on
 * a fixed schedule. Pagination follows the API `next` cursor until caught up
 * (bounded by `maxPages` per tick; the remainder continues on the next tick).
 *
 * Verified live: dockets modified minutes/hours ago are returned, `page_size`
 * is preserved through `next` links, and the cursor filter is honored.
 */
export async function fetchCourtListenerChangedDockets(
  cursorIso: string,
  maxPages = 4,
  pageSize = 100,
): Promise<{ ok: boolean; dockets: CLChangedDocket[]; newCursor: string | null; error?: string; more: boolean; pagesUsed: number }> {
  const token = process.env.COURTLISTENER_TOKEN;
  if (!token) return { ok: false, dockets: [], newCursor: null, error: "COURTLISTENER_TOKEN not configured", more: false, pagesUsed: 0 };

  const dockets: CLChangedDocket[] = [];
  let next: string | null =
    `${CL_BASE}/dockets/?${new URLSearchParams({
      date_modified__gt: cursorIso,
      page_size: String(Math.min(100, Math.max(1, pageSize))),
    }).toString()}`;
  let pages = 0;
  let maxModified: string | null = null;

  while (next && pages < maxPages) {
    const data = await fetchJson(next, { Authorization: `Token ${token}` }, 30_000);
    if (data.__error)
      return { ok: false, dockets: [], newCursor: null, error: `HTTP ${data.status}: ${String(data.body).slice(0, 120)}`, more: false, pagesUsed: pages + 1 };
    const results: any[] = data?.results ?? [];
    for (const r of results) {
      const mod = String(r.date_modified ?? "");
      if (mod && (!maxModified || mod > maxModified)) maxModified = mod;
      dockets.push({
        id: String(r.id ?? ""),
        caseName: cleanPartyName(String(r.case_name ?? "")),
        docketNumber: String(r.docket_number ?? "").trim(),
        courtId: r.court_id ?? null,
        courtName: typeof r.court === "string" ? r.court : null, // court is a resource URI; map via courtId
        cause: r.cause ?? null,
        natureOfSuit: r.nature_of_suit != null ? String(r.nature_of_suit) : null,
        jurisdictionType: r.jurisdiction_type ?? null,
        dateFiled: r.date_filed ?? null,
        dateTerminated: r.date_terminated ?? null,
        dateModified: mod,
        assignedTo: r.assigned_to_str ?? null,
        url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : null,
      });
    }
    pages++;
    next = typeof data?.next === "string" && data.next ? data.next : null;
  }

  return { ok: true, dockets, newCursor: maxModified, more: Boolean(next), pagesUsed: pages };
}

/** Federal nature-of-suit codes this platform tracks (830 = patent, 840 = trademark/copyright adjacent). */
export function isPatentDocket(d: CLChangedDocket): boolean {
  const nos = (d.natureOfSuit ?? "").trim();
  if (nos === "830") return true;
  const cause = (d.cause ?? "").toLowerCase();
  return cause.includes("patent");
}

/* ---------------- 2. USPTO PTAB proceedings ---------------- */

/**
 * Recently instituted PTAB (AIA) trial proceedings from the USPTO Open Data
 * Portal. Requires a free PATENTSVIEW/USPTO API key
 * (https://developer.uspto.gov — "PTAB API").
 */
export async function fetchPtabProceedings(limit = 20): Promise<{ ok: boolean; filings: RawFiling[]; error?: string }> {
  const apiKey = process.env.USPTO_PTAB_KEY ?? process.env.PATENTSVIEW_API_KEY;
  if (!apiKey) return { ok: false, filings: [], error: "USPTO_PTAB_KEY not configured" };
  const url = `${PTAB_BASE}/proceeding?start=0&rows=${limit}&proceedingStatus=INSTITUTED`;
  const data = await fetchJson(url, { "X-Api-Key": apiKey });
  if (data.__error) return { ok: false, filings: [], error: `HTTP ${data.status}: ${data.body}` };
  const results: any[] = data?.results ?? [];
  const filings: RawFiling[] = [];
  for (const r of results) {
    const pName = cleanPartyName(r.petitionerName ?? "Unknown petitioner");
    const dName = cleanPartyName(r.patentOwnerName ?? "Unknown patent owner");
    filings.push({
      sourceId: String(r.proceedingNumber ?? r.trialNumber ?? ""),
      caseNumber: r.proceedingNumber ?? r.trialNumber ?? "UNKNOWN",
      title: `${pName} v. ${dName}`,
      court: "Patent Trial and Appeal Board",
      filingDate: String(r.institutionDate ?? r.filingDate ?? new Date().toISOString()).slice(0, 10),
      cause: r.proceedingType ?? "Inter Partes Review",
      judge: null,
      jurisdictionType: "PTAB",
      plaintiffNames: [pName],
      defendantNames: [dName],
      patentNumbers: r.patentNumber ? [String(r.patentNumber)] : undefined,
    });
  }
  return { ok: true, filings };
}

/* ---------------- 3. PatentsView (enrichment) ---------------- */

/** Look up patent bibliographic basics for an asserted patent number (free key). */
export async function fetchPatentBiblio(
  patentNumber: string,
): Promise<{ ok: boolean; title?: string; assignee?: string; filingDate?: string; abstract?: string }> {
  const apiKey = process.env.PATENTSVIEW_API_KEY;
  if (!apiKey) return { ok: false };
  const num = patentNumber.replace(/\D/g, "");
  const url = `${PV_BASE}/patent/?q=${encodeURIComponent(`{"patent_id":"${num}"}`)}&f=["patent_title","assignee_organization","filing_date","patent_abstract"]`;
  const data = await fetchJson(url, { "X-Api-Key": apiKey });
  if (data.__error) return { ok: false };
  const p = data?.patents?.[0];
  if (!p) return { ok: false };
  return {
    ok: true,
    title: p.patent_title ?? undefined,
    assignee: Array.isArray(p.assignee_organization) ? p.assignee_organization[0] : p.assignee_organization ?? undefined,
    filingDate: p.filing_date ?? undefined,
    abstract: p.patent_abstract ?? undefined,
  };
}

/* ---------------- helpers ---------------- */

function cleanPartyName(name: string): string {
  return String(name).replace(/\s+/g, " ").trim();
}

/** Split "A, B v. C, D" into sides; uses the v4 `party` array when available. */
function splitParties(title: string, partyArray: string[]): { plaintiffs: string[]; defendants: string[] } {
  const parts = title.split(/\s+[vV][sS]?\.?\s+/);
  const strip = (s: string) =>
    s
      .replace(/\bet al\.?\b/gi, "")
      .replace(/,?\s+(?:and|AND)\s+/g, ", ")
      .replace(/,+/g, ",")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  if (parts.length >= 2) {
    return { plaintiffs: strip(parts[0]), defendants: strip(parts[parts.length - 1]) };
  }
  // fallback: v4 party arrays list plaintiff-side first
  if (partyArray.length >= 2) {
    const cut = Math.max(1, Math.ceil(partyArray.length / 2));
    return { plaintiffs: partyArray.slice(0, cut), defendants: partyArray.slice(cut) };
  }
  if (partyArray.length === 1) return { plaintiffs: [partyArray[0]], defendants: [] };
  return { plaintiffs: [title], defendants: [] };
}

/** Reachability probe used by /api/sources to show live source health. */
export async function probeSource(
  kind: "courtlistener" | "ptab" | "patentsview",
): Promise<{ online: boolean; status: number | "no-key" }> {
  const headers: Record<string, string> = {};
  let url = "";
  if (kind === "courtlistener") {
    if (!process.env.COURTLISTENER_TOKEN) return { online: false, status: "no-key" };
    headers.Authorization = `Token ${process.env.COURTLISTENER_TOKEN}`;
    url = `${CL_BASE}/search/?q=%22patent%20infringement%22&type=r&page_size=1`;
  } else if (kind === "ptab") {
    if (!process.env.USPTO_PTAB_KEY && !process.env.PATENTSVIEW_API_KEY) return { online: false, status: "no-key" };
    headers["X-Api-Key"] = process.env.USPTO_PTAB_KEY ?? process.env.PATENTSVIEW_API_KEY ?? "";
    url = `${PTAB_BASE}/proceeding?start=0&rows=1`;
  } else {
    if (!process.env.PATENTSVIEW_API_KEY) return { online: false, status: "no-key" };
    headers["X-Api-Key"] = process.env.PATENTSVIEW_API_KEY;
    url = `${PV_BASE}/patent/?q=${encodeURIComponent('{"patent_id":"1"}')}&f=["patent_id"]`;
  }
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, cache: "no-store" });
    return { online: res.ok, status: res.status };
  } catch {
    return { online: false, status: 0 };
  }
}

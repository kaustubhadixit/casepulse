/**
 * LIVE sync engine — continuous, change-driven, near real time.
 *
 * Design goal: "fetch as the data changes, not on a fixed schedule."
 *
 *   ┌────────────────┐   change cursor (date_modified__gt)    ┌─────────────┐
 *   │ CourtListener  │ ─────────────────────────────────────▶ │ live engine │
 *   │ RECAP core API │   poll every 15s…3min (adaptive)       │  (this file) │
 *   └────────────────┘                                         └──────┬──────┘
 *        new filings via search lane (filed_after)                   │ upsert
 *                                                                    ▼
 *   ┌──────────────┐   SSE push (case:new / case:update)     ┌──────────────┐
 *   │   browser    │ ◀────────────────────────────────────── │  own DB      │
 *   └──────────────┘                                          └──────────────┘
 *
 * How "almost live" is achieved with free public sources:
 *
 *  1. CHANGE CURSOR LANE — CourtListener's RECAP core API exposes
 *     `date_modified__gt`. RECAP dockets change continuously as PACER data is
 *     mirrored, so polling that cursor with a short adaptive interval yields
 *     exactly the records that changed since our last look — nothing else.
 *     The cursor is persisted (SyncState), so restarts resume seamlessly.
 *
 *  2. NEW-FILINGS LANE — the RECAP search API (`filed_after`) catches
 *     brand-new patent complaints with full party lists; deduplicated
 *     against the cursor lane by docket id.
 *
 *  3. ADAPTIVE CADENCE — when changes are flowing, the engine strikes fast
 *     (LIVE_MIN_INTERVAL_MS, default 15s). When upstream is quiet it backs
 *     off gradually (up to LIVE_MAX_INTERVAL_MS, default 3min), and snaps
 *     back the moment anything changes. There is no cron deciding when data
 *     is "allowed" to refresh — the loop runs continuously in-process.
 *
 *  4. TRAFFIC-DRIVEN NUDGES — every read API call runs `requestTick()`:
 *     if the next scheduled poll is far away, a check happens immediately.
 *     Under visitor load the pipeline is effectively always checking.
 *
 *  5. SSE PUSH — `/api/live/stream` streams engine events to browsers, so
 *     the dashboard updates the moment a new docket is ingested (no polling
 *     storms, no refresh button).
 *
 *  6. SERVERLESS-SAFE — on read-only deployments (Vercel + embedded SQLite
 *     snapshot) the same engine fetches on change and holds results in a
 *     per-instance in-memory OVERLAY merged into read APIs, so even a
 *     zero-config deployment is live. On a writable DB (local, or with
 *     DATABASE_URL pointed at Turso/Postgres) everything persists.
 *
 *  7. The per-minute `/api/sync/pulse` route (vercel.json cron) is only a
 *     keep-alive tick for serverless instances — data still moves strictly
 *     when the upstream cursor says something changed.
 */

import { db } from "@/lib/db";
import { cacheInvalidate } from "@/lib/cache";
import { isReadOnlyDeployment } from "@/lib/api-guard";
import {
  fetchCourtListenerChangedDockets,
  fetchCourtListenerDockets,
  fetchPtabProceedings,
  isPatentDocket,
  type CLChangedDocket,
} from "@/lib/sources";
import { ingestExternalFiling, ingestDocketUpdate, createDemoCase, advanceDemoCases, type IngestResult } from "@/lib/sync";
import type { CaseSummary } from "@/lib/caseService";

/* ------------------------- types ------------------------- */

export type LivePhase = "boot" | "live" | "quiet" | "backoff" | "error" | "demo";

export interface LiveEvent {
  type: "hello" | "heartbeat" | "case:new" | "case:update" | "status";
  at: string;
  data?: unknown;
}

export interface LiveStatus {
  running: boolean;
  phase: LivePhase;
  mode: "live" | "demo" | "readonly";
  lastTickAt: string | null;
  lastChangeAt: string | null;
  nextTickAt: string | null;
  intervalMs: number;
  ticks: number;
  changes: number;
  errors: number;
  throttled: number;
  reqLastMinute: number;
  reqLastHour: number;
  reqToday: number;
  lastError: string | null;
  cursor: string | null;
  overlayCount: number;
  clients: number;
  sources: Record<string, { ok: boolean; lastAt: string | null; note?: string }>;
}

/** In-memory near-live case (read-only deployments / overlay mode). */
export interface OverlayCase extends CaseSummary {
  url: string | null;
  dateModified: string;
}

interface EngineState {
  started: boolean;
  ticking: boolean;
  phase: LivePhase;
  lastTickAt: number;
  lastChangeAt: number;
  nextTickAt: number;
  intervalMs: number;
  ticks: number;
  changes: number;
  errors: number;
  throttled: number;
  lastError: string | null;
  cursor: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  lastNudgeAt: number;
  lastLogAt: number;
  lastDemoAt: number;
  tickCounter: number;
  overlay: Map<string, OverlayCase>; // keyed by sourceId
  clients: Set<(e: LiveEvent) => void>;
  sources: Record<string, { ok: boolean; lastAt: number; note?: string }>;
  generation: string;
  throttleUntil: number; // upstream 429 availability — no checks before this time
  reqLog: number[]; // timestamps of upstream requests (drives the budget ledger)
}

/* ------------------------- constants ------------------------- */

const CURSOR_KEY = "cl_date_modified_cursor";
/*
 * REQUEST-BUDGET PLANNER — built around the actual token plan:
 *   5 requests/minute · 50 requests/hour · 125 requests/day.
 *
 * The engine treats that as a hard budget ledger and self-schedules:
 *   - Steady state: ONE cursor request per tick (hot ≈ 1/min, idle backs
 *     off to ≤ 15 min — ~4/hour ≈ 96/day idle).
 *   - The search lane rotates in only every Nth tick; PTAB every Mth.
 *   - Budget caps with headroom: 4/min · 40/hour · 110/day, so nudges,
 *     catch-up pagination and build-time backfills always fit.
 *   - When a window is exhausted, the scheduler jumps to the exact moment
 *     the oldest request exits that window — no 429s, no wasted calls.
 * (Manual admin force-ticks are the only bypass.)
 */
const MIN_INTERVAL = Math.max(15_000, Number(process.env.LIVE_MIN_INTERVAL_MS ?? 60_000));
const MAX_INTERVAL = Math.min(3_600_000, Number(process.env.LIVE_MAX_INTERVAL_MS ?? 900_000));
const CURSOR_OVERLAP_MS = 90_000; // re-check window absorbing clock skew / in-flight writes
const FIRST_BOOT_LOOKBACK_MS = 20 * 60_000; // fresh installs only catch up 20 min of changes
const NUDGE_COOLDOWN_MS = 10_000;
const TICK_FLOOR_MS = 8_000; // absolute minimum spacing between upstream checks
const MAX_OVERLAY = 400;
const SEARCH_EVERY_N_TICKS = 10; // search lane rotates in (1 extra request)
const PTAB_EVERY_N_TICKS = 30; // PTAB lane rotates in when its key is configured
const BURST_INTERVAL_MS = 70_000; // pagination cadence while catching up (≤4/min)
// Budget caps (engine self-limits with headroom under the token plan above)
const BUDGET_PER_MIN = 4; // of 5
const BUDGET_PER_HOUR = 40; // of 50
const BUDGET_PER_DAY = 110; // of 125

/* ------------------------- singleton (HMR-safe) ------------------------- */

const globalRef = globalThis as unknown as { __ppLiveEngine?: EngineState };
// Each module evaluation (incl. HMR swaps) gets a unique generation; the
// scheduler no-ops once a newer generation took over the shared state, so a
// hot-reloaded engine never runs two concurrent loops.
const GENERATION = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function state(): EngineState {
  if (!globalRef.__ppLiveEngine) {
    globalRef.__ppLiveEngine = {
      started: false,
      ticking: false,
      phase: "boot",
      lastTickAt: 0,
      lastChangeAt: 0,
      nextTickAt: 0,
      intervalMs: MIN_INTERVAL,
      ticks: 0,
      changes: 0,
      errors: 0,
      throttled: 0,
      lastError: null,
      cursor: null,
      timer: null,
      lastNudgeAt: 0,
      lastLogAt: 0,
      lastDemoAt: 0,
      tickCounter: 0,
      overlay: new Map(),
      clients: new Set(),
      sources: {},
      generation: "",
      throttleUntil: 0,
      reqLog: [],
    };
  } else {
    // normalize fields added after the state was first created (HMR safety)
    const s = globalRef.__ppLiveEngine;
    if (s.tickCounter === undefined) s.tickCounter = 0;
    if (s.throttled === undefined) s.throttled = 0;
    if (s.generation === undefined) s.generation = "";
    if (s.throttleUntil === undefined) s.throttleUntil = 0;
    if (!Array.isArray(s.reqLog)) s.reqLog = [];
  }
  return globalRef.__ppLiveEngine;
}

/* ------------------------- helpers ------------------------- */

function jitter(ms: number): number {
  const f = 0.85 + Math.random() * 0.3; // ±15%
  return Math.round(ms * f);
}

function noteSource(s: EngineState, name: string, ok: boolean, note?: string) {
  s.sources[name] = { ok, lastAt: Date.now(), note };
}

function broadcast(e: LiveEvent) {
  for (const send of state().clients) {
    try {
      send(e);
    } catch {
      /* dead client — cleanup happens in its own abort handler */
    }
  }
}

/** Convert a raw changed docket into the platform's CaseSummary shape (overlay mode). */
function docketToOverlay(d: CLChangedDocket): OverlayCase {
  const [left, right] = splitV(d.caseName);
  const terminated = Boolean(d.dateTerminated);
  return {
    id: `cl-${d.id}`,
    caseNumber: d.docketNumber || `CL-${d.id}`,
    title: d.caseName,
    jurisdiction: "DISTRICT_COURT",
    court: courtLabel(d.courtId),
    courtDetail: d.courtId ? d.courtId.toUpperCase() : null,
    judge: d.assignedTo,
    status: terminated ? "Terminated" : "Active",
    cause: d.cause,
    techArea: null,
    summary: null,
    damagesAwarded: null,
    filingDate: (d.dateFiled ?? d.dateModified).slice(0, 10),
    closedDate: d.dateTerminated,
    source: "courtlistener",
    updatedAt: d.dateModified,
    plaintiffs: left ? [left] : [],
    defendants: right ? [right] : [],
    url: d.url,
    dateModified: d.dateModified,
  };
}

function splitV(name: string): [string | null, string | null] {
  const parts = name.split(/\s+[vV][sS]?\.?\s+/);
  if (parts.length >= 2) {
    const l = parts[0].replace(/\bet al\.?\b/gi, "").trim();
    const r = parts[parts.length - 1].replace(/\bet al\.?\b/gi, "").trim();
    return [l || null, r || null];
  }
  return [name.trim() || null, null];
}

/** Human label for common federal court ids (RECAP court_id). */
const COURT_LABELS: Record<string, string> = {
  txed: "E.D. Tex.", txwd: "W.D. Tex.", txnd: "N.D. Tex.", txsd: "S.D. Tex.",
  ded: "D. Del.", njd: "D.N.J.", cand: "N.D. Cal.", casd: "S.D. Cal.", ctd: "C.D. Cal.",
  ilnd: "N.D. Ill.", nysd: "S.D.N.Y.", nyed: "E.D.N.Y.", mad: "D. Mass.",
  flsd: "S.D. Fla.", flmd: "M.D. Fla.", vaed: "E.D. Va.", wawd: "W.D. Wash.",
  cod: "D. Colo.", ohnd: "N.D. Ohio", dcd: "D.D.C.", cafc: "Fed. Circuit",
  mied: "E.D. Mich.", ncwd: "W.D.N.C.", utd: "D. Utah", azd: "D. Ariz.",
  paed: "E.D. Pa.", paed_: "", gand: "N.D. Ga.", scd: "D.S.C.",
};

function courtLabel(courtId: string | null): string {
  if (!courtId) return "U.S. District Court";
  return COURT_LABELS[courtId] ?? `U.S. Court (${courtId.toUpperCase()})`;
}

async function loadCursor(): Promise<string> {
  const s = state();
  if (s.cursor) return s.cursor;
  try {
    const row = await db.syncState.findUnique({ where: { key: CURSOR_KEY } });
    if (row?.value) {
      s.cursor = row.value;
      return row.value;
    }
  } catch {
    /* read-only / db unavailable — keep in-memory cursor */
  }
  return new Date(Date.now() - FIRST_BOOT_LOOKBACK_MS).toISOString();
}

async function saveCursor(iso: string) {
  const s = state();
  s.cursor = iso;
  try {
    await db.syncState.upsert({
      where: { key: CURSOR_KEY },
      create: { key: CURSOR_KEY, value: iso },
      update: { value: iso },
    });
  } catch {
    /* overlay mode — memory only */
  }
}

/** CL date_modified values carry -08:00 style offsets; normalize before comparing. */
function toUtcIso(iso: string): string | null {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/* ------------------------- request-budget ledger ------------------------- */

/** Record n upstream requests just issued (prunes entries older than 25 h). */
function logRequests(n: number) {
  const s = state();
  const now = Date.now();
  for (let i = 0; i < n; i++) s.reqLog.push(now + i);
  if (s.reqLog.length > 500) {
    const cutoff = now - 25 * 3600_000;
    s.reqLog = s.reqLog.filter((t) => t > cutoff);
  }
}

/**
 * How long until `need` more upstream requests fit inside every window
 * (minute/hour/day). 0 = go now. When a window is full, jumps to the exact
 * instant the oldest request exits it.
 */
function budgetWaitMs(need: number): number {
  const s = state();
  const now = Date.now();
  const fits = (t: number) => {
    const minC = s.reqLog.filter((x) => t - x < 60_000).length;
    const hourC = s.reqLog.filter((x) => t - x < 3600_000).length;
    const dayC = s.reqLog.filter((x) => t - x < 86_400_000).length;
    return minC + need <= BUDGET_PER_MIN && hourC + need <= BUDGET_PER_HOUR && dayC + need <= BUDGET_PER_DAY;
  };
  if (fits(now)) return 0;
  const candidates = [60_000, 3600_000, 86_400_000]
    .flatMap((w) => s.reqLog.map((x) => x + w + 100))
    .filter((t) => t > now)
    .sort((a, b) => a - b);
  for (const t of candidates) if (fits(t)) return t - now;
  return 3_600_000; // conservative fallback
}

/* ------------------------- the tick ------------------------- */

interface TickOutcome {
  ingested: IngestResult[];
  updated: number;
  overlayAdded: number;
  sourcesTried: number;
  more: boolean;
  throttleMs: number | null; // >0 when upstream answered 429 (wait before next poll)
}

/** Parse "Expected available in N seconds" from a CourtListener 429 body. */
function parseThrottle(note: string | undefined): number | null {
  if (!note) return null;
  const m = note.match(/available in (\d+) seconds?/i);
  if (m) return (Number(m[1]) + 2) * 1000;
  if (note.includes("429")) return 65_000;
  return null;
}

async function runTick(): Promise<TickOutcome> {
  const s = state();
  s.tickCounter++;
  const outcome: TickOutcome = { ingested: [], updated: 0, overlayAdded: 0, sourcesTried: 0, more: false, throttleMs: null };
  const readonly = isReadOnlyDeployment();
  const cursor = await loadCursor();

  /* ---- lane 1 (every tick, 1 request): change cursor ---- */
  const changed = await fetchCourtListenerChangedDockets(cursor, 2).catch((e) => ({
    ok: false,
    dockets: [] as CLChangedDocket[],
    newCursor: null as string | null,
    error: String((e as Error)?.message ?? e),
    more: false,
    pagesUsed: 1,
  }));
  outcome.sourcesTried++;
  logRequests(changed.pagesUsed || 1); // ledger: count every page we asked for

  if (changed.ok) {
    noteSource(s, "courtlistener-cursor", true, `${changed.dockets.length} changed`);
    const seen = new Set<string>();
    let maxMod: string | null = null;

    for (const d of changed.dockets) {
      if (!d.id || seen.has(d.id)) continue;
      seen.add(d.id);
      const mod = toUtcIso(d.dateModified);
      if (mod && (!maxMod || mod > maxMod)) maxMod = mod;

      const existing = readonly ? null : await db.case.findUnique({ where: { sourceId: d.id } }).catch(() => null);

      if (existing) {
        if (await ingestDocketUpdate(d, existing)) {
          outcome.updated++;
          broadcast({
            type: "case:update",
            at: new Date().toISOString(),
            data: { caseNumber: existing.caseNumber, title: existing.title, court: existing.court },
          });
        }
      } else if (isPatentDocket(d) && d.docketNumber) {
        if (readonly) {
          if (!s.overlay.has(d.id)) {
            s.overlay.set(d.id, docketToOverlay(d));
            if (s.overlay.size > MAX_OVERLAY) {
              const oldest = [...s.overlay.entries()].sort((a, b) => a[1].dateModified.localeCompare(b[1].dateModified))[0];
              if (oldest) s.overlay.delete(oldest[0]);
            }
            outcome.overlayAdded++;
            broadcast({ type: "case:new", at: new Date().toISOString(), data: docketToOverlay(d) });
          } else {
            s.overlay.set(d.id, docketToOverlay(d)); // refresh fields
          }
        } else {
          const r = await ingestExternalFiling(
            {
              sourceId: d.id,
              caseNumber: d.docketNumber,
              title: d.caseName,
              court: courtLabel(d.courtId),
              courtCode: d.courtId ?? undefined,
              filingDate: d.dateFiled ?? d.dateModified.slice(0, 10),
              cause: d.cause ?? "Patent Infringement (35 U.S.C. § 271)",
              judge: d.assignedTo,
              jurisdictionType: "DISTRICT_COURT",
              plaintiffNames: splitV(d.caseName)[0] ? [splitV(d.caseName)[0] as string] : ["Unknown plaintiff"],
              defendantNames: splitV(d.caseName)[1] ? [splitV(d.caseName)[1] as string] : ["Unknown defendant"],
              url: d.url,
            },
            "CourtListener RECAP",
          );
          if (r.ingested) {
            outcome.ingested.push(r);
            broadcast({ type: "case:new", at: new Date().toISOString(), data: r });
          }
        }
      }
    }

    if (changed.more) outcome.more = true;
    if (maxMod) {
      const safe = new Date(Math.max(0, new Date(maxMod).getTime() - CURSOR_OVERLAP_MS)).toISOString();
      await saveCursor(safe);
    }
  } else {
    const throttle = parseThrottle(changed.error);
    if (throttle) {
      outcome.throttleMs = throttle;
      s.throttled++;
      noteSource(s, "courtlistener-cursor", false, "rate-limited (429) — expected on the free tier, backing off briefly");
    } else {
      noteSource(s, "courtlistener-cursor", false, changed.error ?? undefined);
    }
  }

  /* ---- lane 2 (rotates in every Nth tick, 1 request): new patent complaints ---- */
  if (s.tickCounter % SEARCH_EVERY_N_TICKS === 1) {
    const recent = await fetchCourtListenerDockets(30, { daysBack: 3 }).catch(() => null);
    outcome.sourcesTried++;
    logRequests(1);
    if (recent?.ok) {
      noteSource(s, "courtlistener-search", true, `${recent.filings.length} recent`);
      for (const f of recent.filings) {
        if (readonly) {
          if (f.sourceId && !s.overlay.has(f.sourceId)) {
            const ov: OverlayCase = {
              id: `cl-${f.sourceId}`,
              caseNumber: f.caseNumber,
              title: f.title,
              jurisdiction: f.jurisdictionType,
              court: f.court,
              courtDetail: f.courtCitation ?? null,
              judge: f.judge ?? null,
              status: "Active",
              cause: f.cause ?? null,
              techArea: null,
              summary: null,
              damagesAwarded: null,
              filingDate: f.filingDate,
              closedDate: null,
              source: "courtlistener",
              updatedAt: new Date().toISOString(),
              plaintiffs: f.plaintiffNames,
              defendants: f.defendantNames,
              url: f.url ?? null,
              dateModified: new Date().toISOString(),
            };
            s.overlay.set(f.sourceId, ov);
            outcome.overlayAdded++;
            broadcast({ type: "case:new", at: new Date().toISOString(), data: ov });
          }
        } else {
          const r = await ingestExternalFiling(f, "CourtListener RECAP");
          if (r.ingested) {
            outcome.ingested.push(r);
            broadcast({ type: "case:new", at: new Date().toISOString(), data: r });
          }
        }
      }
    } else {
      const throttle = parseThrottle(recent?.error);
      if (throttle) {
        outcome.throttleMs = Math.max(outcome.throttleMs ?? 0, throttle);
        s.throttled++;
        noteSource(s, "courtlistener-search", false, "rate-limited (429) — expected on the free tier");
      } else {
        noteSource(s, "courtlistener-search", false, recent?.error ?? "unavailable");
      }
    }
  }

  /* ---- lane 3 (rotates in when configured): PTAB proceedings ---- */
  if ((process.env.USPTO_PTAB_KEY || process.env.PATENTSVIEW_API_KEY) && s.tickCounter % PTAB_EVERY_N_TICKS === 0) {
    const ptab = await fetchPtabProceedings(20).catch(() => null);
    outcome.sourcesTried++;
    logRequests(1);
    if (ptab?.ok) {
      noteSource(s, "uspto-ptab", true, `${ptab.filings.length} proceedings`);
      if (!readonly) {
        for (const f of ptab.filings) {
          const r = await ingestExternalFiling(f, "USPTO PTAB API");
          if (r.ingested) {
            outcome.ingested.push(r);
            broadcast({ type: "case:new", at: new Date().toISOString(), data: r });
          }
        }
      }
    } else {
      noteSource(s, "uspto-ptab", false, ptab?.error ?? "unavailable");
    }
  }

  /* ---- lane 4 (demo only, when NO token is configured at all): labeled synthetic fallback ---- */
  if (!process.env.COURTLISTENER_TOKEN && !readonly) {
    const now = Date.now();
    if (now - s.lastDemoAt > 100_000) {
      s.lastDemoAt = now;
      const c = await createDemoCase().catch(() => null);
      if (c) {
        outcome.ingested.push({
          ingested: true,
          id: c.id,
          caseNumber: c.caseNumber,
          title: c.title,
          court: c.court,
          jurisdiction: c.jurisdiction,
        });
        await advanceDemoCases(2).catch(() => {});
        noteSource(s, "demo-synthetic", true, "no upstream key configured — labeled sample data");
      }
    }
  }

  return outcome;
}

/* ------------------------- scheduler ------------------------- */

function schedule(s: EngineState, delayMs: number) {
  if (s.timer) clearTimeout(s.timer);
  const delay = Math.max(TICK_FLOOR_MS, delayMs);
  s.nextTickAt = Date.now() + delay;
  s.timer = setTimeout(() => {
    void cycle();
  }, delay);
}

async function cycle() {
  const s = state();
  if (s.generation !== GENERATION) return; // superseded by a newer module generation (HMR)
  if (s.ticking) {
    schedule(s, MIN_INTERVAL);
    return;
  }
  // budget gate: a typical tick needs up to 2 requests (cursor + rotating lane)
  const budgetWait = budgetWaitMs(2);
  if (budgetWait > 0) {
    s.phase = "quiet";
    schedule(s, budgetWait + 2_000);
    return;
  }
  s.ticking = true;
  try {
    const outcome = await runTick();
    s.ticks++;
    s.lastTickAt = Date.now();
    const changed = outcome.ingested.length + outcome.updated + outcome.overlayAdded;

    if (changed > 0) {
      s.changes += changed;
      s.lastChangeAt = Date.now();
      s.phase = "live";
      cacheInvalidate("api:"); // aggregates changed — next read is fresh
      // log to SyncLog (throttled: at most one entry per minute)
      if (Date.now() - s.lastLogAt > 60_000) {
        s.lastLogAt = Date.now();
        const notes = `${outcome.ingested.length} new, ${outcome.updated} updated${outcome.overlayAdded ? `, ${outcome.overlayAdded} overlay` : ""}`;
        await db.syncLog
          .create({
            data: {
              source: isReadOnlyDeployment() ? "live-engine (overlay)" : "live-engine",
              recordsIngested: outcome.ingested.length + outcome.overlayAdded,
              casesUpdated: outcome.updated,
              notes: notes.slice(0, 500),
            },
          })
          .catch(() => {});
      }
      broadcast({ type: "status", at: new Date().toISOString(), data: getStatus() });
    } else if (outcome.throttleMs) {
      // expected on the free tier — a brief, informed pause, not an error
      s.phase = "quiet";
    } else {
      s.phase = s.errors > 3 ? "error" : Date.now() - s.lastChangeAt > 10 * 60_000 ? "backoff" : "quiet";
    }

    // adaptive cadence — throttle pause > burst catch-up > hot > gradual backoff
    if (outcome.throttleMs) {
      s.throttleUntil = Date.now() + outcome.throttleMs;
      s.intervalMs = Math.max(MIN_INTERVAL, outcome.throttleMs);
    } else if (outcome.more) s.intervalMs = BURST_INTERVAL_MS;
    else if (changed > 0) s.intervalMs = MIN_INTERVAL;
    else s.intervalMs = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, s.intervalMs * 1.5));
    schedule(s, jitter(s.intervalMs));
  } catch (err) {
    s.errors++;
    s.lastError = String((err as Error)?.message ?? err).slice(0, 200);
    s.phase = "error";
    s.intervalMs = Math.min(MAX_INTERVAL, Math.max(60_000, s.intervalMs * 2));
    schedule(s, jitter(s.intervalMs));
  } finally {
    s.ticking = false;
  }
}

/* ------------------------- public API ------------------------- */

/** Start the continuous loop (idempotent, and takes over after HMR swaps). */
export function startEngine(): EngineState {
  const s = state();
  if (!s.started || s.generation !== GENERATION) {
    s.started = true;
    s.generation = GENERATION;
    s.phase = isReadOnlyDeployment() ? "quiet" : "boot";
    schedule(s, 250); // first check almost immediately
  }
  return s;
}

/**
 * Traffic-driven nudge for read endpoints: if the engine isn't running yet,
 * start it; if the next scheduled check is far away, check NOW (gated to at
 * most one nudge per NUDGE_COOLDOWN_MS so a burst of visitors never hammers
 * the upstream). This is what makes the pipeline continuous under load.
 */
export function requestTick(): void {
  const s = startEngine();
  const now = Date.now();
  if (s.ticking) return;
  if (now < s.throttleUntil) return; // upstream said when it will be available — respect it
  if (budgetWaitMs(1) > 0) return; // request budget exhausted — scheduled tick will catch up
  if (now - s.lastNudgeAt < NUDGE_COOLDOWN_MS) return;
  if (s.nextTickAt - now < NUDGE_COOLDOWN_MS * 1.5) return; // already checking soon
  s.lastNudgeAt = now;
  schedule(s, 50);
}

/** Admin/cron: run one full check immediately and return the result. Bypasses
 *  the request budget by design (explicit human/scheduler intent). */
export async function forceTick(): Promise<LiveStatus> {
  const s = startEngine();
  if (s.ticking) return getStatus();
  s.ticking = true;
  try {
    const outcome = await runTick();
    s.ticks++;
    s.lastTickAt = Date.now();
    const changed = outcome.ingested.length + outcome.updated + outcome.overlayAdded;
    if (changed > 0) {
      s.changes += changed;
      s.lastChangeAt = Date.now();
      s.phase = "live";
      cacheInvalidate("api:");
      await db.syncLog
        .create({
          data: {
            source: "live-engine (manual)",
            recordsIngested: outcome.ingested.length + outcome.overlayAdded,
            casesUpdated: outcome.updated,
            notes: `manual tick: ${outcome.ingested.length} new, ${outcome.updated} updated`,
          },
        })
        .catch(() => {});
      broadcast({ type: "status", at: new Date().toISOString(), data: getStatus() });
    } else {
      s.phase = "quiet";
    }
    schedule(s, jitter(s.intervalMs));
  } catch (err) {
    s.errors++;
    s.lastError = String((err as Error)?.message ?? err).slice(0, 200);
    s.phase = "error";
    schedule(s, jitter(Math.min(MAX_INTERVAL, Math.max(60_000, s.intervalMs * 2))));
  } finally {
    s.ticking = false;
  }
  return getStatus();
}

/** SSE hub: subscribe returns an unsubscribe function. */
export function subscribe(fn: (e: LiveEvent) => void): () => void {
  const s = startEngine();
  s.clients.add(fn);
  return () => s.clients.delete(fn);
}

export function clientCount(): number {
  return state().clients.size;
}

/** Snapshot for UI + /api/live/status. */
export function getStatus(): LiveStatus {
  const s = state();
  const mode = isReadOnlyDeployment() ? "readonly" : process.env.COURTLISTENER_TOKEN ? "live" : "demo";
  return {
    running: s.started,
    phase: s.started ? s.phase : "boot",
    mode,
    lastTickAt: s.lastTickAt ? new Date(s.lastTickAt).toISOString() : null,
    lastChangeAt: s.lastChangeAt ? new Date(s.lastChangeAt).toISOString() : null,
    nextTickAt: s.nextTickAt ? new Date(s.nextTickAt).toISOString() : null,
    intervalMs: s.intervalMs,
    ticks: s.ticks,
    changes: s.changes,
    errors: s.errors,
    throttled: s.throttled,
    reqLastMinute: s.reqLog.filter((t) => Date.now() - t < 60_000).length,
    reqLastHour: s.reqLog.filter((t) => Date.now() - t < 3600_000).length,
    reqToday: s.reqLog.filter((t) => Date.now() - t < 86_400_000).length,
    lastError: s.lastError,
    cursor: s.cursor,
    overlayCount: s.overlay.size,
    clients: s.clients.size,
    sources: Object.fromEntries(
      Object.entries(s.sources).map(([k, v]) => [k, { ok: v.ok, lastAt: v.lastAt ? new Date(v.lastAt).toISOString() : null, note: v.note }]),
    ),
  };
}

/** Overlay cases for read endpoints (newest first). Empty unless read-only deployment. */
export function getOverlay(): OverlayCase[] {
  const s = state();
  if (!isReadOnlyDeployment()) return [];
  return [...s.overlay.values()].sort((a, b) => b.dateModified.localeCompare(a.dateModified));
}

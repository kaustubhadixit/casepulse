"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { JURISDICTIONS, STATUS_COLORS } from "@/lib/constants";
import { navigate } from "./router";

/* ------------------------- live channel (SSE) ------------------------- */

export interface LiveEngineStatus {
  running: boolean;
  phase: "boot" | "live" | "quiet" | "backoff" | "error" | "demo";
  mode: "live" | "demo" | "readonly";
  lastTickAt: string | null;
  lastChangeAt: string | null;
  nextTickAt: string | null;
  intervalMs: number;
  ticks: number;
  changes: number;
  errors: number;
  throttled?: number;
  reqLastMinute?: number;
  reqLastHour?: number;
  reqToday?: number;
  lastError: string | null;
  overlayCount: number;
  clients: number;
  sources: Record<string, { ok: boolean; lastAt: string | null; note?: string }>;
}

/** Window event dispatched whenever the live engine pushed new data. */
export const LIVE_INVALIDATE = "pp:live-invalidate";

let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
function dispatchLiveInvalidate() {
  if (invalidateTimer) return;
  invalidateTimer = setTimeout(() => {
    invalidateTimer = null;
    window.dispatchEvent(new CustomEvent(LIVE_INVALIDATE));
  }, 1_200);
}

export interface LiveCaseEvent {
  caseNumber?: string;
  title?: string;
  court?: string;
  jurisdiction?: string;
  url?: string | null;
}

/**
 * Single SSE connection to the live engine. Mount once (AppShell).
 * - pushes engine status to subscribers via the returned state
 * - fires a debounced window event so every mounted useApi() refetches
 * - invokes onNewCase for toast notifications
 */
export function useLiveChannel(onEvent?: (e: { type: string; data?: LiveCaseEvent }) => void) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<LiveEngineStatus | null>(null);
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let linked = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/live/stream");
      es.onopen = () => {
        linked = true;
        setConnected(true);
      };
      es.onmessage = (msg) => {
        try {
          const e = JSON.parse(msg.data) as { type: string; at: string; data?: unknown };
          if (e.type === "hello" || e.type === "status") {
            setStatus(e.data as LiveEngineStatus);
          } else if (e.type === "case:new" || e.type === "case:update") {
            setStatus((prev) => (prev ? { ...prev, phase: "live", lastChangeAt: e.at } : prev));
            dispatchLiveInvalidate();
            handlerRef.current?.({ type: e.type, data: e.data as LiveCaseEvent });
          }
        } catch {
          /* malformed frame — ignore */
        }
      };
      es.onerror = () => {
        linked = false;
        setConnected(false);
        es?.close();
        if (!closed) retry = setTimeout(connect, 5_000);
      };
    };
    connect();

    // SSE fallback: poll engine status while disconnected
    const poll = setInterval(async () => {
      if (linked) return;
      try {
        const res = await fetch("/api/live/status", { cache: "no-store" });
        if (res.ok) setStatus((await res.json()).data as LiveEngineStatus);
      } catch {
        /* offline */
      }
    }, 15_000);

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (poll) clearInterval(poll);
      es?.close();
    };
  }, []);

  return { connected, status };
}

/* ------------------------- data fetching hook ------------------------- */

/**
 * Fetch JSON with polling support and stale-while-reload semantics:
 * previous data stays on screen while a new request is in flight, so
 * switching filters never flashes an empty skeleton. Also listens for the
 * live engine's push events and refetches (debounced) when new data lands.
 */
export function useApi<T>(url: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const load = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const res = await fetch(u, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [url, load]);

  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [pollMs, load]);

  // live engine push → refetch whatever this hook is showing (debounced)
  useEffect(() => {
    const onLive = () => void load();
    window.addEventListener(LIVE_INVALIDATE, onLive);
    return () => window.removeEventListener(LIVE_INVALIDATE, onLive);
  }, [load]);

  return { data, loading, error, reload: load };
}

/* ------------------------- formatters ------------------------- */

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

/* ------------------------- badges ------------------------- */

export function JurisdictionBadge({ jurisdiction }: { jurisdiction: string }) {
  const j = (JURISDICTIONS as Record<string, { short: string; color: string }>)[jurisdiction];
  if (!j) return <span className="pp-status pp-status-neutral">{jurisdiction}</span>;
  return (
    <span
      className="inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em]"
      style={{
        color: j.color,
        borderColor: `color-mix(in oklch, ${j.color} 38%, transparent)`,
        background: `color-mix(in oklch, ${j.color} 11%, transparent)`,
      }}
    >
      {j.short.toUpperCase()}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "pp-status pp-status-neutral";
  return <span className={cls}>{status}</span>;
}

export function PartyTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    NPE: "text-[color-mix(in_oklch,var(--chart-2)_78%,var(--foreground))] border-[color-mix(in_oklch,var(--chart-2)_38%,transparent)] bg-[color-mix(in_oklch,var(--chart-2)_11%,transparent)]",
    COMPANY: "text-muted-foreground border-border bg-muted",
    UNIVERSITY: "text-[color-mix(in_oklch,var(--chart-5)_78%,var(--foreground))] border-[color-mix(in_oklch,var(--chart-5)_38%,transparent)] bg-[color-mix(in_oklch,var(--chart-5)_11%,transparent)]",
    INDIVIDUAL: "text-muted-foreground border-border bg-transparent",
  };
  const label: Record<string, string> = { NPE: "NPE", COMPANY: "Operating Co.", UNIVERSITY: "University", INDIVIDUAL: "Individual" };
  return (
    <span className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] ${map[type] ?? map.COMPANY}`}>
      {label[type] ?? type}
    </span>
  );
}

export function SourceBadge({ source }: { source?: string }) {
  const live = source === "courtlistener" || source === "uspto-ptab";
  const map: Record<string, string> = {
    courtlistener: "LIVE · RECAP",
    "uspto-ptab": "LIVE · PTAB",
    manual: "MANUAL",
    seed: "SAMPLE",
    synthetic: "SAMPLE",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.1em] ${
        live
          ? "border-[color-mix(in_oklch,var(--chart-1)_40%,transparent)] text-[color-mix(in_oklch,var(--chart-1)_80%,var(--foreground))] bg-[color-mix(in_oklch,var(--chart-1)_9%,transparent)]"
          : "border-border text-muted-foreground bg-transparent"
      }`}
      title={live ? "Ingested from a live public court feed" : "Generated sample data (clearly labeled)"}
    >
      {live ? <span className="pp-pulse inline-block h-1 w-1 rounded-full bg-current" aria-hidden /> : null}
      {map[source ?? ""] ?? (source ?? "unknown").toUpperCase()}
    </span>
  );
}

/* ------------------------- layout primitives ------------------------- */

/** Editorial KPI block: micro label, large tabular numeral, optional hint. */
export function KpiCard({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="border-l-2 border-primary/70 pl-4">
      <p className="micro-label">{label}</p>
      <p className="tnum mt-1.5 font-mono text-[1.65rem] font-semibold leading-none tracking-tight">
        {value}
        {trend ? (
          <span className={`ml-1.5 align-middle text-xs font-medium ${trend === "up" ? "text-[color:var(--chart-4)]" : "text-[color:var(--destructive)]"}`}>
            {trend === "up" ? "▲" : "▼"}
          </span>
        ) : null}
      </p>
      {hint ? <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-[1.45rem] font-semibold leading-tight tracking-tight">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">Loading</span>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center" role="alert">
      <p className="text-sm font-medium text-destructive">{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="text-sm font-medium text-primary underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded border border-dashed py-14 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? (
        <button onClick={onAction} className="mt-2 text-sm font-medium text-primary underline">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-[2px]" />
      ))}
    </div>
  );
}

/* ------------------------- charts (dependency-free SVG) ------------------------- */

/** Compact sparkline for KPI strips. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden focusable="false">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="2" fill="var(--chart-1)" />
    </svg>
  );
}

/** Horizontal bar list for top-N rankings (courts, plaintiffs, tech areas). */
export function BarList({
  items,
  max: maxOverride,
  valueFormatter,
  onClick,
}: {
  items: { label: string; count: number }[];
  max?: number;
  valueFormatter?: (n: number) => string;
  onClick?: (label: string) => void;
}) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data in range.</p>;
  const max = maxOverride ?? Math.max(...items.map((i) => i.count));
  const fmt = valueFormatter ?? ((n: number) => fmtNum(n));
  return (
    <ol className="space-y-0">
      {items.map((item, i) => {
        const pct = max ? Math.max(1.5, (item.count / max) * 100) : 0;
        const Row = onClick ? "button" : "div";
        return (
          <li key={item.label}>
            <Row
              {...(onClick ? { type: "button" as const, onClick: () => onClick(item.label) } : {})}
              className="group relative grid w-full grid-cols-[1.6rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 py-2 text-left last:border-0"
            >
              <span className="tnum font-mono text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="relative block h-[22px]">
                <span
                  className="absolute inset-y-[3px] left-0 rounded-[1px] transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: "color-mix(in oklch, var(--chart-1) 26%, transparent)" }}
                  aria-hidden
                />
                <span className="absolute inset-y-0 left-1.5 flex items-center truncate text-xs font-medium">
                  {item.label}
                </span>
              </span>
              <span className="tnum font-mono text-xs font-semibold">{fmt(item.count)}</span>
            </Row>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------- ticker ------------------------- */

export interface TickerItem {
  id: string;
  title: string;
  court: string;
  caseNumber: string;
  date: string;
}

/** Latest-filings marquee strip for the masthead. */
export function Ticker({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;
  const strip = (
    <div className="flex shrink-0 items-center" aria-hidden={false}>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => navigate(`/case/${it.id}`)}
          className="group flex items-center gap-2 whitespace-nowrap px-5 py-1.5 text-[11px]"
          title={`${it.title} — ${it.court}`}
        >
          <span className="h-1 w-1 rounded-full bg-primary/70" aria-hidden />
          <span className="font-mono tracking-wide text-foreground/70 group-hover:text-foreground">{it.caseNumber}</span>
          <span className="max-w-[26rem] truncate text-foreground/75 group-hover:text-foreground">{it.title}</span>
          <span className="micro-label !text-[9px]">{it.court.replace("District Court, ", "")}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="pp-marquee-mask">
      <div className="pp-marquee flex w-max">
        {strip}
        {strip}
      </div>
    </div>
  );
}

/* ------------------------- misc ------------------------- */

export function CaseLink({ id, title, className }: { id: string; title: string; className?: string }) {
  return (
    <button onClick={() => navigate(`/case/${id}`)} className={`text-left font-medium text-primary hover:underline ${className ?? ""}`}>
      {title}
    </button>
  );
}

export const TECH_AREAS = [
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

export const COMMON_STATUSES = [
  "Active",
  "Settled",
  "Dismissed",
  "Judgment for Plaintiff",
  "Judgment for Defendant",
  "Stayed (PTAB)",
  "Appeal Pending",
  "Instituted",
  "Institution Denied",
  "FWD Issued — All Claims Unpatentable",
  "FWD Issued — Claims Patentable",
  "Terminated — Settled",
  "Opposition Pending",
  "Patent Maintained as Amended",
  "Patent Revoked",
  "Opposition Rejected",
  "First Instance Decision",
  "Withdrawn",
  "ALJ Initial Determination",
  "Final Determination — Violation Found",
  "Final Determination — No Violation",
  "Terminated — Consent Order",
  "Settled (FRAND License)",
];

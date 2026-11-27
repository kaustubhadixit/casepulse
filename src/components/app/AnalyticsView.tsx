"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { JURISDICTIONS, type JurisdictionKey } from "@/lib/constants";
import { navigate } from "./router";
import { useApi, SectionHeading, Spinner, ErrorState, KpiCard, BarList, Sparkline, fmtMonth, fmtNum } from "./shared";

interface TrendsResponse {
  data: {
    series: { month: string; count: number; damages: number }[];
    topCourts: { label: string; count: number }[];
    topTechAreas: { label: string; count: number }[];
    statuses: { label: string; count: number }[];
    topPlaintiffs: { label: string; count: number }[];
    topDefendants: { label: string; count: number }[];
    plaintiffTypes: Record<string, number>;
    total: number;
  };
}

interface StatsResponse {
  data: {
    totalCases: number;
    activeCases: number;
    newThisMonth: number;
    courtsCovered: number;
    uniquePatentsAsserted: number;
    parties: number;
    totalDamagesAwarded: number;
    npeShare: number;
    lastSync: { ranAt: string; source: string } | null;
  };
}

const ALL = "__all__";

/* ---------------- custom SVG trend chart ---------------- */

function TrendChart({ series }: { series: { label: string; count: number; month: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 960;
  const H = 300;
  const PAD = { top: 18, right: 34, bottom: 34, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const { max, ticks, x, y, areaPath, linePath } = useMemo(() => {
    const maxV = Math.max(...series.map((s) => s.count), 1);
    const step = Math.pow(10, Math.floor(Math.log10(maxV)));
    const max = Math.ceil((maxV * 1.12) / step) * step;
    const ticks = 4;
    const x = (i: number) => PAD.left + (series.length > 1 ? (i / (series.length - 1)) * innerW : innerW / 2);
    const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
    let line = "";
    series.forEach((s, i) => (line += `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.count).toFixed(1)}`));
    const area = `${line}L${x(series.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)}L${PAD.left},${(PAD.top + innerH).toFixed(1)}Z`;
    return { max, ticks, x, y, linePath: line, areaPath: area };
  }, [series, innerH, innerW]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((px - PAD.left) / innerW) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, idx)));
  };

  if (!series.length) return <p className="py-10 text-center text-sm text-muted-foreground">No filings in range.</p>;
  const h = hover != null ? series[hover] : null;
  const labelEvery = Math.ceil(series.length / 12);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair select-none"
        role="img"
        aria-label="Monthly filings trend chart"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* gridlines + y labels */}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (max / ticks) * i;
          const yy = y(v);
          return (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yy} y2={yy} className="pp-grid-line" />
              <text x={PAD.left - 8} y={yy + 3.5} textAnchor="end" fontSize="10" fill="var(--muted-foreground)" className="tnum font-mono">
                {v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v)}
              </text>
            </g>
          );
        })}
        {/* area + line */}
        <path d={areaPath} className="chart-area-fill" />
        <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* x labels */}
        {series.map((s, i) => {
          if (!(i % labelEvery === 0 || i === series.length - 1)) return null;
          const isLast = i === series.length - 1;
          return (
            <text
              key={s.month}
              x={x(i)}
              y={H - 8}
              textAnchor={isLast ? "end" : i === 0 ? "start" : "middle"}
              fontSize="9.5"
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              {s.label}
            </text>
          );
        })}
        {/* hover crosshair */}
        {hover != null && h ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--chart-1)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <circle cx={x(hover)} cy={y(h.count)} r="4" fill="var(--chart-1)" stroke="var(--background)" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {h ? (
        <div
          className="pointer-events-none absolute top-2 rounded-[3px] border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `calc(${((x(hover!) ?? 0) / W) * 100}% + ${x(hover!) > W * 0.7 ? -110 : 12}px)` }}
        >
          <p className="micro-label !text-[9px]">{h.label}</p>
          <p className="tnum font-mono text-sm font-semibold">{fmtNum(h.count)} filings</p>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- stacked share bar ---------------- */

function ShareBar({ items }: { items: { label: string; count: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-[2px] border border-border/60">
        {items.map((i) => (
          <div
            key={i.label}
            className="h-full transition-[flex-grow] duration-500"
            style={{ flexGrow: i.count, background: `color-mix(in oklch, ${i.color} 55%, transparent)` }}
            title={`${i.label}: ${i.count}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 flex-none rounded-[1px]" style={{ background: i.color }} aria-hidden />
              <span className="truncate">{i.label}</span>
            </span>
            <span className="tnum font-mono font-semibold">
              {fmtNum(i.count)} <span className="text-muted-foreground">· {Math.round((i.count / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- panel wrapper ---------------- */

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-border bg-card p-5 ${className ?? ""}`}>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

/* ---------------- main view ---------------- */

export default function AnalyticsView({ lockedJurisdiction }: { lockedJurisdiction?: JurisdictionKey }) {
  const [jurisdiction, setJurisdiction] = useState<string>(lockedJurisdiction ?? ALL);
  const [months, setMonths] = useState("24");

  const url = `/api/stats/trends?months=${months}${jurisdiction !== ALL ? `&jurisdiction=${jurisdiction}` : ""}`;
  const { data, loading, error, reload } = useApi<TrendsResponse>(url);
  const { data: statsData } = useApi<StatsResponse>(jurisdiction !== ALL ? `/api/stats?jurisdiction=${jurisdiction}` : "/api/stats", 60_000);
  const t = data?.data;
  const s = statsData?.data;

  const series = useMemo(() => (t ? t.series.map((x) => ({ ...x, label: fmtMonth(x.month) })) : []), [t]);

  const plaintiffTypeItems = useMemo(() => {
    if (!t) return [];
    const pt = t.plaintiffTypes;
    return [
      { label: "NPE / monetization", count: pt.NPE ?? 0, color: "var(--chart-2)" },
      { label: "Operating company", count: pt.COMPANY ?? 0, color: "var(--chart-1)" },
      { label: "University / research", count: pt.UNIVERSITY ?? 0, color: "var(--chart-5)" },
      { label: "Individual", count: pt.INDIVIDUAL ?? 0, color: "var(--chart-6)" },
    ].filter((i) => i.count > 0);
  }, [t]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SectionHeading
        title={lockedJurisdiction ? `${JURISDICTIONS[lockedJurisdiction].short} Analytics` : "Global Litigation Analytics"}
        description={
          lockedJurisdiction
            ? `Interactive charts and statistics on ${JURISDICTIONS[lockedJurisdiction].short} cases — plaintiffs, defendants, action types and filing trends.`
            : "Cross-forum litigation intelligence: filing trends, forum rankings, party leaderboards, technology mix and outcomes."
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {!lockedJurisdiction ? (
          <Select value={jurisdiction} onValueChange={setJurisdiction}>
            <SelectTrigger className="w-[220px]" aria-label="Jurisdiction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All jurisdictions</SelectItem>
              {(Object.keys(JURISDICTIONS) as JurisdictionKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {JURISDICTIONS[k].short}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select value={months} onValueChange={setMonths}>
          <SelectTrigger className="w-[160px]" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
            <SelectItem value="24">Last 24 months</SelectItem>
            <SelectItem value="36">Last 36 months</SelectItem>
          </SelectContent>
        </Select>
        {t ? (
          <p className="tnum ml-auto font-mono text-xs text-muted-foreground">
            <Filter className="mr-1 inline h-3 w-3" aria-hidden />
            {fmtNum(t.total)} cases analysed
          </p>
        ) : null}
      </div>

      {loading && !t ? (
        <Spinner label="Crunching numbers…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !t ? null : (
        <div className="space-y-4">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 border border-border bg-card px-6 py-6 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Total cases" value={fmtNum(s?.totalCases ?? t.total)} hint={`${fmtNum(s?.activeCases ?? 0)} active now`} />
            <KpiCard label="New this month" value={fmtNum(s?.newThisMonth ?? 0)} trend={(s?.newThisMonth ?? 0) > 0 ? "up" : undefined} hint="calendar month to date" />
            <KpiCard label="NPE plaintiff share" value={`${s?.npeShare ?? 0}%`} hint="of plaintiff-side entities" />
            <KpiCard label="Forums covered" value={fmtNum(s?.courtsCovered ?? t.topCourts.length)} hint="courts & divisions" />
            <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-start sm:justify-between sm:gap-3">
              <KpiCard label="Patents asserted" value={fmtNum(s?.uniquePatentsAsserted ?? 0)} hint={`${fmtNum(s?.parties ?? 0)} parties tracked`} />
              <Sparkline values={series.map((p) => p.count)} width={92} height={36} className="hidden shrink-0 self-end sm:block" />
            </div>
          </div>

          {/* trend chart */}
          <Panel
            title="Monthly filings"
            subtitle={`Hover for detail — last ${months} months${jurisdiction !== ALL ? ` · ${JURISDICTIONS[jurisdiction as JurisdictionKey]?.short}` : ""}`}
            className="overflow-hidden"
          >
            <TrendChart series={series} />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Recent-month activity reflects live CourtListener RECAP ingestion; earlier months are the clearly-labeled
              synthetic historical baseline. Every record is origin-tagged.
            </p>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* top courts */}
            <Panel title="Top courts & divisions" subtitle="Click a forum to browse its cases">
              <BarList
                items={t.topCourts}
                onClick={(label) =>
                  navigate(
                    `${jurisdiction !== ALL ? `/${jurisdiction.toLowerCase()}` : "/litigations"}?court=${encodeURIComponent(label)}`,
                  )
                }
              />
            </Panel>

            {/* plaintiff types */}
            <Panel title="Who is filing" subtitle="Plaintiff / petitioner entity types">
              {plaintiffTypeItems.length ? <ShareBar items={plaintiffTypeItems} /> : <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>}
            </Panel>

            {/* top plaintiffs */}
            <Panel title="Top plaintiffs / petitioners" subtitle="Ranked by case count">
              <BarList items={t.topPlaintiffs} />
            </Panel>

            {/* top defendants */}
            <Panel title="Top defendants / respondents" subtitle="Ranked by case count">
              <BarList items={t.topDefendants} />
            </Panel>

            {/* tech areas */}
            <Panel title="Technology areas" subtitle="Asserted-patent technology mix">
              <BarList items={t.topTechAreas} />
            </Panel>

            {/* status distribution */}
            <Panel title="Status distribution" subtitle="Current case outcomes & lifecycle">
              <BarList items={t.statuses} />
            </Panel>
          </div>

          <p className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            Live RECAP imports refresh continuously — synthetic sample history is labeled per record.
            <button onClick={() => navigate("/data-sources")} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
              Data sources <ArrowUpRight className="h-3 w-3" aria-hidden />
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

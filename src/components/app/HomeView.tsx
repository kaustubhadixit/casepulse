"use client";

import { useMemo, useState } from "react";
import {
  Search,
  ArrowRight,
  ArrowUpRight,
  Radar,
  Gavel,
  FileSearch,
  Landmark,
  Globe2,
  Cpu,
  Pill,
  Leaf,
  Utensils,
  Battery,
  Watch,
  Wifi,
  Truck,
  HeartPulse,
  FlaskConical,
  ShoppingCart,
  MonitorSmartphone,
  Database,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { JURISDICTIONS, type JurisdictionKey } from "@/lib/constants";
import { navigate } from "./router";
import { useApi, KpiCard, SectionHeading, CaseLink, StatusBadge, JurisdictionBadge, SourceBadge, BarList, fmtDate, timeAgo, fmtMoney, fmtNum } from "./shared";

interface OverviewStats {
  totalCases: number;
  activeCases: number;
  courtsCovered: number;
  uniquePatentsAsserted: number;
  totalDamagesAwarded: number;
  parties: number;
  newThisMonth: number;
  npeShare: number;
  byJurisdiction: { jurisdiction: string; count: number }[];
  lastSync: { ranAt: string; source: string } | null;
}

interface FeedItem {
  type: "FILING" | "EVENT";
  date: string;
  title: string;
  caseId: string;
  caseNumber: string;
  jurisdiction: string;
  court: string;
  status: string;
  cause: string | null;
  detail: string;
}

/* ------------------------- hero ------------------------- */

function Hero({ stats }: { stats: OverviewStats | null }) {
  return (
    <section className="border-b border-border bg-card/50">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
        <div className="grid items-end gap-10 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="micro-label mb-4 flex items-center gap-2">
              <span className="inline-block h-px w-8 bg-primary" aria-hidden />
              Litigation Monitoring &amp; Analytics · Est. 2026
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-[3.4rem]">
              Patent litigation,
              <br />
              <span className="text-primary">the moment it is filed.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              PatentPulse tracks infringement suits, PTAB trials, EPO oppositions, UPC actions, ITC investigations and
              SEP disputes — ingested directly from free public court feeds, independent of any commercial analytics
              platform.
            </p>
            <div className="mt-7 flex max-w-xl items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  placeholder="Search cases, companies, docket numbers…"
                  className="h-11 rounded-[3px] pl-9"
                  aria-label="Search cases"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.currentTarget.value.trim()) {
                      navigate(`/litigations?q=${encodeURIComponent(e.currentTarget.value.trim())}`);
                    }
                  }}
                />
              </div>
              <Button size="lg" className="h-11 rounded-[3px]" onClick={() => navigate("/analytics")}>
                Open analytics <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden />
              </Button>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5 text-primary" aria-hidden />
              Live dockets from CourtListener / RECAP —
              <button className="font-medium text-primary hover:underline" onClick={() => navigate("/data-sources")}>
                see exactly where data comes from
              </button>
            </p>
          </div>

          {/* stat band */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-7 border-l border-border pl-8">
            <KpiCard label="Cases tracked" value={stats ? fmtNum(stats.totalCases) : "…"} hint={stats ? `${fmtNum(stats.newThisMonth)} new this month` : undefined} />
            <KpiCard label="Active matters" value={stats ? fmtNum(stats.activeCases) : "…"} hint="across six forums" />
            <KpiCard label="Forums covered" value={stats ? fmtNum(stats.courtsCovered) : "…"} hint="courts & divisions" />
            <KpiCard label="Damages awarded" value={stats ? fmtMoney(stats.totalDamagesAwarded) : "…"} hint={stats ? `${fmtNum(stats.parties)} parties tracked` : undefined} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------- jurisdiction index ------------------------- */

const JURISDICTION_ICONS: Record<JurisdictionKey, React.ComponentType<{ className?: string }>> = {
  DISTRICT_COURT: Landmark,
  PTAB: Gavel,
  UPC: Globe2,
  EPO_OPPOSITION: FileSearch,
  ITC: Radar,
  SEP: Wifi,
};

function JurisdictionCards({ stats }: { stats: OverviewStats | null }) {
  const countFor = (key: string) => stats?.byJurisdiction.find((j) => j.jurisdiction === key)?.count;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <SectionHeading
        title="Patent litigation &amp; oppositions"
        description="Every case type we monitor — filings, decisions and trends update automatically as the data pipeline refreshes."
      />
      <div className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(JURISDICTIONS) as JurisdictionKey[]).map((key, i) => {
          const j = JURISDICTIONS[key];
          const Icon = JURISDICTION_ICONS[key];
          const count = countFor(key);
          return (
            <button
              key={key}
              onClick={() => navigate(`/${key === "EPO_OPPOSITION" ? "oppositions" : key === "DISTRICT_COURT" ? "litigations" : key.toLowerCase()}`)}
              className="group relative bg-card p-6 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between">
                <span className="tnum font-mono text-[11px] text-muted-foreground/70">{String(i + 1).padStart(2, "0")}</span>
                {count != null ? <span className="tnum font-mono text-lg font-semibold">{fmtNum(count)}</span> : null}
              </div>
              <div className="mt-5 flex items-center gap-2.5">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="font-display text-lg font-semibold leading-tight">{j.label}</h3>
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{j.description}</p>
              <span className="micro-label mt-4 inline-flex items-center gap-1 !text-primary">
                View cases <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------- live feed ------------------------- */

function ActivityFeed() {
  const { data, loading, error } = useApi<{ data: (FeedItem & { source?: string })[] }>("/api/feed?limit=14", 20_000);
  const [showAll, setShowAll] = useState(false);
  const items = showAll ? (data?.data ?? []) : (data?.data ?? []).slice(0, 8);
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <SectionHeading
          title={
            <span className="flex items-center gap-3">
              IP activity feed
              <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-primary">
                <span className="pp-pulse h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> LIVE
              </span>
            </span>
          }
          description="New filings, rulings and docket events — refreshed continuously from the pipeline."
          action={
            <Button variant="outline" size="sm" className="rounded-[3px]" onClick={() => navigate("/news")}>
              Go to newsroom <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          }
        />
        <div className="border border-border bg-card">
          {loading && !data ? (
            <div className="divide-y divide-border/60">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex animate-pulse items-center gap-4 px-5 py-4">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-muted" />
                    <div className="h-3 w-1/3 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border/60">
                {items.map((item, idx) => (
                  <li key={`${item.caseId}-${idx}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40">
                    <span className="tnum hidden w-24 shrink-0 font-mono text-[11px] text-muted-foreground sm:block">
                      {timeAgo(item.date)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CaseLink id={item.caseId} title={item.title} className="truncate text-sm" />
                        <JurisdictionBadge jurisdiction={item.jurisdiction} />
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                        {item.caseNumber} · {item.court.replace("District Court, ", "")} · {item.detail}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={item.status} />
                    </div>
                  </li>
                ))}
              </ul>
              {(data?.data.length ?? 0) > 8 ? (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="micro-label w-full border-t border-border/60 py-3 text-center transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  {showAll ? "Show less" : `Show all ${data?.data.length} events`}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------- features ------------------------- */

const FEATURES = [
  {
    n: "01",
    title: "Live docket ingestion",
    body: "New patent complaints are mirrored from PACER via the free CourtListener RECAP feed within minutes of filing — no commercial data vendor in the loop.",
  },
  {
    n: "02",
    title: "Cross-forum coverage",
    body: "District courts, PTAB, UPC, EPO oppositions, ITC Section 337 and SEP/FRAND disputes unified in one searchable index with consistent party roles.",
  },
  {
    n: "03",
    title: "Party intelligence",
    body: "Company profiles aggregate full litigation history: who sues whom, NPE vs operating share, top opposing counsel and asserted patent portfolios.",
  },
  {
    n: "04",
    title: "Analytics you can audit",
    body: "Every chart is computed from records you can open, each labeled by origin — live import or clearly-marked sample data. No black boxes.",
  },
];

function Features() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <SectionHeading title="Built for IP professionals" description="A working litigation-intelligence stack, end to end." />
      <div className="grid gap-px overflow-hidden border border-border bg-border md:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.n} className="bg-card p-6">
            <span className="tnum font-mono text-xs font-semibold text-primary">{f.n}</span>
            <h3 className="mt-3 font-display text-xl font-semibold leading-tight">{f.title}</h3>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------- intelligence hub ------------------------- */

function IntelligenceHub({ stats }: { stats: OverviewStats | null }) {
  const items = useMemo(
    () =>
      (stats?.byJurisdiction ?? [])
        .map((j) => ({
          label: (JURISDICTIONS as Record<string, { short: string }>)[j.jurisdiction]?.short ?? j.jurisdiction,
          count: j.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    [stats],
  );
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              title="Matters by forum"
              description="Current split across the six monitored forums."
              action={
                <Button variant="outline" size="sm" className="rounded-[3px]" onClick={() => navigate("/analytics")}>
                  Full analytics <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden />
                </Button>
              }
            />
            <BarList items={items} />
          </div>
          <div className="lg:border-l lg:border-border lg:pl-10">
            <SectionHeading title="Data provenance" description="Every record carries its origin. Live beats loud." />
            <ul className="space-y-3">
              <li className="flex items-start gap-3 border border-border bg-card p-4">
                <SourceBadge source="courtlistener" />
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Ingested from the CourtListener RECAP search API — real federal dockets, refreshed on every sync run.
                </p>
              </li>
              <li className="flex items-start gap-3 border border-border bg-card p-4">
                <SourceBadge source="seed" />
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Synthetic historical baseline for forums without a free live feed yet (UPC, EPO, ITC…) — clearly labeled
                  as sample data everywhere it appears.
                </p>
              </li>
              <li className="flex items-start gap-3 border border-border bg-card p-4">
                <SourceBadge source="uspto-ptab" />
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  PTAB proceedings arrive the same way once a USPTO Open Data key is configured — drop it in{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">.env</code> and the feed activates.
                </p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------- tech categories ------------------------- */

const TECH_CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Consumer Electronics": MonitorSmartphone,
  Semiconductors: Cpu,
  Telecommunications: Wifi,
  "Software & E-Commerce": ShoppingCart,
  "Digital Media": MonitorSmartphone,
  "Pharmaceuticals & Biotech": Pill,
  "Medical Devices": HeartPulse,
  "Chemistry & Materials": FlaskConical,
  "Food & Nutrition": Utensils,
  "Automotive & Mobility": Truck,
  "Industrial Manufacturing": Radar,
  "Clean Energy": Battery,
  Networking: Wifi,
  "Wearables & IoT": Watch,
  "Agricultural Tech": Leaf,
};

function TechCategories() {
  const areas = Object.keys(TECH_CATEGORY_ICONS);
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <SectionHeading
        title="Technology coverage"
        description="Asserted-patent technology areas tracked across the portfolio."
      />
      <div className="flex flex-wrap gap-2">
        {areas.map((a) => {
          const Icon = TECH_CATEGORY_ICONS[a];
          return (
            <button
              key={a}
              onClick={() => navigate(`/patents?tech=${encodeURIComponent(a)}`)}
              className="flex items-center gap-2 rounded-[3px] border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
              {a}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------- faq ------------------------- */

const FAQS = [
  {
    q: "Where does the data come from?",
    a: "Live US district-court dockets are ingested from the CourtListener RECAP search API (Free Law Project), which mirrors PACER continuously. PTAB proceedings activate automatically once a free USPTO Open Data key is configured. Forums without a free public feed (UPC, EPO, ITC) run on a clearly-labeled synthetic baseline so the analytics stay complete.",
  },
  {
    q: "How often is the data updated?",
    a: "The sync pipeline runs at least every 12 hours — opportunistically when the live feed is viewed, via the daily cron endpoint, or manually from the admin console. Every run is logged and auditable on the Data Sources page.",
  },
  {
    q: "Can I track specific companies or cases?",
    a: "Yes — create a free account and add any case to your watchlist from its detail page. Company profiles show complete litigation histories, top opponents and counsel.",
  },
  {
    q: "Which analytics are available?",
    a: "Interactive dashboards for every forum: monthly filing trends, top courts, top plaintiffs and defendants, technology-area mix, status distribution and NPE share — filterable by jurisdiction and period.",
  },
  {
    q: "Is this an official product?",
    a: "No. PatentPulse is an independent open-source study prototype inspired by public litigation-analytics platforms. Live records are real public court data; historical baseline records are synthetic and labeled as such.",
  },
];

function Faq() {
  return (
    <section className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <SectionHeading title="Frequently asked questions" />
        <Accordion type="single" collapsible className="border-t border-border">
          {FAQS.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border-b border-border">
              <AccordionTrigger className="py-4 text-left text-sm font-semibold hover:no-underline sm:text-[15px]">
                <span className="flex items-baseline gap-3">
                  <span className="tnum font-mono text-[11px] text-primary">{String(i + 1).padStart(2, "0")}</span>
                  {f.q}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ------------------------- cta ------------------------- */

function CtaBand() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div className="border border-border bg-foreground px-8 py-12 text-background sm:px-12">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">
              Start monitoring IP litigation today
            </h2>
            <p className="mt-2 max-w-lg text-sm text-background/70">
              Create a free account to build your watchlist, or jump straight into the tracked matters with full-text
              search and analytics.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button
              onClick={() => navigate("/register")}
              className="rounded-[3px] bg-background text-foreground hover:bg-background/85"
            >
              Create free account
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/litigations")}
              className="rounded-[3px] border-background/40 bg-transparent text-background hover:bg-background/10 hover:text-background"
            >
              Browse litigations
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------- page ------------------------- */

export default function HomeView() {
  const { data } = useApi<{ data: OverviewStats }>("/api/stats", 60_000);
  const stats = data?.data ?? null;
  return (
    <>
      <Hero stats={stats} />
      <JurisdictionCards stats={stats} />
      <ActivityFeed />
      <Features />
      <IntelligenceHub stats={stats} />
      <TechCategories />
      <Faq />
      <CtaBand />
      <p className="flex items-center justify-center gap-1.5 pb-8 text-xs text-muted-foreground">
        <Bell className="h-3 w-3" aria-hidden />
        Last data refresh: {stats?.lastSync ? fmtDate(stats.lastSync.ranAt) : "—"} · live records labeled per case
      </p>
    </>
  );
}

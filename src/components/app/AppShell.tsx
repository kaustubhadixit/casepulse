"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Scale, User2, ChevronDown, Activity, ShieldCheck, Bookmark, LogOut, Menu, Github, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AuthProvider, useAuth } from "./auth-context";
import { useHashRoute, navigate, type HashRoute } from "./router";
import { Spinner, Ticker, useApi, useLiveChannel, type LiveEngineStatus } from "./shared";
import { useToast } from "@/hooks/use-toast";
import HomeView from "./HomeView";
import CasesView from "./CasesView";
import CaseDetailView from "./CaseDetailView";
import AnalyticsView from "./AnalyticsView";
import PatentsView from "./PatentsView";
import PatentDetailView from "./PatentDetailView";
import CompaniesView from "./CompaniesView";
import CompanyProfileView from "./CompanyProfileView";
import LawFirmsView from "./LawFirmsView";
import NewsView from "./NewsView";
import AuthView from "./AuthView";
import WatchlistView from "./WatchlistView";
import AdminView from "./AdminView";
import ContactView from "./ContactView";
import DataSourcesView from "./DataSourcesView";

/* ------------------------- brand ------------------------- */

function BrandMark({ className }: { className?: string }) {
  // Sharp square with radar sweep — inherits currentColor, adapts to theme
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect x="1.5" y="1.5" width="29" height="29" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 24 L14.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 24 A 11 11 0 0 0 19 13" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <circle cx="14.5" cy="14.5" r="1.8" fill="currentColor" />
      <path d="M8 24 L8 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="24" r="1.8" fill="currentColor" />
    </svg>
  );
}

function Brand() {
  return (
    <button onClick={() => navigate("/")} className="group flex items-center gap-2.5 text-foreground" aria-label="PatentPulse home">
      <BrandMark className="h-7 w-7 text-primary transition-transform duration-300 group-hover:rotate-[8deg]" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.15rem] font-semibold tracking-tight">PatentPulse</span>
        <span className="micro-label !tracking-[0.22em]">IP Litigation Intelligence</span>
      </span>
    </button>
  );
}

/* ------------------------- theme switcher (3 palettes) ------------------------- */

const PALETTES = [
  { id: "oxford", label: "Oxford — paper / ink / brass", colors: ["#24405e", "#b0884c", "#f3efe4"] },
  { id: "midnight", label: "Midnight — ink / gold / teal", colors: ["#e0af4a", "#141824", "#57a8a0"] },
  { id: "verde", label: "Verde — forest / verdigris / copper", colors: ["#7fb39a", "#182219", "#b0714a"] },
] as const;

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  // hydration-safe mounted check without setState-in-effect
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <div
      className="flex items-center gap-0.5 rounded-[3px] border border-border bg-card p-0.5"
      role="radiogroup"
      aria-label="Color theme"
    >
      {PALETTES.map((p) => {
        const active = mounted && theme === p.id;
        return (
          <button
            key={p.id}
            role="radio"
            aria-checked={active}
            title={p.label}
            onClick={() => setTheme(p.id)}
            className={`flex h-6 items-center gap-[2px] rounded-[2px] px-1.5 transition-all ${
              active ? "bg-primary/15 ring-1 ring-primary/60" : "hover:bg-muted"
            }`}
          >
            {p.colors.map((c) => (
              <span key={c} className="h-3 w-2 rounded-[1px]" style={{ background: c }} aria-hidden />
            ))}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------- live engine badge ------------------------- */

function LiveBadge() {
  // status also arrives via the shared channel mounted in AppFrame; poll as fallback
  const { data } = useApi<{ data: LiveEngineStatus }>("/api/live/status", 20_000);
  const st = data?.data;
  const phase = st?.phase ?? "boot";
  const mode = st?.mode ?? "demo";

  const cfg =
    phase === "live"
      ? { label: "LIVE", dot: "pp-live-dot pp-live-dot--hot", title: "Upstream data changed moments ago — streaming" }
      : phase === "error"
        ? { label: "RETRYING", dot: "pp-live-dot pp-live-dot--err", title: "Upstream temporarily unavailable — backing off" }
        : phase === "demo"
          ? { label: "DEMO", dot: "pp-live-dot pp-live-dot--demo", title: "No upstream API key — labeled sample data" }
          : { label: "WATCHING", dot: "pp-live-dot", title: "Watching upstream for changes (change-cursor poll)" };

  const tip = st
    ? `${cfg.title}\nMode: ${mode}\nChanges detected: ${st.changes}\nLast check: ${st.lastTickAt ? new Date(st.lastTickAt).toLocaleTimeString() : "—"}\nNext check: ${st.nextTickAt ? new Date(st.nextTickAt).toLocaleTimeString() : "—"}`
    : cfg.title;

  return (
    <button
      onClick={() => navigate("/data-sources")}
      title={tip}
      aria-label={`Data pipeline: ${cfg.label}`}
      className="flex h-6 items-center gap-1.5 rounded-[3px] border border-border bg-card px-2 transition-colors hover:bg-muted"
    >
      <span className={cfg.dot} aria-hidden />
      <span className="font-mono text-[9px] font-bold tracking-[0.18em]">{cfg.label}</span>
      {mode === "readonly" ? <span className="font-mono text-[8px] text-muted-foreground">RT</span> : null}
    </button>
  );
}

/* ------------------------- header ------------------------- */

const NAV: { label: string; to: string; badge?: string; children?: { label: string; to: string }[] }[] = [
  { label: "Litigation", to: "/litigations" },
  { label: "PTAB", to: "/ptab" },
  {
    label: "UPC",
    to: "/upc",
    children: [
      { label: "UPC Cases", to: "/upc" },
      { label: "UPC Analytics", to: "/upc/analytics" },
    ],
  },
  { label: "Oppositions", to: "/oppositions" },
  { label: "SEP", to: "/sep" },
  { label: "ITC", to: "/itc", badge: "New" },
  {
    label: "More",
    to: "/analytics",
    children: [
      { label: "Global Analytics", to: "/analytics" },
      { label: "Patents in Litigation", to: "/patents" },
      { label: "Companies", to: "/companies" },
      { label: "Law Firms", to: "/law-firms" },
      { label: "Litigation News", to: "/news" },
      { label: "Data Sources", to: "/data-sources" },
      { label: "Contact", to: "/contact" },
    ],
  },
];

function isActive(route: HashRoute | null, to: string) {
  if (!route) return false;
  const seg = to.replace(/^\//, "").split("/")[0];
  return route.path[0] === seg;
}

function HeaderNavLinks({ onNavigate, route }: { onNavigate?: () => void; route: HashRoute | null }) {
  return (
    <nav className="flex flex-col gap-0.5 lg:flex-row lg:items-center" aria-label="Primary">
      {NAV.map((item) =>
        item.children ? (
          <DropdownMenu key={item.label}>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center gap-1 border-b-2 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  isActive(route, item.to)
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
                <ChevronDown className="h-3 w-3" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {item.children.map((c) => (
                <DropdownMenuItem
                  key={c.label}
                  onClick={() => {
                    navigate(c.to);
                    onNavigate?.();
                  }}
                >
                  {c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            key={item.label}
            onClick={() => {
              navigate(item.to);
              onNavigate?.();
            }}
            className={`flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              isActive(route, item.to)
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
            {item.badge ? (
              <span className="rounded-[2px] bg-primary/15 px-1 py-px font-mono text-[9px] font-bold text-primary">{item.badge}</span>
            ) : null}
          </button>
        ),
      )}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  if (!user) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="hidden text-xs font-semibold uppercase tracking-wider sm:inline-flex">
          Sign in
        </Button>
        <Button size="sm" onClick={() => navigate("/register")} className="hidden text-xs font-semibold uppercase tracking-wider sm:inline-flex">
          Get started
        </Button>
      </>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[2px] bg-primary/15 font-mono text-xs font-bold text-primary">
            {(user.name ?? user.email)[0]?.toUpperCase()}
          </span>
          <span className="hidden max-w-[120px] truncate md:inline">{user.name ?? user.email}</span>
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span>{user.name ?? "Signed in"}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/watchlist")}>
          <Bookmark className="h-4 w-4" /> My Watchlist
        </DropdownMenuItem>
        {user.role === "ADMIN" ? (
          <DropdownMenuItem onClick={() => navigate("/admin")}>
            <ShieldCheck className="h-4 w-4" /> Admin Console
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await logout();
            toast({ title: "Signed out", description: "You have been signed out." });
            navigate("/");
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SiteHeader({ route }: { route: HashRoute | null }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Brand />
        <div className="hidden lg:block">
          <HeaderNavLinks route={route} />
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge />
          <ThemeSwitcher />
          <UserMenu />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto">
              <SheetTitle className="flex items-center gap-2">
                <BrandMark className="h-7 w-7 text-primary" /> <span className="font-display text-lg font-semibold">PatentPulse</span>
              </SheetTitle>
              <div className="mt-6">
                <HeaderNavLinks onNavigate={() => setOpen(false)} route={route} />
                <div className="my-4 border-t" />
                <p className="micro-label px-3 pb-2">Account</p>
                <button onClick={() => { navigate("/login"); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                  <User2 className="h-4 w-4" /> Sign in / Register
                </button>
                <button onClick={() => { navigate("/watchlist"); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Bookmark className="h-4 w-4" /> My Watchlist
                </button>
                <button onClick={() => { navigate("/admin"); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ShieldCheck className="h-4 w-4" /> Admin Console
                </button>
                <div className="my-4 border-t" />
                <div className="px-3"><ThemeSwitcher /></div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/* ------------------------- live ticker strip ------------------------- */

function LiveTicker() {
  const { data } = useApi<{ data: { caseId: string; title: string; court: string; caseNumber: string; date: string; jurisdiction: string }[] }>("/api/feed?limit=14", 30_000);
  const items = (data?.data ?? []).map((f) => ({
    id: f.caseId,
    title: f.title,
    court: f.court,
    caseNumber: f.caseNumber,
    date: f.date,
  }));
  return (
    <div className="flex items-stretch">
      <div className="flex shrink-0 items-center gap-1.5 border-r border-border/60 bg-primary/[0.06] px-3">
        <span className="pp-pulse h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
        <span className="micro-label !text-[9px]">Latest&nbsp;filings</span>
      </div>
      <div className="min-w-0 flex-1">
        <Ticker items={items} />
      </div>
    </div>
  );
}

/* ------------------------- footer ------------------------- */

function FooterLink({ label, to }: { label: string; to: string }) {
  return (
    <li>
      <button onClick={() => navigate(to)} className="text-[13px] text-muted-foreground transition hover:text-foreground hover:underline">
        {label}
      </button>
    </li>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-6 w-6 text-primary" />
              <span className="font-display text-lg font-semibold tracking-tight">PatentPulse</span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              Litigation monitoring &amp; analytics across district courts, PTAB, UPC, EPO oppositions, ITC and SEP disputes.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
              Data streams in near real time — fetched as upstream dockets change (
              <button onClick={() => navigate("/data-sources")} className="underline hover:text-foreground">
                see how
              </button>
              )
            </div>
          </div>
          <div>
            <p className="micro-label mb-3">Case Types</p>
            <ul className="space-y-2">
              <FooterLink label="US Patent Litigations" to="/litigations" />
              <FooterLink label="PTAB Case Tracker" to="/ptab" />
              <FooterLink label="Unified Patent Court" to="/upc" />
              <FooterLink label="Patent Oppositions" to="/oppositions" />
              <FooterLink label="ITC Investigations" to="/itc" />
              <FooterLink label="SEP Litigation" to="/sep" />
            </ul>
          </div>
          <div>
            <p className="micro-label mb-3">Explore</p>
            <ul className="space-y-2">
              <FooterLink label="Global Analytics" to="/analytics" />
              <FooterLink label="Patents in Litigation" to="/patents" />
              <FooterLink label="Companies" to="/companies" />
              <FooterLink label="Law Firms" to="/law-firms" />
              <FooterLink label="Litigation News" to="/news" />
              <FooterLink label="Data Sources" to="/data-sources" />
              <FooterLink label="Contact" to="/contact" />
            </ul>
          </div>
          <div>
            <p className="micro-label mb-3">Account</p>
            <ul className="space-y-2">
              <FooterLink label="Sign in" to="/login" />
              <FooterLink label="Create account" to="/register" />
              <FooterLink label="My Watchlist" to="/watchlist" />
              <FooterLink label="Admin Console" to="/admin" />
            </ul>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5" aria-hidden />© 2026 PatentPulse — functional study prototype.
          </p>
          <p className="flex items-center gap-1.5">
            <Github className="h-3.5 w-3.5" aria-hidden />
            Records are labeled by origin: courtlistener / uspto-ptab / synthetic sample data.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------- route dispatch ------------------------- */

function renderRoute(route: HashRoute) {
  const [a, b] = route.path;
  switch (a) {
    case undefined:
      return <HomeView />;
    case "litigations":
      return <CasesView key="DISTRICT_COURT" jurisdiction="DISTRICT_COURT" initialQuery={route.query} />;
    case "ptab":
      return <CasesView key="PTAB" jurisdiction="PTAB" initialQuery={route.query} />;
    case "upc":
      return b === "analytics" ? <AnalyticsView key="upc-analytics" lockedJurisdiction="UPC" /> : <CasesView key="UPC" jurisdiction="UPC" initialQuery={route.query} />;
    case "oppositions":
      return <CasesView key="EPO_OPPOSITION" jurisdiction="EPO_OPPOSITION" initialQuery={route.query} />;
    case "itc":
      return <CasesView key="ITC" jurisdiction="ITC" initialQuery={route.query} />;
    case "sep":
      return <CasesView key="SEP" jurisdiction="SEP" initialQuery={route.query} />;
    case "case":
      return b ? <CaseDetailView caseId={b} /> : <CasesView jurisdiction="DISTRICT_COURT" />;
    case "analytics":
      return <AnalyticsView />;
    case "patents":
      return <PatentsView initialQuery={route.query} />;
    case "patent":
      return b ? <PatentDetailView patentId={b} /> : <PatentsView />;
    case "companies":
      return <CompaniesView />;
    case "company":
      return b ? <CompanyProfileView slug={b} /> : <CompaniesView />;
    case "law-firms":
      return <LawFirmsView />;
    case "news":
      return <NewsView />;
    case "data-sources":
      return <DataSourcesView />;
    case "login":
      return <AuthView mode="login" />;
    case "register":
      return <AuthView mode="register" />;
    case "watchlist":
      return <WatchlistView />;
    case "admin":
      return <AdminView />;
    case "contact":
      return <ContactView />;
    default:
      return (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-28 text-center">
          <span className="font-mono text-xs font-bold tracking-[0.3em] text-muted-foreground">404</span>
          <h1 className="font-display text-3xl font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground">The view you are looking for does not exist.</p>
          <Button onClick={() => navigate("/")} variant="outline" className="mt-2">
            Back to dashboard
          </Button>
        </div>
      );
  }
}

function AppFrame() {
  const route = useHashRoute();
  const { toast } = useToast();

  // ONE SSE channel for the whole app: new-case toasts + reactive refetch
  const pending = useRef(0);
  const flushAt = useRef(0);
  useLiveChannel((e) => {
    if (e.type !== "case:new" || typeof document === "undefined" || document.visibilityState !== "visible") return;
    pending.current += 1;
    const now = Date.now();
    if (now < flushAt.current) return;
    flushAt.current = now + 20_000;
    const n = pending.current;
    pending.current = 0;
    const first = e.data?.title ?? "New filing";
    toast({
      title: `${n} new filing${n > 1 ? "s" : ""} detected`,
      description: n === 1 ? `${first} — feed updated live.` : `Including “${first}” — feed updated live.`,
    });
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route?.hash]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader route={route} />
      <LiveTicker />
      <main className="flex-1">
        {route === null ? (
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <Spinner label="Loading PatentPulse…" />
          </div>
        ) : (
          <div key={route.hash} className="pp-rise">
            {renderRoute(route)}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default function AppShell() {
  return (
    <AuthProvider>
      <AppFrame />
    </AuthProvider>
  );
}

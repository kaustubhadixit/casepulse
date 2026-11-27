"use client";

import { useState } from "react";
import { ArrowLeft, Bookmark, BookmarkCheck, MapPin, Gavel, CalendarDays, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { navigate } from "./router";
import { useAuth } from "./auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  useApi,
  CaseLink,
  StatusBadge,
  JurisdictionBadge,
  PartyTypeBadge,
  SourceBadge,
  fmtDate,
  fmtMoney,
  Spinner,
  ErrorState,
  EmptyState,
} from "./shared";

interface CaseDetail {
  id: string;
  caseNumber: string;
  title: string;
  jurisdiction: string;
  court: string;
  courtDetail: string | null;
  judge: string | null;
  status: string;
  cause: string | null;
  techArea: string | null;
  summary: string | null;
  damagesAwarded: number | null;
  filingDate: string;
  closedDate: string | null;
  source: string;
  updatedAt: string;
  plaintiffs: string[];
  defendants: string[];
  parties: { name: string; slug: string; type: string; role: string; hqCountry: string | null; description: string | null }[];
  patents: { id: string; number: string; title: string; techArea: string | null; assignee: string | null; grantDate: string | null; claimCount: number | null; status: string }[];
  lawFirms: { name: string; city: string | null; country: string | null; side: string }[];
  events: { id: string; date: string; kind: string; description: string }[];
  relatedCases: { id: string; caseNumber: string; title: string; jurisdiction: string; status: string; filingDate: string; sharedPatents: number }[];
  watchCount: number;
  watched: boolean;
}

const backTarget: Record<string, string> = {
  DISTRICT_COURT: "/litigations",
  PTAB: "/ptab",
  UPC: "/upc",
  EPO_OPPOSITION: "/oppositions",
  ITC: "/itc",
  SEP: "/sep",
};

export default function CaseDetailView({ caseId }: { caseId: string }) {
  const { data, loading, error, reload } = useApi<{ data: CaseDetail }>(`/api/cases/${caseId}`);
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const c = data?.data;

  const toggleWatch = async () => {
    if (!c) return;
    if (!user) {
      toast({ title: "Sign in required", description: "Create a free account to track cases on your watchlist." });
      navigate("/login");
      return;
    }
    setBusy(true);
    try {
      if (c.watched) {
        await fetch(`/api/watchlist?caseId=${c.id}`, { method: "DELETE" });
        toast({ title: "Removed from watchlist" });
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId: c.id }),
        });
        if (!res.ok) throw new Error();
        toast({ title: "Added to watchlist", description: "You will see updates for this case under My Watchlist." });
      }
      await reload();
    } catch {
      toast({ title: "Action failed", description: "Could not update your watchlist. Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading case…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!c) return <EmptyState title="Case not found" />;

  const plaintiffFirms = c.lawFirms.filter((f) => f.side === "PLAINTIFF");
  const defendantFirms = c.lawFirms.filter((f) => f.side === "DEFENDANT");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={() => navigate(backTarget[c.jurisdiction] ?? "/litigations")}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to {backTarget[c.jurisdiction]?.replace("/", "") ?? "cases"}
      </Button>

      {/* header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <JurisdictionBadge jurisdiction={c.jurisdiction} />
                <StatusBadge status={c.status} />
                {c.techArea ? <Badge variant="outline">{c.techArea}</Badge> : null}
                <SourceBadge source={c.source} />
              </div>
              <h1 className="mt-3 text-xl font-extrabold tracking-tight sm:text-2xl">{c.title}</h1>
              <p className="mt-1 font-mono text-sm text-muted-foreground">{c.caseNumber}</p>
              <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden /> {c.court}
                </span>
                <span className="flex items-center gap-1.5">
                  <Gavel className="h-4 w-4 shrink-0" aria-hidden /> {c.judge ?? "—"}
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 shrink-0" aria-hidden /> Filed {fmtDate(c.filingDate)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Scale className="h-4 w-4 shrink-0" aria-hidden /> {c.cause ?? "—"}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-stretch gap-2">
              <Button onClick={toggleWatch} disabled={busy} variant={c.watched ? "secondary" : "default"} className="gap-1.5">
                {c.watched ? <BookmarkCheck className="h-4 w-4" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
                {c.watched ? "Watching" : "Watch this case"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {c.watchCount} {c.watchCount === 1 ? "user" : "users"} tracking
              </p>
            </div>
          </div>
          {c.summary ? <p className="mt-5 border-t pt-4 text-sm leading-relaxed text-muted-foreground">{c.summary}</p> : null}
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Damages awarded</p>
            <p className="mt-1 text-xl font-bold text-primary">{fmtMoney(c.damagesAwarded)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Patents asserted</p>
            <p className="mt-1 text-xl font-bold">{c.patents.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Parties</p>
            <p className="mt-1 text-xl font-bold">{c.parties.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Docket events</p>
            <p className="mt-1 text-xl font-bold">{c.events.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="parties">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="parties">Parties &amp; Counsel</TabsTrigger>
          <TabsTrigger value="patents">Patents ({c.patents.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="related">Related ({c.relatedCases.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="parties">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-0">
                <div className="divide-y">
                  {c.parties.map((p) => (
                    <div key={p.slug + p.role} className="flex flex-wrap items-center justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <button
                          onClick={() => navigate(`/company/${p.slug}`)}
                          className="font-medium text-primary hover:underline"
                        >
                          {p.name}
                        </button>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {p.hqCountry ?? "—"} · {p.description ?? ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <PartyTypeBadge type={p.type} />
                        <Badge variant={["PLAINTIFF", "PETITIONER", "OPPONENT"].includes(p.role) ? "default" : "secondary"}>{p.role}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <p className="mb-2 text-sm font-semibold">Counsel — plaintiff side</p>
                  {plaintiffFirms.length ? (
                    <ul className="space-y-1.5">
                      {plaintiffFirms.map((f) => (
                        <li key={f.name} className="text-sm text-muted-foreground">
                          {f.name} <span className="text-xs">({[f.city, f.country].filter(Boolean).join(", ")})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not yet recorded.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="mb-2 text-sm font-semibold">Counsel — defendant side</p>
                  {defendantFirms.length ? (
                    <ul className="space-y-1.5">
                      {defendantFirms.map((f) => (
                        <li key={f.name} className="text-sm text-muted-foreground">
                          {f.name} <span className="text-xs">({[f.city, f.country].filter(Boolean).join(", ")})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not yet recorded.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="patents">
          {c.patents.length === 0 ? (
            <EmptyState title="No patents linked to this record" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {c.patents.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => navigate(`/patent/${p.id}`)}
                        className="font-mono text-sm font-bold text-primary hover:underline"
                      >
                        {p.number}
                      </button>
                      <Badge variant="outline">{p.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">{p.title}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {p.techArea ? <span>{p.techArea}</span> : null}
                      <span>Granted {fmtDate(p.grantDate)}</span>
                      <span>{p.claimCount ?? "—"} claims</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Assignee: {p.assignee ?? "—"}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          {c.events.length === 0 ? (
            <EmptyState title="No docket events recorded yet" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <ol className="divide-y">
                  {c.events.map((e) => (
                    <li key={e.id} className="flex gap-4 p-4">
                      <div className="w-24 shrink-0 text-right">
                        <p className="text-xs font-semibold">{fmtDate(e.date)}</p>
                      </div>
                      <div className="min-w-0 flex-1 border-l pl-4">
                        <Badge variant="outline" className="mb-1">
                          {e.kind}
                        </Badge>
                        <p className="text-sm text-muted-foreground">{e.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="related">
          {c.relatedCases.length === 0 ? (
            <EmptyState title="No related cases" description="Cases sharing a party or an asserted patent will appear here." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {c.relatedCases.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <CaseLink id={r.id} title={r.title} className="text-sm" />
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {r.caseNumber} · filed {fmtDate(r.filingDate)}
                          {r.sharedPatents > 0 ? ` · ${r.sharedPatents} shared patent${r.sharedPatents > 1 ? "s" : ""}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <JurisdictionBadge jurisdiction={r.jurisdiction} />
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

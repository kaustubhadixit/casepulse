"use client";

import { ArrowLeft, Swords, Gavel, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { navigate } from "./router";
import { useApi, CaseLink, StatusBadge, JurisdictionBadge, PartyTypeBadge, Spinner, ErrorState, EmptyState, fmtDate, fmtMoney } from "./shared";

interface PartyProfile {
  party: { id: string; slug: string; name: string; type: string; hqCountry: string | null; hqCity: string | null; description: string | null };
  stats: { totalCases: number; asPlaintiff: number; asDefendant: number; activeCases: number; damagesInvolved: number };
  topOpponents: { name: string; count: number }[];
  lawFirms: { name: string; city: string | null; side: string; count: number }[];
  patents: { id: string; number: string; title: string; techArea: string | null; grantDate: string | null; status: string }[];
  recentCases: { id: string; caseNumber: string; title: string; jurisdiction: string; court: string; status: string; filingDate: string; role: string }[];
}

export default function CompanyProfileView({ slug }: { slug: string }) {
  const { data, loading, error, reload } = useApi<{ data: PartyProfile }>(`/api/parties/${slug}`);
  const d = data?.data;

  if (loading) return <Spinner label="Loading company profile…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!d) return <EmptyState title="Company not found" />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={() => navigate("/companies")}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to companies
      </Button>

      {/* header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <PartyTypeBadge type={d.party.type} />
                {d.party.hqCountry ? (
                  <span className="text-xs text-muted-foreground">HQ: {d.party.hqCountry}</span>
                ) : null}
              </div>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{d.party.name}</h1>
              {d.party.description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{d.party.description}</p> : null}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Total cases", value: d.stats.totalCases },
              { label: "As plaintiff", value: d.stats.asPlaintiff },
              { label: "As defendant", value: d.stats.asDefendant },
              { label: "Active matters", value: d.stats.activeCases },
              { label: "Damages involved", value: fmtMoney(d.stats.damagesInvolved) },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-lg font-bold text-primary">{s.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* recent cases */}
        <div className="lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Gavel className="h-5 w-5 text-primary" aria-hidden /> Litigation history
          </h2>
          {d.recentCases.length === 0 ? (
            <EmptyState title="No cases on record" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {d.recentCases.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <CaseLink id={c.id} title={c.title} className="text-sm" />
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {c.caseNumber} · {c.court} · filed {fmtDate(c.filingDate)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{c.role}</Badge>
                        <JurisdictionBadge jurisdiction={c.jurisdiction} />
                        <StatusBadge status={c.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* side panels */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Swords className="h-4 w-4 text-primary" aria-hidden /> Top opponents
              </h3>
              {d.topOpponents.length ? (
                <ul className="space-y-2">
                  {d.topOpponents.map((o) => (
                    <li key={o.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-muted-foreground">{o.name}</span>
                      <Badge variant="secondary">{o.count}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No opponents on record.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Building2 className="h-4 w-4 text-primary" aria-hidden /> Counsel
              </h3>
              {d.lawFirms.length ? (
                <ul className="space-y-2">
                  {d.lawFirms.map((f) => (
                    <li key={f.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {f.name}
                        {f.city ? <span className="text-xs text-muted-foreground"> · {f.city}</span> : null}
                      </span>
                      <Badge variant="outline">{f.side === "PLAINTIFF" ? "P" : "D"} · {f.count}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No counsel recorded.</p>
              )}
            </CardContent>
          </Card>

          {d.patents.length ? (
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-3 text-sm font-bold">Patent portfolio (asserted)</h3>
                <ul className="space-y-2.5">
                  {d.patents.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => navigate(`/patent/${p.id}`)}
                        className="font-mono text-xs font-bold text-primary hover:underline"
                      >
                        {p.number}
                      </button>
                      <p className="truncate text-xs text-muted-foreground">{p.title}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

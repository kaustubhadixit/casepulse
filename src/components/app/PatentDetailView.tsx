"use client";

import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { navigate } from "./router";
import { useApi, CaseLink, StatusBadge, JurisdictionBadge, Spinner, ErrorState, EmptyState, fmtDate } from "./shared";

interface PatentDetail {
  id: string;
  number: string;
  title: string;
  techArea: string | null;
  assignee: string | null;
  status: string;
  claimCount: number | null;
  abstract: string | null;
  filingDate: string | null;
  grantDate: string | null;
  cases: {
    id: string;
    caseNumber: string;
    title: string;
    jurisdiction: string;
    court: string;
    status: string;
    filingDate: string;
    plaintiffs: string[];
    defendants: string[];
  }[];
}

export default function PatentDetailView({ patentId }: { patentId: string }) {
  const { data, loading, error, reload } = useApi<{ data: PatentDetail }>(`/api/patents/${patentId}`);
  const p = data?.data;

  if (loading) return <Spinner label="Loading patent…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!p) return <EmptyState title="Patent not found" />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={() => navigate("/patents")}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to patents
      </Button>

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
              {p.number}
            </Badge>
            <Badge variant="outline">{p.status}</Badge>
            {p.techArea ? <Badge variant="outline">{p.techArea}</Badge> : null}
          </div>
          <h1 className="mt-3 text-xl font-extrabold tracking-tight sm:text-2xl">{p.title}</h1>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide">Assignee</p>
              <p className="mt-0.5 font-medium text-foreground">{p.assignee ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide">Filed</p>
              <p className="mt-0.5 font-medium text-foreground">{fmtDate(p.filingDate)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide">Granted</p>
              <p className="mt-0.5 font-medium text-foreground">{fmtDate(p.grantDate)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide">Claims</p>
              <p className="mt-0.5 font-medium text-foreground">{p.claimCount ?? "—"}</p>
            </div>
          </div>
          {p.abstract ? <p className="mt-5 border-t pt-4 text-sm leading-relaxed text-muted-foreground">{p.abstract}</p> : null}
        </CardContent>
      </Card>

      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <FileText className="h-5 w-5 text-primary" aria-hidden />
        Assertion history ({p.cases.length})
      </h2>

      {p.cases.length === 0 ? (
        <EmptyState title="No recorded assertions" />
      ) : (
        <div className="grid gap-3">
          {p.cases.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <CaseLink id={c.id} title={c.title} className="text-sm" />
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {c.caseNumber} · {c.court} · filed {fmtDate(c.filingDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <JurisdictionBadge jurisdiction={c.jurisdiction} />
                  <StatusBadge status={c.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Database, ExternalLink, KeyRound, RefreshCw, Radio, ShieldCheck, Globe2, Cpu } from "lucide-react";
import { useApi, SectionHeading, Spinner, ErrorState, timeAgo } from "./shared";
import { useToast } from "@/hooks/use-toast";

interface SourceDef {
  id: string;
  name: string;
  kind: string;
  url: string | null;
  signup: string | null;
  env: string | null;
  free: boolean;
  refresh: string;
  status: string;
  notes: string;
}

interface SourcesResponse {
  data: SourceDef[];
  cadence: { mode: string; changeCursor?: string; push?: string; trafficNudge?: string; keepAlive?: string; cron?: string; opportunistic?: string };
}

interface SyncLog {
  id: string;
  ranAt: string;
  source: string;
  recordsIngested: number;
  casesUpdated: number;
  notes: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  online: "bg-primary/12 text-primary",
  "no-key": "text-[color-mix(in_oklch,var(--chart-2)_78%,var(--foreground))] bg-[color-mix(in_oklch,var(--chart-2)_12%,transparent)]",
};

const SOURCE_ICONS: Record<string, React.ElementType> = {
  courtlistener: Globe2,
  "uspto-ptab": ShieldCheck,
  patentsview: Database,
  synthetic: Cpu,
};

function statusBadge(status: string) {
  const cls = status.startsWith("error") ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : (STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300");
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>;
}

export default function DataSourcesView() {
  const { data, loading, error, reload } = useApi<SourcesResponse>("/api/sources");
  const logs = useApi<{ data: SyncLog[] }>("/api/sync");
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  // admin-triggered refresh (falls back to synthetic-only if not admin)
  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" } });
      const json = await res.json();
      if (res.ok) {
        toast({
          title: "Upstream check ran",
          description: json.changes
            ? `${json.changes} change(s) detected so far — engine ingesting.`
            : "Cursor is up to date — no upstream changes since the last check.",
        });
        reload();
        logs.reload();
      } else {
        toast({ title: "Refresh blocked", description: json.error ?? "Admin session or cron key required." });
      }
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Spinner label="Loading data sources…" /></div>;
  if (error || !data) return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><ErrorState message={error ?? "Failed to load sources"} onRetry={reload} /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <SectionHeading
        title="Data Sources & Refresh Pipeline"
        description="Where the data comes from, how it is refreshed, and how to plug in free public APIs — fully independent of any proprietary feed."
        action={
          <Button onClick={runNow} disabled={running} size="sm" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} aria-hidden />
            {running ? "Running…" : "Refresh now"}
          </Button>
        }
      />

      <Card className="mb-6 border-primary/25 bg-primary/[0.05]">
        <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-4">
          <Radio className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">Refresh mode — {data.cadence.mode}</p>
            <p className="mt-0.5 text-muted-foreground">{data.cadence.changeCursor}</p>
            <p className="mt-0.5 text-muted-foreground">{data.cadence.push}. {data.cadence.trafficNudge}.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{data.cadence.keepAlive}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {data.data.map((s) => {
          const Icon = SOURCE_ICONS[s.id] ?? Database;
          return (
            <Card key={s.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between gap-3 text-base">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {s.name}
                  </span>
                  {statusBadge(s.status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">{s.kind}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Refresh</dt>
                  <dd>{s.refresh}</dd>
                  <dt className="text-muted-foreground">Cost</dt>
                  <dd>{s.free ? "Free public API" : "—"}</dd>
                  {s.env ? (
                    <>
                      <dt className="flex items-center gap-1 text-muted-foreground"><KeyRound className="h-3 w-3" aria-hidden /> Key</dt>
                      <dd><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.env}</code></dd>
                    </>
                  ) : null}
                </dl>
                <p className="text-xs text-muted-foreground">{s.notes}</p>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    API docs <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-10">
        <SectionHeading title="Sync history" description="Every refresh run is logged with the sources it touched." />
        {logs.loading ? (
          <Spinner />
        ) : logs.error || !logs.data ? (
          <ErrorState message="Failed to load sync history" onRetry={logs.reload} />
        ) : logs.data.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sync runs yet — trigger one above.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">New records</th>
                  <th className="px-3 py-2 font-semibold">Cases advanced</th>
                  <th className="px-3 py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {logs.data.data.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="whitespace-nowrap px-3 py-2">{timeAgo(l.ranAt)}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{l.source}</Badge></td>
                    <td className="px-3 py-2">{l.recordsIngested}</td>
                    <td className="px-3 py-2">{l.casesUpdated}</td>
                    <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground" title={l.notes ?? undefined}>{l.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

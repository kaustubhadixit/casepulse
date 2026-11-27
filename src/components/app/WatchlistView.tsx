"use client";

import { Bookmark, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { navigate } from "./router";
import { useAuth } from "./auth-context";
import { useApi, CaseLink, StatusBadge, JurisdictionBadge, Spinner, ErrorState, EmptyState, fmtDate, timeAgo } from "./shared";
import { useToast } from "@/hooks/use-toast";
import type { CaseSummaryRow } from "./CasesView";

interface WatchRow extends CaseSummaryRow {
  note: string | null;
  watchedAt: string;
}

export default function WatchlistView() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error, reload } = useApi<{ data: WatchRow[] }>(user ? "/api/watchlist" : null);
  const { toast } = useToast();

  const remove = async (caseId: string) => {
    try {
      await fetch(`/api/watchlist?caseId=${caseId}`, { method: "DELETE" });
      toast({ title: "Removed from watchlist" });
      await reload();
    } catch {
      toast({ title: "Could not remove case", variant: "destructive" });
    }
  };

  if (authLoading) return <Spinner />;
  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <Bookmark className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Your watchlist lives here</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to track cases, get activity digests and monitor the disputes that matter to you.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => navigate("/login")}>Sign in</Button>
          <Button variant="outline" onClick={() => navigate("/register")}>
            Create free account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">My Watchlist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cases you are tracking — statuses update automatically as the data pipeline refreshes.
        </p>
      </div>

      {loading && !data ? (
        <Spinner label="Loading watchlist…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="Nothing on your watchlist yet"
          description="Open any case and press “Watch this case” to start monitoring it."
          actionLabel="Explore litigations"
          onAction={() => navigate("/litigations")}
        />
      ) : (
        <div className="grid gap-3">
          {data.data.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <CaseLink id={c.id} title={c.title} className="text-sm" />
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {c.caseNumber} · {c.court} · filed {fmtDate(c.filingDate)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Added {timeAgo(c.watchedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <JurisdictionBadge jurisdiction={c.jurisdiction} />
                  <StatusBadge status={c.status} />
                  <Button variant="ghost" size="icon" aria-label="Remove from watchlist" onClick={() => remove(c.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

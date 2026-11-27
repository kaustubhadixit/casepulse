"use client";

import { useMemo, useState } from "react";
import { Newspaper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApi, SectionHeading, Spinner, ErrorState, EmptyState, timeAgo } from "./shared";

interface NewsRow {
  id: string;
  title: string;
  summary: string;
  category: string;
  sourceName: string;
  publishedAt: string;
}

const CATEGORIES = ["All", "LITIGATION", "PTAB", "UPC", "OPPOSITION", "SEP", "ITC", "MARKET"];

const CATEGORY_COLORS: Record<string, string> = {
  LITIGATION: "bg-primary/12 text-primary",
  PTAB: "text-[color-mix(in_oklch,var(--chart-2)_78%,var(--foreground))] bg-[color-mix(in_oklch,var(--chart-2)_12%,transparent)]",
  UPC: "text-[color-mix(in_oklch,var(--chart-5)_78%,var(--foreground))] bg-[color-mix(in_oklch,var(--chart-5)_12%,transparent)]",
  OPPOSITION: "text-[color-mix(in_oklch,var(--chart-3)_78%,var(--foreground))] bg-[color-mix(in_oklch,var(--chart-3)_12%,transparent)]",
  SEP: "text-[color-mix(in_oklch,var(--chart-6)_78%,var(--foreground))] bg-[color-mix(in_oklch,var(--chart-6)_12%,transparent)]",
  ITC: "bg-primary/12 text-primary",
  MARKET: "text-muted-foreground bg-muted",
};

export default function NewsView() {
  const [category, setCategory] = useState("All");
  const { data, loading, error, reload } = useApi<{ data: NewsRow[] }>(`/api/news?limit=30${category !== "All" ? `&category=${category}` : ""}`, 60000);
  const items = data?.data ?? [];
  const featured = useMemo(() => items[0], [items]);
  const rest = useMemo(() => items.slice(1), [items]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <SectionHeading
        title="Litigation News"
        description="Verdicts, settlements, institution decisions and market moves — curated from the data pipeline as cases evolve."
      />

      {/* category chips */}
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="News categories">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              category === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {c === "All" ? "All news" : c}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <Spinner label="Loading news…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState title="No news in this category yet" description="Check back after the next data refresh." />
      ) : (
        <div className="space-y-4">
          {featured ? (
            <Card className="border-primary/25 bg-primary/[0.04]">
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Badge className={CATEGORY_COLORS[featured.category] ?? CATEGORY_COLORS.LITIGATION}>{featured.category}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {featured.sourceName} · {timeAgo(featured.publishedAt)}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-bold leading-snug sm:text-xl">{featured.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{featured.summary}</p>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {rest.map((n) => (
              <Card key={n.id}>
                <CardContent className="flex h-full flex-col p-5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {n.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{timeAgo(n.publishedAt)}</span>
                  </div>
                  <h3 className="mt-2.5 text-sm font-bold leading-snug">{n.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{n.summary}</p>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Newspaper className="h-3 w-3" aria-hidden /> {n.sourceName}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

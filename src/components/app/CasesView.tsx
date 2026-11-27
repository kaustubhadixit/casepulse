"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JURISDICTIONS, type JurisdictionKey } from "@/lib/constants";
import { navigate } from "./router";
import { useApi, CaseLink, StatusBadge, JurisdictionBadge, SourceBadge, fmtDate, fmtMoney, Spinner, ErrorState, EmptyState } from "./shared";

export interface CaseSummaryRow {
  id: string;
  caseNumber: string;
  title: string;
  jurisdiction: string;
  court: string;
  courtDetail?: string | null;
  judge: string | null;
  status: string;
  cause: string | null;
  techArea: string | null;
  summary?: string | null;
  damagesAwarded: number | null;
  filingDate: string;
  closedDate?: string | null;
  source?: string;
  updatedAt?: string;
  plaintiffs: string[];
  defendants: string[];
}

interface CasesResponse {
  data: CaseSummaryRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  facets: { courts: string[]; statuses: string[]; techAreas: string[] };
}

const ALL = "__all__";

export default function CasesView({
  jurisdiction,
  initialQuery,
}: {
  jurisdiction: JurisdictionKey;
  initialQuery?: URLSearchParams;
}) {
  const meta = JURISDICTIONS[jurisdiction];
  const [q, setQ] = useState(initialQuery?.get("q") ?? "");
  const [court, setCourt] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [tech, setTech] = useState(initialQuery?.get("tech") ?? ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const params = useMemo(() => {
    const sp = new URLSearchParams({ jurisdiction, page: String(page), pageSize: "12", sort });
    if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
    if (court !== ALL) sp.set("court", court);
    if (status !== ALL) sp.set("status", status);
    if (tech !== ALL) sp.set("tech", tech);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    return sp.toString();
  }, [jurisdiction, page, sort, debouncedQ, court, status, tech, from, to]);

  const { data, loading, error, reload } = useApi<CasesResponse>(`/api/cases?${params}`);

  const hasFilters = q || court !== ALL || status !== ALL || tech !== ALL || from || to;
  const clearFilters = useCallback(() => {
    setQ("");
    setCourt(ALL);
    setStatus(ALL);
    setTech(ALL);
    setFrom("");
    setTo("");
  }, []);

  const csvHref = useMemo(() => `/api/cases?${params}&pageSize=50`, [params]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <JurisdictionBadge jurisdiction={jurisdiction} />
          {jurisdiction === "UPC" ? (
            <Button variant="outline" size="sm" onClick={() => navigate("/upc/analytics")}>
              View analytics dashboard
            </Button>
          ) : null}
          {jurisdiction === "DISTRICT_COURT" ? (
            <Button variant="outline" size="sm" onClick={() => navigate("/analytics")}>
              Global analytics
            </Button>
          ) : null}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{meta.label}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">{meta.description}</p>
      </div>

      {/* filters */}
      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <Label htmlFor="case-search" className="sr-only">
                Search cases
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="case-search"
                  type="search"
                  placeholder="Search case name, party or docket number…"
                  className="pl-9"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                    setDirty(true);
                  }}
                />
              </div>
            </div>
            <Select value={court} onValueChange={(v) => { setCourt(v); setPage(1); }}>
              <SelectTrigger aria-label="Filter by court">
                <SelectValue placeholder="All courts" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL}>All courts</SelectItem>
                {data?.facets.courts.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL}>All statuses</SelectItem>
                {data?.facets.statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tech} onValueChange={(v) => { setTech(v); setPage(1); }}>
              <SelectTrigger aria-label="Filter by technology">
                <SelectValue placeholder="All technologies" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL}>All technologies</SelectItem>
                {data?.facets.techAreas.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="date-from" className="sr-only">
                  Filed from
                </Label>
                <Input id="date-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="Filed from" className="min-w-0" />
              </div>
              <span className="text-xs text-muted-foreground">to</span>
              <div className="min-w-0 flex-1">
                <Label htmlFor="date-to" className="sr-only">
                  Filed to
                </Label>
                <Input id="date-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="Filed to" className="min-w-0" />
              </div>
            </div>
            <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
              <SelectTrigger aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Newest filings</SelectItem>
                <SelectItem value="oldest">Oldest filings</SelectItem>
                <SelectItem value="damages">Highest damages</SelectItem>
                <SelectItem value="updated">Recently updated</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              {hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1">
                  <X className="h-3.5 w-3.5" aria-hidden /> Clear
                </Button>
              ) : null}
              <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(csvHref, "_blank")}>
                <Download className="h-3.5 w-3.5" aria-hidden /> Export page (JSON)
              </Button>
              {dirty ? null : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* results */}
      {loading && !data ? (
        <Spinner label="Loading cases…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No cases match your filters"
          description="Try clearing a filter or widening the date range."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
            Showing <strong>{data.data.length}</strong> of <strong>{data.pagination.total.toLocaleString()}</strong> cases
            {hasFilters ? " (filtered)" : ""}
          </p>

          {/* desktop table */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto scroll-thin">
                <Table className="data-table">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[280px]">Case</TableHead>
                      <TableHead className="min-w-[120px]">Court</TableHead>
                      <TableHead>Filed</TableHead>
                      <TableHead className="min-w-[160px]">Cause</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Damages</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CaseLink id={c.id} title={c.title} />
                            <SourceBadge source={c.source} />
                          </div>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.caseNumber}</p>
                        </TableCell>
                        <TableCell className="text-sm">{c.court.replace("District Court, ", "")}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{fmtDate(c.filingDate)}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{c.cause ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {c.damagesAwarded != null ? fmtMoney(c.damagesAwarded) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* mobile cards */}
          <div className="grid gap-3 lg:hidden">
            {data.data.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <CaseLink id={c.id} title={c.title} className="text-sm" />
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{c.caseNumber}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{c.court}</span>
                    <span>Filed {fmtDate(c.filingDate)}</span>
                    {c.damagesAwarded != null ? <span className="font-semibold text-primary">{fmtMoney(c.damagesAwarded)}</span> : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* pagination */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { navigate } from "./router";
import { useApi, SectionHeading, StatusBadge, JurisdictionBadge, Spinner, ErrorState, EmptyState, fmtDate, TECH_AREAS } from "./shared";

interface PatentRow {
  id: string;
  number: string;
  title: string;
  techArea: string | null;
  assignee: string | null;
  status: string;
  claimCount: number | null;
  grantDate: string | null;
  assertedCount: number;
  activeCases: number;
  lastAsserted: string | null;
}

interface PatentsResponse {
  data: PatentRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  techAreas: string[];
}

const ALL = "__all__";

export default function PatentsView({ initialQuery }: { initialQuery?: URLSearchParams }) {
  const [q, setQ] = useState(initialQuery?.get("q") ?? "");
  const [tech, setTech] = useState(ALL);
  const [sort, setSort] = useState("asserted");
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState(q);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  const params = useMemo(() => {
    const sp = new URLSearchParams({ page: String(page), pageSize: "12", sort });
    if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
    if (tech !== ALL) sp.set("tech", tech);
    return sp.toString();
  }, [page, sort, debouncedQ, tech]);

  const { data, loading, error, reload } = useApi<PatentsResponse>(`/api/patents?${params}`);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SectionHeading
        title="Patents in Litigation"
        description="The most-asserted patents across every monitored forum — ranked by enforcement activity, with full assertion histories."
      />

      <Card className="mb-5">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <Label htmlFor="patent-search" className="sr-only">
              Search patents
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="patent-search"
                type="search"
                placeholder="Search number, title or assignee…"
                className="pl-9"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <Select value={tech} onValueChange={(v) => { setTech(v); setPage(1); }}>
            <SelectTrigger aria-label="Technology filter">
              <SelectValue placeholder="All technologies" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>All technologies</SelectItem>
              {TECH_AREAS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
            <SelectTrigger aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asserted">Most asserted</SelectItem>
              <SelectItem value="recent">Recently asserted</SelectItem>
              <SelectItem value="number">Newest grants</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading && !data ? (
        <Spinner label="Loading patents…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState title="No patents found" description="Try a different search term or technology filter." />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
            Showing <strong>{data.data.length}</strong> of <strong>{data.pagination.total.toLocaleString()}</strong> asserted patents
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto scroll-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[130px]">Patent</TableHead>
                      <TableHead className="min-w-[260px]">Title</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead className="text-center">Times asserted</TableHead>
                      <TableHead className="text-center">Active cases</TableHead>
                      <TableHead>Last asserted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/patent/${p.id}`)}>
                        <TableCell className="font-mono text-sm font-bold text-primary">{p.number}</TableCell>
                        <TableCell>
                          <p className="max-w-[340px] truncate text-sm font-medium">{p.title}</p>
                          {p.techArea ? <p className="text-xs text-muted-foreground">{p.techArea}</p> : null}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{p.assignee ?? "—"}</TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                            {p.assertedCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm">{p.activeCases}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(p.lastAsserted)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

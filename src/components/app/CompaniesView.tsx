"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { navigate } from "./router";
import { useApi, SectionHeading, PartyTypeBadge, Spinner, ErrorState, EmptyState, fmtDate } from "./shared";

interface PartyRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  hqCountry: string | null;
  totalCases: number;
  asPlaintiff: number;
  asDefendant: number;
  activeCases: number;
  damagesInvolved: number;
  lastFiling: string | null;
}

interface PartiesResponse {
  data: PartyRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const ALL = "__all__";

export default function CompaniesView() {
  const [q, setQ] = useState("");
  const [type, setType] = useState(ALL);
  const [sort, setSort] = useState("cases");
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  const params = useMemo(() => {
    const sp = new URLSearchParams({ page: String(page), pageSize: "12", sort });
    if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
    if (type !== ALL) sp.set("type", type);
    return sp.toString();
  }, [page, sort, debouncedQ, type]);

  const { data, loading, error, reload } = useApi<PartiesResponse>(`/api/parties?${params}`);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SectionHeading
        title="Companies & Institutions"
        description="Every plaintiff, defendant, petitioner and opponent in the database — with enforcement histories, exposure and activity levels."
      />

      <Card className="mb-5">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div>
            <Label htmlFor="company-search" className="sr-only">
              Search companies
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="company-search"
                type="search"
                placeholder="Search by name…"
                className="pl-9"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger aria-label="Type filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              <SelectItem value="COMPANY">Operating companies</SelectItem>
              <SelectItem value="NPE">NPEs</SelectItem>
              <SelectItem value="UNIVERSITY">Universities</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
            <SelectTrigger aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cases">Most cases</SelectItem>
              <SelectItem value="recent">Most recent activity</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading && !data ? (
        <Spinner label="Loading companies…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState title="No companies found" description="Try a different search or filter." />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
            Showing <strong>{data.data.length}</strong> of <strong>{data.pagination.total.toLocaleString()}</strong> entities
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto scroll-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[240px]">Company</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-center">Total cases</TableHead>
                      <TableHead className="text-center">As plaintiff</TableHead>
                      <TableHead className="text-center">As defendant</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead>Last filing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/company/${p.slug}`)}>
                        <TableCell>
                          <p className="text-sm font-medium text-primary">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.hqCountry ?? "—"}</p>
                        </TableCell>
                        <TableCell>
                          <PartyTypeBadge type={p.type} />
                        </TableCell>
                        <TableCell className="text-center text-sm font-semibold">{p.totalCases}</TableCell>
                        <TableCell className="text-center text-sm">{p.asPlaintiff}</TableCell>
                        <TableCell className="text-center text-sm">{p.asDefendant}</TableCell>
                        <TableCell className="text-center text-sm">{p.activeCases}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(p.lastFiling)}</TableCell>
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

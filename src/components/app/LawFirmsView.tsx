"use client";

import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";import { Search, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, SectionHeading, Spinner, ErrorState, EmptyState, fmtMonth } from "./shared";

interface FirmRow {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  totalCases: number;
  plaintiffCases: number;
  defendantCases: number;
  oppositionsFiled: number;
  monthlyOppositions: { month: string; count: number }[];
}

interface FirmsResponse {
  data: FirmRow[];
  months: string[];
  aggregateMonthly: { month: string; count: number }[];
}

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

export default function LawFirmsView() {
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useApi<FirmsResponse>("/api/law-firms");

  const firms = (data?.data ?? []).filter((f) => !q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const aggregate = (data?.aggregateMonthly ?? []).map((m) => ({ ...m, label: fmtMonth(m.month) }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SectionHeading
        title="Law Firm Analytics"
        description="Monthly trend of patent oppositions filed by law firms at the EPO in the last 10 months, plus caseload by side across every monitored forum. Data is updated as the pipeline refreshes."
      />

      {/* aggregate trend */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
            Oppositions filed per month — all firms
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregate} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Oppositions" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* firm table */}
      <Card className="mb-5">
        <CardContent className="p-4">
          <Label htmlFor="firm-search" className="sr-only">
            Search law firms
          </Label>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="firm-search"
              type="search"
              placeholder="Search law firms…"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <Spinner label="Loading law firms…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : firms.length === 0 ? (
        <EmptyState title="No law firms found" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Law firm</TableHead>
                    <TableHead>Office</TableHead>
                    <TableHead className="text-center">Total cases</TableHead>
                    <TableHead className="text-center">Plaintiff side</TableHead>
                    <TableHead className="text-center">Defendant side</TableHead>
                    <TableHead className="text-center">EPO oppositions</TableHead>
                    <TableHead className="text-right">10-month trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {firms.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-sm font-medium">{f.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[f.city, f.country].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm font-semibold">{f.totalCases}</TableCell>
                      <TableCell className="text-center text-sm">{f.plaintiffCases}</TableCell>
                      <TableCell className="text-center text-sm">{f.defendantCases}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{f.oppositionsFiled}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <button className="text-sm font-medium text-primary hover:underline">View</button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                              <DialogTitle>{f.name} — monthly oppositions</DialogTitle>
                            </DialogHeader>
                            <div className="h-56">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={f.monthlyOppositions.map((m) => ({ ...m, label: fmtMonth(m.month) }))}
                                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" tickLine={false} />
                                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} allowDecimals={false} />
                                  <Tooltip contentStyle={tooltipStyle} />
                                  <Bar dataKey="count" name="Oppositions" fill="#0d9488" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Oppositions filed by this firm at the EPO over the last 10 months (opponent-side representations).
                            </p>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

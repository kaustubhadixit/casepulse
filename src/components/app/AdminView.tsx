"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw, ShieldCheck, Database, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JURISDICTIONS, type JurisdictionKey } from "@/lib/constants";
import { navigate } from "./router";
import { useAuth } from "./auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  useApi,
  CaseLink,
  StatusBadge,
  JurisdictionBadge,
  Spinner,
  ErrorState,
  EmptyState,
  fmtDate,
  timeAgo,
  TECH_AREAS,
  COMMON_STATUSES,
} from "./shared";
import type { CaseSummaryRow } from "./CasesView";

interface CasesResponse {
  data: CaseSummaryRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface SyncLogRow {
  id: string;
  ranAt: string;
  source: string;
  recordsIngested: number;
  casesUpdated: number;
  notes: string | null;
}

const emptyForm = {
  title: "",
  caseNumber: "",
  jurisdiction: "DISTRICT_COURT" as JurisdictionKey,
  court: "",
  judge: "",
  status: "Active",
  cause: "",
  techArea: "",
  filingDate: new Date().toISOString().slice(0, 10),
  damagesAwarded: "",
  summary: "",
  plaintiffs: "",
  defendants: "",
  patentNumbers: "",
};

type FormState = typeof emptyForm;

function CaseForm({
  value,
  onChange,
}: {
  value: FormState;
  onChange: (patch: Partial<FormState>) => void;
}) {
  const courtPlaceholder = value.jurisdiction === "PTAB" ? "Patent Trial and Appeal Board" : value.jurisdiction === "UPC" ? "UPC — Local Division Munich" : value.jurisdiction === "EPO_OPPOSITION" ? "EPO Opposition Division" : value.jurisdiction === "ITC" ? "U.S. International Trade Commission" : "D. Del.";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="f-title">Case title (e.g. “Plaintiff LLC v. Defendant Inc.”) *</Label>
        <Input id="f-title" value={value.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Auralign Technologies LLC v. Novatide Electronics Corp." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-jurisdiction">Jurisdiction *</Label>
        <Select value={value.jurisdiction} onValueChange={(v) => onChange({ jurisdiction: v as JurisdictionKey })}>
          <SelectTrigger id="f-jurisdiction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(JURISDICTIONS) as JurisdictionKey[]).map((k) => (
              <SelectItem key={k} value={k}>
                {JURISDICTIONS[k].short}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-court">Court / forum *</Label>
        <Input id="f-court" value={value.court} onChange={(e) => onChange({ court: e.target.value })} placeholder={courtPlaceholder} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-number">Docket number (auto if blank)</Label>
        <Input id="f-number" value={value.caseNumber} onChange={(e) => onChange({ caseNumber: e.target.value })} placeholder="1:26-cv-00123" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-status">Status</Label>
        <Select value={value.status} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger id="f-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {COMMON_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-judge">Judge</Label>
        <Input id="f-judge" value={value.judge} onChange={(e) => onChange({ judge: e.target.value })} placeholder="Hon. Adaline Mercer" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-tech">Technology area</Label>
        <Select value={value.techArea || undefined} onValueChange={(v) => onChange({ techArea: v })}>
          <SelectTrigger id="f-tech">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {TECH_AREAS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-date">Filing date *</Label>
        <Input id="f-date" type="date" value={value.filingDate} onChange={(e) => onChange({ filingDate: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-damages">Damages awarded (USD, optional)</Label>
        <Input id="f-damages" type="number" min="0" step="1000" value={value.damagesAwarded} onChange={(e) => onChange({ damagesAwarded: e.target.value })} placeholder="125000000" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-cause">Cause of action</Label>
        <Input id="f-cause" value={value.cause} onChange={(e) => onChange({ cause: e.target.value })} placeholder={JURISDICTIONS[value.jurisdiction].cause} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-plaintiffs">Plaintiffs (comma separated) *</Label>
        <Input id="f-plaintiffs" value={value.plaintiffs} onChange={(e) => onChange({ plaintiffs: e.target.value })} placeholder="Auralign Technologies LLC" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-defendants">Defendants (comma separated) *</Label>
        <Input id="f-defendants" value={value.defendants} onChange={(e) => onChange({ defendants: e.target.value })} placeholder="Novatide Electronics Corp., Asterwell Networks Ltd." />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="f-patents">Patent numbers (comma separated, optional — new numbers are created)</Label>
        <Input id="f-patents" value={value.patentNumbers} onChange={(e) => onChange({ patentNumbers: e.target.value })} placeholder="US 10,555,123 B2, EP 3 456 789 B1" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="f-summary">Summary</Label>
        <Textarea id="f-summary" rows={3} value={value.summary} onChange={(e) => onChange({ summary: e.target.value })} placeholder="Short description of the dispute…" />
      </div>
    </div>
  );
}

export default function AdminView() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "ADMIN";

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CaseSummaryRow | null>(null);
  const [busy, setBusy] = useState(false);

  const params = useMemo(() => {
    const sp = new URLSearchParams({ page: String(page), pageSize: "12", sort: "updated" });
    if (q.trim()) sp.set("q", q.trim());
    return sp.toString();
  }, [page, q]);

  const { data, loading, error, reload } = useApi<CasesResponse>(isAdmin ? `/api/cases?${params}` : null);
  const syncLogs = useApi<{ data: SyncLogRow[] }>(isAdmin ? "/api/sync" : null);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = async (c: CaseSummaryRow) => {
    setEditingId(c.id);
    setForm({
      ...emptyForm,
      title: c.title,
      caseNumber: c.caseNumber,
      jurisdiction: c.jurisdiction as JurisdictionKey,
      court: c.court,
      judge: c.judge ?? "",
      status: c.status,
      cause: c.cause ?? "",
      techArea: c.techArea ?? "",
      filingDate: c.filingDate.slice(0, 10),
      damagesAwarded: c.damagesAwarded != null ? String(c.damagesAwarded) : "",
      summary: c.summary ?? "",
      plaintiffs: c.plaintiffs.join(", "),
      defendants: c.defendants.join(", "),
      patentNumbers: "",
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const base = {
        title: form.title.trim(),
        caseNumber: form.caseNumber.trim() || undefined,
        jurisdiction: form.jurisdiction,
        court: form.court.trim(),
        judge: form.judge.trim() || null,
        status: form.status,
        cause: form.cause.trim() || null,
        techArea: form.techArea || null,
        filingDate: form.filingDate,
        damagesAwarded: form.damagesAwarded ? Number(form.damagesAwarded) : null,
        summary: form.summary.trim() || null,
      };
      const res = editingId
        ? await fetch(`/api/cases/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(base),
          })
        : await fetch("/api/cases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...base,
              plaintiffs: form.plaintiffs.split(",").map((s) => s.trim()).filter(Boolean),
              defendants: form.defendants.split(",").map((s) => s.trim()).filter(Boolean),
              patentNumbers: form.patentNumbers.split(",").map((s) => s.trim()).filter(Boolean),
            }),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      toast({ title: editingId ? "Case updated" : "Case created", description: `${json.data.caseNumber} — ${json.data.title}` });
      setDialogOpen(false);
      await reload();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cases/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Case deleted", description: deleteTarget.caseNumber });
      setDeleteTarget(null);
      await reload();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runSync = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast({
        title: "Upstream check dispatched",
        description:
          json.changes != null
            ? `Engine: ${json.changes} change(s) detected so far · phase ${json.phase} · ${json.reqLastHour ?? 0}/40 requests this hour.`
            : "The live engine is checking the change cursor now.",
      });
      await Promise.all([syncLogs.reload(), reload()]);
    } catch (err) {
      toast({ title: "Sync failed", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return <Spinner />;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with the demo admin account (<code className="font-mono">admin@patentpulse.demo</code>) to manage cases
          and the data pipeline.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => navigate("/login")}>Sign in as admin</Button>
          <Button variant="outline" onClick={() => navigate("/")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Admin Console</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage case records and control the data refresh pipeline.
        </p>
      </div>

      <Tabs defaultValue="cases">
        <TabsList className="mb-4">
          <TabsTrigger value="cases">Case Management</TabsTrigger>
          <TabsTrigger value="sync">Data Sync</TabsTrigger>
        </TabsList>

        {/* ------------------------- cases tab ------------------------- */}
        <TabsContent value="cases">
          <Card className="mb-5">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  placeholder="Search cases…"
                  className="pl-9"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Button onClick={openCreate} className="gap-1.5">
                <Plus className="h-4 w-4" aria-hidden /> New case
              </Button>
            </CardContent>
          </Card>

          {loading && !data ? (
            <Spinner label="Loading cases…" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : !data || data.data.length === 0 ? (
            <EmptyState title="No cases match" actionLabel="Create a case" onAction={openCreate} />
          ) : (
            <>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto scroll-thin">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[260px]">Case</TableHead>
                          <TableHead>Forum</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.data.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <CaseLink id={c.id} title={c.title} className="text-sm" />
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.caseNumber}</p>
                            </TableCell>
                            <TableCell>
                              <JurisdictionBadge jurisdiction={c.jurisdiction} />
                              <p className="mt-1 text-xs text-muted-foreground">{c.court}</p>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={c.status} />
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{c.source}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(c.updatedAt)}</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" aria-label={`Edit ${c.caseNumber}`} onClick={() => openEdit(c)}>
                                  <Pencil className="h-4 w-4" aria-hidden />
                                </Button>
                                <Button variant="ghost" size="icon" aria-label={`Delete ${c.caseNumber}`} onClick={() => setDeleteTarget(c)}>
                                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total.toLocaleString()} total
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ------------------------- sync tab ------------------------- */}
        <TabsContent value="sync">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <p className="text-sm font-semibold">Pipeline control</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  The live engine polls upstream change cursors continuously — there is no fixed refresh schedule. When
                  CourtListener / USPTO data changes, it is fetched within moments. Cadence is budget-aware around the
                  token plan (5 req/min · 50/hour · 125/day): hot ≈ 1 request/min while changes flow, backing off to
                  ≤ 15 min when idle, with traffic-driven nudges and SSE push to browsers. Admins can force an immediate
                  upstream check (bypasses the budget by design), and external schedulers may ping{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">GET /api/sync/pulse</code> as a keep-alive.
                </p>
                <Button onClick={runSync} disabled={busy} className="w-full gap-1.5">
                  <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
                  {busy ? "Running…" : "Run refresh now"}
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <p className="text-sm font-semibold">Sync history</p>
              </CardHeader>
              <CardContent className="p-0">
                {syncLogs.loading && !syncLogs.data ? (
                  <Spinner />
                ) : syncLogs.error ? (
                  <ErrorState message={syncLogs.error} onRetry={syncLogs.reload} />
                ) : (
                  <div className="max-h-96 overflow-y-auto scroll-thin">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ran at</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-center">Ingested</TableHead>
                          <TableHead className="text-center">Advanced</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(syncLogs.data?.data ?? []).map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="whitespace-nowrap text-sm">{fmtDate(l.ranAt)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{l.source}</Badge>
                            </TableCell>
                            <TableCell className="text-center text-sm font-semibold text-primary">{l.recordsIngested}</TableCell>
                            <TableCell className="text-center text-sm">{l.casesUpdated}</TableCell>
                            <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">{l.notes ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit case" : "Create case"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the record — a status change is logged as a docket event." : "New cases appear instantly across search, analytics and the live feed."}
            </DialogDescription>
          </DialogHeader>
          <CaseForm value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !form.title.trim() || !form.court.trim() || !form.filingDate || (!editingId && (!form.plaintiffs.trim() || !form.defendants.trim()))}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Create case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this case?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” ({deleteTarget?.caseNumber}) and all its events, party links and watchlist entries
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

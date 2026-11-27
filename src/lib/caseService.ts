import { db } from "@/lib/db";
import { PLAINTIFF_ROLES } from "@/lib/constants";

/** Shared case-list query logic used by the cases API and party profiles. */

export interface CaseListParams {
  q?: string;
  jurisdiction?: string;
  court?: string;
  status?: string;
  tech?: string;
  party?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface CaseSummary {
  id: string;
  caseNumber: string;
  title: string;
  jurisdiction: string;
  court: string;
  courtDetail: string | null;
  judge: string | null;
  status: string;
  cause: string | null;
  techArea: string | null;
  summary: string | null;
  damagesAwarded: number | null;
  filingDate: string;
  closedDate: string | null;
  source: string;
  updatedAt: string;
  plaintiffs: string[];
  defendants: string[];
}

type CaseWithParties = {
  id: string;
  caseNumber: string;
  title: string;
  jurisdiction: string;
  court: string;
  courtDetail: string | null;
  judge: string | null;
  status: string;
  cause: string | null;
  techArea: string | null;
  summary: string | null;
  damagesAwarded: number | null;
  filingDate: Date;
  closedDate: Date | null;
  source: string;
  updatedAt: Date;
  parties: { role: string; party: { name: string } }[];
};

export function toSummary(c: CaseWithParties): CaseSummary {
  const plaintiffs = c.parties.filter((p) => PLAINTIFF_ROLES.includes(p.role)).map((p) => p.party.name);
  const defendants = c.parties.filter((p) => !PLAINTIFF_ROLES.includes(p.role)).map((p) => p.party.name);
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    jurisdiction: c.jurisdiction,
    court: c.court,
    courtDetail: c.courtDetail,
    judge: c.judge,
    status: c.status,
    cause: c.cause,
    techArea: c.techArea,
    summary: c.summary,
    damagesAwarded: c.damagesAwarded,
    filingDate: c.filingDate.toISOString(),
    closedDate: c.closedDate ? c.closedDate.toISOString() : null,
    source: c.source,
    updatedAt: c.updatedAt.toISOString(),
    plaintiffs,
    defendants,
  };
}

const caseInclude = {
  parties: { include: { party: { select: { name: true } } } },
} as const;

export async function listCases(params: CaseListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, params.pageSize ?? 12));
  const where: Record<string, unknown> = {};

  if (params.jurisdiction) where.jurisdiction = params.jurisdiction;
  if (params.court) where.court = params.court;
  if (params.status) where.status = params.status;
  if (params.tech) where.techArea = params.tech;
  if (params.from || params.to) {
    where.filingDate = {
      ...(params.from ? { gte: new Date(params.from) } : {}),
      ...(params.to ? { lte: new Date(params.to + "T23:59:59Z") } : {}),
    };
  }
  if (params.q) {
    const q = params.q.trim();
    where.OR = [{ title: { contains: q } }, { caseNumber: { contains: q } }, { summary: { contains: q } }];
  }
  if (params.party) {
    where.parties = { some: { party: { name: { contains: params.party.trim() } } } };
  }

  const orderBy: Record<string, string> =
    params.sort === "oldest"
      ? { filingDate: "asc" }
      : params.sort === "damages"
        ? { damagesAwarded: "desc" }
        : params.sort === "updated"
          ? { updatedAt: "desc" }
          : { filingDate: "desc" };

  const [rows, total] = await Promise.all([
    db.case.findMany({
      where,
      include: caseInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.case.count({ where }),
  ]);

  return {
    data: rows.map(toSummary),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/** Distinct filter values for a given jurisdiction (drives the filter dropdowns). */
export async function caseFacets(jurisdiction?: string) {
  const where = jurisdiction ? { jurisdiction } : {};
  const [courts, statuses, techAreas] = await Promise.all([
    db.case.groupBy({ by: ["court"], where, _count: true, orderBy: { _count: { court: "desc" } } }),
    db.case.groupBy({ by: ["status"], where, _count: true, orderBy: { _count: { status: "desc" } } }),
    db.case.groupBy({ by: ["techArea"], where, _count: true, orderBy: { _count: { techArea: "desc" } } }),
  ]);
  return {
    courts: courts.map((c) => c.court),
    statuses: statuses.map((c) => c.status).filter(Boolean),
    techAreas: techAreas.map((c) => c.techArea).filter(Boolean),
  };
}

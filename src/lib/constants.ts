/** Shared domain constants — SQLite stores these as plain strings. */

/* Jurisdiction accent colors reference theme chart variables so every
   palette stays coherent; used with color-mix in the badge components. */
export const JURISDICTIONS = {
  DISTRICT_COURT: {
    label: "US Patent Litigations",
    short: "District Court",
    description:
      "Patent infringement suits filed in U.S. district courts. Track disputes, rulings, damages and trends to protect your IP and manage legal risk.",
    cause: "Patent Infringement (35 U.S.C. § 271)",
    color: "var(--chart-1)",
  },
  PTAB: {
    label: "PTAB Case Tracker",
    short: "PTAB",
    description:
      "Inter partes reviews, post-grant reviews and CBM trials before the Patent Trial and Appeal Board, with institution decisions and final written decisions.",
    cause: "IPR / PGR / CBM Petition",
    color: "var(--chart-2)",
  },
  UPC: {
    label: "Unified Patent Court",
    short: "UPC",
    description:
      "Litigation before the UPC's central and local divisions — plaintiffs, defendants, judges and remedies across Contracting Member States.",
    cause: "Infringement Action (Art. 32 UPCA)",
    color: "var(--chart-5)",
  },
  EPO_OPPOSITION: {
    label: "Patent Oppositions",
    short: "EPO Oppositions",
    description:
      "European patent oppositions before the EPO Opposition Division and Boards of Appeal — monthly trends by law firm, opponent and technology.",
    cause: "Opposition under Art. 99 EPC",
    color: "var(--chart-3)",
  },
  ITC: {
    label: "ITC Investigations",
    short: "ITC",
    description:
      "Section 337 investigations at the U.S. International Trade Commission — exclusion orders, consent orders and ALJ determinations.",
    cause: "Section 337 Investigation",
    color: "var(--chart-4)",
  },
  SEP: {
    label: "SEP Litigation",
    short: "SEP",
    description:
      "Standard-essential patent assertions and FRAND rate disputes across major standards and jurisdictions.",
    cause: "SEP Infringement & FRAND Terms",
    color: "var(--chart-6)",
  },
} as const;

export type JurisdictionKey = keyof typeof JURISDICTIONS;

export const PARTY_TYPES = ["COMPANY", "NPE", "UNIVERSITY", "INDIVIDUAL"] as const;

export const PLAINTIFF_ROLES = ["PLAINTIFF", "PETITIONER", "OPPONENT"];
export const DEFENDANT_ROLES = ["DEFENDANT", "RESPONDENT", "PROPRIETOR"];

export const EVENT_KINDS: Record<string, string> = {
  FILING: "Filing",
  ANSWER: "Answer",
  SCHEDULING: "Scheduling",
  MARKMAN: "Markman",
  ORDER: "Order",
  RULING: "Ruling",
  JUDGMENT: "Judgment",
  VERDICT: "Verdict",
  TRIAL: "Trial",
  SETTLEMENT: "Settlement",
  DISMISSAL: "Dismissal",
  INSTITUTION: "Institution",
  DECISION: "Decision",
  APPEAL: "Appeal",
  WITHDRAWAL: "Withdrawal",
  UPDATE: "Docket Update",
};

/* Status → semantic class (theme-aware square badges, see globals.css). */
export const STATUS_COLORS: Record<string, string> = {
  Active: "pp-status pp-status-positive",
  Instituted: "pp-status pp-status-caution",
  "Institution Denied": "pp-status pp-status-neutral",
  Settled: "pp-status pp-status-neutral",
  "Settled (FRAND License)": "pp-status pp-status-neutral",
  "Terminated — Settled": "pp-status pp-status-neutral",
  "Terminated — Consent Order": "pp-status pp-status-positive",
  Dismissed: "pp-status pp-status-neutral",
  "Judgment for Plaintiff": "pp-status pp-status-negative",
  "Judgment for Defendant": "pp-status pp-status-positive",
  "Stayed (PTAB)": "pp-status pp-status-caution",
  "Appeal Pending": "pp-status pp-status-violet",
  "FWD Issued — All Claims Unpatentable": "pp-status pp-status-negative",
  "FWD Issued — Claims Patentable": "pp-status pp-status-positive",
  "Opposition Pending": "pp-status pp-status-caution",
  "Patent Maintained as Amended": "pp-status pp-status-caution",
  "Patent Revoked": "pp-status pp-status-negative",
  "Opposition Rejected": "pp-status pp-status-positive",
  "First Instance Decision": "pp-status pp-status-violet",
  Withdrawn: "pp-status pp-status-neutral",
  "ALJ Initial Determination": "pp-status pp-status-caution",
  "Final Determination — Violation Found": "pp-status pp-status-negative",
  "Final Determination — No Violation": "pp-status pp-status-positive",
};

/* Chart palette references the active theme's CSS variables. */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

/**
 * PatentPulse seed script — generates realistic, fully SYNTHETIC patent
 * litigation / PTAB / UPC / EPO opposition / ITC / SEP data.
 *
 * All company names, law firms, judges, patents and events are fictional.
 * Court names and proceeding formats are public facts and used for realism.
 *
 * Run: bun prisma/seed.ts   (or: bun run db:seed)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/* ------------------------------------------------------------------ */
/* Deterministic PRNG so re-seeding produces a stable dataset          */
/* ------------------------------------------------------------------ */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261127);
const randInt = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const pickMany = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};
const chance = (p: number) => rnd() < p;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */
const NOW = new Date();
const T0 = new Date("2022-01-04T09:00:00Z").getTime();
const T1 = NOW.getTime();
const randDate = (startDaysAgo = 1790, endDaysAgo = 1) =>
  new Date(T1 - randInt(endDaysAgo * 864e5 === 0 ? 864e5 : endDaysAgo * 864e5, startDaysAgo * 864e5));

const DISTRICT_COURTS: Record<string, { div: string; judgePool: number }> = {
  "E.D. Tex.": { div: "2", judgePool: 4 },
  "W.D. Tex.": { div: "6", judgePool: 5 },
  "D. Del.": { div: "1", judgePool: 4 },
  "N.D. Cal.": { div: "3", judgePool: 5 },
  "C.D. Cal.": { div: "8", judgePool: 4 },
  "D.N.J.": { div: "2", judgePool: 3 },
  "N.D. Ill.": { div: "1", judgePool: 4 },
  "S.D.N.Y.": { div: "1", judgePool: 3 },
  "D. Mass.": { div: "1", judgePool: 3 },
  "M.D. Fla.": { div: "8", judgePool: 3 },
  "E.D. Va.": { div: "1", judgePool: 3 },
  "W.D. Wash.": { div: "2", judgePool: 3 },
  "N.D. Tex.": { div: "3", judgePool: 4 },
  "D. Colo.": { div: "1", judgePool: 3 },
};

const UPC_DIVISIONS = [
  "UPC — Local Division Munich",
  "UPC — Local Division Düsseldorf",
  "UPC — Local Division Mannheim",
  "UPC — Local Division Paris",
  "UPC — Local Division Milan",
  "UPC — Local Division The Hague",
  "UPC — Local Division Hamburg",
  "UPC — Nordic-Baltic Regional Division",
  "UPC — Central Division (Paris)",
];

const JUDGES = [
  "Hon. Adaline Mercer",
  "Hon. Marcus Thorne",
  "Hon. Priya Raghunathan",
  "Hon. Daniel Osei",
  "Hon. Lillian Brandt",
  "Hon. Cormac Doyle",
  "Hon. Sofia Marchetti",
  "Hon. Harold Wexley",
  "Hon. Amara Nwosu",
  "Hon. Julian Ferreira",
  "Hon. Beatrice Lindqvist",
  "Hon. Thomas Ardmore",
  "Hon. Celeste Dupont",
  "Hon. Nathaniel Cross",
  "Hon. Imani Walker",
  "Hon. Frederick Halloran",
  "Hon. Rosa Villarreal",
  "Hon. Edmund Kessler",
];
const ALJS = ["ALJ Dara Whitcomb", "ALJ Peter Sarraf", "ALJ Ingrid Bauer", "ALJ Julius Nkemdirim"];

const NPE_PLAINTIFFS = [
  "Auralign Technologies LLC",
  "Bexley IP Ventures LLC",
  "Cindra Media Systems LLC",
  "Deltaforge IP Holdings LLC",
  "Emberlight Licensing LLC",
  "Fairpoint Digital IP LLC",
  "Glenmark Patent Holdings LLC",
  "Harborview IP LLC",
  "Ironbark Innovations LLC",
  "Junipeer Semiconductor IP LLC",
  "Kelvinstone Licensing LLC",
  "Lumicore Technologies LLC",
  "Meridian IP Monetization LLC",
  "Northgate Wireless IP LLC",
  "Orchid Systems IP LLC",
  "Pinnacle Peak IP LLC",
  "Quartzline Media IP LLC",
  "Redwood Patent Works LLC",
  "Silverpine IP LLC",
  "Tangletree Licensing LLC",
  "Uptown IP Group LLC",
  "Vantage Arch IP LLC",
  "Westbrook Innovation LLC",
  "Xenith Patent Partners LLC",
  "Yarrow Digital IP LLC",
  "Zephyr IP Holdings LLC",
  "Copperleaf IP LLC",
  "Basalt Ridge Innovations LLC",
  "Driftwood Media Patents LLC",
  "Elmpark Technologies LLC",
  "Foxglove IP LLC",
  "Granite State Licensing LLC",
  "Highfield Patent Group LLC",
  "Kestrel Licensing LLC",
  "Longview Digital IP LLC",
  "Northmoor Photonics IP LLC",
  "Palebridge Systems IP LLC",
  "Ridgeline Media Patents LLC",
  "Stonebrook IP Holdings LLC",
];

const OP_PLAINTIFFS = [
  "Novatide Electronics Corp.",
  "Everstream Semiconductors Inc.",
  "Omniqor Inc.",
  "Quantaloop Computing Inc.",
  "Vantix Global Technologies",
  "Streamforge Media Inc.",
  "Cloudhaven Systems Inc.",
  "Neurobit Devices Inc.",
  "Smartgrid Analytics Corp.",
  "Connected Living Systems Inc.",
  "Wavelength Photonics KK",
  "Zenmark Digital Media Ltd.",
];

const UNIVERSITIES = [
  "Great Lakes Polytechnic University",
  "Pacific Crest University",
  "Northfield Institute of Technology",
  "Cascade University",
  "Bayshore State University",
];

const DEFENDANTS = [
  "Novatide Electronics Corp.",
  "Helioscale Mobility GmbH",
  "Cinderpeak Software Inc.",
  "Asterwell Networks Ltd.",
  "Mirefield Consumer Products S.A.",
  "Tsubaki Industrial Co. Ltd.",
  "Bright Meridian Health AG",
  "Solmara Foods Group N.V.",
  "Kavo Semiconductor Pte. Ltd.",
  "Vantor Medical Systems Inc.",
  "Ridgeway Telecom S.p.A.",
  "Nimbus Computing Oy",
  "Clearwater Appliances LLC",
  "Falcon Edge Motors Ltd.",
  "Ostwind Energietechnik GmbH",
  "Pacifica Marine Systems Inc.",
  "Quill & Crate Retail Group Inc.",
  "Tessellate Graphics AB",
  "Verdant AgriTech S.A.",
  "Everstream Semiconductors Inc.",
  "Xenocore Devices Inc.",
  "Yellowfield Robotics B.V.",
  "Atlas Forge Manufacturing Co.",
  "Borealis Pharma AS",
  "Corvus Analytics Inc.",
  "Dunelight Media Group PLC",
  "Frosthaven Instruments Oy",
  "Glacier Peak Optics Inc.",
  "Horizon Wireless SA",
  "Ivorygate Commerce Inc.",
  "Jade River Foods Ltd.",
  "Kirin Devices Corp.",
  "Lakeshore Diagnostics Inc.",
  "Monteverde Audio GmbH",
  "Orbital Logistics AG",
  "Pearlgate Beauty Group SA",
  "Quietwind Energy LLC",
  "Riverstone Materials Corp.",
  "Silverfern Medical Ltd.",
  "Thornbridge Networks Inc.",
  "Ultraviolet Imaging KK",
  "Vantage Point Security GmbH",
  "Wexford Furniture Group Ltd.",
  "Yamawaki Precision Co. Ltd.",
  "Zodiac Semiconductor Inc.",
  "Omniqor Inc.",
  "Streamforge Media Inc.",
  "Cloudhaven Systems Inc.",
  "Quantaloop Computing Inc.",
  "Nimbusol Storage Inc.",
];

const EU_DEFENDANTS = [
  "Helioscale Mobility GmbH",
  "Ostwind Energietechnik GmbH",
  "Monteverde Audio GmbH",
  "Vantage Point Security GmbH",
  "Bergmann Lichtsysteme GmbH",
  "Solvayre Chimie S.A.",
  "Aiguillon Photonics SAS",
  "Ferrovia Controls S.p.A.",
  "Ridgeway Telecom S.p.A.",
  "Canalside Microelectronics B.V.",
  "Yellowfield Robotics B.V.",
  "Northsea Drilling Systems B.V.",
  "Lakeshore Diagnostics Inc.",
  "Verdant AgriTech S.A.",
  "Asterwell Networks Ltd.",
  "Dunelight Media Group PLC",
  "Brayford Consumer Electronics Ltd",
  "Nimbus Computing Oy",
  "Frosthaven Instruments Oy",
  "Tessellate Graphics AB",
  "Vintervik Telecom AB",
  "Torlo Communications SA",
  "Kavo Semiconductor Pte. Ltd.",
  "Tsubaki Industrial Co. Ltd.",
  "Wavelength Photonics KK",
  "Kirin Devices Corp.",
  "Zodiac Semiconductor Inc.",
  "Everstream Semiconductors Inc.",
  "Xenocore Devices Inc.",
];

const LAW_FIRMS = [
  { name: "Hargrove & Stern LLP", city: "New York", country: "US" },
  { name: "Calloway IP Group LLP", city: "Chicago", country: "US" },
  { name: "Bergstrom Reyes LLP", city: "Dallas", country: "US" },
  { name: "Whitfield & Marsh LLP", city: "Washington, DC", country: "US" },
  { name: "Nakamura Odell LLP", city: "Palo Alto", country: "US" },
  { name: "Fenwick Voss LLP", city: "San Francisco", country: "US" },
  { name: "Delacroix & Weber Avocats", city: "Paris", country: "FR" },
  { name: "Maas & Kolberg PartG mbB", city: "Düsseldorf", country: "DE" },
  { name: "Santoro Bianchi Studio Legale", city: "Milan", country: "IT" },
  { name: "Ellsworth Blackwood LLP", city: "London", country: "GB" },
  { name: "Pryor Castellanos LLP", city: "Houston", country: "US" },
  { name: "Tanaka Brightwell LLP", city: "Seattle", country: "US" },
  { name: "Van der Meer & Partners", city: "Amsterdam", country: "NL" },
  { name: "Ostrander Hale LLP", city: "Boston", country: "US" },
  { name: "Grieveson Locke LLP", city: "Los Angeles", country: "US" },
  { name: "Ibarra Dunn LLP", city: "Austin", country: "US" },
  { name: "Kowalski Freund LLP", city: "Munich", country: "DE" },
  { name: "Ashcombe Partners LLP", city: "London", country: "GB" },
  { name: "Silver & Traynor LLP", city: "Washington, DC", country: "US" },
  { name: "Halvorsen & Bruun Advokatfirma", city: "Oslo", country: "NO" },
  { name: "Mercier Lévesque", city: "Montreal", country: "CA" },
  { name: "Ravi Chandra & Co.", city: "Bengaluru", country: "IN" },
];

const TECH_AREAS = [
  "Consumer Electronics",
  "Semiconductors",
  "Telecommunications",
  "Software & E-Commerce",
  "Digital Media",
  "Pharmaceuticals & Biotech",
  "Medical Devices",
  "Chemistry & Materials",
  "Food & Nutrition",
  "Automotive & Mobility",
  "Industrial Manufacturing",
  "Clean Energy",
  "Networking",
  "Wearables & IoT",
  "Agricultural Tech",
];

const PATENT_TITLES: Record<string, string[]> = {
  Semiconductors: [
    "Method for fabricating multi-gate transistor structures with reduced leakage",
    "Wafer-level packaging architecture for heterogeneous chiplet integration",
    "Thermal-aware routing circuit for stacked die interconnects",
    "Low-power clock distribution network for system-on-chip devices",
  ],
  Telecommunications: [
    "Low-latency beamforming management method for wireless access networks",
    "Network slice allocation with guaranteed quality of service",
    "Spectrum sharing controller for coexisting radio systems",
    "Adaptive handover method for high-mobility user equipment",
  ],
  "Software & E-Commerce": [
    "Automated recommendation system using distributed event processing",
    "Distributed checkout pipeline with fraud-risk scoring",
    "Inventory forecasting engine with probabilistic demand models",
    "Policy-based access control for multi-tenant cloud platforms",
  ],
  "Digital Media": [
    "Adaptive bitrate streaming pipeline for layered video delivery",
    "Parallel codec transcoding with region-of-interest weighting",
    "Content fingerprinting method for real-time media identification",
    "Synchronised playback of interactive media streams",
  ],
  "Pharmaceuticals & Biotech": [
    "Crystalline forms of quinazoline derivatives for targeted therapy",
    "Engineered antibody construct with enhanced effector function",
    "Sustained-release formulation of macrocyclic inhibitors",
    "Method of treating inflammatory disorders using modulated dosing",
  ],
  "Medical Devices": [
    "Catheter assembly with shape-memory guidewire section",
    "Pressure-sensing ablation tip for cardiac procedures",
    "Adaptive infusion pump with occlusion detection",
    "Stereo-optic surgical navigation system",
  ],
  "Chemistry & Materials": [
    "Process for preparing high-purity polyamide resins",
    "Catalytic coating composition for exhaust after-treatment",
    "Solvent-free lamination adhesive for flexible substrates",
    "Composite electrolyte separator with ceramic filler",
  ],
  "Food & Nutrition": [
    "Protein enrichment process for plant-based food compositions",
    "Encapsulation method for heat-sensitive food additives",
    "Fermentation-derived flavour compound production",
    "Aseptic filling method for extended-shelf-life beverages",
  ],
  "Automotive & Mobility": [
    "Vehicle battery thermal management with adaptive coolant routing",
    "Lane prediction system using fused sensor modalities",
    "Regenerative braking controller for electrified drivetrains",
    "Over-the-air update orchestration for vehicle control units",
  ],
  "Industrial Manufacturing": [
    "Robotic pick-and-place cell with vision-guided correction",
    "Weld quality inspection method using acoustic emission sensing",
    "Additive manufacturing build-plate leveling system",
    "Digital twin synchronisation for assembly-line diagnostics",
  ],
  "Clean Energy": [
    "Wind turbine blade with adaptive pitch geometry",
    "Erosion-resistant leading-edge coating for rotor blades",
    "Grid-forming inverter control for distributed storage",
    "Bifacial photovoltaic module mounting assembly",
  ],
  Networking: [
    "Packet forwarding method for software-defined networks",
    "Congestion-aware flow scheduling across data-center fabrics",
    "Zero-trust segmentation gateway for enterprise branches",
    "Multi-path transport aggregation for hybrid links",
  ],
  "Consumer Electronics": [
    "Haptic feedback module for foldable display devices",
    "Under-display optical sensing assembly",
    "Adaptive thermal envelope management for handheld devices",
    "Near-field coil sharing architecture for accessories",
  ],
  "Wearables & IoT": [
    "Wearable ECG monitoring device with adaptive power modes",
    "Gesture recognition engine for wrist-worn devices",
    "Mesh sensor network with energy-harvesting nodes",
    "Continuous glucose monitoring calibration method",
  ],
  "Agricultural Tech": [
    "Sensor-driven irrigation management platform",
    "Pest detection method using multispectral imaging",
    "Variable-rate seeding control with in-cab analytics",
    "Autonomous orchard navigation for electric utility vehicles",
  ],
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function districtCaseNumber(court: string, date: Date): string {
  const meta = DISTRICT_COURTS[court] ?? { div: "1" };
  const yy = date.getUTCFullYear() % 100;
  return `${meta.div}:${String(yy).padStart(2, "0")}-cv-${String(randInt(100, 98999)).padStart(5, "0")}`;
}
function usPatentNumber(): string {
  const n = randInt(9_200_000, 12_150_000);
  return `US ${n.toLocaleString("en-US")} B2`;
}
function epPatentNumber(): string {
  return `EP 3 ${randInt(100, 999)} ${randInt(100, 999)} B1`;
}
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

interface PartyRec {
  slug: string;
  name: string;
  type: string;
  hqCountry?: string;
  hqCity?: string;
  description?: string;
}
interface PatentRec {
  number: string;
  title: string;
  techArea: string;
  assignee: string;
  filingDate: Date;
  grantDate: Date;
  claimCount: number;
}

async function main() {
  console.log("Seeding PatentPulse database…");

  await db.syncLog.deleteMany();
  await db.watchlistItem.deleteMany();
  await db.caseEvent.deleteMany();
  await db.casePatent.deleteMany();
  await db.caseLawFirm.deleteMany();
  await db.caseParty.deleteMany();
  await db.newsItem.deleteMany();
  await db.case.deleteMany();
  await db.patent.deleteMany();
  await db.lawFirm.deleteMany();
  await db.party.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();

  /* ------------------------- parties ------------------------- */
  const partyRecs: PartyRec[] = [];
  const used = new Set<string>();
  const addParty = (n: string, type: string, description: string) => {
    if (used.has(n)) return;
    used.add(n);
    partyRecs.push({ slug: slugify(n), name: n, type, hqCountry: undefined, hqCity: undefined, description });
  };
  for (const n of NPE_PLAINTIFFS)
    addParty(
      n,
      "NPE",
      "Non-practicing entity asserting a portfolio of acquired patents."
    );
  for (const n of OP_PLAINTIFFS) addParty(n, "COMPANY", "Operating company with an active licensing and enforcement programme.");
  for (const n of UNIVERSITIES) addParty(n, "UNIVERSITY", "Research university technology transfer office.");
  for (const n of [...DEFENDANTS, ...EU_DEFENDANTS]) addParty(n, "COMPANY", "Operating company active in global technology markets.");
  const partyByName = new Map<string, string>();
  for (const p of partyRecs) {
    let rec = p;
    if (!rec.hqCountry) {
      const n = rec.name;
      rec = {
        ...rec,
        hqCountry: n.includes("GmbH")
          ? "DE"
          : n.includes("S.A.") || n.includes("SAS")
            ? "FR"
            : n.includes("S.p.A.")
              ? "IT"
              : n.includes("B.V.") || n.includes("N.V.")
                ? "NL"
                : n.includes("Ltd") || n.includes("PLC")
                  ? "GB"
                  : n.includes("Oy")
                    ? "FI"
                    : n.includes("AB")
                      ? "SE"
                      : n.includes("AS")
                        ? "NO"
                        : n.includes("KK") || n.includes("Co. Ltd")
                          ? "JP"
                          : n.includes("Pte. Ltd")
                            ? "SG"
                            : "US",
      };
    }
    const row = await db.party.create({ data: rec });
    partyByName.set(rec.name, row.id);
  }
  console.log(`  parties: ${partyRecs.length}`);

  /* ------------------------- law firms ------------------------- */
  const lawFirmIds: string[] = [];
  for (const f of LAW_FIRMS) {
    const row = await db.lawFirm.create({ data: { slug: slugify(f.name), name: f.name, city: f.city, country: f.country } });
    lawFirmIds.push(row.id);
  }
  console.log(`  law firms: ${lawFirmIds.length}`);

  /* ------------------------- patents ------------------------- */
  // NPE plaintiffs each hold a small portfolio, reused across their cases
  const patentsByOwner = new Map<string, PatentRec[]>();
  const allPatents: PatentRec[] = [];
  const patentOwners = [...NPE_PLAINTIFFS, ...OP_PLAINTIFFS, ...UNIVERSITIES];
  for (const owner of patentOwners) {
    const count = randInt(3, 6);
    const portfolio: PatentRec[] = [];
    for (let i = 0; i < count; i++) {
      const techArea = pick(TECH_AREAS);
      const rec: PatentRec = {
        number: chance(0.75) ? usPatentNumber() : epPatentNumber(),
        title: pick(PATENT_TITLES[techArea] ?? PATENT_TITLES["Software & E-Commerce"]),
        techArea,
        assignee: owner,
        filingDate: randDate(5000, 1400),
        grantDate: randDate(1400, 200),
        claimCount: randInt(11, 28),
      };
      portfolio.push(rec);
      allPatents.push(rec);
    }
    patentsByOwner.set(owner, portfolio);
  }
  const patentIdByNumber = new Map<string, string>();
  for (const p of allPatents) {
    let number = p.number;
    while (patentIdByNumber.has(number)) {
      number = p.number.startsWith("US") ? usPatentNumber() : epPatentNumber();
    }
    p.number = number;
    const row = await db.patent.create({
      data: {
        number: p.number,
        title: p.title,
        techArea: p.techArea,
        assignee: p.assignee,
        filingDate: p.filingDate,
        grantDate: p.grantDate,
        claimCount: p.claimCount,
        status: chance(0.88) ? "Active" : chance(0.5) ? "Expired" : "Lapsed",
        abstract: `The disclosure relates to ${p.techArea.toLowerCase()}. Embodiments of the claimed invention improve efficiency, reliability or cost of existing approaches, and are particularly suited to large-scale commercial deployment.`,
      },
    });
    patentIdByNumber.set(p.number, row.id);
  }
  console.log(`  patents: ${allPatents.length}`);

  /* ------------------------- cases ------------------------- */
  const DISTRICT_STATUSES: [string, number][] = [
    ["Active", 0.34],
    ["Settled", 0.22],
    ["Dismissed", 0.14],
    ["Judgment for Plaintiff", 0.06],
    ["Judgment for Defendant", 0.07],
    ["Stayed (PTAB)", 0.09],
    ["Appeal Pending", 0.08],
  ];
  const weighted = (table: [string, number][]): string => {
    const r = rnd();
    let acc = 0;
    for (const [v, w] of table) {
      acc += w;
      if (r <= acc) return v;
    }
    return table[0][0];
  };

  const event = (caseId: string, date: Date, kind: string, description: string) =>
    db.caseEvent.create({ data: { caseId, date, kind, description } });

  let created = 0;
  const caseIdByNumber = new Map<string, string>();
  const usedCaseNumbers = new Set<string>();
  const uniqueCaseNumber = (gen: () => string): string => {
    let n = gen();
    let tries = 0;
    while (usedCaseNumbers.has(n) && tries++ < 2000) n = gen();
    usedCaseNumbers.add(n);
    return n;
  };

  const createCase = async (opts: {
    jurisdiction: string;
    court: string;
    courtDetail?: string;
    caseNumber: string;
    filingDate: Date;
    status: string;
    cause: string;
    techArea: string;
    judge?: string;
    damages?: number;
    plaintiffs: string[];
    defendants: string[];
    plaintiffRole: string;
    defendantRole: string;
    patents: string[];
    summary?: string;
    closedAfterDays?: number;
  }) => {
    const uniq = (arr: string[]) => [...new Set(arr)];
    const pls = uniq(opts.plaintiffs);
    const defs = uniq(opts.defendants).filter((d) => !pls.includes(d));
    if (!pls.length || !defs.length) return null;
    const title = `${pls.join(", ")} v. ${defs.join(", ")}`;
    const closed =
      opts.status === "Active" || opts.status === "Appeal Pending" || opts.status === "Stayed (PTAB)" || opts.status === "Instituted"
        ? null
        : new Date(Math.min(opts.filingDate.getTime() + (opts.closedAfterDays ?? randInt(45, 620)) * 864e5, T1));
    const c = await db.case.create({
      data: {
        caseNumber: opts.caseNumber,
        title,
        jurisdiction: opts.jurisdiction,
        court: opts.court,
        courtDetail: opts.courtDetail,
        judge: opts.judge,
        status: opts.status,
        cause: opts.cause,
        techArea: opts.techArea,
        summary:
          opts.summary ??
          `${pls[0]} asserts ${opts.patents.length} patent${opts.patents.length > 1 ? "s" : ""} against ${defs.join(", ")} before the ${opts.court}.`,
        damagesAwarded: opts.damages,
        filingDate: opts.filingDate,
        closedDate: closed,
        source: "seed",
      },
    });
    caseIdByNumber.set(opts.caseNumber, c.id);

    for (const p of pls)
      await db.caseParty.create({ data: { caseId: c.id, partyId: partyByName.get(p)!, role: opts.plaintiffRole } });
    for (const d of defs)
      await db.caseParty.create({ data: { caseId: c.id, partyId: partyByName.get(d)!, role: opts.defendantRole } });

    const pf = pickMany(lawFirmIds, randInt(1, 2));
    const df = pickMany(lawFirmIds, randInt(1, 2));
    for (const f of pf) await db.caseLawFirm.create({ data: { caseId: c.id, lawFirmId: f, side: "PLAINTIFF" } });
    for (const f of df) await db.caseLawFirm.create({ data: { caseId: c.id, lawFirmId: f, side: "DEFENDANT" } });

    for (const pn of opts.patents) {
      const pid = patentIdByNumber.get(pn);
      if (pid) await db.casePatent.create({ data: { caseId: c.id, patentId: pid } });
    }

    // lifecycle events
    const events: { date: Date; kind: string; description: string }[] = [
      { date: opts.filingDate, kind: "FILING", description: `${opts.cause} filed by ${pls[0]}.` },
    ];
    const addMonths = (d: Date, m: number) => new Date(d.getTime() + m * 30 * 864e5);
    const withinWindow = (d: Date) => d.getTime() < T1 && d.getTime() > opts.filingDate.getTime();
    const maybe = (d: Date, p: number, kind: string, description: string) => {
      if (chance(p) && withinWindow(d)) events.push({ date: d, kind, description });
    };
    maybe(addMonths(opts.filingDate, 2), 0.9, "ANSWER", "Answer and affirmative defenses filed.");
    maybe(addMonths(opts.filingDate, 3), 0.7, "SCHEDULING", "Scheduling order entered; claim construction briefing set.");
    maybe(addMonths(opts.filingDate, 8), 0.55, "MARKMAN", "Markman hearing held on disputed claim terms.");
    maybe(addMonths(opts.filingDate, 10), 0.5, "ORDER", "Motion to transfer denied.");
    if (opts.damages) {
      const vd = addMonths(opts.filingDate, randInt(12, 20));
      if (withinWindow(vd))
        events.push({ date: vd, kind: "VERDICT", description: `Jury verdict for plaintiff — $${opts.damages.toLocaleString("en-US")} in damages.` });
    }
    if (closed && closed.getTime() > opts.filingDate.getTime()) {
      const kind =
        opts.status === "Settled" ? "SETTLEMENT" : opts.status === "Dismissed" ? "DISMISSAL" : opts.status.startsWith("Judgment") ? "JUDGMENT" : "ORDER";
      events.push({
        date: closed,
        kind,
        description:
          opts.status === "Settled"
            ? "Parties notified the court of a confidential settlement; case dismissed with prejudice."
            : opts.status === "Dismissed"
              ? "Case dismissed (voluntary dismissal by plaintiff)."
              : opts.status === "Judgment for Plaintiff"
                ? "Final judgment entered in favor of plaintiff."
                : opts.status === "Judgment for Defendant"
                  ? "Final judgment entered in favor of defendant; patents held not infringed."
                  : "Case closed.",
      });
    }
    for (const e of events.sort((a, b) => a.date.getTime() - b.date.getTime())) await event(c.id, e.date, e.kind, e.description);
    created++;
    return c.id;
  };

  const portfolioFor = (owner: string, n: number): string[] => {
    const pool = patentsByOwner.get(owner) ?? [];
    return pickMany(pool, Math.min(n, pool.length)).map((p) => p.number);
  };

  // ---- US district court litigations (150) ----
  for (let i = 0; i < 240; i++) {
    const court = pick(Object.keys(DISTRICT_COURTS));
    const filingDate = randDate(1780, 3);
    const isNpe = chance(0.62);
    const plaintiff = isNpe ? pick(NPE_PLAINTIFFS) : chance(0.8) ? pick(OP_PLAINTIFFS) : pick(UNIVERSITIES);
    const defendants = pickMany(DEFENDANTS, randInt(1, 3));
    const techArea = pick(TECH_AREAS);
    const status = weighted(DISTRICT_STATUSES);
    const damages =
      (["Judgment for Plaintiff", "Appeal Pending"].includes(status) || chance(0.09)) && chance(0.85)
        ? Math.round(randInt(35, 28000)) / 100 * 1_000_000
        : undefined;
    await createCase({
      jurisdiction: "DISTRICT_COURT",
      court,
      courtDetail: `${court} — ${pick(["Marshall Division", "Waco Division", "Wilmington", "San Jose Division", "Los Angeles", "Newark Vicinage", "Chicago", "Alexandria Division", "Denver", "Seattle"])}`,
      caseNumber: uniqueCaseNumber(() => districtCaseNumber(court, filingDate)),
      filingDate,
      status,
      cause: "Patent Infringement (35 U.S.C. § 271)",
      techArea,
      judge: pick(JUDGES),
      damages,
      plaintiffs: [plaintiff],
      defendants,
      plaintiffRole: "PLAINTIFF",
      defendantRole: "DEFENDANT",
      patents: portfolioFor(plaintiff, randInt(1, 3)),
    });
  }

  // ---- PTAB trials (90) ----
  for (let i = 0; i < 130; i++) {
    const filingDate = randDate(1780, 3);
    const patentOwner = pick([...NPE_PLAINTIFFS, ...OP_PLAINTIFFS, ...UNIVERSITIES]);
    const petitioner = pickMany([...DEFENDANTS, ...OP_PLAINTIFFS], 1)[0];
    const techArea = pick(TECH_AREAS);
    const type = chance(0.78) ? "Inter Partes Review" : chance(0.7) ? "Post-Grant Review" : "Covered Business Method Review";
    const yy = filingDate.getUTCFullYear();
    const status = weighted([
      ["Instituted", 0.3],
      ["Institution Denied", 0.18],
      ["FWD Issued — All Claims Unpatentable", 0.14],
      ["FWD Issued — Claims Patentable", 0.08],
      ["Terminated — Settled", 0.22],
      ["Appeal Pending", 0.08],
    ] as [string, number][]);
    await createCase({
      jurisdiction: "PTAB",
      court: "Patent Trial and Appeal Board",
      courtDetail: pick(["Arlington, VA", "Detroit, MI", "San Jose, CA", "Dallas, TX"]),
      caseNumber: uniqueCaseNumber(() => `${type.startsWith("Inter") ? "IPR" : type.startsWith("Post") ? "PGR" : "CBM"}${yy}-${String(randInt(100, 9900)).padStart(5, "0")}`),
      filingDate,
      status,
      cause: `${type} Petition`,
      techArea,
      judge: `${pick(["Hon. ", "APJ ", "APJ ", "APJ "])}${pick(JUDGES).replace("Hon. ", "")}`,
      plaintiffs: [petitioner],
      defendants: [patentOwner],
      plaintiffRole: "PETITIONER",
      defendantRole: "RESPONDENT",
      patents: portfolioFor(patentOwner, 1),
      summary: `${petitioner} petitions for ${type.toLowerCase()} of ${patentOwner}'s patent before the PTAB. ${status === "Instituted" ? "Trial instituted on all challenged claims." : ""}`,
      closedAfterDays: status.startsWith("FWD") || status === "Terminated — Settled" ? randInt(120, 540) : randInt(60, 240),
    });
  }

  // ---- EPO oppositions (110) ----
  for (let i = 0; i < 110; i++) {
    const filingDate = randDate(1780, 3);
    const proprietor = pick([...OP_PLAINTIFFS, ...OP_PLAINTIFFS, ...UNIVERSITIES]);
    const opponents = pickMany(EU_DEFENDANTS, randInt(1, 3));
    const techArea = pick(TECH_AREAS);
    const status = weighted([
      ["Opposition Pending", 0.3],
      ["Patent Maintained as Amended", 0.18],
      ["Patent Revoked", 0.16],
      ["Opposition Rejected", 0.1],
      ["Appeal Pending", 0.26],
    ] as [string, number][]);
    await createCase({
      jurisdiction: "EPO_OPPOSITION",
      court: "EPO Opposition Division",
      courtDetail: pick(["Munich", "The Hague", "Berlin"]),
      caseNumber: uniqueCaseNumber(() => `OPP-${randInt(12000000, 99999999)}`),
      filingDate,
      status,
      cause: "Opposition under Art. 99 EPC",
      techArea,
      judge: undefined,
      plaintiffs: opponents,
      defendants: [proprietor],
      plaintiffRole: "OPPONENT",
      defendantRole: "PROPRIETOR",
      patents: [patentsByOwner.has(proprietor) ? pick(patentsByOwner.get(proprietor)!).number : allPatents[0].number],
      summary: `${opponents[0]} opposes ${proprietor}'s European patent. ${status === "Patent Revoked" ? "The Opposition Division revoked the patent in full." : ""}`,
      closedAfterDays: status === "Opposition Pending" ? 9999 : randInt(180, 700),
    });
  }

  // ---- UPC litigations (70) ----
  for (let i = 0; i < 70; i++) {
    const filingDate = randDate(1300, 2); // UPC operational since mid-2023
    const division = pick(UPC_DIVISIONS);
    const plaintiff = pick([...NPE_PLAINTIFFS, ...OP_PLAINTIFFS, ...UNIVERSITIES]);
    const defendants = pickMany(EU_DEFENDANTS, randInt(1, 3));
    const techArea = pick(TECH_AREAS);
    const status = weighted([
      ["Active", 0.45],
      ["First Instance Decision", 0.12],
      ["Withdrawn", 0.15],
      ["Settled", 0.16],
      ["Appeal Pending", 0.12],
    ] as [string, number][]);
    await createCase({
      jurisdiction: "UPC",
      court: division,
      courtDetail: pick(["Seat of the division", "Seat of the division — additional premises"]),
      caseNumber: uniqueCaseNumber(() => `UPC_CFI_${randInt(100, 499)}/${filingDate.getUTCFullYear()}`),
      filingDate,
      status,
      cause: "Infringement Action (Art. 32(1)(a) UPCA)",
      techArea,
      judge: pick(JUDGES),
      plaintiffs: [plaintiff],
      defendants,
      plaintiffRole: "PLAINTIFF",
      defendantRole: "DEFENDANT",
      patents: portfolioFor(plaintiff, randInt(1, 2)),
      summary: `${plaintiff} brings an infringement action before the ${division} seeking relief across multiple Contracting Member States.`,
      closedAfterDays: status === "Active" ? 9999 : randInt(90, 480),
    });
  }

  // ---- ITC investigations (40) ----
  for (let i = 0; i < 40; i++) {
    const filingDate = randDate(1780, 3);
    const complainant = chance(0.6) ? pick(NPE_PLAINTIFFS) : pick(OP_PLAINTIFFS);
    const respondents = pickMany([...DEFENDANTS, ...EU_DEFENDANTS], randInt(2, 4));
    const techArea = pick(TECH_AREAS);
    const status = weighted([
      ["Active", 0.4],
      ["ALJ Initial Determination", 0.15],
      ["Final Determination — Violation Found", 0.12],
      ["Final Determination — No Violation", 0.08],
      ["Terminated — Consent Order", 0.15],
      ["Terminated — Settlement", 0.1],
    ] as [string, number][]);
    await createCase({
      jurisdiction: "ITC",
      court: "U.S. International Trade Commission",
      courtDetail: "Office of Unfair Import Investigations",
      caseNumber: uniqueCaseNumber(() => `337-TA-${randInt(1350, 1470)}`),
      filingDate,
      status,
      cause: "Section 337 Investigation",
      techArea,
      judge: pick(ALJS),
      plaintiffs: [complainant],
      defendants: respondents,
      plaintiffRole: "PLAINTIFF",
      defendantRole: "DEFENDANT",
      patents: portfolioFor(complainant, randInt(1, 3)),
      summary: `Complainant seeks an exclusion order and cease-and-desist order against imports of accused ${techArea.toLowerCase()} products.`,
      closedAfterDays: status === "Active" ? 9999 : randInt(300, 620),
    });
  }

  // ---- SEP litigations (30) ----
  for (let i = 0; i < 30; i++) {
    const court = pick(["E.D. Tex.", "W.D. Tex.", "D. Del.", "N.D. Cal.", "S.D.N.Y.", "E.D. Va.", "C.D. Cal.", "W.D. Wash."]);
    const filingDate = randDate(1780, 3);
    const plaintiff = pick([...OP_PLAINTIFFS, ...NPE_PLAINTIFFS]);
    const defendants = pickMany([...DEFENDANTS, ...EU_DEFENDANTS], randInt(1, 2));
    const status = weighted([
      ["Active", 0.5],
      ["Settled (FRAND License)", 0.25],
      ["Dismissed", 0.15],
      ["Judgment for Plaintiff", 0.1],
    ] as [string, number][]);
    await createCase({
      jurisdiction: "SEP",
      court,
      courtDetail: "Standard-essential patent portfolio assertion",
      caseNumber: uniqueCaseNumber(() => districtCaseNumber(court, filingDate)),
      filingDate,
      status,
      cause: "SEP Infringement & FRAND Terms",
      techArea: pick(["Telecommunications", "Networking", "Consumer Electronics", "Software & E-Commerce"]),
      judge: pick(JUDGES),
      plaintiffs: [plaintiff],
      defendants,
      plaintiffRole: "PLAINTIFF",
      defendantRole: "DEFENDANT",
      patents: portfolioFor(plaintiff, randInt(2, 4)),
      summary: `Plaintiff asserts standard-essential patents and seeks a FRAND determination against implementers of the ${pick(["5G NR", "Wi-Fi 6E", "AVC/H.264", "HEVC/H.265", "NB-IoT"])} standard.`,
      closedAfterDays: status === "Active" ? 9999 : randInt(120, 500),
    });
  }

  console.log(`  cases: ${created}`);

  /* ------------------------- news ------------------------- */
  const NEWS_CATEGORIES = ["LITIGATION", "PTAB", "UPC", "OPPOSITION", "SEP", "ITC", "MARKET"] as const;
  const newsTemplates: ((d: Date) => { title: string; summary: string; category: string })[] = [
    () => {
      const p = pick(NPE_PLAINTIFFS);
      const d = pick(DEFENDANTS);
      const amt = randInt(28, 320) * 1_000_000;
      return { title: `Jury returns $${(amt / 1_000_000).toFixed(0)}M verdict for ${p} in ${pick(["E.D. Tex.", "W.D. Tex.", "D. Del."])}`, summary: `A federal jury found ${d} infringed patents covering ${pick(TECH_AREAS).toLowerCase()} technology and awarded $${(amt / 1_000_000).toFixed(0)}M in reasonable-royalty damages. Post-trial motions are expected.`, category: "LITIGATION" };
    },
    () => {
      const a = pick(NPE_PLAINTIFFS);
      const b = pick(DEFENDANTS);
      return { title: `${a} and ${b} reach confidential settlement`, summary: `The parties dismissed all claims and counterclaims with prejudice after mediation. Financial terms were not disclosed.`, category: "LITIGATION" };
    },
    () => {
      const d = pick(DEFENDANTS);
      return { title: `PTAB institutes IPR against ${d}'s asserted patent`, summary: `The Board found a reasonable likelihood that the petitioner established unpatentability of at least one challenged claim. District court litigation may be stayed pending the final written decision.`, category: "PTAB" };
    },
    () => {
      const p = pick(EU_DEFENDANTS);
      return { title: `UPC ${pick(["Munich", "Düsseldorf", "Mannheim", "Milan"])} division issues first-instance decision in ${p} dispute`, summary: `The court held the patent infringed and granted an injunction covering several Contracting Member States. An appeal to the Court of Appeal in Luxembourg is available.`, category: "UPC" };
    },
    () => {
      const p = pick(EU_DEFENDANTS);
      return { title: `EPO Opposition Division revokes ${p}'s European patent`, summary: `After oral proceedings, the division found the main request and all auxiliary requests lacked inventive step over the prior art on file.`, category: "OPPOSITION" };
    },
    () => {
      const a = pick(OP_PLAINTIFFS);
      return { title: `${a} files SEP enforcement action against ${pick(DEFENDANTS)}`, summary: `The complaint seeks injunctive relief and a FRAND rate determination for patents declared essential to the 5G NR standard.`, category: "SEP" };
    },
    () => ({
      title: `ITC institutes Section 337 investigation into ${pick(TECH_AREAS).toLowerCase()} imports`,
      summary: `The Commission determined to institute an investigation based on a complaint alleging patent infringement. The target date for the final determination will be set within 45 days.`,
      category: "ITC",
    }),
    () => ({
      title: `NPE share of new patent filings reaches ${randInt(52, 68)}% in latest quarter`,
      summary: `Monetization entities accounted for the majority of new US district court patent complaints, continuing a multi-year trend, according to PatentPulse's quarterly tracker.`,
      category: "MARKET",
    }),
  ];
  for (let i = 0; i < 26; i++) {
    const tpl = newsTemplates[i % newsTemplates.length](new Date());
    await db.newsItem.create({
      data: {
        ...tpl,
        sourceName: pick(["PatentPulse Newsroom", "IP Litigation Daily", "Docket Wire", "Global IP Monitor"]),
        publishedAt: randDate(62, 0),
      },
    });
  }
  console.log(`  news: 26`);

  /* ------------------------- users ------------------------- */
  const { hashPassword } = await import("../src/lib/password");
  await db.user.create({
    data: {
      email: "admin@patentpulse.demo",
      name: "Demo Admin",
      passwordHash: hashPassword("Admin123!"),
      role: "ADMIN",
    },
  });
  await db.user.create({
    data: {
      email: "demo@patentpulse.demo",
      name: "Demo Analyst",
      passwordHash: hashPassword("Demo123!"),
      role: "USER",
    },
  });
  await db.syncLog.create({
    data: { source: "seed", recordsIngested: created, casesUpdated: 0, notes: `Seeded ${created} cases, ${allPatents.length} patents, ${partyRecs.length} parties.` },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

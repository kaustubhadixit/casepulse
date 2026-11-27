/**
 * Backfill real patent dockets from CourtListener into the local DB.
 * Usage: bun scripts/backfill-cl.ts [pages]   (default 6 pages × 100 dockets)
 */
import { runBackfill } from "../src/lib/sync";

const pages = Math.max(1, Math.min(20, Number(process.argv[2] ?? 6)));

runBackfill(pages)
  .then((r) => {
    console.log(`backfill complete: ${r.ingested} ingested, ${r.skipped} already present, ${r.pages} page(s)`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("backfill failed:", e);
    process.exit(1);
  });

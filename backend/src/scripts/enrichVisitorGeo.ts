/**
 * Fill `visitors.city` and `visitors.country` from the IP already stored on each row.
 *
 * WHY A SCRIPT AND NOT A SERVICE. The GeoLite2 City database is ~60MB and the
 * reader holds it open. The production host's kernel journal counts 670 OOM kills
 * and it runs five Postgres instances, so the long-running backend must not carry
 * that resident. A short-lived process pays it for the length of a run and gives
 * it back. This also means the backfill and the ongoing fill are the SAME code
 * path, run on different days - there is no second implementation to drift.
 *
 * IDEMPOTENT. It selects rows with no city and writes what it finds. Running it
 * twice in a row does the same work and reaches the same state; nothing is
 * appended, incremented or double-counted. Rows whose IP cannot be resolved are
 * selected again on the next run, which is deliberate rather than wasteful: the
 * database is updated about twice a week, so an address that resolves to nothing
 * today may resolve next month. At ~6.4k rows a full pass is seconds.
 *
 * SAFE TO INTERRUPT. Each batch commits on its own. A run killed halfway leaves
 * the rows it finished enriched and the rest exactly as they were.
 *
 * USAGE
 *   node dist/scripts/enrichVisitorGeo.js                 # enrich everything outstanding
 *   node dist/scripts/enrichVisitorGeo.js --dry-run       # report, write nothing
 *   node dist/scripts/enrichVisitorGeo.js --limit 500     # cap the rows considered
 *   GEOIP_CITY_DB=/path/to/GeoLite2-City.mmdb node ...    # non-default database path
 */
import { QueryTypes } from 'sequelize';
import * as fs from 'fs';
import * as path from 'path';
import { sequelize } from '../config/database';
import { cityFromLookup, isEnrichableIp, normalizeIp } from '../services/geo/visitorGeoEnrichment';

/** Baked into the backend image by .github/workflows/build-images.yml. */
const DEFAULT_DB_PATH = '/app/geoip/GeoLite2-City.mmdb';
const BATCH_SIZE = 500;

interface VisitorRow {
  id: string;
  ip_address: string | null;
}

interface Counters {
  considered: number;
  skippedNotPublic: number;
  noMatch: number;
  countryOnly: number;
  enriched: number;
}

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown> = {}): void {
  // Structured, to stdout, per the Observability Framework. Deliberately carries
  // NO ip address and no visitor id: this is a bulk job over personal data and
  // the counts are what anybody debugging it actually needs.
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'visitor-geo-enrichment',
    event,
    ...context,
  })}\n`);
}

function resolveDbPath(): string {
  const configured = process.env.GEOIP_CITY_DB;
  if (configured) return configured;
  if (fs.existsSync(DEFAULT_DB_PATH)) return DEFAULT_DB_PATH;
  // Local development: the repo copy, if someone has put one there.
  return path.resolve(__dirname, '..', '..', 'geoip', 'GeoLite2-City.mmdb');
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg !== -1 ? Math.max(1, Number(process.argv[limitArg + 1]) || 0) : null;

  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    // Loud and specific. A silent skip here is how a job reports success for
    // weeks while enriching nothing.
    log('error', 'geoip_database_missing', { dbPath, hint: 'the image build downloads this; set GEOIP_CITY_DB to override' });
    process.exitCode = 1;
    return;
  }

  // Required lazily so the 60MB reader is never loaded by anything that merely
  // imports this file, and so --help-style misuse fails before paying for it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const maxmind = require('maxmind') as typeof import('maxmind');
  // Their own CityResponse, because `open` constrains its generic to mmdb-lib's
  // union. `cityFromLookup` then takes it as `unknown` and narrows, so nothing
  // here asserts a shape over data that came out of a binary file.
  const reader = await maxmind.open<import('maxmind').CityResponse>(dbPath);
  log('info', 'start', { dbPath, dryRun, limit, batchSize: BATCH_SIZE });

  const counters: Counters = { considered: 0, skippedNotPublic: 0, noMatch: 0, countryOnly: 0, enriched: 0 };
  const started = Date.now();
  let lastId: string | null = null;

  for (;;) {
    if (limit !== null && counters.considered >= limit) break;
    const take = limit !== null ? Math.min(BATCH_SIZE, limit - counters.considered) : BATCH_SIZE;

    // Keyset pagination on id, not OFFSET: the rows being updated are the rows
    // being paged over, so an OFFSET walk would skip rows as the result set
    // shifts underneath it.
    // ANNOTATED, not inferred. Without this `tsc` reports TS7022: the query's SQL
    // mentions `lastId`, `lastId` is assigned from `rows` at the bottom of the
    // loop, and inference walks that circle back into its own initializer. The
    // annotation cuts the cycle and says the same thing the generic does.
    const rows: VisitorRow[] = await sequelize.query<VisitorRow>(
      `SELECT id, ip_address
         FROM visitors
        WHERE city IS NULL
          AND ip_address IS NOT NULL
          AND ip_address <> ''
          ${lastId ? 'AND id > :lastId' : ''}
        ORDER BY id
        LIMIT :take`,
      { replacements: lastId ? { lastId, take } : { take }, type: QueryTypes.SELECT },
    );
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;

    const updates: Array<{ id: string; city: string | null; country: string | null }> = [];
    for (const row of rows) {
      counters.considered += 1;
      if (!isEnrichableIp(row.ip_address)) { counters.skippedNotPublic += 1; continue; }
      const ip = normalizeIp(row.ip_address);
      if (!ip) { counters.skippedNotPublic += 1; continue; }

      const result = cityFromLookup(reader.get(ip));
      if (result.city) { counters.enriched += 1; updates.push({ id: row.id, ...result }); continue; }
      if (result.country) { counters.countryOnly += 1; updates.push({ id: row.id, ...result }); continue; }
      counters.noMatch += 1;
    }

    if (updates.length && !dryRun) {
      // One transaction per batch, so an interruption loses at most one batch and
      // never leaves a row half-written.
      await sequelize.transaction(async (tx) => {
        for (const u of updates) {
          await sequelize.query(
            `UPDATE visitors
                SET city = COALESCE(:city, city),
                    country = COALESCE(:country, country)
              WHERE id = :id`,
            { replacements: { id: u.id, city: u.city, country: u.country }, type: QueryTypes.UPDATE, transaction: tx },
          );
        }
      });
    }

    log('info', 'batch_done', { ...counters, wrote: dryRun ? 0 : updates.length });
  }

  log('info', 'end', {
    ...counters,
    dryRun,
    duration_ms: Date.now() - started,
    outcome: 'success',
    // The number that matters: how many rows the snack bar can now name.
    renderable_cities_added: dryRun ? 0 : counters.enriched,
  });
  await sequelize.close();
}

main().catch(async (err) => {
  log('error', 'unhandled_error', {
    error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
    message: err instanceof Error ? err.message : String(err),
    outcome: 'failure',
  });
  try { await sequelize.close(); } catch { /* already closed */ }
  process.exitCode = 1;
});

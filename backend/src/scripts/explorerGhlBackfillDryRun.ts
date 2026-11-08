/**
 * Phase 1 of the Explorer GoHighLevel backfill: a dry run that writes NOTHING.
 *
 * WHY THIS EXISTS. 318 Colaberry Explorer learners have a lead row in our Postgres and no
 * GoHighLevel contact, so Rose cannot call the ones with phone numbers. The plan for fixing
 * that is `docs/EXPLORER_GHL_BACKFILL_PLAN.md`, approved 2026-11-07. Phase 1 is this script:
 * it answers the one question the database cannot, which is whether those people are already
 * in GHL under a contact we simply never recorded.
 *
 * ── THERE IS NO WRITE PATH IN THIS FILE, AND THAT IS DELIBERATE ─────────────
 *
 * It imports `findContactByEmail` and `findContactByPhone` and nothing else from the GHL
 * service. `createContact`, `updateContact`, `addContactTag`, `addContactNote` and
 * `syncLeadToGhl` are all absent, so there is no flag, typo or argument that can make this
 * script write to a customer-facing CRM. Phase 3 adds the live run as its own reviewed change.
 *
 * The reason that matters: on 2026-10-23 a previous GHL backfill pushed an end-to-end test
 * fixture into the live School of Data and AI account and it had to be deleted from a
 * customer-facing CRM by hand (`services/leads/syntheticContacts.ts:5-12`).
 *
 * ── WHAT IT MEASURED ON FIRST RUN (2026-11-07, production) ──────────────────
 *
 * The plan was written against the sync audit, which said 9 of the 318 were test fixtures.
 * The audit undercounts: it only knows about the fixtures the guard actually refused, and 46
 * more were never attempted at all, so no row says `synthetic_email` for them. Tested by
 * EMAIL SHAPE, which is the rule the live sync itself applies before routing, the real figure
 * is 56. Candidates are therefore 261, not the 307 the plan projected.
 *
 *   318 missing  =  56 test fixtures  +  1 success-with-no-id  +  261 candidates
 *
 * Every one of the 195 callable people is a candidate; none of the exclusions removes somebody
 * Rose could have phoned.
 *
 * ── THE CONTROLS ARE THE POINT ──────────────────────────────────────────────
 *
 * A dry run whose GHL client is misconfigured reports "would create" for all 261 people, and
 * that reads exactly like a successful run. So before any candidate is looked up, for EVERY
 * destination account this run will touch:
 *
 *   present control — a lead that already HAS a `ghl_contact_id` in that account must be
 *                     found by email. If it is not, that credential cannot see its own data
 *                     and the whole run is void.
 *   absent control  — an address under `.invalid` must NOT be found. If it is, v1's fuzzy
 *                     search is returning noise and every "already in GHL" result is suspect.
 *
 * Both run per account, because each account is a different API key pointing at a different
 * location, and one working key proves nothing about another.
 *
 * Usage (read-only, safe to re-run):
 *   docker exec accelerator-backend node dist/scripts/explorerGhlBackfillDryRun.js
 *   docker exec accelerator-backend node dist/scripts/explorerGhlBackfillDryRun.js --limit 20
 *   docker exec accelerator-backend node dist/scripts/explorerGhlBackfillDryRun.js \
 *     --json /tmp/phase1-ledger.json
 *
 * Exits non-zero when a control fails or the cohorts do not reconcile, because a dry run that
 * cannot prove its own arithmetic is not evidence.
 */
import * as fs from 'fs';
import * as crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { findContactByEmail, findContactByPhone } from '../services/ghlService';
import { resolveGhlAccountForSource } from '../services/leads/ghlAccountRouting';
import { syntheticEmailSql } from '../services/leads/syntheticContacts';
import { getSetting } from '../services/settingsService';

const CORRELATION_ID = crypto.randomUUID();

/**
 * Milliseconds between GHL requests. 261 candidates cost up to ~522 reads.
 *
 * No GHL rate limit is documented anywhere in this repo, `docs/` or `directives/` - the only
 * one implemented is for SMS and does not gate contacts - so this is a judgement call rather
 * than a bound. 200ms is about 5 requests a second, which keeps a full pass near two minutes
 * while staying well under the 10/s that v1 is commonly reported to allow.
 */
const PACE_MS = 200;

export interface CandidateRow {
  enrollment_id: string;
  lead_id: number;
  email: string | null;
  phone: string | null;
  name: string | null;
  source: string | null;
  consent_contact: boolean;
  last_sync_status: string | null;
}

export interface CohortCounts {
  missing_total: number;
  synthetic: number;
  success_no_id: number;
  candidates: number;
  callable_total: number;
  callable_candidates: number;
}

/** What the live run would do for one person, and why. */
export type Disposition =
  | 'already_in_ghl_by_email'
  | 'already_in_ghl_by_phone'
  | 'would_create'
  | 'withheld_unconfigured'
  | 'withheld_no_credentials'
  | 'withheld_routes_unreadable'
  | 'skipped_no_email'
  | 'lookup_error';

export interface DispositionRow {
  enrollment_id: string;
  lead_id: number;
  source: string | null;
  account: string;
  callable: boolean;
  consent_contact: boolean;
  disposition: Disposition;
  /** The GHL contact id a live run would have reused, when one was found. */
  existing_contact_id: string | null;
}

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'explorer-ghl-backfill-dry-run',
      event,
      correlation_id: CORRELATION_ID,
      ...context,
    }) + '\n'
  );
}

const digits = (v: string | null): string => (v || '').replace(/\D/g, '');
const isCallable = (row: { phone: string | null }): boolean => digits(row.phone).length >= 10;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * The universe, partitioned by the SAME two predicates the live sync uses.
 *
 * `syntheticEmailSql` is imported rather than restated so the exclusion cannot drift from
 * `isSyntheticContactEmail`, which is what the sync checks at `ghlService.ts:289`. A
 * hand-written LIKE here is precisely the script-level filter that failed in October.
 */
function cohortSql(): string {
  return `
  WITH missing AS (
    SELECT p.enrollment_id, l.id AS lead_id, l.email, l.phone, l.name, l.source,
           l.consent_contact
      FROM explorer_journey_profiles p
      JOIN leads l ON l.id = p.lead_id
     WHERE l.ghl_contact_id IS NULL
  ), last_sync AS (
    SELECT DISTINCT ON (a.lead_id) a.lead_id, a.metadata->>'status' AS status
      FROM activities a
     WHERE a.metadata->>'action' = 'ghl_sync'
     ORDER BY a.lead_id, a.created_at DESC
  )
  SELECT m.*, s.status AS last_sync_status,
         ${syntheticEmailSql('m.email')} AS is_synthetic
    FROM missing m
    LEFT JOIN last_sync s ON s.lead_id = m.lead_id
   ORDER BY m.source, m.lead_id
`;
}

/**
 * A lead that is ALREADY in GHL, for use as the present control.
 *
 * Picked per source group rather than globally: the control has to live in the same account
 * as the candidates it vouches for, or it proves nothing about that credential.
 */
function controlSql(): string {
  return `
  SELECT l.id AS lead_id, l.email, l.ghl_contact_id, l.source
    FROM leads l
   WHERE l.ghl_contact_id IS NOT NULL
     AND coalesce(l.email, '') <> ''
     AND l.source = :source
     AND NOT ${syntheticEmailSql('l.email')}
   ORDER BY l.id DESC
   LIMIT 1
`;
}

export interface Cohorts {
  synthetic: CandidateRow[];
  successNoId: CandidateRow[];
  candidates: CandidateRow[];
  counts: CohortCounts;
}

/**
 * Split the universe into three buckets, exhaustively and without overlap.
 *
 * ORDER MATTERS, AND IT IS THE ORDER THE LIVE SYNC USES. The fixture test runs first, so a
 * test address whose last sync happened to report success is counted as a fixture rather than
 * as a defect to investigate. `isSyntheticContactEmail` is likewise checked before anything
 * else at `ghlService.ts:289`.
 *
 * Partitioning the other way round is what made the plan's own figure wrong: it bucketed on
 * the sync audit's `reason`, which only knows about the fixtures the guard actually refused,
 * and so counted 9 where the email rule counts 56.
 */
export function partitionCohorts(rows: Array<CandidateRow & { is_synthetic: boolean }>): Cohorts {
  const synthetic = rows.filter((r) => r.is_synthetic);
  const rest = rows.filter((r) => !r.is_synthetic);
  // Reported success and stored no contact id. We do not know whether a duplicate already
  // exists for them, so they are investigated individually rather than batch-written.
  const successNoId = rest.filter((r) => r.last_sync_status === 'success');
  const candidates = rest.filter((r) => r.last_sync_status !== 'success');

  const counts: CohortCounts = {
    missing_total: rows.length,
    synthetic: synthetic.length,
    success_no_id: successNoId.length,
    candidates: candidates.length,
    callable_total: rows.filter(isCallable).length,
    callable_candidates: candidates.filter(isCallable).length,
  };
  return { synthetic, successNoId, candidates, counts };
}

export async function loadCohorts(): Promise<Cohorts> {
  const rows = await sequelize.query<CandidateRow & { is_synthetic: boolean }>(cohortSql(), {
    type: QueryTypes.SELECT,
  });
  const cohorts = partitionCohorts(rows);
  const { counts } = cohorts;

  // A post-condition on `partitionCohorts`, not on the SQL: if a future edit adds a fourth
  // bucket and forgets a count, the run stops instead of reporting a short total.
  const sum = counts.synthetic + counts.success_no_id + counts.candidates;
  if (sum !== counts.missing_total) {
    throw new Error(`cohorts do not reconcile: ${sum} parts vs ${counts.missing_total} total`);
  }
  return cohorts;
}

export interface ControlResult {
  account: string;
  /** Which source supplied the already-synced lead, or null when none could be found. */
  control_source: string | null;
  present_found: boolean;
  present_id_matched: boolean;
  absent_found: boolean;
}

/**
 * Prove, per credential, that this client can both see a contact that exists and fail to see
 * one that does not. Returns one result per account; the caller aborts on any failure.
 *
 * The present control is searched for across EVERY source that routes to the account, not just
 * the first one. A source with no already-synced lead would otherwise abort a run whose
 * credential is perfectly good, which is a false alarm in the one place a false alarm is most
 * expensive: the gate that decides whether the numbers can be trusted at all.
 */
export async function runControls(
  accountsBySource: Map<string, { accountKey: string; apiKey: string }>
): Promise<ControlResult[]> {
  const byAccount = new Map<string, { apiKey: string; sources: string[] }>();
  for (const [source, account] of accountsBySource) {
    const entry = byAccount.get(account.accountKey);
    if (entry) entry.sources.push(source);
    else byAccount.set(account.accountKey, { apiKey: account.apiKey, sources: [source] });
  }

  const results: ControlResult[] = [];
  for (const [accountKey, { apiKey, sources }] of byAccount) {
    let presentFound = false;
    let presentIdMatched = false;
    let controlSource: string | null = null;

    for (const source of sources) {
      const [control] = await sequelize.query<{ lead_id: number; email: string; ghl_contact_id: string }>(
        controlSql(),
        { type: QueryTypes.SELECT, replacements: { source } }
      );
      if (!control) continue;

      controlSource = source;
      const hit = await findContactByEmail(control.email, apiKey);
      await sleep(PACE_MS);
      presentFound = hit !== null;
      presentIdMatched = hit?.id === control.ghl_contact_id;
      if (presentFound) break;
    }

    // `.invalid` is reserved by RFC 2606 and can never resolve to a real address.
    const absent = `control-absent-${crypto.randomUUID()}@colaberry-control.invalid`;
    const absentHit = await findContactByEmail(absent, apiKey);
    await sleep(PACE_MS);

    results.push({
      account: accountKey,
      control_source: controlSource,
      present_found: presentFound,
      present_id_matched: presentIdMatched,
      absent_found: absentHit !== null,
    });
  }
  return results;
}

/** Resolve every distinct candidate source once, so routing is read N times not 261. */
async function resolveAccounts(
  candidates: CandidateRow[]
): Promise<{ ready: Map<string, { accountKey: string; apiKey: string }>; withheld: Map<string, Disposition> }> {
  const ready = new Map<string, { accountKey: string; apiKey: string }>();
  const withheld = new Map<string, Disposition>();

  for (const source of new Set(candidates.map((c) => c.source || ''))) {
    const outcome = await resolveGhlAccountForSource(source || null);
    if (outcome.status === 'ready') {
      ready.set(source, { accountKey: outcome.account.accountKey, apiKey: outcome.account.apiKey });
    } else {
      withheld.set(source, `withheld_${outcome.status}` as Disposition);
    }
  }
  return { ready, withheld };
}

/**
 * The controls that failed, and therefore void the run.
 *
 * A credential that cannot find a contact it already owns makes every lookup return null,
 * which reads exactly like "nobody is in GHL" and would send the whole candidate set into a
 * live run. A `.invalid` address that DOES match means v1's fuzzy search is returning noise,
 * so every "already in GHL" answer is unreliable in the other direction.
 *
 * A present control found under a different id is NOT a failure: the contact exists either
 * way, so "already in GHL" is still the right answer for that person. It is reported instead.
 */
export function failedControls(results: ControlResult[]): ControlResult[] {
  return results.filter((c) => !c.present_found || c.absent_found);
}

export async function classifyOne(
  row: CandidateRow,
  account: { accountKey: string; apiKey: string }
): Promise<{ disposition: Disposition; existing_contact_id: string | null }> {
  const email = (row.email || '').trim();
  if (!email) return { disposition: 'skipped_no_email', existing_contact_id: null };

  try {
    const byEmail = await findContactByEmail(email, account.apiKey);
    await sleep(PACE_MS);
    if (byEmail) return { disposition: 'already_in_ghl_by_email', existing_contact_id: byEmail.id };

    if (isCallable(row)) {
      const byPhone = await findContactByPhone(row.phone as string, account.apiKey);
      await sleep(PACE_MS);
      if (byPhone) return { disposition: 'already_in_ghl_by_phone', existing_contact_id: byPhone.id };
    }
    return { disposition: 'would_create', existing_contact_id: null };
  } catch (err) {
    log('error', 'lookup_failed', {
      lead_id: row.lead_id,
      error_class: err instanceof Error ? err.constructor.name : 'Unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return { disposition: 'lookup_error', existing_contact_id: null };
  }
}

function tally(rows: DispositionRow[], key: (r: DispositionRow) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function printSummary(counts: CohortCounts, rows: DispositionRow[], controls: ControlResult[]): void {
  const line = (label: string, value: unknown): void => console.log(`  ${label.padEnd(34)} ${value}`);

  console.log('\n=== Cohorts (production, read-only) ===');
  line('explorer profiles missing in GHL', counts.missing_total);
  line('  test fixtures, excluded', counts.synthetic);
  line('  success with no contact id', counts.success_no_id);
  line('  BACKFILL CANDIDATES', counts.candidates);
  line('callable of the whole set', counts.callable_total);
  line('callable of the candidates', counts.callable_candidates);

  console.log('\n=== Controls, per credential ===');
  for (const c of controls) {
    line(`${c.account} present`, c.present_found ? `found${c.present_id_matched ? ', id matched' : ', DIFFERENT id'}` : 'NOT FOUND');
    line(`${c.account} absent`, c.absent_found ? 'FOUND, which is wrong' : 'correctly absent');
  }

  console.log('\n=== What a live run would do ===');
  for (const [k, v] of tally(rows, (r) => r.disposition)) line(k, v);

  console.log('\n=== By destination account ===');
  for (const [k, v] of tally(rows, (r) => `${r.account} / ${r.disposition}`)) line(k, v);

  console.log('\n=== Callable people that would be created ===');
  const createCallable = rows.filter((r) => r.disposition === 'would_create' && r.callable);
  line('callable, would create', createCallable.length);
  line('  of those, consent_contact true', createCallable.filter((r) => r.consent_contact).length);
  for (const [k, v] of tally(createCallable, (r) => r.source || '(null)')) line(`  ${k}`, v);
}

function flagValue(argv: string[], name: string): string | null {
  const at = argv.indexOf(name);
  return at !== -1 && argv[at + 1] ? argv[at + 1] : null;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const limitArg = flagValue(argv, '--limit');
  const limit = limitArg ? Number(limitArg) : null;
  const jsonPath = flagValue(argv, '--json');

  if (!(await getSetting('ghl_enabled'))) {
    // The code default is false, so a disabled flag would make the live run silently do
    // nothing. Assert it here rather than discover it in Phase 3.
    throw new Error('ghl_enabled is not set: a live run would be a no-op');
  }

  const { counts, candidates } = await loadCohorts();
  log('info', 'cohorts_loaded', { ...counts });

  const { ready, withheld } = await resolveAccounts(candidates);
  log('info', 'accounts_resolved', {
    ready_sources: [...ready.keys()],
    ready_accounts: [...new Set([...ready.values()].map((a) => a.accountKey))],
    withheld_sources: [...withheld.keys()],
  });

  const controls = await runControls(ready);
  const badControls = failedControls(controls);
  if (badControls.length > 0) {
    log('error', 'controls_failed', { accounts: badControls.map((c) => c.account) });
    throw new Error(
      `control failed for ${badControls.map((c) => c.account).join(', ')}: ` +
        'this run cannot distinguish "not in GHL" from "cannot read GHL"'
    );
  }
  log('info', 'controls_passed', { controls });

  const work = limit ? candidates.slice(0, limit) : candidates;
  const rows: DispositionRow[] = [];
  let done = 0;

  for (const row of work) {
    const source = row.source || '';
    const account = ready.get(source);
    const base = {
      enrollment_id: row.enrollment_id,
      lead_id: row.lead_id,
      source: row.source,
      callable: isCallable(row),
      consent_contact: Boolean(row.consent_contact),
    };

    if (!account) {
      rows.push({ ...base, account: 'unresolved', disposition: withheld.get(source) || 'lookup_error', existing_contact_id: null });
    } else {
      const { disposition, existing_contact_id } = await classifyOne(row, account);
      rows.push({ ...base, account: account.accountKey, disposition, existing_contact_id });
    }

    if (++done % 25 === 0) log('info', 'progress', { done, of: work.length });
  }

  if (rows.length !== work.length) {
    throw new Error(`row count ${rows.length} does not equal candidate count ${work.length}`);
  }

  printSummary(counts, rows, controls);

  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify({ correlation_id: CORRELATION_ID, counts, controls, rows }, null, 2));
    console.log(`\nledger: ${jsonPath}`);
  }

  log('info', 'dry_run_complete', {
    outcome: 'success',
    classified: rows.length,
    of_candidates: counts.candidates,
    partial: limit !== null,
  });
}

if (require.main === module) {
  main()
    .then(async () => {
      await sequelize.close();
      process.exit(0);
    })
    .catch(async (err) => {
      log('error', 'dry_run_failed', {
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
      });
      await sequelize.close().catch(() => undefined);
      process.exit(1);
    });
}

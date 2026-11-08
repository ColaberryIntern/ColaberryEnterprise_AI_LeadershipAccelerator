/**
 * Phase 3A of the Explorer GoHighLevel backfill: repair the link, write NOTHING to the CRM.
 *
 * WHY THIS EXISTS. Phase 1 (`explorerGhlBackfillDryRun.ts`, run against production on
 * 2026-11-07) measured that 196 of the 261 backfill candidates are ALREADY in GoHighLevel,
 * under contacts somebody on the team typed in by hand between July and October. GoHighLevel's
 * own `attributionSource` says `CRM UI / manual` for 17 of a 24-contact sample and carries a
 * `left voicemail` tag, so the calling has already happened. What is missing is the
 * `ghl_contact_id` on OUR lead row, not the contact in theirs.
 *
 * So this script writes one column on up to 192 rows of our own Postgres and nothing else.
 *
 * ── THERE IS NO CRM WRITE PATH, AND IT IS ENFORCED AT THE IMPORT ────────────
 *
 * This file does not import `../services/ghlService` at all. Every GoHighLevel read goes
 * through `classifyOne` from the Phase 1 module, whose own suite asserts that its ghlService
 * import names exactly `findContactByEmail` and `findContactByPhone`. The contract therefore
 * holds transitively, and `explorerGhlLinkRepair.test.ts` asserts the absence of that import
 * here so a later edit cannot quietly add one.
 *
 * The cohort SQL and the matcher are IMPORTED rather than copied for the same reason. The
 * plan's own candidate count was wrong by 46 because it restated a predicate instead of
 * reusing the one the live sync applies; a second copy of the cohort query would drift the
 * same way.
 *
 * ── THE COLLISION GUARD IS THE REASON THIS IS NOT A ONE-LINE UPDATE ─────────
 *
 * The 196 matches resolve to only 192 DISTINCT contact ids: four people registered twice with
 * two email addresses and one phone number, so two of our lead rows point at one of their
 * contacts. Writing the same id onto both would fan a customer-facing record across two of
 * ours. The rule that resolves it, and the evidence for it, live in
 * `lib/explorerGhlLinkPlan.ts`; this file holds the I/O and asserts the rule's post-conditions
 * before anything is written.
 *
 * ── THE ONE BEHAVIORAL CONSEQUENCE, STATED PLAINLY ─────────────────────────
 *
 * Setting `ghl_contact_id` changes which branch `syncLeadToGhl` takes for these leads
 * (`services/ghlService.ts:348`). Before the repair, a campaign send against one of them would
 * try to CREATE a contact, duplicating the one Rose is working. After the repair it takes the
 * already-linked branch, which applies provenance tags and, when a campaign supplies an
 * interest group, one `updateContact` on a custom field. Both are additive. The repair
 * therefore removes a duplicate-creation path and adds a labeling path; it does not make this
 * script a CRM writer.
 *
 * Usage - the default is a plan with no writes, and `--apply` demands the count up front:
 *   docker exec accelerator-backend node dist/scripts/explorerGhlLinkRepair.js \
 *     --json /tmp/phase3a-plan.json
 *   docker exec accelerator-backend node dist/scripts/explorerGhlLinkRepair.js \
 *     --apply --expect 192 --json /tmp/phase3a-applied.json
 *   docker exec accelerator-backend node dist/scripts/explorerGhlLinkRepair.js \
 *     --reverse /tmp/phase3a-applied.json
 *
 * Idempotent by construction: every UPDATE carries `AND ghl_contact_id IS NULL`, so a second
 * run writes nothing and reports the rows as already linked rather than failing.
 */
import * as fs from 'fs';
import * as crypto from 'crypto';
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import {
  CandidateRow,
  classifyOne,
  failedControls,
  loadCohorts,
  resolveAccounts,
  runControls,
} from './explorerGhlBackfillDryRun';
import {
  MatchRow,
  PlannedLink,
  RepairPlan,
  fanOutViolations,
  planLinks,
} from './lib/explorerGhlLinkPlan';
import { getSetting } from '../services/settingsService';

const CORRELATION_ID = crypto.randomUUID();

/** Rows per transaction. The plan approved in #3745 asked for batches of 5. */
const DEFAULT_BATCH = 5;

export type AppliedOutcome = 'linked' | 'already_linked_concurrently';

export interface AppliedRow {
  lead_id: number;
  contact_id: string;
  outcome: AppliedOutcome;
  applied_at: string;
}

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'explorer-ghl-link-repair',
      event,
      correlation_id: CORRELATION_ID,
      ...context,
    }) + '\n'
  );
}

/**
 * Which lead rows already carry each of these contact ids.
 *
 * Read for the WHOLE candidate set before any write, because a contact already linked to a
 * different lead is the one collision the in-batch grouping cannot see.
 */
export async function loadExistingLinks(contactIds: string[]): Promise<Map<string, number[]>> {
  const byContact = new Map<string, number[]>();
  if (contactIds.length === 0) return byContact;

  const rows = await sequelize.query<{ lead_id: number; ghl_contact_id: string }>(
    // `IN (:ids)`, not `ANY(:ids)`. Sequelize expands an array replacement to a parenthesized
    // list, so `ANY(:ids)` renders as `ANY('a', 'b')`, which Postgres rejects outright. The
    // same trap is recorded at `db/ensureCertPrepSchema.ts:364`, and a mocked unit test cannot
    // see it because the statement is never parsed.
    `SELECT id AS lead_id, ghl_contact_id
       FROM leads
      WHERE ghl_contact_id IN (:ids)`,
    { type: QueryTypes.SELECT, replacements: { ids: contactIds } }
  );
  for (const r of rows) {
    const list = byContact.get(r.ghl_contact_id) || [];
    list.push(r.lead_id);
    byContact.set(r.ghl_contact_id, list);
  }
  return byContact;
}

/**
 * Write one lead's link, inside the caller's transaction.
 *
 * `AND ghl_contact_id IS NULL` is the idempotency key. It makes a second run a no-op, and it
 * makes a concurrent writer win rather than be silently overwritten - which is the right
 * outcome, because the other writer is the live sync holding evidence this script does not.
 */
export async function applyOne(link: PlannedLink, tx: Transaction): Promise<AppliedOutcome> {
  // `QueryTypes.UPDATE` returns `[rows, rowCount]` on Postgres, so the second element is the
  // number of rows the guard let through (sequelize 6.37.7, dialects/postgres/query.js:203-224).
  const [, affected] = await sequelize.query(
    `UPDATE leads
        SET ghl_contact_id = :contactId, updated_at = NOW()
      WHERE id = :leadId
        AND ghl_contact_id IS NULL`,
    {
      type: QueryTypes.UPDATE,
      replacements: { contactId: link.contact_id, leadId: link.lead_id },
      transaction: tx,
    }
  );
  if (!affected) return 'already_linked_concurrently';

  // Auditable in-product, in the same activity log an operator already reads for ghl_sync, and
  // in the same transaction so there is never a link without its record.
  await sequelize.query(
    `INSERT INTO activities (id, lead_id, type, subject, metadata, created_at)
     VALUES (:id, :leadId, 'system', 'GHL Contact Link Repaired', CAST(:meta AS jsonb), NOW())`,
    {
      type: QueryTypes.INSERT,
      replacements: {
        id: crypto.randomUUID(),
        leadId: link.lead_id,
        meta: JSON.stringify({
          action: 'ghl_link_repair',
          status: 'linked',
          phase: '3A',
          ghl_contact_id: link.contact_id,
          matched_by: link.matched_by,
          account: link.account,
          source: link.source,
          correlation_id: CORRELATION_ID,
        }),
      },
      transaction: tx,
    }
  );
  return 'linked';
}

/** Undo exactly what a ledger records, and only where the value is still the one we wrote. */
export async function reverse(ledgerPath: string): Promise<{ reversed: number; skipped: number }> {
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as { applied?: AppliedRow[] };
  const applied = (ledger.applied || []).filter((a) => a.outcome === 'linked');
  let reversed = 0;
  let skipped = 0;

  for (const row of applied) {
    const [, affected] = await sequelize.query(
      `UPDATE leads
          SET ghl_contact_id = NULL, updated_at = NOW()
        WHERE id = :leadId
          AND ghl_contact_id = :contactId`,
      { type: QueryTypes.UPDATE, replacements: { leadId: row.lead_id, contactId: row.contact_id } }
    );
    if (affected) reversed += 1;
    else skipped += 1;
  }
  log('info', 'reverse_complete', { outcome: 'success', reversed, skipped, of: applied.length });
  return { reversed, skipped };
}

const digits = (v: string | null): string => (v || '').replace(/\D/g, '');

/** Run Phase 1's matcher over the candidates and keep only the ones found in GoHighLevel. */
async function collectMatches(
  candidates: CandidateRow[],
  ready: Map<string, { accountKey: string; apiKey: string }>
): Promise<{ matches: MatchRow[]; unmatched: number; unresolved: number }> {
  const matches: MatchRow[] = [];
  let unmatched = 0;
  let unresolved = 0;
  let done = 0;

  for (const row of candidates) {
    const account = ready.get(row.source || '');
    if (!account) {
      unresolved += 1;
      continue;
    }
    const { disposition, existing_contact_id } = await classifyOne(row, account);
    if (existing_contact_id && (disposition === 'already_in_ghl_by_email' || disposition === 'already_in_ghl_by_phone')) {
      matches.push({
        enrollment_id: row.enrollment_id,
        lead_id: row.lead_id,
        source: row.source,
        account: account.accountKey,
        matched_by: disposition === 'already_in_ghl_by_email' ? 'email' : 'phone',
        contact_id: existing_contact_id,
        callable: digits(row.phone).length >= 10,
        consent_contact: Boolean(row.consent_contact),
      });
    } else {
      unmatched += 1;
    }
    if (++done % 25 === 0) log('info', 'progress', { done, of: candidates.length });
  }
  return { matches, unmatched, unresolved };
}

function flagValue(argv: string[], name: string): string | null {
  const at = argv.indexOf(name);
  return at !== -1 && argv[at + 1] ? argv[at + 1] : null;
}

function printPlan(plan: RepairPlan, unmatched: number, unresolved: number): void {
  const line = (label: string, value: unknown): void => console.log(`  ${label.padEnd(36)} ${value}`);
  console.log('\n=== Phase 3A plan: links to write in OUR Postgres ===');
  line('links to write', plan.link.length);
  line('  distinct contacts', new Set(plan.link.map((l) => l.contact_id)).size);
  line('  of those, callable', plan.link.filter((l) => l.callable).length);
  line('withheld', plan.withheld.length);
  for (const reason of ['duplicate_person_withheld', 'collision_unresolved', 'already_linked_elsewhere']) {
    const n = plan.withheld.filter((w) => w.reason === reason).length;
    if (n) line(`  ${reason}`, n);
  }
  line('not in GHL, nothing to link', unmatched);
  line('source unroutable, skipped', unresolved);

  const groups = plan.withheld.filter((w) => w.reason !== 'already_linked_elsewhere');
  if (groups.length) {
    console.log('\n=== Withheld, for a human merge decision ===');
    for (const w of groups) {
      console.log(`  lead ${w.lead_id} (${w.matched_by}) collides with ${w.collided_with.join(', ')} on contact ${w.contact_id}`);
    }
  }
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const reversePath = flagValue(argv, '--reverse');
  if (reversePath) {
    await reverse(reversePath);
    return;
  }

  const apply = argv.includes('--apply');
  const expectArg = flagValue(argv, '--expect');
  const batchSize = Number(flagValue(argv, '--batch') || DEFAULT_BATCH);
  const limitArg = flagValue(argv, '--limit');
  const jsonPath = flagValue(argv, '--json');

  if (apply && expectArg === null) {
    // A write whose size nobody stated in advance is a write nobody reviewed. Run without
    // `--apply` first, read the plan, then pass the number back.
    throw new Error('--apply requires --expect <n>: run without --apply first and pass the planned link count');
  }
  if (apply && !jsonPath) {
    // Without a ledger there is nothing for `--reverse` to read, so the write would be a
    // 192-row change to production with no recorded way back.
    throw new Error('--apply requires --json <path>: a write with no ledger cannot be reversed');
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    // `--batch 0` would advance the write loop by nothing and never terminate. An infinite
    // retry loop is prohibited outright by CLAUDE.md; an infinite WRITE loop is worse.
    throw new Error(`--batch must be a positive integer, got "${flagValue(argv, '--batch')}"`);
  }
  if (limitArg !== null && (!Number.isInteger(Number(limitArg)) || Number(limitArg) < 1)) {
    // A NaN limit silently slices the cohort to nothing, which reads as "there is no work".
    throw new Error(`--limit must be a positive integer, got "${limitArg}"`);
  }
  if (!(await getSetting('ghl_enabled'))) {
    throw new Error('ghl_enabled is not set: the lookups this plan depends on would be meaningless');
  }

  const { counts, candidates } = await loadCohorts();
  const work = limitArg ? candidates.slice(0, Number(limitArg)) : candidates;
  log('info', 'cohorts_loaded', { ...counts, considering: work.length });

  const { ready, withheld: unroutable } = await resolveAccounts(work);
  const controls = await runControls(ready);
  const badControls = failedControls(controls);
  if (badControls.length > 0) {
    // In the write direction the absent control is the load-bearing one: a fuzzy search
    // returning noise would put somebody else's contact id onto one of our leads.
    throw new Error(
      `control failed for ${badControls.map((c) => c.account).join(', ')}: ` +
        'a lookup that cannot be trusted must not become a written link'
    );
  }
  log('info', 'controls_passed', { controls, unroutable_sources: [...unroutable.keys()] });

  const { matches, unmatched, unresolved } = await collectMatches(work, ready);
  const existingLinks = await loadExistingLinks([...new Set(matches.map((m) => m.contact_id))]);
  const plan = planLinks(matches, existingLinks);

  if (plan.link.length + plan.withheld.length !== matches.length) {
    throw new Error(`plan does not reconcile: ${plan.link.length + plan.withheld.length} planned vs ${matches.length} matched`);
  }
  const fanOut = fanOutViolations(plan.link);
  if (fanOut.length > 0) {
    throw new Error(`fan-out: contact(s) ${fanOut.join(', ')} planned for more than one lead`);
  }

  printPlan(plan, unmatched, unresolved);

  const ledger: Record<string, unknown> = {
    correlation_id: CORRELATION_ID,
    applied_at: null,
    counts: {
      considered: work.length,
      matched: matches.length,
      to_link: plan.link.length,
      withheld: plan.withheld.length,
      unmatched,
      unresolved,
    },
    controls,
    plan,
    applied: [] as AppliedRow[],
  };
  const flush = (): void => {
    if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(ledger, null, 2));
  };
  flush();

  if (!apply) {
    log('info', 'plan_complete', { outcome: 'success', to_link: plan.link.length, wrote_nothing: true });
    console.log(`\nNo writes. Re-run with --apply --expect ${plan.link.length} to write these links.`);
    return;
  }

  const expected = Number(expectArg);
  if (plan.link.length !== expected) {
    throw new Error(
      `--expect ${expected} but the plan now holds ${plan.link.length} links: the cohort moved, so re-read the plan before writing`
    );
  }

  const applied: AppliedRow[] = [];
  ledger.applied = applied;
  for (let i = 0; i < plan.link.length; i += batchSize) {
    const batch = plan.link.slice(i, i + batchSize);
    // One transaction per batch, so a failure rolls back that batch alone and the ledger on
    // disk already names every row written before it.
    await sequelize.transaction(async (tx) => {
      for (const row of batch) {
        const outcome = await applyOne(row, tx);
        applied.push({
          lead_id: row.lead_id,
          contact_id: row.contact_id,
          outcome,
          applied_at: new Date().toISOString(),
        });
      }
    });
    flush();
    log('info', 'batch_applied', { batch: i / batchSize + 1, rows: batch.length, total_applied: applied.length });
  }

  ledger.applied_at = new Date().toISOString();
  flush();

  const linked = applied.filter((a) => a.outcome === 'linked').length;
  const concurrent = applied.filter((a) => a.outcome === 'already_linked_concurrently').length;
  console.log('\n=== Applied ===');
  console.log(`  linked                               ${linked}`);
  console.log(`  already linked by someone else       ${concurrent}`);
  if (jsonPath) console.log(`  ledger (reverse with --reverse)      ${jsonPath}`);

  log('info', 'repair_complete', {
    outcome: 'success',
    linked,
    already_linked_concurrently: concurrent,
    withheld: plan.withheld.length,
  });
}

if (require.main === module) {
  main()
    .then(async () => {
      await sequelize.close();
      process.exit(0);
    })
    .catch(async (err) => {
      log('error', 'repair_failed', {
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
      });
      await sequelize.close().catch(() => undefined);
      process.exit(1);
    });
}

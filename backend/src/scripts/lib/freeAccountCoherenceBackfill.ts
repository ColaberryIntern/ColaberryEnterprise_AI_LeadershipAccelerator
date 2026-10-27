/**
 * Growth OS Reset Phase 2 T207 — the backfill predicate for the two columns that
 * describe a free account, stated explicitly, in both directions.
 *
 * WHY A PREDICATE MODULE AND NOT A SCRIPT. The forward sweep, the inverse, the
 * dry-run counts and every exclusion test must agree about one definition of
 * "this row is a free AI learner". Writing the predicate inside a CLI would mean
 * the inverse re-derives it, and an inverse that disagrees with its forward is a
 * rollback that corrupts rows. So the decision is pure and lives here; the CLI
 * (`scripts/backfillFreeAccountCoherence.ts`) only loads rows and prints counts.
 *
 * THE TWO SHAPES ARE TWO DIFFERENT BUGS, which the plan treats as one:
 *
 *   A. `enrollment_type: 'explorer'` + `tier <> 'guest'`  — ENTITLEMENT.
 *      `explorerIdentityBridge.loadActiveExplorers` filters on
 *      `enrollment_type`/`status` and never reads `tier`, so these rows are
 *      already visible to Explorer Growth. What is wrong is that a free account
 *      holds the PAID access level, so the paywall never limits it.
 *
 *   B. `tier: 'guest'` + `enrollment_type: 'standard'`    — VISIBILITY.
 *      These are invisible to Explorer Growth. This is the shape the reset
 *      exists to fix.
 *
 * WHY B NEEDS POSITIVE PROVENANCE AND A IS SAFE WITHOUT IT. A Shape A row has
 * already declared its programme: the row itself says 'explorer'. Aligning its
 * access level to a free programme asserts nothing new about the person.
 *
 * Shape B asserts something new — it moves a row INTO the learner programme —
 * and the shape alone cannot support that, because three non-learner populations
 * live in it: org teammates (`orgService.ts:220,415`), AI Flotation prospect
 * accounts (`leads/prospectAccount.ts:137`), and staff/agent identities. The
 * production predicate `freeAccountRegistration.needsProgrammeUpgrade` matches
 * ALL of them and is safe only because its caller supplies `programme:
 * 'learner'` — a human asking for the course. Its own docblock calls the upgrade
 * "an upgrade, not a conscription". A table sweep has no such signal, so Shape B
 * writes only rows carrying positive free-signup provenance and REPORTS the rest
 * for human decision rather than guessing in either direction.
 */

/**
 * The marker `freeSignupService.captureGuestAsLead` falls back to on both fields.
 * Internal: nothing outside this module reads it, and CLAUDE.md caps the public
 * export surface at 12 symbols — this module was at 14.
 */
const FREE_SIGNUP_MARKER = 'free_signup';

/**
 * The seeded staff/agent accounts, pinned so an agent identity is an explicit
 * exclusion rather than an accident of its email domain.
 *
 * Every one of these is a plus-alias-free `@colaberry.com` address, so
 * `staffDetection.IS_STAFF_SQL`'s email term already excludes them today. That
 * is exactly why the list is pinned: the day somebody seeds an agent on another
 * domain, the staff-email term stops covering it. `agentIdentitySeedsAreExcluded`
 * in the test suite re-derives these literals from the seed files and fails if
 * this list drifts, so the protection does not depend on anybody remembering.
 */
export const AGENT_IDENTITY_EMAILS: readonly string[] = [
  'reese@colaberry.com',
  'dara@colaberry.com',
  'cory-engine@colaberry.com',
  'corybrain@colaberry.com',
  'inboxcaseengine@colaberry.com',
  'workforceintelligence@colaberry.com',
  'bposorchestrator@colaberry.com',
  'agentbehaviormonitor@colaberry.com',
  'growth-journey@colaberry.com',
  // Maya (admissions), 2026-10-27. `staff_email` already excludes her today — a plus-alias-free
  // @colaberry.com address — but that is precisely the coverage this list exists so as not to
  // depend on.
  'maya@colaberry.com',
];

/** Lead sources that mint a prospect account — mirrors `PROSPECT_ACCOUNT_SOURCES`. */
export const PROSPECT_LEAD_SOURCES: readonly string[] = ['ai-flotation'];

/** Every exclusion term, reported as a SET so overlaps stay visible. */
export type ExclusionReason =
  | 'not_active'
  | 'undeclared_programme'
  | 'paid_status'
  | 'paid_amount'
  | 'active_subscription'
  | 'org_member'
  | 'prospect_account'
  | 'agent_identity'
  | 'staff_role'
  | 'staff_mgmt_role'
  | 'staff_email';

/**
 * One candidate row, flattened. The joins live in the CLI's query; this stays a
 * plain record so every exclusion is testable without a database.
 */
export interface BackfillRow {
  id: string;
  email: string;
  status: string;
  tier: string;
  enrollment_type: string;
  payment_status: string;
  amount_paid?: number | string | null;
  /** Newest subscription status for this enrollment, or null when there is none. */
  subscription_status?: string | null;
  /** True when an `org_members` row references this enrollment. */
  is_org_member?: boolean;
  /** `community_members.role` / `.mgmt_role` — the two predicates IS_STAFF_SQL misses. */
  community_role?: string | null;
  mgmt_role?: string | null;
  /** Earliest lead for this email, by `source` and `form_type`. */
  lead_source?: string | null;
  lead_form_type?: string | null;
  /** Cohort name, used to spot the "Explore - Prospects" placement. */
  cohort_name?: string | null;
  explorer_entered_at?: Date | string | null;
}

/** Internal for the same export-ceiling reason as `FREE_SIGNUP_MARKER`. */
type BackfillBucket =
  | 'tier_backfill'
  | 'programme_backfill'
  | 'paid_and_guest'
  | 'ambiguous_no_learner_provenance'
  | 'excluded'
  | 'already_coherent';

export interface LedgerEntry {
  id: string;
  column: 'tier' | 'enrollment_type';
  from: string;
  to: string;
}

export interface RowDecision {
  id: string;
  action: 'write' | 'report' | 'skip';
  bucket: BackfillBucket;
  exclusions: ExclusionReason[];
  patch?: LedgerEntry;
}

export interface BackfillPlan {
  decisions: RowDecision[];
  ledger: LedgerEntry[];
  /** Counts per bucket, and per exclusion reason — the script's own output. */
  buckets: Record<string, number>;
  exclusionCounts: Record<string, number>;
  /**
   * Rows Direction B would move into the Explorer programme while leaving
   * `explorer_entered_at` NULL. Written as exactly two columns per the plan, so
   * this is DISCLOSED rather than silently patched.
   *
   * NO TASK CURRENTLY OWNS BACKFILLING THIS COLUMN. An earlier version of this
   * comment said T209 did; that was wrong — `plan.md:471` makes T209 the
   * Explorer lifecycle STAGE, and `explorer_entered_at` appears nowhere in the
   * plan at all. T205 added the column (`plan.md:333`). The honest state is
   * that this count is an open item for whoever picks it up, which is why the
   * CLI prints it on every run instead of filing it behind a task number.
   */
  programmeWritesWithoutEntryTimestamp: number;
}

const PAID_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due']);
const DECLARED_PROGRAMMES = new Set(['standard', 'explorer']);

function norm(v: string | null | undefined): string {
  return (v || '').trim().toLowerCase();
}

/**
 * Is this row paying, or holding granted access?
 *
 * The subscription term is not redundant with `payment_status`. A `plan: 'comp'`
 * subscription is an admin-granted seat — `Subscription.ts:13-17`, "Free Access —
 * full program access at $0, never billed" — whose `payment_status` is never
 * 'paid' and whose `amount_paid` is 0. Demoting one to `tier: 'guest'` would
 * strip a seat somebody was given. `past_due` counts as paid for the same
 * reason: a failed charge is a billing problem, not grounds to demote.
 */
function isPaid(row: BackfillRow): boolean {
  if (norm(row.payment_status) === 'paid') return true;
  if (Number(row.amount_paid || 0) > 0) return true;
  return PAID_SUBSCRIPTION_STATUSES.has(norm(row.subscription_status));
}

/** Did this row arrive through the free-AI signup? `freeSignupService.ts:138-139`. */
function hasLearnerProvenance(row: BackfillRow): boolean {
  return norm(row.lead_source) === FREE_SIGNUP_MARKER
    || norm(row.lead_form_type) === FREE_SIGNUP_MARKER;
}

/**
 * EVERY exclusion term that applies, not the first.
 *
 * Returning the full set is what makes the staff union testable. The three staff
 * predicates in this repo disagree — `staffAccess.ts:40` is `role === 'staff'`
 * alone, `staffAccess.ts:61` adds `mgmt_role`, and `staffDetection.ts:16` has no
 * `role` term at all — so a staff member with `role='staff'`, a NULL `mgmt_role`
 * and an external address yields exactly `['staff_role']`. A test can then show
 * that both other predicates would have missed that row, instead of asserting
 * the union is wider in prose.
 */
export function exclusionsFor(row: BackfillRow): ExclusionReason[] {
  const out: ExclusionReason[] = [];
  const email = norm(row.email);

  if (norm(row.status) !== 'active') out.push('not_active');
  if (!DECLARED_PROGRAMMES.has(norm(row.enrollment_type))) out.push('undeclared_programme');

  if (norm(row.payment_status) === 'paid') out.push('paid_status');
  if (Number(row.amount_paid || 0) > 0) out.push('paid_amount');
  if (PAID_SUBSCRIPTION_STATUSES.has(norm(row.subscription_status))) out.push('active_subscription');

  if (row.is_org_member) out.push('org_member');

  if (PROSPECT_LEAD_SOURCES.includes(norm(row.lead_source))
    || norm(row.cohort_name).includes('prospect')) {
    out.push('prospect_account');
  }

  if (AGENT_IDENTITY_EMAILS.includes(email)) out.push('agent_identity');

  if (norm(row.community_role) === 'staff') out.push('staff_role');
  if (row.mgmt_role) out.push('staff_mgmt_role');
  if (email.endsWith('@colaberry.com') && !email.includes('+')) out.push('staff_email');

  return out;
}

/**
 * The decision for one row.
 *
 * Order matters in exactly one place: the paid-and-guest case is checked BEFORE
 * the exclusion short-circuit. That row IS excluded (by `paid_status`), and
 * letting the exclusion win would make it vanish into a skip count. The plan is
 * explicit that it is "reported separately for human decision, not silently
 * skipped and not silently flipped" — so it is reported, and its exclusions are
 * carried along so the report says why it was not written.
 */
export function decideRow(row: BackfillRow): RowDecision {
  const exclusions = exclusionsFor(row);
  const tier = norm(row.tier);
  const programme = norm(row.enrollment_type);
  const shapeA = programme === 'explorer' && tier !== 'guest';
  const shapeB = programme === 'standard' && tier === 'guest';

  if (tier === 'guest' && isPaid(row) && norm(row.status) === 'active') {
    return { id: row.id, action: 'report', bucket: 'paid_and_guest', exclusions };
  }

  if (!shapeA && !shapeB) {
    return { id: row.id, action: 'skip', bucket: 'already_coherent', exclusions };
  }

  if (exclusions.length) {
    return { id: row.id, action: 'skip', bucket: 'excluded', exclusions };
  }

  if (shapeA) {
    return {
      id: row.id,
      action: 'write',
      bucket: 'tier_backfill',
      exclusions,
      patch: { id: row.id, column: 'tier', from: row.tier, to: 'guest' },
    };
  }

  if (!hasLearnerProvenance(row)) {
    return { id: row.id, action: 'report', bucket: 'ambiguous_no_learner_provenance', exclusions };
  }

  return {
    id: row.id,
    action: 'write',
    bucket: 'programme_backfill',
    exclusions,
    patch: { id: row.id, column: 'enrollment_type', from: row.enrollment_type, to: 'explorer' },
  };
}

/**
 * Plan the whole sweep. Pure: it decides and counts, and writes nothing.
 *
 * Idempotency is structural rather than guarded. Both predicates key on the very
 * columns they write — Shape A requires `tier <> 'guest'` and sets `tier` to
 * 'guest'; Shape B requires `enrollment_type = 'standard'` and sets it to
 * 'explorer' — so a row this plan has written can no longer match either shape.
 * A second run over the written rows plans zero writes because there is nothing
 * left for it to select, not because a flag says it already ran.
 */
export function planBackfill(rows: BackfillRow[]): BackfillPlan {
  const decisions = rows.map(decideRow);
  const buckets: Record<string, number> = {};
  const exclusionCounts: Record<string, number> = {};

  for (const d of decisions) {
    buckets[d.bucket] = (buckets[d.bucket] || 0) + 1;
    for (const reason of d.exclusions) {
      exclusionCounts[reason] = (exclusionCounts[reason] || 0) + 1;
    }
  }

  const ledger = decisions
    .filter((d) => d.action === 'write' && d.patch)
    .map((d) => d.patch as LedgerEntry);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const programmeWritesWithoutEntryTimestamp = ledger.filter(
    (e) => e.column === 'enrollment_type' && !byId.get(e.id)?.explorer_entered_at,
  ).length;

  return { decisions, ledger, buckets, exclusionCounts, programmeWritesWithoutEntryTimestamp };
}

/**
 * The documented inverse — ledger-driven, and it has to be.
 *
 * The tempting inverse is predicate-based: "set every `explorer` + `guest` row
 * back to `tier: 'member'`". That is WRONG and would corrupt rows this backfill
 * never touched, because `explorer` + `guest` is also the correct, coherent
 * shape for an Open House $50 deposit holder — `openHouseCreditService.ts:125-126`
 * writes both columns together on purpose. A predicate-based rollback cannot
 * tell those from rows the sweep flipped, since after the sweep they are
 * byte-identical in both columns.
 *
 * So the forward run emits exactly what it changed and the inverse reverts those
 * ids and nothing else. `applied` lets the caller feed back the subset that
 * actually committed, so a run that died halfway inverts only what landed.
 */
export function planInverse(ledger: LedgerEntry[]): LedgerEntry[] {
  return ledger.map((e) => ({ id: e.id, column: e.column, from: e.to, to: e.from }));
}

/** Apply a ledger to in-memory rows. Used by the idempotency and inverse tests. */
export function applyLedger(rows: BackfillRow[], ledger: LedgerEntry[]): BackfillRow[] {
  const patches = new Map<string, LedgerEntry[]>();
  for (const e of ledger) {
    const bucket = patches.get(e.id);
    if (bucket) bucket.push(e);
    else patches.set(e.id, [e]);
  }
  return rows.map((r) => {
    const mine = patches.get(r.id);
    if (!mine) return r;
    return mine.reduce((acc, e) => ({ ...acc, [e.column]: e.to }), { ...r });
  });
}

/**
 * T207 — one test per exclusion, each because of a specific harm, plus the four
 * claims the plan asks to be proved rather than asserted.
 *
 * DESIGN NOTE, because the previous three tasks in this phase failed on evidence
 * rather than behaviour. The baseline fixture is a row the backfill DOES write
 * (Shape B with free-signup provenance). Every exclusion test changes exactly
 * one field and asserts the write becomes a non-write. That makes each test
 * falsifiable by construction: delete the exclusion term from `exclusionsFor`
 * and its test fails, because the baseline proves the suite can see a write at
 * all. A suite whose every assertion is "nothing happened" cannot tell a working
 * exclusion from a broken fixture — that is exactly how T205 shipped an
 * assertion that could never fail.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  AGENT_IDENTITY_EMAILS,
  BackfillRow,
  PROSPECT_LEAD_SOURCES,
  applyLedger,
  decideRow,
  exclusionsFor,
  planBackfill,
  planInverse,
} from '../freeAccountCoherenceBackfill';

/** Explicit type, not a cast: two TS2339s shipped invisibly in T206 behind `as any`. */
const row = (over: Partial<BackfillRow> = {}): BackfillRow => ({
  id: 'enr-baseline',
  email: 'learner@example.com',
  status: 'active',
  tier: 'guest',
  enrollment_type: 'standard',
  payment_status: 'pending',
  amount_paid: 0,
  subscription_status: null,
  is_org_member: false,
  community_role: null,
  mgmt_role: null,
  lead_source: 'free_signup',
  lead_form_type: 'free_signup',
  cohort_name: null,
  explorer_entered_at: null,
  ...over,
});

describe('T207 baseline — the positive control for every exclusion test below', () => {
  it('writes enrollment_type on a free-signup guest+standard row', () => {
    const d = decideRow(row());
    expect(d.action).toBe('write');
    expect(d.bucket).toBe('programme_backfill');
    expect(d.patch).toEqual({
      id: 'enr-baseline', column: 'enrollment_type', from: 'standard', to: 'explorer',
    });
  });

  it('writes tier on a Shape A explorer+member row', () => {
    // 260 rows in production on 2026-10-07 carry exactly this shape.
    const d = decideRow(row({ enrollment_type: 'explorer', tier: 'member' }));
    expect(d.action).toBe('write');
    expect(d.bucket).toBe('tier_backfill');
    expect(d.patch).toEqual({ id: 'enr-baseline', column: 'tier', from: 'member', to: 'guest' });
  });
});

describe('T207 exclusions — each one because of a named harm', () => {
  it('never touches an undeclared programme such as internship', () => {
    // Harm: duplicateAccountSweepService.ts:121-139 — without its internship
    // filter a non-dry sweep "withdraws one of their two legitimate
    // enrollments, moves their points events and unapplied credits, and
    // rewrites their attendance". Two live readers filter on this value
    // (duplicateAccountSweepService.ts:141, duplicateAliasDetector.ts:123) and
    // there is no in-repo writer, so the value arrives from outside the repo.
    const d = decideRow(row({ enrollment_type: 'internship' }));
    expect(d.action).not.toBe('write');
    expect(d.exclusions).toContain('undeclared_programme');
  });

  it('never demotes a paid Shape A row to guest', () => {
    // The 2 production rows at explorer/paid/active. Demoting them would gate a
    // paying student to the free preview week.
    const d = decideRow(row({ enrollment_type: 'explorer', tier: 'member', payment_status: 'paid' }));
    expect(d.action).toBe('skip');
    expect(d.exclusions).toContain('paid_status');
  });

  it('treats a non-zero amount_paid as paid even when payment_status is not', () => {
    const d = decideRow(row({ enrollment_type: 'explorer', tier: 'member', amount_paid: 5000 }));
    expect(d.action).toBe('skip');
    expect(d.exclusions).toContain('paid_amount');
  });

  it('protects a comped seat, which no payment column reveals', () => {
    // Subscription.ts:13-17 — plan 'comp' is "Free Access — full program access
    // at $0, never billed": payment_status is never 'paid' and amount_paid is 0.
    // Without the subscription term this row looks identical to a free learner
    // and the backfill would strip a granted seat.
    const comped = row({
      enrollment_type: 'explorer', tier: 'member',
      payment_status: 'pending', amount_paid: 0, subscription_status: 'active',
    });
    expect(exclusionsFor(comped)).toContain('active_subscription');
    expect(decideRow(comped).action).toBe('skip');
  });

  it('counts past_due as paying, so a failed charge cannot demote a member', () => {
    const d = decideRow(row({
      enrollment_type: 'explorer', tier: 'member', subscription_status: 'past_due',
    }));
    expect(d.action).toBe('skip');
    expect(d.exclusions).toContain('active_subscription');
  });

  it('never conscripts an org teammate into the learner programme', () => {
    // orgService.ts:220,415 pass programme:'standard'. guest+standard is their
    // legitimate resting state — freeAccountRegistration.ts:23-25. 6 such rows
    // in production.
    const d = decideRow(row({ is_org_member: true }));
    expect(d.action).toBe('skip');
    expect(d.exclusions).toContain('org_member');
  });

  it('never routes an AI Flotation prospect onto a learner roster, by lead source', () => {
    // leads/prospectAccount.ts:130-133 — "a commercial relationship", not a
    // learner. Flipping these breaches the standing brand boundary and repeats
    // the mistake freeAccountRegistration.ts:26-28 names. This exclusion is NOT
    // in the plan's table; it was derived from source during T207 discovery.
    const d = decideRow(row({ lead_source: 'ai-flotation', lead_form_type: null }));
    expect(d.action).toBe('skip');
    expect(d.exclusions).toContain('prospect_account');
  });

  it('never routes an AI Flotation prospect onto a learner roster, by cohort', () => {
    // The cohort assignment is best-effort (prospectAccount.ts:102-104 lets the
    // account stand without one), so neither signal alone is sufficient.
    const d = decideRow(row({ cohort_name: 'Explore - Prospects' }));
    expect(d.action).toBe('skip');
    expect(d.exclusions).toContain('prospect_account');
  });

  it('never touches a withdrawn row', () => {
    // 20 production rows are explorer/pending/withdrawn. They are history:
    // explorerIdentityBridge.ts:122 requires status='active'.
    const d = decideRow(row({ enrollment_type: 'explorer', tier: 'member', status: 'withdrawn' }));
    expect(d.action).toBe('skip');
    expect(d.exclusions).toContain('not_active');
  });

  it('never touches a seeded agent identity', () => {
    const d = decideRow(row({ email: 'reese@colaberry.com' }));
    expect(d.action).toBe('skip');
    expect(d.exclusions).toContain('agent_identity');
  });
});

describe('T207 AC3 — the staff union is wider than any single predicate', () => {
  /**
   * The row that proves it, named: `role='staff'`, NULL `mgmt_role`, external
   * address. Staff to the entitlement layer (`staffAccess.ts:40`,
   * `isStaffEnrollment`) and invisible to `staffDetection.ts:16`
   * (`IS_STAFF_SQL`), which carries no `role` term at all. Reusing IS_STAFF_SQL
   * alone — the SQL a backfill would naturally reach for — flips this person
   * onto the free course and locks them to Week 0.
   */
  const staffByRoleOnly = row({
    id: 'staff-role-only', email: 'contractor@gmail.com',
    community_role: 'staff', mgmt_role: null,
  });
  const staffByMgmtOnly = row({
    id: 'staff-mgmt-only', email: 'manager@gmail.com',
    community_role: null, mgmt_role: 'director',
  });
  const staffByEmailOnly = row({
    id: 'staff-email-only', email: 'person@colaberry.com',
    community_role: null, mgmt_role: null,
  });

  it('excludes the role-only staff member that IS_STAFF_SQL cannot see', () => {
    expect(exclusionsFor(staffByRoleOnly)).toEqual(['staff_role']);
    expect(decideRow(staffByRoleOnly).action).toBe('skip');
  });

  it('excludes the mgmt_role-only staff member that isStaffEnrollment cannot see', () => {
    expect(exclusionsFor(staffByMgmtOnly)).toEqual(['staff_mgmt_role']);
    expect(decideRow(staffByMgmtOnly).action).toBe('skip');
  });

  it('excludes the colaberry.com address that neither staffAccess predicate sees', () => {
    expect(exclusionsFor(staffByEmailOnly)).toEqual(['staff_email']);
    expect(decideRow(staffByEmailOnly).action).toBe('skip');
  });

  it('is strictly wider than each single predicate, by count', () => {
    const rows = [staffByRoleOnly, staffByMgmtOnly, staffByEmailOnly];
    const union = rows.filter((r) => exclusionsFor(r).some((e) => e.startsWith('staff_')));
    const byRole = rows.filter((r) => exclusionsFor(r).includes('staff_role'));
    const byMgmt = rows.filter((r) => exclusionsFor(r).includes('staff_mgmt_role'));
    const byEmail = rows.filter((r) => exclusionsFor(r).includes('staff_email'));

    expect(union).toHaveLength(3);
    expect(byRole).toHaveLength(1);
    expect(byMgmt).toHaveLength(1);
    expect(byEmail).toHaveLength(1);
    // The plain-alias exclusion in IS_STAFF_SQL is also preserved: a +alias test
    // persona is NOT staff, per staffDetection.ts:10-14.
    expect(exclusionsFor(row({ email: 'ali+9@colaberry.com' }))).not.toContain('staff_email');
  });
});

describe('T207 AC4 — paid-and-guest is reported, never written and never silently skipped', () => {
  // 0 such rows in production on 2026-10-07; this is a regression guard on
  // T206's fix, not a rescue of live rows.
  const paidGuest = row({ id: 'paid-guest', payment_status: 'paid' });

  it('reports it rather than writing it', () => {
    const d = decideRow(paidGuest);
    expect(d.action).toBe('report');
    expect(d.bucket).toBe('paid_and_guest');
  });

  it('carries the reason it was not written, so the report can explain itself', () => {
    expect(decideRow(paidGuest).exclusions).toContain('paid_status');
  });

  it('contributes nothing to the ledger', () => {
    const plan = planBackfill([paidGuest]);
    expect(plan.ledger).toEqual([]);
    expect(plan.buckets.paid_and_guest).toBe(1);
  });

  /**
   * Added because a mutation survived. Replacing `isPaid`'s subscription term
   * with `return false` left all 27 tests green: `exclusionsFor` computes
   * `active_subscription` independently, so a Shape A comped row still skipped
   * and every assertion held. The ONLY thing `isPaid` decides is whether a
   * `guest` row is REPORTED rather than skipped — and nothing covered that, so
   * a comped seat holder at guest+standard would have been silently skipped.
   * That is the exact outcome the plan forbids for this family of rows.
   */
  it('reports a comped guest row instead of skipping it, which no payment column reveals', () => {
    const comped = row({
      id: 'comped-guest',
      payment_status: 'pending',
      amount_paid: 0,
      subscription_status: 'active',
      lead_source: null,
      lead_form_type: null,
    });
    const d = decideRow(comped);
    expect(d.action).toBe('report');
    expect(d.bucket).toBe('paid_and_guest');
    expect(d.exclusions).toContain('active_subscription');
  });
});

describe('T207 — the ambiguous bucket is reported, not guessed in either direction', () => {
  it('reports a guest+standard row with no learner provenance', () => {
    // 35 production rows match no lead by email, plus 2 with a non-free_signup
    // source. The shape cannot establish that the person asked for the course.
    const d = decideRow(row({ lead_source: null, lead_form_type: null }));
    expect(d.action).toBe('report');
    expect(d.bucket).toBe('ambiguous_no_learner_provenance');
    expect(d.exclusions).toEqual([]);
  });

  it('accepts form_type as provenance when the caller overrode source', () => {
    // freeSignupService.ts:138-139 — the caller's source wins, so a named entry
    // point leaves source != 'free_signup' while form_type still defaults to it.
    const d = decideRow(row({ lead_source: 'website', lead_form_type: 'free_signup' }));
    expect(d.action).toBe('write');
  });
});

describe('T207 AC5 — a second run is a no-op', () => {
  it('plans zero writes after its own ledger is applied', () => {
    const rows = [
      row({ id: 'a', enrollment_type: 'explorer', tier: 'member' }),
      row({ id: 'b' }),
      row({ id: 'c', is_org_member: true }),
    ];
    const first = planBackfill(rows);
    expect(first.ledger).toHaveLength(2);

    const second = planBackfill(applyLedger(rows, first.ledger));
    expect(second.ledger).toHaveLength(0);
    expect(second.buckets.already_coherent).toBe(2);
  });
});

describe('T207 — the disclosure offered INSTEAD of writing explorer_entered_at', () => {
  /**
   * This count is the whole substitute for not writing the column, and a
   * verifier found it untested: hardcoding it to 0 left the suite green, so a
   * silently-zero disclosure would have told an operator nothing while looking
   * exactly like "no affected rows".
   */
  it('counts programme writes that leave explorer_entered_at NULL', () => {
    const plan = planBackfill([
      row({ id: 'null-ts', explorer_entered_at: null }),
      row({ id: 'has-ts', explorer_entered_at: new Date('2026-07-19T00:00:00Z') }),
      // A tier backfill is not a programme write and must not be counted.
      row({ id: 'tier-only', enrollment_type: 'explorer', tier: 'member', explorer_entered_at: null }),
    ]);
    expect(plan.ledger).toHaveLength(3);
    expect(plan.programmeWritesWithoutEntryTimestamp).toBe(1);
  });

  it('is zero when every programme write already carries a timestamp', () => {
    const plan = planBackfill([row({ explorer_entered_at: new Date() })]);
    expect(plan.ledger).toHaveLength(1);
    expect(plan.programmeWritesWithoutEntryTimestamp).toBe(0);
  });
});

describe('T207 — PROSPECT_LEAD_SOURCES cannot drift from the service it mirrors', () => {
  /**
   * The constant duplicates `prospectAccount.PROSPECT_ACCOUNT_SOURCES`. A
   * comment saying it "mirrors" that list is not a mechanism: a second prospect
   * source added there would silently un-protect that population here. Derived
   * from source rather than pinned by hand, for the same reason the agent-email
   * tripwire is.
   */
  it('contains every source prospectAccount.ts mints an account for', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'services/leads/prospectAccount.ts'),
      'utf8',
    );
    const decl = /PROSPECT_ACCOUNT_SOURCES[^=]*=\s*\[([^\]]*)\]/.exec(src);
    expect(decl).not.toBeNull();
    const declared = Array.from(decl![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const source of declared) {
      expect(PROSPECT_LEAD_SOURCES).toContain(source);
      // And it must actually exclude a row carrying that source.
      expect(exclusionsFor(row({ lead_source: source, lead_form_type: null })))
        .toContain('prospect_account');
    }
  });
});

describe('T207 AC6/AC8 — the inverse, and why it is ledger-driven', () => {
  it('restores every written row to its exact prior value', () => {
    const rows = [
      row({ id: 'a', enrollment_type: 'explorer', tier: 'member' }),
      row({ id: 'b' }),
    ];
    const forward = planBackfill(rows);
    const restored = applyLedger(applyLedger(rows, forward.ledger), planInverse(forward.ledger));
    expect(restored).toEqual(rows);
  });

  it('leaves an always-coherent explorer+guest row alone, which a predicate inverse would not', () => {
    // openHouseCreditService.ts:125-126 writes enrollment_type:'explorer' AND
    // tier:'guest' together, so a $50 deposit holder is legitimately coherent.
    // After the sweep that row is byte-identical to one the sweep flipped, so
    // "set every explorer+guest row back to member" would corrupt it. The
    // ledger is the only thing that can tell them apart.
    const deposit = row({ id: 'deposit', enrollment_type: 'explorer', tier: 'guest' });
    const flipped = row({ id: 'flipped', enrollment_type: 'explorer', tier: 'member' });

    const forward = planBackfill([deposit, flipped]);
    expect(forward.ledger.map((e) => e.id)).toEqual(['flipped']);

    const inverse = planInverse(forward.ledger);
    expect(inverse.map((e) => e.id)).not.toContain('deposit');

    const after = applyLedger(applyLedger([deposit, flipped], forward.ledger), inverse);
    expect(after.find((r) => r.id === 'deposit')).toEqual(deposit);
  });
});

describe('T207 — the agent-identity list cannot go stale without failing this build', () => {
  // NOTE (2026-10-27): this list is HARDCODED, so a brand-new seed file is invisible to the
  // drift guard until somebody adds it here — which is the opposite of what
  // `AGENT_IDENTITY_EMAILS`'s docblock promises ("re-derives these literals from the seed files
  // ... so the protection does not depend on anybody remembering"). `mayaIdentitySeed.ts` was the
  // first file to expose that: it introduced a new agent address and this guard stayed silent.
  // Adding it here closes the case; deriving this list by globbing `*IdentitySeed.ts` would close
  // the CLASS, and is left as its own change because it alters how every future agent is
  // validated.
  const SEEDS = [
    'services/reese/reeseIdentitySeed.ts',
    'services/curriculum/daraIdentitySeed.ts',
    'services/agentBlueprint/ticketCreatorIdentitySeed.ts',
    'services/agentBlueprint/agentIdentitySeed.ts',
    'services/mayaIdentitySeed.ts',
  ];

  /**
   * Comments are stripped before scanning. `daraIdentitySeed.ts:24` mentions
   * 'swati@colaberry.com' in prose — a human, not an agent identity — and a
   * scanner that reads its own comments is the defect T203 and T205 both hit.
   */
  const stripComments = (s: string): string => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const read = (rel: string): string => fs.readFileSync(
    path.join(__dirname, '..', '..', '..', rel), 'utf8',
  );

  it('strips comments but keeps code — the two-way control on the stripper', () => {
    const dara = stripComments(read('services/curriculum/daraIdentitySeed.ts'));
    expect(dara).not.toContain('swati@colaberry.com');   // was in a comment
    expect(dara).toContain("DARA_EMAIL = 'dara@colaberry.com'"); // is code
  });

  it('pins every hardcoded agent address found in the seed files', () => {
    const found = new Set<string>();
    for (const rel of SEEDS) {
      const src = stripComments(read(rel));
      for (const m of src.matchAll(/'([a-z0-9._+-]+@colaberry\.com)'/g)) found.add(m[1]);
    }
    expect(found.size).toBeGreaterThan(0);
    for (const email of found) expect(AGENT_IDENTITY_EMAILS).toContain(email);
  });

  it('excludes a dynamically named agent the pinned list CANNOT contain', () => {
    // ticketCreatorIdentitySeed.ts:232 builds `${agentName.toLowerCase()}@colaberry.com`,
    // so the set of agent addresses is open-ended and no literal list can be
    // complete. The staff-email term is what actually protects them; the pinned
    // list only makes the named ones explicit. Stated here so nobody later
    // mistakes AGENT_IDENTITY_EMAILS for an exhaustive set.
    const dynamic = row({ email: 'somebrandnewagent@colaberry.com' });
    expect(AGENT_IDENTITY_EMAILS).not.toContain('somebrandnewagent@colaberry.com');
    expect(exclusionsFor(dynamic)).toContain('staff_email');
    expect(decideRow(dynamic).action).toBe('skip');
  });
});

/**
 * Launch readiness (Phase 6, T610).
 *
 * Three fixture worlds - all off, the Phase 4 moves done, and ready - then the three
 * rules that make the output worth reading: order decides `next_move`, a `null` is
 * counted neither way, and the score is `null` rather than 0 when nothing is known.
 */

const agentFindOne = jest.fn();
const brandFindAll = jest.fn();
const campaignFindOne = jest.fn();
const contentRuleCount = jest.fn();
const controlCount = jest.fn();
const policyFindAll = jest.fn();
const programFindAll = jest.fn();
const settingFindOne = jest.fn();
const membershipCount = jest.fn();
const query = jest.fn();
// MR3 added five items; three of them read tables this fixture did not supply.
const programCount = jest.fn();
const classificationCount = jest.fn();
const enrollmentCount = jest.fn();
const decisionCount = jest.fn();

jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
jest.mock('../../../../models', () => ({
  AiAgent: { findOne: (...a: unknown[]) => agentFindOne(...a) },
  Brand: { findAll: (...a: unknown[]) => brandFindAll(...a) },
  Campaign: { findOne: (...a: unknown[]) => campaignFindOne(...a) },
  GrowthJourneyContentRule: { count: (...a: unknown[]) => contentRuleCount(...a) },
  GrowthJourneyExecutionControl: { count: (...a: unknown[]) => controlCount(...a) },
  GrowthJourneyPolicy: { findAll: (...a: unknown[]) => policyFindAll(...a) },
  JourneyProgram: {
    findAll: (...a: unknown[]) => programFindAll(...a),
    count: (...a: unknown[]) => programCount(...a),
  },
  GrowthJourneyClassification: { count: (...a: unknown[]) => classificationCount(...a) },
  GrowthJourneyEnrollment: { count: (...a: unknown[]) => enrollmentCount(...a) },
  GrowthJourneyDecision: { count: (...a: unknown[]) => decisionCount(...a) },
  SystemSetting: { findOne: (...a: unknown[]) => settingFindOne(...a) },
  TenantMembership: { count: (...a: unknown[]) => membershipCount(...a) },
}));

import { ALI_OUTREACH_CAMPAIGN_KEY, EXPLORER_CAMPAIGN_KEYS, FLOW_CAMPAIGN_KEYS } from '../../execution/campaignKeys';
import fs from 'fs';
import path from 'path';

import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../../../agentRegistry/growthJourneyAgents';
import {
  APPROVED_RULE_STATUS,
  buildReadiness,
  FIELD_CAP,
  LEDGER_INDEXES,
  REQUIRED_QUEUES,
  scoreOf,
  scrubField,
  scrubReadiness,
  type ReadinessKey,
} from '../buildReadiness';

const NOW = new Date('2026-09-29T18:00:00.000Z');
const row = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });

const FLAGS_OFF = {
  growthJourneyEnabled: false, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false,
} as never;
const FLAGS_ON = {
  growthJourneyEnabled: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true,
} as never;
/**
 * The master off while every sub-flag is ON. This is the ONLY world in which the
 * sanctioned reader and a direct sub-flag read disagree, and without it a mutation
 * that bypassed `isGrowthJourneyCapabilityEnabled` survived the whole gauntlet: the
 * dark-launch guard could not see it either, because `flags[capability]` is bracket
 * access with a computed key and the guard scans for DOTTED reads.
 */
/**
 * The Explorer family, which gates two of the three journey channels. Separate from the growth
 * flags because they are a separate switch set with a separate owner, and the readiness item
 * reads them through `isExplorerFeatureEnabled` so the master is honoured.
 */
const EXPLORER_OFF = { growthOsEnabled: false, inAppNudgeEnabled: false, aliOutreachEnabled: false } as never;
const EXPLORER_ON = { growthOsEnabled: true, inAppNudgeEnabled: true, aliOutreachEnabled: true } as never;

const MASTER_OFF_SUBFLAGS_ON = {
  growthJourneyEnabled: false, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true,
} as never;

/** World 1: nothing done. Every read answers empty. */
function worldAllOff(): void {
  agentFindOne.mockResolvedValue(null);
  programFindAll.mockResolvedValue([]);
  contentRuleCount.mockResolvedValue(0);
  policyFindAll.mockResolvedValue([]);
  membershipCount.mockResolvedValue(0);
  settingFindOne.mockResolvedValue(null);
  campaignFindOne.mockResolvedValue(null);
  controlCount.mockResolvedValue(0);
  query.mockResolvedValue([]);
  // World 1 means NOTHING done, so every one of these is empty too. Production's actual state
  // is different and more interesting - 220 enrolled against 0 classified - and it gets its own
  // describe block rather than being smuggled in here, where it would make one item ready and
  // quietly break this world's "every knowable item is blocked" premise.
  programCount.mockResolvedValue(0);
  enrollmentCount.mockResolvedValue(0);
  classificationCount.mockResolvedValue(0);
  decisionCount.mockResolvedValue(0);
}

/** World 2: the Phase 4 moves are done - memberships, content rules, queues, the kill-switch row. */
function worldPhase4Done(): void {
  worldAllOff();
  programFindAll.mockResolvedValue([row({ brand_id: 'b-cpn', kind: 'learner' }), row({ brand_id: 'b-training', kind: 'learner' })]);
  contentRuleCount.mockResolvedValue(3);
  policyFindAll.mockResolvedValue(
    REQUIRED_QUEUES.flatMap((q) => [
      row({ policy_type: 'queue_capacity', owner_queue: q }),
      row({ policy_type: 'queue_assignee', owner_queue: q }),
    ]),
  );
  membershipCount.mockResolvedValue(12);
  settingFindOne.mockResolvedValue(row({ value: false }));
  query.mockResolvedValue(LEDGER_INDEXES.map((indexname) => ({ indexname })));
}

/** World 3: everything an operator can do is done. Only `tests_green` stays unknown. */
function worldReady(): void {
  worldPhase4Done();
  agentFindOne.mockResolvedValue(row({ enabled: true }));
  campaignFindOne.mockResolvedValue(row({ status: 'active', approval_status: 'approved' }));
  controlCount.mockResolvedValue(1);
  programCount.mockResolvedValue(4);
  enrollmentCount.mockResolvedValue(220);
  classificationCount.mockResolvedValue(180);
  decisionCount.mockResolvedValue(42);
}

const byKey = (items: Array<{ key: ReadinessKey; ready: boolean | null }>) =>
  Object.fromEntries(items.map((i) => [i.key, i.ready]));

beforeEach(() => jest.clearAllMocks());

describe('world 1: nothing done', () => {
  it('every knowable item is blocked, tests_green is unknown, and the first move is the master flag', async () => {
    worldAllOff();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    expect(r.items).toHaveLength(22);
    expect(r.next_move).toBe('master_flag');
    expect(r.score.ready).toBe(0);
    expect(r.score.known).toBe(21);
    expect(r.score.unknown).toBe(1);
    expect(r.score.pct).toBe(0);
    expect(byKey(r.items).tests_green).toBeNull();
  });

  it('content_rules is NOT ready when no learner programme exists, and the reason says that rather than "0 of 0"', async () => {
    worldAllOff();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    // Deliberately `false` and not `true`: with no learner programme there is nothing
    // to add rules to, so the item cannot be satisfied by doing what its next_move
    // says - but a learner journey with no learner programme is certainly not ready to
    // launch either, and answering `true` here would let the score claim otherwise.
    // The reason names the real situation so the checklist is not misleading about WHY.
    expect(byKey(r.items).content_rules).toBe(false);
    expect(r.items.find((i) => i.key === 'content_rules')!.reason).toContain('no learner programme exists');
    expect(r.items.find((i) => i.key === 'content_rules')!.reason).not.toContain('0 of 0');
  });

  it('a missing kill-switch ROW is not ready, and the reason says an absent row reads as OFF', async () => {
    worldAllOff();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    const k = r.items.find((i) => i.key === 'kill_switch_row')!;
    expect(k.ready).toBe(false);
    expect(k.reason).toContain('no system_kill_switch row exists');
    // The first version said "the readers fail closed, which is safe". That is BACKWARDS:
    // `system_kill_switch` is not in settingsService's DEFAULTS, so `getSetting` returns
    // null and both readers answer false - permissive, not fail-closed. launchSafety.ts's
    // own header says so, and says a readiness check "could not tell off from never set",
    // which is this exact item. The verdict was always right; the sentence was inverted.
    expect(k.reason).toContain('infer OFF from an absent row');
    expect(k.reason).toContain('indistinguishable');
    expect(k.reason).not.toContain('fail closed');
  });

  it('every item carries a non-empty reason AND a non-empty next_move, blocked or not (the plan\'s M1)', async () => {
    worldAllOff();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    for (const i of r.items) {
      expect(i.reason.trim().length).toBeGreaterThan(0);
      expect(i.next_move.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('world 2: the Phase 4 moves are done', () => {
  it('the operator items pass and the next move moves on to the flags', async () => {
    worldPhase4Done();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    const k = byKey(r.items);
    expect(k.content_rules).toBe(true);
    expect(k.queue_policies).toBe(true);
    expect(k.memberships).toBe(true);
    expect(k.kill_switch_row).toBe(true);
    expect(k.ledger_indexes).toBe(true);
    // still blocked on the flags, which come first in the order
    expect(r.next_move).toBe('master_flag');
  });

  it('with the flags on, the next move is the first agent row', async () => {
    worldPhase4Done();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    expect(byKey(r.items).master_flag).toBe(true);
    expect(byKey(r.items).probe_scopes).toBe(true);
    expect(r.next_move).toBe('nightly_enabled');
  });

  it('a partially-staffed queue is NOT ready, and names exactly what is missing', async () => {
    worldPhase4Done();
    policyFindAll.mockResolvedValue([row({ policy_type: 'queue_capacity', owner_queue: 'sales' })]);
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const q = r.items.find((i) => i.key === 'queue_policies')!;
    expect(q.ready).toBe(false);
    expect(q.reason).toContain('queue_assignee:sales');
    expect(q.reason).toContain('queue_capacity:solution_architect');
    expect(q.reason).not.toContain('queue_capacity:sales');
  });

  it('one learner brand without rules blocks the item and the count says so', async () => {
    worldPhase4Done();
    contentRuleCount.mockResolvedValueOnce(2).mockResolvedValue(0);
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const c = r.items.find((i) => i.key === 'content_rules')!;
    expect(c.ready).toBe(false);
    expect(c.reason).toBe('1 of 2 learner brand(s) have at least one APPROVED content rule');
  });

  it('a missing ledger index is named, from pg_indexes rather than from a file', async () => {
    worldPhase4Done();
    query.mockResolvedValue([{ indexname: LEDGER_INDEXES[0] }]);
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const idx = r.items.find((i) => i.key === 'ledger_indexes')!;
    expect(idx.ready).toBe(false);
    expect(idx.reason).toContain(LEDGER_INDEXES[1]);
    expect(idx.reason).toContain(LEDGER_INDEXES[2]);
    expect(String(query.mock.calls[0][0])).toContain('pg_indexes');
  });

  it('the kill switch being ON is a different failure from the row being absent', async () => {
    worldPhase4Done();
    settingFindOne.mockResolvedValue(row({ value: true }));
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const k = r.items.find((i) => i.key === 'kill_switch_row')!;
    expect(k.ready).toBe(false);
    expect(k.reason).toContain('the kill switch is ON');
  });

  it("a kill switch stored as the STRING 'true' is still on", async () => {
    worldPhase4Done();
    settingFindOne.mockResolvedValue(row({ value: 'true' }));
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    expect(r.items.find((i) => i.key === 'kill_switch_row')!.ready).toBe(false);
  });
});

describe('world 3: ready', () => {
  it('everything knowable is ready, the score is 100, and next_move is null', async () => {
    worldReady();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const blocked = r.items.filter((i) => i.ready === false).map((i) => i.key);
    expect(blocked).toEqual([]);
    expect(r.next_move).toBeNull();
    expect(r.score).toEqual({ ready: 21, known: 21, unknown: 1, pct: 100 });
  });

  it('tests_green stays unknown even in the ready world, and is never claimed green', async () => {
    worldReady();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const t = r.items.find((i) => i.key === 'tests_green')!;
    expect(t.ready).toBeNull();
    expect(t.reason).toContain('not readable from here');
    // the unknown is excluded from BOTH sides, so it cannot flatter or drag the score
    expect(r.score.known).toBe(21);
    expect(r.score.pct).toBe(100);
  });

  it("a campaign at approval_status 'live' counts as approved", async () => {
    worldReady();
    campaignFindOne.mockResolvedValue(row({ status: 'active', approval_status: 'live' }));
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    // requiring the exact string 'approved' would report the most-launched campaigns
    // on the platform as the ones blocking launch
    expect(byKey(r.items).explorer_campaigns).toBe(true);
    expect(byKey(r.items).flow_drafts).toBe(true);
  });

  it("a campaign approved but not active is NOT ready, and the count distinguishes exist from live", async () => {
    worldReady();
    campaignFindOne.mockResolvedValue(row({ status: 'draft', approval_status: 'approved' }));
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const e = r.items.find((i) => i.key === 'explorer_campaigns')!;
    expect(e.ready).toBe(false);
    expect(e.reason).toBe(`0 of ${EXPLORER_CAMPAIGN_KEYS.length} Explorer campaigns are stamped, approved and active (${EXPLORER_CAMPAIGN_KEYS.length} exist)`);
  });
});

describe('the two items that answered wrongly on a real database', () => {
  it('a learner brand whose rules are all DRAFT is BLOCKED, and the count query says approved', async () => {
    // The bug: the count ignored `approval_status` while `contentEligibility.ts:251`
    // refuses any rule that is not 'approved' - and the column defaults to 'draft'. So a
    // brand with nothing but drafts read READY while every content decision for it would
    // be refused. The item's own next_move already said "approved".
    worldPhase4Done();
    contentRuleCount.mockResolvedValue(0); // no APPROVED rules, whatever else exists
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    expect(byKey(r.items).content_rules).toBe(false);

    // and the predicate is the point, not just the answer
    const where = contentRuleCount.mock.calls[0][0].where;
    expect(where.approval_status).toBe('approved');
    expect(where.brand_id).toBe('b-cpn');
  });

  it('the rule status this reader requires is the one the content gate enforces', () => {
    // If these two ever drift, the checklist and the decision path disagree about what
    // "ready" means. contentEligibility.ts's ALLOWED_RULE_STATUS is 'approved'.
    expect(APPROVED_RULE_STATUS).toBe('approved');
  });

  it('LEDGER_INDEXES names exactly the indexes ensureMultiTenantSchema creates on event_ledger', () => {
    // The names are duplicated from the ensure - the only way to check an index EXISTS
    // rather than that a file mentions it. This ties the two together, so renaming one
    // there fails here instead of leaving a permanent false failure with no explanation.
    const ensure = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', 'db', 'ensureMultiTenantSchema.ts'),
      'utf8',
    );
    const created = [...ensure.matchAll(/CREATE INDEX CONCURRENTLY IF NOT EXISTS (\w+) ON event_ledger/g)].map((m) => m[1]);
    expect(created).toHaveLength(3);
    expect([...LEDGER_INDEXES].sort()).toEqual([...created].sort());
  });

  it('the two agent names are taken FROM the registry, not retyped', () => {
    // An earlier version imported the registry and then hard-coded both strings anyway,
    // which made the claim to reuse it untrue and would have survived a rename there.
    const names = GROWTH_JOURNEY_AGENT_ENTRIES.map((e) => e.agent_name);
    expect(names).toContain('GrowthJourneyShadowDecisions');
    expect(names).toContain('GrowthJourneyExecutor');
  });
});

describe('the capability items go through the sanctioned reader, not the object', () => {
  it('master OFF with every sub-flag ON -> all three capability items are BLOCKED, and say the master gates them', async () => {
    // The cell that kills a bypass of `isGrowthJourneyCapabilityEnabled`. A direct
    // read - dotted or bracketed - answers `true` here, because the sub-flag is set;
    // the sanctioned reader answers `false`, because it AND-s with the master. Every
    // other fixture sets the master and the sub-flags together, so this is the only
    // world in which the two can be told apart.
    worldReady();
    const r = await buildReadiness({ now: NOW, flags: MASTER_OFF_SUBFLAGS_ON });
    const k = byKey(r.items);
    expect(k.master_flag).toBe(false);
    expect(k.decisions_flag).toBe(false);
    expect(k.handoffs_flag).toBe(false);
    expect(k.execution_flag).toBe(false);
    for (const key of ['decisions_flag', 'handoffs_flag', 'execution_flag'] as ReadinessKey[]) {
      const i = r.items.find((x) => x.key === key)!;
      expect(i.reason).toContain('gated by the master flag');
      // and the next move must not send someone to set a variable that is already set
      expect(i.next_move).toContain('turn the master flag on first');
    }
  });

  it('master ON -> the same three items are ready, so the reader is not just always false', async () => {
    worldReady();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const k = byKey(r.items);
    expect(k.decisions_flag).toBe(true);
    expect(k.handoffs_flag).toBe(true);
    expect(k.execution_flag).toBe(true);
  });
});

describe('the three rules that make the list worth reading', () => {
  it('ORDER decides next_move: the first blocked item wins, not the worst one (the plan\'s M2)', async () => {
    worldReady();
    // block two items far apart in the list; the EARLIER one must be the next move
    settingFindOne.mockResolvedValue(null); // kill_switch_row, item 10
    controlCount.mockResolvedValue(0); // review_rollout, item 14
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    expect(r.next_move).toBe('kill_switch_row');
  });

  it('the item order is the dependency sequence, pinned by name', async () => {
    worldAllOff();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    expect(r.items.map((i) => i.key)).toEqual([
      'master_flag', 'decisions_flag', 'nightly_enabled',
      // MR3: the decider's input sits here, immediately after the switches that let it run and
      // before everything that consumes a decision. `classifications_present` is the item that
      // answers "why has it never decided anything", so it has to be read before the execution
      // half, not after it.
      'enrollments_present', 'classifications_present',
      'content_rules', 'queue_policies',
      'memberships', 'handoffs_flag',
      // MR3: an active programme gates EXECUTION only - the nightly decider accepts draft - so
      // it belongs with the execution items rather than up with the decision ones.
      'programmes_active', 'execution_flag', 'explorer_channel_flags',
      'executor_enabled', 'kill_switch_row',
      'explorer_campaigns', 'ali_campaign', 'flow_drafts', 'review_rollout',
      // MR3: downstream of the rollout, because the rollout is what causes a decision to be
      // stamped live in the first place.
      'decisions_mode_split',
      'probe_scopes',
      'ledger_indexes', 'tests_green',
    ]);
  });

  it('a null is counted NEITHER as ready NOR in the denominator (the plan\'s M3)', async () => {
    worldReady();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const nulls = r.items.filter((i) => i.ready === null).length;
    expect(nulls).toBe(1);
    expect(r.score.known).toBe(r.items.length - nulls);
    expect(r.score.ready).toBeLessThanOrEqual(r.score.known);
    // the giveaway if a null were counted ready: 22/22
    expect(r.score.ready).not.toBe(r.items.length);
  });

  it('the score is NULL, never 0, when nothing is knowable - asserted on the REAL function', async () => {
    // The all-unknowable case is not reachable through buildReadiness (tests_green is
    // the only hard-coded null), so scoreOf is exported and called directly. The first
    // version of this cell reimplemented the arithmetic, which made it a check that
    // could not fail no matter what the source did.
    const unknown = (key: string) => ({ key, ready: null, reason: 'r', next_move: 'n' });
    expect(scoreOf([unknown('a'), unknown('b')] as never).pct).toBeNull();
    expect(scoreOf([unknown('a'), unknown('b')] as never).known).toBe(0);
    expect(scoreOf([unknown('a'), unknown('b')] as never).unknown).toBe(2);
  });

  it('scoreOf counts a null neither as ready nor in the denominator', () => {
    const items = [
      { key: 'a', ready: true, reason: 'r', next_move: 'n' },
      { key: 'b', ready: false, reason: 'r', next_move: 'n' },
      { key: 'c', ready: null, reason: 'r', next_move: 'n' },
    ];
    expect(scoreOf(items as never)).toEqual({ ready: 1, known: 2, unknown: 1, pct: 50 });
  });

  it('scoreOf rounds rather than truncating, so 2 of 3 is 67 and not 66', () => {
    const mk = (ready: boolean) => ({ key: 'k', ready, reason: 'r', next_move: 'n' });
    expect(scoreOf([mk(true), mk(true), mk(false)] as never).pct).toBe(67);
  });

  it('the report carries as_of, so a point-in-time answer says when', async () => {
    worldAllOff();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    expect(r.as_of).toBe(NOW.toISOString());
  });
});

describe('every authored reason fits under the cap', () => {
  it('no reason or next_move the reader produces is long enough to be truncated', async () => {
    // FIELD_CAP is 200 and the longest authored reason is ~171, so the headroom is thin.
    // Without this cell a slightly longer future reason would be silently cut to 200 and
    // nothing would say so - the same class of quiet wrongness as a floor served as a total.
    worldAllOff();
    const off = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    const on = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    const texts = [...off.items, ...on.items].flatMap((i) => [i.reason, i.next_move]);
    const longest = texts.reduce((a, b) => (b.length > a.length ? b : a));
    expect(longest.length).toBeLessThanOrEqual(FIELD_CAP);
    for (const t of texts) expect(scrubField(t)).toBe(t);
  });
});

describe('the scrubber, which both serving surfaces share', () => {
  it('an `@` replaces the WHOLE value, because masking is not enough for this bar', () => {
    // redactForLogs would answer `s***@example.com` - the `@` survives - and the Phase 6
    // bar is "`@` anywhere in a JSON response of a new route fails the phase".
    expect(scrubField('contact someone@example.com now')).toBe('redacted - the value carried an address');
    expect(scrubField('journey decisions are enabled')).toBe('journey decisions are enabled');
  });

  it('a long value is capped, because the `@` rule alone would not catch one', () => {
    const out = scrubField('x'.repeat(FIELD_CAP + 50));
    expect(out).toHaveLength(FIELD_CAP + 3);
    expect(out.endsWith('...')).toBe(true);
  });

  it('scrubReadiness scrubs both free-text fields of every item and leaves the rest exact', () => {
    const r = {
      items: [
        { key: 'memberships', ready: false, reason: 'contact a@b.co', next_move: 'mail c@d.co' },
        { key: 'master_flag', ready: true, reason: 'on', next_move: 'nothing' },
      ],
      score: { ready: 1, known: 2, unknown: 0, pct: 50 },
      next_move: 'memberships',
      as_of: '2026-09-29T18:00:00.000Z',
    };
    const out = scrubReadiness(r as never);
    expect(JSON.stringify(out)).not.toContain('@');
    expect(out.items[1].reason).toBe('on');
    // the envelope is untouched: a redactor over a serialised document is what mangles UUIDs
    expect(out.score).toEqual(r.score);
    expect(out.as_of).toBe(r.as_of);
    expect(out.next_move).toBe('memberships');
  });
});

describe('it reads and never writes', () => {
  it('no create, update or destroy is reachable: the mocked models expose none', async () => {
    worldReady();
    await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    // The model mocks above define ONLY the read methods this reader may use. A write
    // would throw "is not a function" rather than pass, which is the point of listing
    // them one by one instead of using a permissive auto-mock.
    const mocked = jest.requireMock('../../../../models') as Record<string, Record<string, unknown>>;
    for (const model of Object.values(mocked)) {
      for (const method of ['create', 'update', 'destroy', 'upsert', 'bulkCreate']) {
        expect(model[method]).toBeUndefined();
      }
    }
  });

  it('no address can reach the report: every reason is authored text plus ids and counts', async () => {
    worldPhase4Done();
    programFindAll.mockResolvedValue([row({ brand_id: 'someone@example.com', kind: 'learner' })]);
    policyFindAll.mockResolvedValue([row({ policy_type: 'queue_capacity', owner_queue: 'sales@example.com' })]);
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON, explorerFlags: EXPLORER_ON });
    // brand ids are never interpolated into a reason, and the queue names in a reason
    // come from REQUIRED_QUEUES - the code's own list - not from the row
    expect(JSON.stringify(r)).not.toContain('@example.com');
  });
});

/**
 * MR3. The five items added because the list could not say why the engine had never decided
 * anything, driven against the state actually measured in production on 2026-11-12.
 */
describe('MR3: production as measured, where 220 people are enrolled and nothing is decidable', () => {
  /** Master and decisions on, execution off: the "decisions only" state, which is reachable. */
  const DECISIONS_ONLY = {
    growthJourneyEnabled: true, journeyDecisions: true, journeyHandoffs: false, journeyExecution: false,
  } as never;

  /** 4 programmes, none active; 220 enrolled; 0 classified; 0 decisions. All query results. */
  function worldAsMeasured(): void {
    worldAllOff();
    agentFindOne.mockResolvedValue(row({ enabled: true }));
    programCount.mockImplementation((args?: { where?: { status?: string } }) => Promise.resolve(
      args?.where?.status === 'active' ? 0 : 4,
    ));
    enrollmentCount.mockResolvedValue(220);
    classificationCount.mockResolvedValue(0);
    decisionCount.mockResolvedValue(0);
  }

  it('the first move is CLASSIFICATION, not the execution flag', async () => {
    // THE LOAD-BEARING ASSERTION OF THIS BLOCK. The advice everyone reaches for is "turn on
    // execution". With zero classification rows that produces silence, which reads as a broken
    // deploy. The checklist now says so before anybody flips anything.
    worldAsMeasured();

    const r = await buildReadiness({ now: NOW, flags: DECISIONS_ONLY, explorerFlags: EXPLORER_OFF });

    expect(r.next_move).toBe('classifications_present');
    expect(r.next_move).not.toBe('execution_flag');
  });

  it('and it says why: the decider reads classifications, not the 220 enrollments', async () => {
    worldAsMeasured();

    const r = await buildReadiness({ now: NOW, flags: DECISIONS_ONLY, explorerFlags: EXPLORER_OFF });
    const items = Object.fromEntries(r.items.map((i) => [i.key, i]));

    expect(items.classifications_present.ready).toBe(false);
    expect(items.classifications_present.reason).toMatch(/subject_ref/);
    expect(items.classifications_present.reason).toMatch(/220 enrolled people are not a queue/);
    // The enrollment item is ready, and says plainly that being ready does not make anybody
    // decidable. The two sit next to each other so the gap reads on one screen.
    expect(items.enrollments_present.ready).toBe(true);
    expect(items.enrollments_present.reason).toMatch(/NOT the decider's input/);
  });

  it('programmes_active blocks EXECUTION only, and the reason says the decider accepts draft', async () => {
    // The correction that saves a wasted step: activating a programme is not a prerequisite for
    // decisions, because runShadowDecisionsNightly accepts draft|active|paused. Only the
    // executor requires active.
    worldAsMeasured();

    const r = await buildReadiness({ now: NOW, flags: DECISIONS_ONLY, explorerFlags: EXPLORER_OFF });
    const programmes = r.items.find((i) => i.key === 'programmes_active');

    expect(programmes?.ready).toBe(false);
    expect(programmes?.reason).toMatch(/0 of 4/);
    expect(programmes?.reason).toMatch(/accepts draft/);
    expect(programmes?.next_move).toMatch(/human decision/);
  });

  it('decisions_mode_split distinguishes "none exist" from "all shadow"', async () => {
    // A bare count would read the same in both cases, and they need different next moves.
    worldAsMeasured();
    const none = await buildReadiness({ now: NOW, flags: DECISIONS_ONLY, explorerFlags: EXPLORER_OFF });
    expect(none.items.find((i) => i.key === 'decisions_mode_split')?.reason)
      .toMatch(/no decisions exist at all/);

    // 612 shadow decisions and not one live: the Explorer side's real history.
    decisionCount.mockImplementation((args?: { where?: { mode?: string } }) => Promise.resolve(
      args?.where?.mode === 'live' ? 0 : 612,
    ));
    const allShadow = await buildReadiness({ now: NOW, flags: DECISIONS_ONLY, explorerFlags: EXPLORER_OFF });
    const split = allShadow.items.find((i) => i.key === 'decisions_mode_split');
    expect(split?.ready).toBe(false);
    expect(split?.reason).toMatch(/0 of 612/);
    expect(split?.reason).toMatch(/never re-stamped/);
  });

  it('explorer_channel_flags reports both journey channels closed', async () => {
    worldAsMeasured();

    const r = await buildReadiness({ now: NOW, flags: DECISIONS_ONLY, explorerFlags: EXPLORER_OFF });
    const channels = r.items.find((i) => i.key === 'explorer_channel_flags');

    expect(channels?.ready).toBe(false);
    expect(channels?.reason).toMatch(/in_app and ali_outreach/);
  });

  it('the Explorer item goes through the sanctioned reader, so the master gates the channels', async () => {
    // The regression this catches: reading the per-channel flags directly would report both
    // channels open while EXPLORER_GROWTH_OS_ENABLED was off, which is the opposite of what
    // resolveExecutionMode does. The dark-launch guard cannot see this, because it scans for
    // dotted reads and the accessor takes the feature as a string.
    worldAsMeasured();
    const masterOffChannelsOn = {
      growthOsEnabled: false, inAppNudgeEnabled: true, aliOutreachEnabled: true,
    } as never;

    const r = await buildReadiness({
      now: NOW, flags: DECISIONS_ONLY, explorerFlags: masterOffChannelsOn,
    });

    expect(r.items.find((i) => i.key === 'explorer_channel_flags')?.ready).toBe(false);
  });

  it('with the channels genuinely open the item is ready, so the reader is not just always false', async () => {
    worldAsMeasured();
    const r = await buildReadiness({ now: NOW, flags: DECISIONS_ONLY, explorerFlags: EXPLORER_ON });
    expect(r.items.find((i) => i.key === 'explorer_channel_flags')?.ready).toBe(true);
  });

  it('no address reaches the report, even with the new reasons in it', async () => {
    // The journey-tree rule: no `@` in output, ever. The new reasons interpolate counts only,
    // but the assertion is cheap and the rule is absolute.
    worldAsMeasured();
    const r = await buildReadiness({ now: NOW, flags: DECISIONS_ONLY, explorerFlags: EXPLORER_OFF });
    expect(JSON.stringify(scrubReadiness(r))).not.toContain('@');
  });

  it('every new reason and next_move fits under the cap', async () => {
    // The longest of them interpolates a six-digit count; this pins that it still fits rather
    // than being silently truncated by scrubField.
    worldAsMeasured();
    enrollmentCount.mockResolvedValue(999999);
    decisionCount.mockImplementation((args?: { where?: { mode?: string } }) => Promise.resolve(
      args?.where?.mode === 'live' ? 1 : 999999,
    ));
    const r = await buildReadiness({ now: NOW, flags: DECISIONS_ONLY, explorerFlags: EXPLORER_OFF });
    const NEW_KEYS = [
      'enrollments_present', 'classifications_present', 'programmes_active',
      'explorer_channel_flags', 'decisions_mode_split',
    ];
    for (const i of r.items.filter((x) => NEW_KEYS.includes(x.key))) {
      expect(i.reason.length).toBeLessThanOrEqual(FIELD_CAP);
      expect(i.next_move.length).toBeLessThanOrEqual(FIELD_CAP);
      expect(i.reason.length).toBeGreaterThan(0);
      expect(i.next_move.length).toBeGreaterThan(0);
    }
  });
});

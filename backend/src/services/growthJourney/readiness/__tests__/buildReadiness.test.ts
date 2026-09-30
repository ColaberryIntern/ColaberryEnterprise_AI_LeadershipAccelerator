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

jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
jest.mock('../../../../models', () => ({
  AiAgent: { findOne: (...a: unknown[]) => agentFindOne(...a) },
  Brand: { findAll: (...a: unknown[]) => brandFindAll(...a) },
  Campaign: { findOne: (...a: unknown[]) => campaignFindOne(...a) },
  GrowthJourneyContentRule: { count: (...a: unknown[]) => contentRuleCount(...a) },
  GrowthJourneyExecutionControl: { count: (...a: unknown[]) => controlCount(...a) },
  GrowthJourneyPolicy: { findAll: (...a: unknown[]) => policyFindAll(...a) },
  JourneyProgram: { findAll: (...a: unknown[]) => programFindAll(...a) },
  SystemSetting: { findOne: (...a: unknown[]) => settingFindOne(...a) },
  TenantMembership: { count: (...a: unknown[]) => membershipCount(...a) },
}));

import { ALI_OUTREACH_CAMPAIGN_KEY, EXPLORER_CAMPAIGN_KEYS, FLOW_CAMPAIGN_KEYS } from '../../execution/campaignKeys';
import { buildReadiness, LEDGER_INDEXES, REQUIRED_QUEUES, scoreOf, type ReadinessKey } from '../buildReadiness';

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
}

const byKey = (items: Array<{ key: ReadinessKey; ready: boolean | null }>) =>
  Object.fromEntries(items.map((i) => [i.key, i.ready]));

beforeEach(() => jest.clearAllMocks());

describe('world 1: nothing done', () => {
  it('every knowable item is blocked, tests_green is unknown, and the first move is the master flag', async () => {
    worldAllOff();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    expect(r.items).toHaveLength(17);
    expect(r.next_move).toBe('master_flag');
    expect(r.score.ready).toBe(0);
    expect(r.score.known).toBe(16);
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

  it('a missing kill-switch ROW is not ready, and says why that is different from the switch being on', async () => {
    worldAllOff();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    const k = r.items.find((i) => i.key === 'kill_switch_row')!;
    expect(k.ready).toBe(false);
    expect(k.reason).toContain('no system_kill_switch row exists');
    expect(k.reason).toContain('fail closed');
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
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    expect(byKey(r.items).master_flag).toBe(true);
    expect(byKey(r.items).probe_scopes).toBe(true);
    expect(r.next_move).toBe('nightly_enabled');
  });

  it('a partially-staffed queue is NOT ready, and names exactly what is missing', async () => {
    worldPhase4Done();
    policyFindAll.mockResolvedValue([row({ policy_type: 'queue_capacity', owner_queue: 'sales' })]);
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    const q = r.items.find((i) => i.key === 'queue_policies')!;
    expect(q.ready).toBe(false);
    expect(q.reason).toContain('queue_assignee:sales');
    expect(q.reason).toContain('queue_capacity:solution_architect');
    expect(q.reason).not.toContain('queue_capacity:sales');
  });

  it('one learner brand without rules blocks the item and the count says so', async () => {
    worldPhase4Done();
    contentRuleCount.mockResolvedValueOnce(2).mockResolvedValue(0);
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    const c = r.items.find((i) => i.key === 'content_rules')!;
    expect(c.ready).toBe(false);
    expect(c.reason).toBe('1 of 2 learner brand(s) have at least one content rule');
  });

  it('a missing ledger index is named, from pg_indexes rather than from a file', async () => {
    worldPhase4Done();
    query.mockResolvedValue([{ indexname: LEDGER_INDEXES[0] }]);
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    const idx = r.items.find((i) => i.key === 'ledger_indexes')!;
    expect(idx.ready).toBe(false);
    expect(idx.reason).toContain(LEDGER_INDEXES[1]);
    expect(idx.reason).toContain(LEDGER_INDEXES[2]);
    expect(String(query.mock.calls[0][0])).toContain('pg_indexes');
  });

  it('the kill switch being ON is a different failure from the row being absent', async () => {
    worldPhase4Done();
    settingFindOne.mockResolvedValue(row({ value: true }));
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    const k = r.items.find((i) => i.key === 'kill_switch_row')!;
    expect(k.ready).toBe(false);
    expect(k.reason).toContain('the kill switch is ON');
  });

  it("a kill switch stored as the STRING 'true' is still on", async () => {
    worldPhase4Done();
    settingFindOne.mockResolvedValue(row({ value: 'true' }));
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    expect(r.items.find((i) => i.key === 'kill_switch_row')!.ready).toBe(false);
  });
});

describe('world 3: ready', () => {
  it('everything knowable is ready, the score is 100, and next_move is null', async () => {
    worldReady();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    const blocked = r.items.filter((i) => i.ready === false).map((i) => i.key);
    expect(blocked).toEqual([]);
    expect(r.next_move).toBeNull();
    expect(r.score).toEqual({ ready: 16, known: 16, unknown: 1, pct: 100 });
  });

  it('tests_green stays unknown even in the ready world, and is never claimed green', async () => {
    worldReady();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    const t = r.items.find((i) => i.key === 'tests_green')!;
    expect(t.ready).toBeNull();
    expect(t.reason).toContain('not readable from here');
    // the unknown is excluded from BOTH sides, so it cannot flatter or drag the score
    expect(r.score.known).toBe(16);
    expect(r.score.pct).toBe(100);
  });

  it("a campaign at approval_status 'live' counts as approved", async () => {
    worldReady();
    campaignFindOne.mockResolvedValue(row({ status: 'active', approval_status: 'live' }));
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    // requiring the exact string 'approved' would report the most-launched campaigns
    // on the platform as the ones blocking launch
    expect(byKey(r.items).explorer_campaigns).toBe(true);
    expect(byKey(r.items).flow_drafts).toBe(true);
  });

  it("a campaign approved but not active is NOT ready, and the count distinguishes exist from live", async () => {
    worldReady();
    campaignFindOne.mockResolvedValue(row({ status: 'draft', approval_status: 'approved' }));
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    const e = r.items.find((i) => i.key === 'explorer_campaigns')!;
    expect(e.ready).toBe(false);
    expect(e.reason).toBe(`0 of ${EXPLORER_CAMPAIGN_KEYS.length} Explorer campaigns are stamped, approved and active (${EXPLORER_CAMPAIGN_KEYS.length} exist)`);
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
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
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
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    expect(r.next_move).toBe('kill_switch_row');
  });

  it('the item order is the dependency sequence, pinned by name', async () => {
    worldAllOff();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_OFF });
    expect(r.items.map((i) => i.key)).toEqual([
      'master_flag', 'decisions_flag', 'nightly_enabled', 'content_rules', 'queue_policies',
      'memberships', 'handoffs_flag', 'execution_flag', 'executor_enabled', 'kill_switch_row',
      'explorer_campaigns', 'ali_campaign', 'flow_drafts', 'review_rollout', 'probe_scopes',
      'ledger_indexes', 'tests_green',
    ]);
  });

  it('a null is counted NEITHER as ready NOR in the denominator (the plan\'s M3)', async () => {
    worldReady();
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    const nulls = r.items.filter((i) => i.ready === null).length;
    expect(nulls).toBe(1);
    expect(r.score.known).toBe(r.items.length - nulls);
    expect(r.score.ready).toBeLessThanOrEqual(r.score.known);
    // the giveaway if a null were counted ready: 17/17
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

describe('it reads and never writes', () => {
  it('no create, update or destroy is reachable: the mocked models expose none', async () => {
    worldReady();
    await buildReadiness({ now: NOW, flags: FLAGS_ON });
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
    const r = await buildReadiness({ now: NOW, flags: FLAGS_ON });
    // brand ids are never interpolated into a reason, and the queue names in a reason
    // come from REQUIRED_QUEUES - the code's own list - not from the row
    expect(JSON.stringify(r)).not.toContain('@example.com');
  });
});

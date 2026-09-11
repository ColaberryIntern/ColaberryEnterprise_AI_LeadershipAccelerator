/**
 * T226 — `evaluateAndDispatch`, which had no test at all: priority order,
 * `continue_on_match`, the break on first match, brand facts, and the
 * claim-then-run replay guard on `routing_rule_executions`.
 *
 * The execution store is an in-memory fake that honours the UNIQUE index on
 * `(raw_payload_id, rule_id, action_index)` the same way Postgres does — a
 * second insert of the same triple throws a `SequelizeUniqueConstraintError`.
 * That is the property every replay assertion below rests on, so the fake's
 * own behaviour is asserted first.
 */

const rules: Array<Record<string, any>> = [];
const executions: Array<Record<string, any>> = [];
const runAction = jest.fn();

class UniqueError extends Error {
  name = 'SequelizeUniqueConstraintError';
}

jest.mock('../../models', () => ({
  RoutingRule: {
    // Honours the `order` clause the engine passes, so a test of priority order
    // tests the QUERY, not this fake. (A fake that sorted by itself let a
    // `priority DESC` mutation survive.)
    findAll: async (q: { where?: { is_active?: boolean }; order?: Array<[string, string]> }) => {
      const active = rules.filter((r) => (q?.where?.is_active === undefined ? true : r.is_active === q.where.is_active));
      const [[col, dir] = ['priority', 'ASC']] = q?.order ?? [];
      const sign = String(dir).toUpperCase() === 'DESC' ? -1 : 1;
      return active.sort((a, b) => (a[col] > b[col] ? sign : a[col] < b[col] ? -sign : 0));
    },
  },
  RoutingRuleExecution: {
    create: async (row: Record<string, any>) => {
      const key = `${row.raw_payload_id}|${row.rule_id}|${row.action_index}`;
      if (executions.some((e) => e.__key === key)) throw new UniqueError('duplicate key');
      const rec: Record<string, any> = { ...row, __key: key, update: async (patch: Record<string, any>) => Object.assign(rec, patch) };
      executions.push(rec);
      return rec;
    },
  },
}));
jest.mock('../routingActionsService', () => ({ runAction: (...a: unknown[]) => runAction(...a) }));

import { evaluateAndDispatch } from '../routingEngineService';

const lead = { id: 42, toJSON: () => ({ id: 42, lead_temperature: 'warm' }) };
const context = (over: Record<string, any> = {}) => ({
  source_slug: 'ai-flotation',
  entry_slug: 'workflow_intake',
  raw_payload_id: 'raw-1',
  normalized: {},
  tenant_id: 't-af',
  brand_id: 'b-af',
  brand_slug: 'ai-flotation',
  ...over,
});
const rule = (over: Record<string, any>) => ({
  id: `rule-${rules.length + 1}`,
  name: `rule ${rules.length + 1}`,
  priority: 100,
  conditions: {},
  actions: [{ type: 'notify_sales' }],
  continue_on_match: false,
  is_active: true,
  version: 1,
  ...over,
});

beforeEach(() => {
  rules.length = 0;
  executions.length = 0;
  runAction.mockReset().mockImplementation(async (action: any) => ({ type: action.type, status: 'ok', detail: { did: action.type } }));
});

describe('the fake execution store behaves like the unique index', () => {
  it('rejects a second insert of the same (payload, rule, action_index)', async () => {
    const { RoutingRuleExecution } = require('../../models');
    await RoutingRuleExecution.create({ raw_payload_id: 'p', rule_id: 'r', action_index: 0 });
    await expect(RoutingRuleExecution.create({ raw_payload_id: 'p', rule_id: 'r', action_index: 0 })).rejects.toBeInstanceOf(UniqueError);
    await expect(RoutingRuleExecution.create({ raw_payload_id: 'p', rule_id: 'r', action_index: 1 })).resolves.toBeDefined();
  });
});

describe('order and fall-through (previously untested)', () => {
  it('runs rules in priority ASC and stops at the first match by default', async () => {
    rules.push(rule({ priority: 200, actions: [{ type: 'second' }] }), rule({ priority: 10, actions: [{ type: 'first' }] }));
    const r = await evaluateAndDispatch(lead, context());
    expect(r.map((x) => x.type)).toEqual(['first']);
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it('continues past a match when continue_on_match is set', async () => {
    rules.push(rule({ priority: 10, actions: [{ type: 'first' }], continue_on_match: true }), rule({ priority: 20, actions: [{ type: 'second' }] }));
    const r = await evaluateAndDispatch(lead, context());
    expect(r.map((x) => x.type)).toEqual(['first', 'second']);
  });

  it('skips a rule whose conditions do not match and keeps looking', async () => {
    rules.push(rule({ priority: 10, conditions: { source_slug: 'cpn' }, actions: [{ type: 'wrong' }] }), rule({ priority: 20, actions: [{ type: 'right' }] }));
    const r = await evaluateAndDispatch(lead, context());
    expect(r.map((x) => x.type)).toEqual(['right']);
  });

  it('runs every action of a matched rule, in order, each with its own execution row', async () => {
    rules.push(rule({ actions: [{ type: 'a' }, { type: 'b' }, { type: 'c' }] }));
    await evaluateAndDispatch(lead, context());
    expect(runAction.mock.calls.map((c) => c[0].type)).toEqual(['a', 'b', 'c']);
    expect(executions.map((e) => e.action_index)).toEqual([0, 1, 2]);
  });
});

describe('brand facts (T226)', () => {
  it('a rule can match on brand_slug, and does not match another brand', async () => {
    rules.push(rule({ conditions: { brand_slug: 'ai-flotation' }, actions: [{ type: 'af_only' }] }));
    expect((await evaluateAndDispatch(lead, context())).map((x) => x.type)).toEqual(['af_only']);
    executions.length = 0;
    expect(await evaluateAndDispatch(lead, context({ raw_payload_id: 'raw-2', brand_slug: 'cpn' }))).toEqual([]);
  });

  it('an unresolved source has null brand facts: a brand rule does not match, and nothing throws', async () => {
    rules.push(rule({ conditions: { brand_slug: 'ai-flotation' } }));
    const r = await evaluateAndDispatch(lead, context({ tenant_id: null, brand_id: null, brand_slug: null }));
    expect(r).toEqual([]);
  });

  it('the execution row carries the tenant and brand', async () => {
    rules.push(rule({}));
    await evaluateAndDispatch(lead, context());
    expect(executions[0]).toMatchObject({ tenant_id: 't-af', brand_id: 'b-af', lead_id: 42, raw_payload_id: 'raw-1', rule_version: 1 });
  });

  it('the handler context also carries them', async () => {
    rules.push(rule({}));
    await evaluateAndDispatch(lead, context());
    expect(runAction.mock.calls[0][1]).toMatchObject({ brand_id: 'b-af', brand_slug: 'ai-flotation', tenant_id: 't-af' });
  });
});

describe('claim-then-run: replay safety', () => {
  it('the same payload dispatched twice runs each action ONCE; the second pass reports skipped', async () => {
    rules.push(rule({ actions: [{ type: 'request_callback' }] }));
    const first = await evaluateAndDispatch(lead, context());
    const second = await evaluateAndDispatch(lead, context());
    expect(first).toEqual([expect.objectContaining({ type: 'request_callback', status: 'ok' })]);
    expect(second).toEqual([expect.objectContaining({ type: 'request_callback', status: 'skipped', detail: { reason: 'already_executed' } })]);
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it('two CONCURRENT dispatches of one payload: exactly one ok, one skipped', async () => {
    rules.push(rule({ actions: [{ type: 'request_callback' }] }));
    const [a, b] = await Promise.all([evaluateAndDispatch(lead, context()), evaluateAndDispatch(lead, context())]);
    const statuses = [a[0].status, b[0].status].sort();
    expect(statuses).toEqual(['ok', 'skipped']);
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it('a different payload for the same lead and rule runs again (keyed on the payload, not the lead)', async () => {
    rules.push(rule({}));
    await evaluateAndDispatch(lead, context({ raw_payload_id: 'raw-1' }));
    await evaluateAndDispatch(lead, context({ raw_payload_id: 'raw-2' }));
    expect(runAction).toHaveBeenCalledTimes(2);
  });

  it('the claim is written BEFORE the handler runs, and finished after', async () => {
    rules.push(rule({}));
    runAction.mockImplementation(async (action: any) => {
      // At handler time the claim row already exists and is still `claimed`.
      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe('claimed');
      return { type: action.type, status: 'ok' };
    });
    await evaluateAndDispatch(lead, context());
    expect(executions[0].status).toBe('ok');
    expect(executions[0].finished_at).toBeInstanceOf(Date);
  });

  it('records rule_version and the action snapshot as they were when it fired', async () => {
    rules.push(rule({ version: 3, actions: [{ type: 'notify_sales', to: 'sales' }] }));
    await evaluateAndDispatch(lead, context());
    expect(executions[0]).toMatchObject({ rule_version: 3, action_type: 'notify_sales', action_snapshot: { type: 'notify_sales', to: 'sales' } });
  });

  it('a failed handler leaves a failed row with an error class; a deferred one leaves deferred', async () => {
    rules.push(rule({ actions: [{ type: 'x' }, { type: 'y' }] }));
    runAction
      .mockImplementationOnce(async () => ({ type: 'x', status: 'failed', error: 'not_implemented: nope' }))
      .mockImplementationOnce(async () => ({ type: 'y', status: 'deferred', detail: { would: 'y' } }));
    await evaluateAndDispatch(lead, context());
    expect(executions[0]).toMatchObject({ status: 'failed' });
    expect(typeof executions[0].error_class).toBe('string');
    expect(executions[1]).toMatchObject({ status: 'deferred', detail: { would: 'y' }, error_class: null });
  });

  it('a store failure that is NOT a unique violation propagates (the ingest logs it; the lead is already saved)', async () => {
    rules.push(rule({}));
    const { RoutingRuleExecution } = require('../../models');
    const orig = RoutingRuleExecution.create;
    RoutingRuleExecution.create = async () => { throw new Error('connection reset'); };
    await expect(evaluateAndDispatch(lead, context())).rejects.toThrow('connection reset');
    RoutingRuleExecution.create = orig;
    expect(runAction).not.toHaveBeenCalled();
  });
});

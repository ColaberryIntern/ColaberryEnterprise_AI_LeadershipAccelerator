/**
 * T226 — routing-rule create/update validate against the action registry and
 * bump `version` when behaviour changes. Before: any `type` string was
 * accepted and then ran as `unknown`; a rule that looked saved and did nothing.
 *
 * The three production rules (read 2026-09-11) are replayed through the
 * schema literally, so the validation cannot have broken what is live.
 */
const create = jest.fn();
const findByPk = jest.fn();

jest.mock('../../models', () => ({
  LeadSource: {}, EntryPoint: {}, FormDefinition: {}, RawLeadPayload: {}, Lead: {},
  RoutingRule: { create: (...a: unknown[]) => create(...a), findByPk: (...a: unknown[]) => findByPk(...a), findAll: jest.fn() },
}));
jest.mock('../../services/emailService', () => ({ sendNewLeadAlert: jest.fn() }));
jest.mock('../../services/communicationLogService', () => ({ logCommunication: jest.fn() }));
jest.mock('../../services/callbackRequestService', () => ({ requestInstantCallback: jest.fn() }));
jest.mock('../../services/activityService', () => ({ logActivity: jest.fn() }));

import { createRoutingRule, updateRoutingRule } from '../adminLeadSourceController';
import { routingRuleCreateSchema } from '../../schemas/routingRuleSchema';

const res = () => {
  const r: Record<string, any> = { statusCode: 200, body: undefined };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: unknown) => { r.body = b; return r; };
  return r;
};

const PROD_RULES = [
  { name: 'Notify on ai-flotation lead', conditions: { source_slug: 'ai-flotation' }, actions: [{ type: 'notify_sales' }] },
  { name: 'Call back on ai-flotation call_me_now', conditions: { source_slug: 'ai-flotation', entry_slug: 'call_me_now' }, actions: [{ type: 'request_callback' }] },
  { name: 'Call back on cpn scholarship_interview_call', conditions: { source_slug: 'cpn', entry_slug: 'scholarship_interview_call' }, actions: [{ type: 'request_callback' }] },
];

beforeEach(() => {
  create.mockReset().mockImplementation(async (row: Record<string, unknown>) => ({ id: 'new', ...row }));
  findByPk.mockReset();
});

describe('create', () => {
  it('rejects an unknown action type with 400 that names it', async () => {
    const r = res();
    await createRoutingRule({ body: { name: 'x', conditions: {}, actions: [{ type: 'assign_journey_programme' }] } } as any, r as any);
    expect(r.statusCode).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/unknown action type/);
    expect(JSON.stringify(r.body)).toContain('assign_journey_programme'); // the typo itself is in the message
    expect(JSON.stringify(r.body)).toMatch(/actions/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an empty actions list and a missing name', async () => {
    for (const body of [{ name: 'x', conditions: {}, actions: [] }, { conditions: {}, actions: [{ type: 'notify_sales' }] }]) {
      const r = res();
      await createRoutingRule({ body } as any, r as any);
      expect(r.statusCode).toBe(400);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts each of the three production rules literally (201)', async () => {
    for (const body of PROD_RULES) {
      const r = res();
      await createRoutingRule({ body } as any, r as any);
      expect({ name: body.name, status: r.statusCode }).toEqual({ name: body.name, status: 201 });
    }
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('the schema reads the registry, not a copy: a type added to ACTION_HANDLERS becomes valid', () => {
    const { ACTION_HANDLERS } = require('../../services/routingActionsService');
    ACTION_HANDLERS.__temp_type = async () => ({ ok: true });
    try {
      expect(routingRuleCreateSchema.safeParse({ name: 'x', conditions: {}, actions: [{ type: '__temp_type' }] }).success).toBe(true);
    } finally {
      delete ACTION_HANDLERS.__temp_type;
    }
    expect(routingRuleCreateSchema.safeParse({ name: 'x', conditions: {}, actions: [{ type: '__temp_type' }] }).success).toBe(false);
  });

  it('action bodies stay open: handler-specific fields pass through', () => {
    const p = routingRuleCreateSchema.safeParse({ name: 'x', conditions: {}, actions: [{ type: 'send_pdf', pdf_slug: 'guide' }] });
    expect(p.success).toBe(true);
    expect((p as any).data.actions[0].pdf_slug).toBe('guide');
  });
});

describe('update bumps version only when behaviour changes', () => {
  const existing = (over: Record<string, any> = {}) => {
    const row: Record<string, any> = {
      id: 'r1', name: 'old', priority: 100, version: 1,
      conditions: { source_slug: 'cpn' }, actions: [{ type: 'notify_sales' }],
      ...over,
    };
    row.update = jest.fn(async (patch: Record<string, any>) => Object.assign(row, patch));
    return row;
  };

  it('changing actions → version 2', async () => {
    const row = existing();
    findByPk.mockResolvedValue(row);
    await updateRoutingRule({ params: { id: 'r1' }, body: { actions: [{ type: 'request_callback' }] } } as any, res() as any);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
  });

  it('changing conditions → version 2', async () => {
    const row = existing();
    findByPk.mockResolvedValue(row);
    await updateRoutingRule({ params: { id: 'r1' }, body: { conditions: { source_slug: 'ai-flotation' } } } as any, res() as any);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
  });

  it('renaming or pausing → version unchanged', async () => {
    const row = existing();
    findByPk.mockResolvedValue(row);
    await updateRoutingRule({ params: { id: 'r1' }, body: { name: 'new name', is_active: false } } as any, res() as any);
    const patch = (row.update as jest.Mock).mock.calls[0][0];
    expect(patch.version).toBeUndefined();
    expect(patch).toMatchObject({ name: 'new name', is_active: false });
  });

  it('re-sending the same actions verbatim → version unchanged (idempotent PATCH)', async () => {
    const row = existing();
    findByPk.mockResolvedValue(row);
    await updateRoutingRule({ params: { id: 'r1' }, body: { actions: [{ type: 'notify_sales' }] } } as any, res() as any);
    expect((row.update as jest.Mock).mock.calls[0][0].version).toBeUndefined();
  });

  it('an unknown type on update is a 400 and nothing is written', async () => {
    const row = existing();
    findByPk.mockResolvedValue(row);
    const r = res();
    await updateRoutingRule({ params: { id: 'r1' }, body: { actions: [{ type: 'nope' }] } } as any, r as any);
    expect(r.statusCode).toBe(400);
    expect(row.update).not.toHaveBeenCalled();
  });

  it('404 for a missing rule, before validation', async () => {
    findByPk.mockResolvedValue(null);
    const r = res();
    await updateRoutingRule({ params: { id: 'zzz' }, body: {} } as any, r as any);
    expect(r.statusCode).toBe(404);
  });
});

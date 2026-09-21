const m = { programFindByPk: jest.fn(), leadFindAll: jest.fn(), ledger: jest.fn() };
jest.mock('../../../../models', () => {
  const { T5 } = require('../../__tests__/fixtures/phase5Tables');
  return {
    GrowthJourneyExecutionControl: {
      create: async (attrs: Record<string, unknown>) => T5.controls.insert(attrs),
      findByPk: async (id: string) => T5.controls.findOne({ where: { id } }),
      findAll: (...a: unknown[]) => T5.controls.findAll(...(a as [never])),
      update: (...a: unknown[]) => T5.controls.update(...(a as [never, never])),
    },
    JourneyProgram: { findByPk: (...a: unknown[]) => m.programFindByPk(...a) },
    Lead: { findAll: (...a: unknown[]) => m.leadFindAll(...a) },
  };
});
jest.mock('../../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => m.ledger(...a) }));

import { Op } from 'sequelize';
import { T5, resetPhase5Tables, uniquesOn } from '../../__tests__/fixtures/phase5Tables';
import {
  clearControl,
  CONTROL_CLEARED_EVENT,
  CONTROL_SET_EVENT,
  ControlConflictError,
  ControlValidationError,
  findControl,
  listControls,
  ScopeKeyError,
  setPause,
  setRollout,
} from '../controlsService';

/**
 * T518 - the one writer of the switchboard, over T503's controls table, which
 * enforces the partial unique on `scope_key` for real: a second active row for
 * a scope is the database's 409, a cleared row is history, a clear is one
 * conditional update. The programme and lead reads and the ledger are spies.
 */

const TENANT = 't-col';
const BRAND = 'b-ent';
const PROGRAM = 'p-ent';
const ACTOR = { id: 'admin:7' };
const AS_OF = new Date('2026-09-21T15:00:00.000Z');

beforeEach(() => {
  resetPhase5Tables();
  for (const fn of Object.values(m)) fn.mockReset();
  m.ledger.mockResolvedValue({ recorded: true });
  m.programFindByPk.mockResolvedValue({ id: PROGRAM, brand_id: BRAND, tenant_id: TENANT });
  m.leadFindAll.mockImplementation(async ({ where }: { where: { id: { [Op.in]: number[] } } }) => where.id[Op.in].filter((id) => id < 900).map((id) => ({ get: () => id })));
});

describe('a pause', () => {
  it('writes one row (kind pause, mode off, the named dimensions) and one ledger row of ids and codes - the reason stays on the row', async () => {
    const v = await setPause({ tenantId: TENANT, brandId: BRAND, channel: 'email', reason: 'ops@colaberry.com asked for a hold' }, ACTOR);
    expect(v).toMatchObject({ tenant_id: TENANT, kind: 'pause', scope_key: `pause|${BRAND}|*|email|*`, mode: 'off', brand_id: BRAND, program_id: null, channel: 'email', subject_ref: null, cohort_lead_ids: null, daily_limit: null, set_by_admin_id: ACTOR.id, cleared_at: null });
    expect(T5.controls.rows).toHaveLength(1);
    expect(m.ledger).toHaveBeenCalledTimes(1);
    const [type, entity, entityId, scope, payload, actor] = m.ledger.mock.calls[0];
    expect([type, entity, entityId, scope, actor]).toEqual([CONTROL_SET_EVENT, 'growth_journey_execution_control', v.id, { tenant_id: TENANT, brand_id: BRAND }, ACTOR.id]);
    expect(payload).toEqual({ control_id: v.id, kind: 'pause', scope_key: v.scope_key, mode: 'off', brand_id: BRAND, program_id: null, channel: 'email', subject_ref: null, cohort_size: null, daily_limit: null });
    expect(JSON.stringify(payload)).not.toContain('@');
  });

  it('with no brand: a programme-, channel- or subject-wide row with a null brand in the ledger scope; the all-wildcard pause is refused before any write', async () => {
    const v = await setPause({ tenantId: TENANT, channel: 'in_app', reason: 'nudges off' }, ACTOR);
    expect(v).toMatchObject({ scope_key: 'pause|*|*|in_app|*', brand_id: null });
    expect(m.ledger.mock.calls[0][3]).toEqual({ tenant_id: TENANT, brand_id: null });
    await expect(setPause({ tenantId: TENANT, reason: 'everything' }, ACTOR)).rejects.toBeInstanceOf(ScopeKeyError);
    expect(T5.controls.rows).toHaveLength(1);
    expect(m.ledger).toHaveBeenCalledTimes(1);
  });

  it('acceptance 5: a second ACTIVE row for the same scope is the index\'s unique violation, answered as a 409 - and once the first is cleared, the scope may be paused again', async () => {
    expect(uniquesOn('growth_journey_execution_controls')).toEqual(['growth_journey_execution_controls_scope_unique']);
    const first = await setPause({ tenantId: TENANT, brandId: BRAND, reason: 'one' }, ACTOR);
    await expect(setPause({ tenantId: TENANT, brandId: BRAND, reason: 'two' }, ACTOR)).rejects.toMatchObject({ name: 'ControlConflictError', status: 409, scope_key: first.scope_key });
    expect(T5.controls.rows).toHaveLength(1);
    expect(m.ledger).toHaveBeenCalledTimes(1);
    await clearControl(first.id, ACTOR, AS_OF);
    const again = await setPause({ tenantId: TENANT, brandId: BRAND, reason: 'two' }, ACTOR);
    expect(again.id).not.toBe(first.id);
    expect(T5.controls.rows).toHaveLength(2);
  });
});

describe('a rollout', () => {
  it('review: one brand x programme x channel, no cohort, no limit; the programme must be the brand\'s', async () => {
    const v = await setRollout({ tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'email', mode: 'review', reason: 'first cohort' }, ACTOR);
    expect(v).toMatchObject({ kind: 'rollout', scope_key: `rollout|${BRAND}|${PROGRAM}|email`, mode: 'review', cohort_lead_ids: null, daily_limit: null });
    expect(m.programFindByPk).toHaveBeenCalledWith(PROGRAM, { attributes: ['id', 'brand_id', 'tenant_id'] });
    m.programFindByPk.mockResolvedValue({ id: PROGRAM, brand_id: 'b-other', tenant_id: TENANT });
    await expect(setRollout({ tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'in_app', mode: 'review', reason: 'x' }, ACTOR)).rejects.toMatchObject({ name: 'ControlValidationError', status: 400, code: 'program_not_in_brand' });
    m.programFindByPk.mockResolvedValue(null);
    await expect(setRollout({ tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'in_app', mode: 'review', reason: 'x' }, ACTOR)).rejects.toBeInstanceOf(ControlValidationError);
    expect(T5.controls.rows).toHaveLength(1);
  });

  it('limited: the cohort is existing lead ids (deduplicated) and a daily limit; a missing id names itself and nothing is written', async () => {
    const v = await setRollout({ tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'email', mode: 'limited', cohortLeadIds: [11, 12, 11], dailyLimit: 5, reason: 'pilot' }, ACTOR);
    expect(v).toMatchObject({ mode: 'limited', cohort_lead_ids: [11, 12], daily_limit: 5 });
    expect(m.ledger.mock.calls[0][4]).toMatchObject({ cohort_size: 2, daily_limit: 5 });
    await expect(setRollout({ tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'in_app', mode: 'limited', cohortLeadIds: [11, 901, 902], dailyLimit: 5, reason: 'pilot' }, ACTOR))
      .rejects.toMatchObject({ code: 'cohort_lead_missing', detail: { missing: [901, 902] } });
    await expect(setRollout({ tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'in_app', mode: 'limited', cohortLeadIds: [], dailyLimit: 5, reason: 'pilot' }, ACTOR))
      .rejects.toMatchObject({ code: 'limited_needs_cohort_and_limit' });
    expect(T5.controls.rows).toHaveLength(1);
    expect(m.ledger).toHaveBeenCalledTimes(1);
  });

  it('acceptance 5 for rollouts: the same scope twice is a 409; a different channel is a different scope', async () => {
    await setRollout({ tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'email', mode: 'review', reason: 'a' }, ACTOR);
    await expect(setRollout({ tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'email', mode: 'limited', cohortLeadIds: [1], dailyLimit: 1, reason: 'b' }, ACTOR)).rejects.toBeInstanceOf(ControlConflictError);
    await setRollout({ tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'in_app', mode: 'review', reason: 'c' }, ACTOR);
    expect(T5.controls.rows).toHaveLength(2);
  });
});

describe('a clear', () => {
  it('is one conditional update: cleared once with one ledger row; a second clear changes nothing and writes nothing; an unknown id is not found', async () => {
    const v = await setPause({ tenantId: TENANT, brandId: BRAND, reason: 'hold' }, ACTOR);
    m.ledger.mockClear();
    const first = await clearControl(v.id, { id: 'admin:9' }, AS_OF);
    expect(first).toMatchObject({ status: 'cleared', control: { id: v.id, cleared_at: AS_OF, cleared_by_admin_id: 'admin:9' } });
    expect(m.ledger).toHaveBeenCalledTimes(1);
    expect(m.ledger.mock.calls[0].slice(0, 4)).toEqual([CONTROL_CLEARED_EVENT, 'growth_journey_execution_control', v.id, { tenant_id: TENANT, brand_id: BRAND }]);
    expect(m.ledger.mock.calls[0][5]).toBe('admin:9');
    const second = await clearControl(v.id, { id: 'admin:10' }, new Date(AS_OF.getTime() + 1000));
    expect(second).toMatchObject({ status: 'already_cleared', control: { cleared_at: AS_OF, cleared_by_admin_id: 'admin:9' } });
    expect(m.ledger).toHaveBeenCalledTimes(1);
    expect(await clearControl('nope', ACTOR, AS_OF)).toEqual({ status: 'not_found' });
    expect(T5.controls.rows).toHaveLength(1); // never deleted
  });
});

describe('the list, and the read by id', () => {
  it('active only unless asked, newest first, the caller\'s where honoured', async () => {
    const a = await setPause({ tenantId: TENANT, brandId: BRAND, reason: 'a' }, ACTOR);
    const b = await setPause({ tenantId: TENANT, brandId: 'b-trn', reason: 'b' }, ACTOR);
    const c = await setPause({ tenantId: 't-other', brandId: 'b-x', reason: 'c' }, ACTOR);
    await clearControl(a.id, ACTOR, AS_OF);
    expect((await listControls({ where: { tenant_id: TENANT }, includeCleared: false, limit: 100 })).map((v) => v.id)).toEqual([b.id]);
    expect((await listControls({ where: { tenant_id: TENANT }, includeCleared: true, limit: 100 })).map((v) => v.id).sort()).toEqual([a.id, b.id].sort());
    expect((await listControls({ where: {}, includeCleared: false, limit: 100 })).map((v) => v.id).sort()).toEqual([b.id, c.id].sort());
    expect((await listControls({ where: {}, includeCleared: true, limit: 1 }))).toHaveLength(1);
    expect(await findControl(c.id)).toMatchObject({ id: c.id, tenant_id: 't-other' });
    expect(await findControl('nope')).toBeNull();
  });
});

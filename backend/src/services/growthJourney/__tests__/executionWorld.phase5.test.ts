import { clock, AS_OF_4 } from './fixtures/phase4Tables';
import { T5, resetPhase5Tables, uniquesOn } from './fixtures/phase5Tables';

/**
 * T503 — the execution tables as the fixture world enforces them, read from the
 * shipped DDL. These are the guarantees every later Phase 5 task leans on: the
 * planner's "one receipt per decision", the one-open-per-person slot the adapter
 * claims, and "one active control per scope" for the operator's switchboard.
 */

const receipt = (over: Record<string, unknown> = {}) => ({
  tenant_id: 't-col', brand_id: 'b-ent', program_id: 'p-ent', decision_id: 'd-1', subject_ref: 'lead:501',
  lead_id: 501, enrollment_id: null, channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c-1',
  campaign_key: 'explorer_next_lesson', sequence_id: 's-1', mode: 'limited', status: 'approved',
  control_ids: ['ctl-1'], attempts: 0, ...over,
});
const control = (over: Record<string, unknown> = {}) => ({
  tenant_id: 't-col', kind: 'rollout', scope_key: 'rollout|b-ent|p-ent|email', brand_id: 'b-ent',
  program_id: 'p-ent', channel: 'email', subject_ref: null, mode: 'limited', cohort_lead_ids: [501],
  daily_limit: 5, cleared_at: null, ...over,
});

beforeEach(() => {
  resetPhase5Tables();
  clock.now = AS_OF_4;
});

describe('the world reads the Phase 5 indexes from the shipped DDL', () => {
  it('knows every unique index T503 ships, and no other', () => {
    expect(uniquesOn('growth_journey_executions')).toEqual([
      'growth_journey_executions_decision_unique',
      'growth_journey_executions_open_enrollment_unique',
      'growth_journey_executions_open_lead_unique',
    ]);
    expect(uniquesOn('growth_journey_execution_controls')).toEqual(['growth_journey_execution_controls_scope_unique']);
    expect(uniquesOn('growth_journey_in_app_nudges')).toEqual(['growth_journey_in_app_nudges_execution_unique']);
  });
});

describe('exactly once, as the database enforces it', () => {
  it('one receipt per decision, whatever else differs', async () => {
    await T5.executions.create(receipt());
    await expect(T5.executions.create(receipt({ channel: 'in_app', lead_id: 777 })))
      .rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
    expect(T5.executions.rows).toHaveLength(1);
  });

  it('one OPEN receipt per person per brand per channel - another channel and another brand are free', async () => {
    await T5.executions.create(receipt({ decision_id: 'd-1' }));
    await expect(T5.executions.create(receipt({ decision_id: 'd-2' }))).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
    await T5.executions.create(receipt({ decision_id: 'd-3', channel: 'in_app', enrollment_id: 'e-1' }));
    await T5.executions.create(receipt({ decision_id: 'd-4', brand_id: 'b-trn' }));
    expect(T5.executions.rows).toHaveLength(3);
  });

  it('one OPEN receipt per ENROLMENT too, so a learner cannot be executed on twice under their other ref', async () => {
    await T5.executions.create(receipt({ decision_id: 'd-1', subject_ref: 'enrollment:e-1', lead_id: null, enrollment_id: 'e-1' }));
    await expect(T5.executions.create(receipt({ decision_id: 'd-2', subject_ref: 'enrollment:e-1', lead_id: null, enrollment_id: 'e-1' })))
      .rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
    expect(T5.executions.rows).toHaveLength(1);
  });

  it('a TERMINAL receipt holds no slot: the next decision for the same person may execute', async () => {
    const first = await T5.executions.create(receipt({ decision_id: 'd-1' }));
    await (first as unknown as { update: (p: Record<string, unknown>) => Promise<unknown> }).update({ status: 'completed' });
    await T5.executions.create(receipt({ decision_id: 'd-2' }));
    expect(T5.executions.rows.map((r) => r.status)).toEqual(['completed', 'approved']);
  });

  it.each(['pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress'])('%s holds the slot', async (status) => {
    await T5.executions.create(receipt({ decision_id: 'd-1', status }));
    await expect(T5.executions.create(receipt({ decision_id: 'd-2' }))).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
  });

  it.each(['completed', 'blocked', 'failed', 'cancelled', 'expired', 'rejected'])('%s does not', async (status) => {
    await T5.executions.create(receipt({ decision_id: 'd-1', status }));
    await T5.executions.create(receipt({ decision_id: 'd-2' }));
    expect(T5.executions.rows).toHaveLength(2);
  });
});

describe('the operator switchboard and the in-app surface', () => {
  it('one ACTIVE control per scope; clearing it frees the scope for the next one', async () => {
    const first = await T5.controls.create(control());
    await expect(T5.controls.create(control())).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
    await (first as unknown as { update: (p: Record<string, unknown>) => Promise<unknown> }).update({ cleared_at: AS_OF_4 });
    await T5.controls.create(control());
    expect(T5.controls.rows).toHaveLength(2);
    // A different scope was never blocked.
    await T5.controls.create(control({ scope_key: 'pause|b-ent|*|*|*', kind: 'pause', mode: 'off', cohort_lead_ids: null, daily_limit: null }));
    expect(T5.controls.rows).toHaveLength(3);
  });

  it('one nudge per execution', async () => {
    const base = { tenant_id: 't-col', brand_id: 'b-trn', program_id: 'p-trn', enrollment_id: 'e-1', execution_id: 'ex-1', title: 'Your next lesson', href: '/portal/lesson/3', purpose: 'next_lesson' };
    await T5.nudges.create(base);
    await expect(T5.nudges.create({ ...base, title: 'Another' })).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
    expect(T5.nudges.rows).toHaveLength(1);
  });
});

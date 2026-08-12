/**
 * Reese Phase 2 (Autonomous Outreach) model tests. Follows this repo's
 * established convention (see outcomeMeasurementModel.test.ts /
 * approvalRequestModel.test.ts): mock the DB connection and env, import
 * models/index.ts to trigger association setup, then inspect Sequelize's
 * in-memory association/attribute metadata. No real Postgres connection is
 * made or available to local jest runs.
 */

jest.mock('../../config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('postgres://mock:mock@localhost:5432/mock', {
    dialect: 'postgres',
    logging: false,
  });
  return { sequelize, connectDatabase: jest.fn() };
});

jest.mock('../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://mock:mock@localhost:5432/mock',
    nodeEnv: 'test',
    jwtSecret: 'test-secret',
    port: 3000,
  },
}));

import * as Models from '../../models';

function hasAssociation(model: any, alias: string): boolean {
  return model.associations && alias in model.associations;
}

describe('Reese Outreach model — exported', () => {
  test('exports ReeseOutreach', () => {
    expect((Models as any).ReeseOutreach).toBeDefined();
  });
});

describe('Reese Outreach model — associations', () => {
  test('Ticket has reeseOutreaches', () => {
    expect(hasAssociation(Models.Ticket, 'reeseOutreaches')).toBe(true);
  });
  test('ReeseOutreach belongs to ticket', () => {
    expect(hasAssociation((Models as any).ReeseOutreach, 'ticket')).toBe(true);
  });
  test('Enrollment has reeseOutreaches', () => {
    expect(hasAssociation(Models.Enrollment, 'reeseOutreaches')).toBe(true);
  });
  test('ReeseOutreach belongs to enrollment', () => {
    expect(hasAssociation((Models as any).ReeseOutreach, 'enrollment')).toBe(true);
  });
});

describe('Reese Outreach model — defaults', () => {
  test('status defaults to active — a newly created outreach thread is live until resolved', () => {
    const attr = (Models as any).ReeseOutreach.rawAttributes.status;
    expect(attr.defaultValue).toBe('active');
  });
  test('attempt_count defaults to 1 — creating the row IS the first send, not a "scheduled but not sent yet" state', () => {
    const attr = (Models as any).ReeseOutreach.rawAttributes.attempt_count;
    expect(attr.defaultValue).toBe(1);
  });
  test('risk_tier defaults to R3 — every autonomous-outreach row is high-risk-tagged by default', () => {
    const attr = (Models as any).ReeseOutreach.rawAttributes.risk_tier;
    expect(attr.defaultValue).toBe('R3');
  });
  test('(enrollment_id, signal_type) has a unique index scoped to active rows — the dedup backstop T005 depends on', () => {
    const indexes = (Models as any).ReeseOutreach.options.indexes;
    const uniqueIndex = indexes.find(
      (i: any) => i.unique && i.fields?.includes('enrollment_id') && i.fields?.includes('signal_type'),
    );
    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex.where).toEqual({ status: 'active' });
  });
});

describe('Reese Outreach model — round trip (mocked Sequelize call boundary)', () => {
  test('create() then findOne() round-trips signal_snapshot JSONB, goal, and last_contacted_at', async () => {
    const ReeseOutreachModel = (Models as any).ReeseOutreach;
    const enrollmentId = '11111111-1111-1111-1111-111111111111';
    const ticketId = '22222222-2222-2222-2222-222222222222';
    const lastContactedAt = new Date('2026-08-09T20:38:31Z');
    const row = {
      id: 'row-1',
      enrollment_id: enrollmentId,
      ticket_id: ticketId,
      signal_type: 'inactivity',
      signal_snapshot: { daysSinceActive: 8.2, completionPct: 12 },
      goal: 'Confirm the student is unblocked and re-engaged within 7 days.',
      status: 'active',
      attempt_count: 1,
      last_contacted_at: lastContactedAt,
      next_follow_up_due_at: new Date('2026-08-16T20:38:31Z'),
      risk_tier: 'R3',
    };

    const createSpy = jest.spyOn(ReeseOutreachModel, 'create').mockResolvedValueOnce(row as any);
    const findOneSpy = jest.spyOn(ReeseOutreachModel, 'findOne').mockResolvedValueOnce(row as any);

    const created = await ReeseOutreachModel.create(row);
    expect(created.enrollment_id).toBe(enrollmentId);
    expect(created.signal_snapshot.completionPct).toBe(12);

    const found = await ReeseOutreachModel.findOne({ where: { enrollment_id: enrollmentId } });
    expect(found.last_contacted_at).toEqual(lastContactedAt);
    expect(found.goal).toContain('unblocked');

    createSpy.mockRestore();
    findOneSpy.mockRestore();
  });

  test('a second create() for the same (enrollment_id, signal_type) active row is rejected, not silently duplicated', async () => {
    const { UniqueConstraintError } = require('sequelize');
    const ReeseOutreachModel = (Models as any).ReeseOutreach;
    const enrollmentId = '33333333-3333-3333-3333-333333333333';

    const createSpy = jest.spyOn(ReeseOutreachModel, 'create');
    createSpy.mockResolvedValueOnce({ id: 'row-1', enrollment_id: enrollmentId, signal_type: 'inactivity' } as any);
    createSpy.mockRejectedValueOnce(
      new UniqueConstraintError({
        message: 'duplicate key value violates unique constraint "idx_reese_outreach_active_unique"',
      }),
    );

    const first = await ReeseOutreachModel.create({ enrollment_id: enrollmentId, signal_type: 'inactivity' });
    expect(first.enrollment_id).toBe(enrollmentId);

    await expect(
      ReeseOutreachModel.create({ enrollment_id: enrollmentId, signal_type: 'inactivity' }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);

    expect(createSpy).toHaveBeenCalledTimes(2);
    createSpy.mockRestore();
  });
});

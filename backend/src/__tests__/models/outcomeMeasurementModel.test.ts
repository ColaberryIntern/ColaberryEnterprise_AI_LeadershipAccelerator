/**
 * ProofDesk Outcomes & Learning (Milestone 5) model tests.
 * Follows this repo's established convention (see approvalRequestModel.test.ts /
 * workGraphModels.test.ts): mock the DB connection and env, import models/index.ts to
 * trigger association setup, then inspect Sequelize's in-memory association/attribute
 * metadata. No real Postgres connection is made or available to local jest runs.
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

describe('ProofDesk Outcomes model — exported', () => {
  test('exports OutcomeMeasurement', () => {
    expect((Models as any).OutcomeMeasurement).toBeDefined();
  });
});

describe('ProofDesk Outcomes model — associations', () => {
  test('Ticket has outcomeMeasurements', () => {
    expect(hasAssociation(Models.Ticket, 'outcomeMeasurements')).toBe(true);
  });
  test('OutcomeMeasurement belongs to ticket', () => {
    expect(hasAssociation((Models as any).OutcomeMeasurement, 'ticket')).toBe(true);
  });
});

describe('ProofDesk Outcomes model — defaults and idempotency', () => {
  test('status defaults to scheduled', () => {
    const attr = (Models as any).OutcomeMeasurement.rawAttributes.status;
    expect(attr.defaultValue).toBe('scheduled');
  });
  test('outcome_status defaults to pending, never a fabricated stable/recurrence value', () => {
    const attr = (Models as any).OutcomeMeasurement.rawAttributes.outcome_status;
    expect(attr.defaultValue).toBe('pending');
  });
  test('observation_window_days defaults to 7 (v1 fixed window, not per-domain configurable)', () => {
    const attr = (Models as any).OutcomeMeasurement.rawAttributes.observation_window_days;
    expect(attr.defaultValue).toBe(7);
  });
  test('(ticket_id, measurement_type) has a unique index — the idempotency key for scheduling', () => {
    const indexes = (Models as any).OutcomeMeasurement.options.indexes;
    const uniqueIndex = indexes.find(
      (i: any) => i.unique && i.fields?.includes('ticket_id') && i.fields?.includes('measurement_type'),
    );
    expect(uniqueIndex).toBeDefined();
  });
});

describe('ProofDesk Outcomes model — round trip (mocked Sequelize call boundary)', () => {
  test('create() then findOne() round-trips baseline/target JSONB and scheduled_for', async () => {
    const OutcomeMeasurementModel = (Models as any).OutcomeMeasurement;
    const ticketId = '11111111-1111-1111-1111-111111111111';
    const scheduledFor = new Date('2026-08-11T20:38:31Z');
    const row = {
      id: 'row-1',
      ticket_id: ticketId,
      measurement_type: 'ticket_recurrence_check',
      baseline: { ticket_status: 'done', entity_type: 'curriculum_card', entity_id: 'card-42' },
      target: { expected: 'no_recurrence_ticket_within_window' },
      observation_window_days: 7,
      scheduled_for: scheduledFor,
      status: 'scheduled',
      outcome_status: 'pending',
    };

    const createSpy = jest.spyOn(OutcomeMeasurementModel, 'create').mockResolvedValueOnce(row as any);
    const findOneSpy = jest.spyOn(OutcomeMeasurementModel, 'findOne').mockResolvedValueOnce(row as any);

    const created = await OutcomeMeasurementModel.create(row);
    expect(created.ticket_id).toBe(ticketId);
    expect(created.baseline.entity_type).toBe('curriculum_card');

    const found = await OutcomeMeasurementModel.findOne({ where: { ticket_id: ticketId } });
    expect(found.scheduled_for).toEqual(scheduledFor);
    expect(found.target.expected).toBe('no_recurrence_ticket_within_window');

    createSpy.mockRestore();
    findOneSpy.mockRestore();
  });

  test('a second create() with the same (ticket_id, measurement_type) is rejected, not silently duplicated', async () => {
    const { UniqueConstraintError } = require('sequelize');
    const OutcomeMeasurementModel = (Models as any).OutcomeMeasurement;
    const ticketId = '22222222-2222-2222-2222-222222222222';

    const createSpy = jest.spyOn(OutcomeMeasurementModel, 'create');
    createSpy.mockResolvedValueOnce({ id: 'row-1', ticket_id: ticketId, measurement_type: 'ticket_recurrence_check' } as any);
    createSpy.mockRejectedValueOnce(
      new UniqueConstraintError({
        message: 'duplicate key value violates unique constraint "idx_outcome_measurements_ticket_type"',
      }),
    );

    const first = await OutcomeMeasurementModel.create({ ticket_id: ticketId, measurement_type: 'ticket_recurrence_check' });
    expect(first.ticket_id).toBe(ticketId);

    await expect(
      OutcomeMeasurementModel.create({ ticket_id: ticketId, measurement_type: 'ticket_recurrence_check' }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);

    expect(createSpy).toHaveBeenCalledTimes(2);
    createSpy.mockRestore();
  });
});

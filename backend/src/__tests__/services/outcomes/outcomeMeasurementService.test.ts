jest.mock('../../../config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('postgres://mock:mock@localhost:5432/mock', {
    dialect: 'postgres',
    logging: false,
  });
  return { sequelize, connectDatabase: jest.fn() };
});

jest.mock('../../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://mock:mock@localhost:5432/mock',
    nodeEnv: 'test',
    jwtSecret: 'test-secret',
    port: 3000,
  },
}));

import * as Models from '../../../models';
import {
  scheduleOutcomeMeasurement,
  processDueOutcomeMeasurements,
  getOutcomeMeasurementsSummary,
} from '../../../services/outcomes/outcomeMeasurementService';

const { Ticket, OutcomeMeasurement } = Models as any;

describe('scheduleOutcomeMeasurement', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('happy path: a done ticket with entity_type/entity_id produces a scheduled row ~7 days out with a populated baseline', async () => {
    const ticketId = '11111111-1111-1111-1111-111111111111';
    const completedAt = new Date('2026-08-04T20:00:00Z');
    jest.spyOn(Ticket, 'findByPk').mockResolvedValue({
      id: ticketId,
      status: 'done',
      entity_type: 'curriculum_card',
      entity_id: 'card-42',
      parent_ticket_id: null,
      completed_at: completedAt,
    } as any);

    let capturedDefaults: any = null;
    jest.spyOn(OutcomeMeasurement, 'findOrCreate').mockImplementation(async (opts: any) => {
      capturedDefaults = opts.defaults;
      return [{ ...opts.defaults, id: 'row-1' }, true];
    });

    const row = await scheduleOutcomeMeasurement(ticketId);

    expect(row.id).toBe('row-1');
    expect(capturedDefaults.ticket_id).toBe(ticketId);
    expect(capturedDefaults.measurement_type).toBe('ticket_recurrence_check');
    expect(capturedDefaults.baseline).toMatchObject({
      ticket_status: 'done',
      entity_type: 'curriculum_card',
      entity_id: 'card-42',
    });
    expect(capturedDefaults.observation_window_days).toBe(7);

    const msUntilScheduled = capturedDefaults.scheduled_for.getTime() - Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(msUntilScheduled - sevenDaysMs)).toBeLessThan(5000); // within 5s tolerance
  });

  test('idempotency boundary: calling scheduleOutcomeMeasurement twice for the same ticketId results in exactly one row via findOrCreate, no crash, no duplicate', async () => {
    const ticketId = '22222222-2222-2222-2222-222222222222';
    jest.spyOn(Ticket, 'findByPk').mockResolvedValue({
      id: ticketId,
      status: 'done',
      entity_type: null,
      entity_id: null,
      parent_ticket_id: null,
      completed_at: new Date(),
    } as any);

    const existingRow = { id: 'row-2', ticket_id: ticketId, measurement_type: 'ticket_recurrence_check' };
    const findOrCreateSpy = jest
      .spyOn(OutcomeMeasurement, 'findOrCreate')
      .mockResolvedValueOnce([existingRow, true] as any)
      .mockResolvedValueOnce([existingRow, false] as any); // 2nd call: found existing, not created

    const first = await scheduleOutcomeMeasurement(ticketId);
    const second = await scheduleOutcomeMeasurement(ticketId);

    expect(first.id).toBe('row-2');
    expect(second.id).toBe('row-2');
    expect(findOrCreateSpy).toHaveBeenCalledTimes(2);
    // both calls used the same unique key — proving no second distinct row is ever
    // requested outside the (ticket_id, measurement_type) idempotency key
    expect(findOrCreateSpy.mock.calls[0][0].where).toEqual({
      ticket_id: ticketId,
      measurement_type: 'ticket_recurrence_check',
    });
    expect(findOrCreateSpy.mock.calls[1][0].where).toEqual({
      ticket_id: ticketId,
      measurement_type: 'ticket_recurrence_check',
    });
  });

  test('boundary: a ticket with neither entity_type/entity_id nor a parent relationship still schedules cleanly (does not crash)', async () => {
    const ticketId = '33333333-3333-3333-3333-333333333333';
    jest.spyOn(Ticket, 'findByPk').mockResolvedValue({
      id: ticketId,
      status: 'done',
      entity_type: null,
      entity_id: null,
      parent_ticket_id: null,
      completed_at: new Date(),
    } as any);

    jest.spyOn(OutcomeMeasurement, 'findOrCreate').mockImplementation(async (opts: any) => {
      return [{ ...opts.defaults, id: 'row-3' }, true];
    });

    await expect(scheduleOutcomeMeasurement(ticketId)).resolves.toMatchObject({ id: 'row-3' });
  });

  test('failure path: a nonexistent ticket throws rather than silently scheduling garbage', async () => {
    jest.spyOn(Ticket, 'findByPk').mockResolvedValue(null);
    await expect(scheduleOutcomeMeasurement('does-not-exist')).rejects.toThrow(/not found/i);
  });
});

describe('processDueOutcomeMeasurements', () => {
  function makeDueRow(overrides: Partial<any> = {}) {
    const row: any = {
      id: 'om-1',
      ticket_id: 'ticket-1',
      status: 'scheduled',
      created_at: new Date('2026-07-20T00:00:00Z'),
      baseline: {
        ticket_status: 'done',
        entity_type: 'curriculum_card',
        entity_id: 'card-42',
        parent_ticket_id: null,
        completed_at: '2026-07-28T00:00:00Z',
      },
      ...overrides,
    };
    row.update = jest.fn(async (fields: any) => Object.assign(row, fields));
    return row;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('happy path: a due row whose ticket has entity_type/entity_id and a matching new ticket resolves to recurrence_detected', async () => {
    const row = makeDueRow();
    jest.spyOn(OutcomeMeasurement, 'findAll').mockResolvedValue([row]);
    jest.spyOn(Ticket, 'findAll').mockResolvedValue([{ id: 'new-ticket-99' }] as any);

    const result = await processDueOutcomeMeasurements();

    expect(result).toEqual({ processed: 1, stable: 0, recurrence_detected: 1, insufficient_data: 0 });
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'observed',
        outcome_status: 'recurrence_detected',
        observed_result: { recurrence_ticket_ids: ['new-ticket-99'], found: true },
      }),
    );
  });

  test('happy path: a due row with a real entity link and no matching new ticket resolves to stable', async () => {
    const row = makeDueRow();
    jest.spyOn(OutcomeMeasurement, 'findAll').mockResolvedValue([row]);
    jest.spyOn(Ticket, 'findAll').mockResolvedValue([] as any);

    const result = await processDueOutcomeMeasurements();

    expect(result).toEqual({ processed: 1, stable: 1, recurrence_detected: 0, insufficient_data: 0 });
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'observed', outcome_status: 'stable' }),
    );
  });

  test('boundary (reinterpreted per execution-contract.md, since no M2 evidence gate exists): a due row whose ticket has neither entity_type/entity_id nor a matching child resolves to insufficient_data, never a fabricated stable, and never crashes', async () => {
    const row = makeDueRow({
      baseline: {
        ticket_status: 'done',
        entity_type: null,
        entity_id: null,
        parent_ticket_id: null,
        completed_at: '2026-07-28T00:00:00Z',
      },
    });
    jest.spyOn(OutcomeMeasurement, 'findAll').mockResolvedValue([row]);
    jest.spyOn(Ticket, 'findAll').mockResolvedValue([] as any); // no parent_ticket_id-linked children either

    await expect(processDueOutcomeMeasurements()).resolves.toEqual({
      processed: 1,
      stable: 0,
      recurrence_detected: 0,
      insufficient_data: 1,
    });
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'observed', outcome_status: 'insufficient_data' }),
    );
  });

  test('idempotency: only status=scheduled rows are selected, so an already-observed row is never reprocessed (query filter is the guard, asserted via the findAll where clause)', async () => {
    jest.spyOn(OutcomeMeasurement, 'findAll').mockResolvedValue([]);
    const ticketFindAllSpy = jest.spyOn(Ticket, 'findAll').mockResolvedValue([] as any);

    const result = await processDueOutcomeMeasurements();

    expect(result).toEqual({ processed: 0, stable: 0, recurrence_detected: 0, insufficient_data: 0 });
    expect(ticketFindAllSpy).not.toHaveBeenCalled(); // no due rows -> no recurrence lookups performed at all
    expect((OutcomeMeasurement.findAll as jest.Mock).mock.calls[0][0].where.status).toBe('scheduled');
  });
});

describe('getOutcomeMeasurementsSummary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('happy path: counts scheduled vs observed, and observed rows by outcome_status', async () => {
    jest.spyOn(OutcomeMeasurement, 'findAll').mockResolvedValue([
      { status: 'scheduled', outcome_status: 'pending' },
      { status: 'scheduled', outcome_status: 'pending' },
      { status: 'observed', outcome_status: 'stable' },
      { status: 'observed', outcome_status: 'recurrence_detected' },
      { status: 'observed', outcome_status: 'insufficient_data' },
      { status: 'observed', outcome_status: 'stable' },
    ] as any);

    const result = await getOutcomeMeasurementsSummary();

    expect(result).toEqual({
      scheduled: 2,
      observed: 4,
      stable: 2,
      recurrence_detected: 1,
      insufficient_data: 1,
    });
  });

  test('boundary: empty table returns all-zero summary, no crash', async () => {
    jest.spyOn(OutcomeMeasurement, 'findAll').mockResolvedValue([] as any);
    await expect(getOutcomeMeasurementsSummary()).resolves.toEqual({
      scheduled: 0,
      observed: 0,
      stable: 0,
      recurrence_detected: 0,
      insufficient_data: 0,
    });
  });
});

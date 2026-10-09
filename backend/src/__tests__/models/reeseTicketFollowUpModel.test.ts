/**
 * Reese ticket follow-up model tests. Deliberately imports ReeseTicketFollowUp
 * DIRECTLY from its own file, never via models/index.ts's 215-model barrel —
 * that barrel triggers a full association-graph load that crashes plain-object
 * mocks (the same gotcha this codebase has hit repeatedly; reeseOutreachModel.test.ts
 * imports the barrel and is, as a result, excluded from CI entirely via
 * jest.ci.config.ts's testPathIgnorePatterns). This model is intentionally kept
 * OUT of that barrel (no association declared), matching ReeseOutreach.ts's/
 * ReeseWelcome.ts's own real pattern of being imported directly by every real
 * caller rather than through models/index.ts.
 */

jest.mock('../../config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('postgres://mock:mock@localhost:5432/mock', {
    dialect: 'postgres',
    logging: false,
  });
  return { sequelize, connectDatabase: jest.fn() };
});

import ReeseTicketFollowUp from '../../models/ReeseTicketFollowUp';

describe('ReeseTicketFollowUp model — defaults', () => {
  test('attempt_count defaults to 0 — creating the row does not itself count as a send', () => {
    const attr = (ReeseTicketFollowUp as any).rawAttributes.attempt_count;
    expect(attr.defaultValue).toBe(0);
  });
  test('status defaults to active', () => {
    const attr = (ReeseTicketFollowUp as any).rawAttributes.status;
    expect(attr.defaultValue).toBe('active');
  });
  test('ticket_id has a unique index — one row per ticket, never duplicated', () => {
    const indexes = (ReeseTicketFollowUp as any).options.indexes;
    const ticketIdIndex = indexes.find((i: any) => i.fields?.includes('ticket_id'));
    expect(ticketIdIndex).toBeDefined();
    expect(ticketIdIndex.unique).toBe(true);
  });
});

describe('ReeseTicketFollowUp model — round trip (mocked Sequelize call boundary)', () => {
  test('create() then findOne() round-trips every real field', async () => {
    const ticketId = '11111111-1111-1111-1111-111111111111';
    const roomId = '22222222-2222-2222-2222-222222222222';
    const studentEnrollmentId = '33333333-3333-3333-3333-333333333333';
    const lastFollowupAt = new Date('2026-10-02T18:00:00Z');
    const row = {
      id: 'row-1', ticket_id: ticketId, room_id: roomId, student_enrollment_id: studentEnrollmentId,
      attempt_count: 1, status: 'active', last_followup_at: lastFollowupAt,
    };

    const createSpy = jest.spyOn(ReeseTicketFollowUp, 'create').mockResolvedValueOnce(row as any);
    const findOneSpy = jest.spyOn(ReeseTicketFollowUp, 'findOne').mockResolvedValueOnce(row as any);

    const created = await ReeseTicketFollowUp.create(row as any);
    expect(created.ticket_id).toBe(ticketId);
    expect(created.attempt_count).toBe(1);

    const found = await ReeseTicketFollowUp.findOne({ where: { ticket_id: ticketId } });
    expect(found?.room_id).toBe(roomId);
    expect(found?.last_followup_at).toEqual(lastFollowupAt);

    createSpy.mockRestore();
    findOneSpy.mockRestore();
  });

  test('a second create() for the same ticket_id is rejected, not silently duplicated', async () => {
    const { UniqueConstraintError } = require('sequelize');
    const ticketId = '44444444-4444-4444-4444-444444444444';

    const createSpy = jest.spyOn(ReeseTicketFollowUp, 'create');
    createSpy.mockResolvedValueOnce({ id: 'row-1', ticket_id: ticketId } as any);
    createSpy.mockRejectedValueOnce(
      new UniqueConstraintError({
        message: 'duplicate key value violates unique constraint "idx_reese_ticket_followups_ticket_id"',
      }),
    );

    const first = await ReeseTicketFollowUp.create({ ticket_id: ticketId } as any);
    expect(first.ticket_id).toBe(ticketId);

    await expect(ReeseTicketFollowUp.create({ ticket_id: ticketId } as any)).rejects.toBeInstanceOf(UniqueConstraintError);

    expect(createSpy).toHaveBeenCalledTimes(2);
    createSpy.mockRestore();
  });
});

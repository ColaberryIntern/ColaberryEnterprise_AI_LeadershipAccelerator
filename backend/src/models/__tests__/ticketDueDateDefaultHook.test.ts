/**
 * Ticket's beforeValidate due-date-default hook (`setDefaultTicketDueDate`,
 * ticket due-date validation gap fix, 2026-09-28). Tests the exported handler
 * function DIRECTLY, bypassing Sequelize's own hook-execution machinery
 * entirely — mirrors `models/__tests__/ticketCreationLedgerHook.test.ts`'s
 * established pattern for the identical class of problem (many direct
 * `.create()` call sites, one required guarantee fixed at the model layer).
 *
 * The critical property under test: a real, non-null due_date the caller
 * already set is NEVER overwritten; a missing one always gets a real value.
 */
import { setDefaultTicketDueDate } from '../ticketDueDateDefaultHook';

describe('setDefaultTicketDueDate', () => {
  it('defaults due_date when it is undefined, based on the real priority', () => {
    const instance: { due_date?: Date | string | null; priority?: any } = { priority: 'critical' };
    setDefaultTicketDueDate(instance);
    expect(instance.due_date).toBeInstanceOf(Date);
    const hoursAhead = (instance.due_date!.getTime() - Date.now()) / (60 * 60 * 1000);
    expect(hoursAhead).toBeGreaterThan(23.9);
    expect(hoursAhead).toBeLessThan(24.1);
  });

  it('defaults due_date when it is explicitly null (the real sla_due_at ?? null case)', () => {
    const instance: { due_date?: Date | string | null; priority?: any } = { due_date: null, priority: 'high' };
    setDefaultTicketDueDate(instance);
    expect(instance.due_date).toBeInstanceOf(Date);
    const hoursAhead = ((instance.due_date as Date).getTime() - Date.now()) / (60 * 60 * 1000);
    expect(hoursAhead).toBeGreaterThan(47.9);
    expect(hoursAhead).toBeLessThan(48.1);
  });

  it('never overwrites an explicit real Date due_date', () => {
    const explicit = new Date('2026-12-25T00:00:00.000Z');
    const instance: { due_date?: Date | string | null; priority?: any } = { due_date: explicit, priority: 'critical' };
    setDefaultTicketDueDate(instance);
    expect(instance.due_date).toBe(explicit);
  });

  it('never overwrites an explicit string due_date', () => {
    const instance: { due_date?: Date | string | null; priority?: any } = { due_date: '2026-12-25', priority: 'critical' };
    setDefaultTicketDueDate(instance);
    expect(instance.due_date).toBe('2026-12-25');
  });

  it('falls back to the medium window when priority is missing', () => {
    const instance: { due_date?: Date | string | null; priority?: any } = {};
    setDefaultTicketDueDate(instance);
    expect(instance.due_date).toBeInstanceOf(Date);
    const hoursAhead = ((instance.due_date as Date).getTime() - Date.now()) / (60 * 60 * 1000);
    expect(hoursAhead).toBeGreaterThan(71.9);
    expect(hoursAhead).toBeLessThan(72.1);
  });
});

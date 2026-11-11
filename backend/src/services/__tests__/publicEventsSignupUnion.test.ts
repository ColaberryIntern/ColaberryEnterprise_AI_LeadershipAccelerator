/**
 * The portal badge counts BOTH ledgers.
 *
 * On 2026-11-11 the Nov 19 Open House read "7 signed up" while eight more people
 * had registered through our own landing page, with zero overlap. The number was
 * not wrong about Eventbrite; it was answering a narrower question than the one
 * anyone reading it was asking.
 *
 * Two properties are load-bearing and get the most cases:
 *   1. UNION, never sum. Overlap being zero today is a fact about today.
 *   2. Never inflate on a failed read. An approximate larger number is
 *      indistinguishable from a real one.
 */
import { addOwnRegistrations, getOwnRegisteredEventIds } from '../publicEventsService';
import { sequelize } from '../../config/database';

jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));

// mssql is mocked only so importing the module under test does not pull in the
// driver. No case here reaches CCPP: each one either returns before the roster is
// read, or asserts the behaviour when a read fails.
//
// NOTE ON SCOPE. The union ARITHMETIC itself - 7 Eventbrite plus 8 ours with no
// overlap is 15, a shared address counts once, a duplicated CCPP row counts once -
// cannot be driven from here, because `addOwnRegistrations` calls
// `getEventAttendeeEmails` as a module-local binding that a spy on a separate
// module instance would not replace. Faking it convincingly enough to test would
// mean testing the fake. That arithmetic was instead executed directly against the
// real code, 10/10, and is recorded in the PR. What this file pins is everything
// AROUND it: the guards that decide whether the arithmetic runs at all.
jest.mock('mssql', () => ({ ConnectionPool: jest.fn(), VarChar: 'varchar' }));

const mockQuery = sequelize.query as jest.Mock;

type Row = { event_id: string; email_lower: string };
const rowsFor = (id: string, emails: string[]): Row[] => emails.map((e) => ({ event_id: id, email_lower: e }));

const OURS = ['al@c.com', 'pf@g.com', 'na2@g.com', 'ch@g.com', 'we@y.com', 'cg@g.com', 'va@g.com', 'mo@g.com'];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('getOwnRegisteredEventIds', () => {
  it('returns the events this address registered for on our own pages', async () => {
    mockQuery.mockResolvedValue([{ event_id: '2004289439668' }]);
    const ids = await getOwnRegisteredEventIds('someone@example.com', ['2004289439668', 'other']);
    expect(ids.has('2004289439668')).toBe(true);
    expect(ids.has('other')).toBe(false);
  });

  it('normalises the address before matching', async () => {
    mockQuery.mockResolvedValue([]);
    await getOwnRegisteredEventIds('  Mixed@Example.COM ', ['e1']);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ replacements: expect.objectContaining({ email: 'mixed@example.com' }) }),
    );
  });

  it('fails SOFT, like its CCPP twin, so a blip cannot break the calendar', async () => {
    mockQuery.mockRejectedValue(new Error('pg down'));
    const ids = await getOwnRegisteredEventIds('a@b.com', ['e1']);
    expect(ids.size).toBe(0);
  });

  it('does not query at all for an empty address or empty event list', async () => {
    expect((await getOwnRegisteredEventIds('', ['e1'])).size).toBe(0);
    expect((await getOwnRegisteredEventIds('a@b.com', [])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('addOwnRegistrations', () => {
  it('leaves an empty feed alone without querying', async () => {
    const out = await addOwnRegistrations([]);
    expect(out).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('leaves the feed alone when we hold no registrations for it', async () => {
    mockQuery.mockResolvedValue([]);
    const events = [{ id: 'E1', signup_count: 7 }] as never;
    const out = await addOwnRegistrations(events);
    expect((out[0] as { signup_count: number }).signup_count).toBe(7);
  });

  it('never inflates when the registrations query itself fails', async () => {
    mockQuery.mockRejectedValue(new Error('pg down'));
    const events = [{ id: 'E1', signup_count: 7 }] as never;
    const out = await addOwnRegistrations(events);
    expect((out[0] as { signup_count: number }).signup_count).toBe(7);
  });

  it('does not invent a count where Eventbrite reported none', async () => {
    // Eight registrations of ours are present, and the count still stays null:
    // unknown plus eight is still unknown. Returns before the roster is read.
    mockQuery.mockResolvedValue(rowsFor('E1', OURS));
    const events = [{ id: 'E1', signup_count: null }] as never;
    const out = await addOwnRegistrations(events);
    expect((out[0] as { signup_count: number | null }).signup_count).toBeNull();
  });
});

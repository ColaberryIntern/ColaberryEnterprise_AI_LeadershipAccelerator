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
// Mocked BEFORE the module under test is imported, matching the setup in
// publicEventsService.test.ts. `../../models` matters: models/index.ts calls
// Cohort.init() against the real Sequelize instance at import time, so a stubbed
// database without a working `define` makes the whole suite fail to run - which is
// exactly how the second push of this change failed.
jest.mock('mssql', () => {
  const request = { input: jest.fn().mockReturnThis(), query: jest.fn() };
  const pool = {
    connect: jest.fn().mockResolvedValue(undefined),
    request: jest.fn(() => request),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, ConnectionPool: jest.fn(() => pool), NVarChar: 'NVarChar', VarChar: 'VarChar', Int: 'Int' };
});
jest.mock('../../config/env', () => ({
  env: { mssqlHost: 'h', mssqlPort: 1433, mssqlUser: 'u', mssqlPass: 'p', mssqlDatabase: 'CCPP' },
}));
jest.mock('../../models', () => ({ OpenHouseEvent: { findAll: jest.fn() } }));
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { addOwnRegistrations, getOwnRegisteredEventIds } from '../publicEventsService';
import { sequelize } from '../../config/database';

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

describe('this module must not pull in the database at import time', () => {
  // THE REGRESSION THIS PINS. The first push of this change added a top-level
  // `import { sequelize } from '../config/database'`. That module builds its
  // Sequelize instance as a SIDE EFFECT of being imported, from a connection URL
  // absent in the test environment - so it took down `publicEventsService.test.ts`
  // and `openHouseEventService.test.ts` with "Test suite failed to run", not with a
  // failing assertion. Two suites that have nothing to do with this feature.
  //
  // A static read of the source is the right check: it fails for the exact reason a
  // human would, and it does not depend on whether DATABASE_URL happens to be set
  // in whichever tier is running.
  const SOURCE = readFileSync(join(__dirname, '..', 'publicEventsService.ts'), 'utf8');
  // Imports only - the lazy `await import(...)` inside a function is the fix, not
  // the defect, so the check must not match it.
  const TOP_LEVEL_IMPORTS = SOURCE.split(/\n(?=(?:export )?(?:async )?function |const |let )/)[0];

  it('does not import config/database at the top level', () => {
    expect(TOP_LEVEL_IMPORTS).not.toMatch(/^import .*config\/database/m);
  });

  it('CONTROL: the lazy import inside a function IS present', () => {
    // Without this, the check above would also pass if the Postgres access were
    // simply deleted, which is the wrong way to make a test go green.
    expect(SOURCE).toMatch(/await import\('\.\.\/config\/database'\)/);
  });
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

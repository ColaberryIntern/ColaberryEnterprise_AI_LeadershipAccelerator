jest.mock('mssql', () => ({ __esModule: true, ConnectionPool: jest.fn(), NVarChar: 'NVarChar', VarChar: 'VarChar', Int: 'Int' }));
jest.mock('../../../../config/env', () => ({ env: { mssqlHost: 'h', mssqlPort: 1433, mssqlUser: 'u', mssqlPass: 'p', mssqlDatabase: 'CCPP' } }));
jest.mock('../../../../models', () => ({ OpenHouseEvent: { findAll: jest.fn() } }));
const mockPgQuery = jest.fn();
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockPgQuery(...a) } }));
const mockOurs = jest.fn();
jest.mock('../../../openHouseRegistrationStore', () => ({ listOpenHouseRegistrations: (...a: unknown[]) => mockOurs(...a) }));

import { listRegistrants, mergeRegistrants, RegistrantsNotFound } from '../registrants';
import { NotConfiguredError, type EventbriteSource } from '../eventbriteSource';
import type { EventbriteEventView } from '../eventbriteEvents';

/**
 * CH9.3 registrants: one row per person across Eventbrite and our site, CCPP's wrapped emails
 * cleaned, only public events, a partial list said to be partial, and no person ever logged.
 */
const EVENT: EventbriteEventView = { ccpp_event_id: '777', title: 'AI Open House', starts_at: '2026-12-04T00:30:00.000Z', ends_at: null, registration_url: null, image_url: null, registered: 3, eventbrite_status: 'live' };
// CCPP Central wall-clock read as UTC: 10:00 "Z" is 10:00 AM Central = 16:00Z in November.
const att = (email: string | null, name: string | null, at: string | null, phone: string | null = null) => ({ EventId: '777', AttendeeName: name, Email: email, PhoneNumber: phone, OrderId: 1, CreatedDate: at ? new Date(at) : null });
const source = (rows: ReturnType<typeof att>[] | Error): EventbriteSource => ({
  kind: 'fixture', listEvents: jest.fn(), listAttendees: jest.fn(() => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows))),
});
let errSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockOurs.mockResolvedValue([]);
  mockPgQuery.mockResolvedValue([]);
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errSpy.mockRestore());

describe('mergeRegistrants (pure)', () => {
  it("cleans CCPP's wrapped emails and names, and one person across both sources is one row", () => {
    const rows = mergeRegistrants(
      [att("'Ada@Example.test',", "'Ada Lovelace',", '2026-11-10T10:00:00Z', "'+1 214 555 0100',"), att("'ada@example.test',", "'Ada Lovelace',", '2026-11-10T10:00:00Z')],
      [{ email_lower: 'ada@example.test', name: 'Ada L.', enrollment_id: null, created_at: '2026-11-09T12:00:00.000Z' }],
    );
    expect(rows).toEqual([{
      name: 'Ada Lovelace', email: 'ada@example.test', phone: '+1 214 555 0100',
      registered_at: '2026-11-09T12:00:00.000Z', // the earlier of the two
      sources: ['eventbrite', 'site'], enrollment_linked: false,
    }]);
  });
  it('the CCPP time is read as Central', () => {
    expect(mergeRegistrants([att('a@x.test', 'A', '2026-11-10T10:00:00Z')], [])[0].registered_at).toBe('2026-11-10T16:00:00.000Z');
  });
  it('drops rows with no usable email; keeps the first non-empty name and phone', () => {
    const rows = mergeRegistrants([att(null, 'Nobody', null), att('not-an-email', 'X', null), att('b@x.test', '', null), att('b@x.test', 'Bea', null, '555')], []);
    expect(rows).toEqual([{ name: 'Bea', email: 'b@x.test', phone: '555', registered_at: null, sources: ['eventbrite'], enrollment_linked: false }]);
  });
  it('orders by time, then email, so the same data always gives the same list', () => {
    const ccpp = [att('c@x.test', 'C', '2026-11-12T10:00:00Z'), att('a@x.test', 'A', '2026-11-11T10:00:00Z'), att('b@x.test', 'B', '2026-11-11T10:00:00Z')];
    const once = mergeRegistrants(ccpp, []).map((r) => r.email);
    expect(once).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
    expect(mergeRegistrants([...ccpp].reverse(), []).map((r) => r.email)).toEqual(once);
  });
  it('a linked enrollment on our row marks the account', () => {
    expect(mergeRegistrants([], [{ email_lower: 'k@x.test', name: 'K', enrollment_id: 'e-1', created_at: '2026-11-01T00:00:00Z' }])[0].enrollment_linked).toBe(true);
  });
});

describe('listRegistrants', () => {
  it('refuses an event that is not on the public list', async () => {
    await expect(listRegistrants('999', { source: source([]), findEvent: async () => null })).rejects.toBeInstanceOf(RegistrantsNotFound);
    expect(mockOurs).not.toHaveBeenCalled();
  });
  it('the full list, with platform accounts matched by email; phones kept for the CSV', async () => {
    mockOurs.mockResolvedValue([{ email_lower: 'site@x.test', name: 'Site Person', enrollment_id: null, created_at: '2026-11-15T00:00:00Z' }]);
    mockPgQuery.mockResolvedValue([{ e: 'ada@x.test' }]);
    const list = await listRegistrants('777', { source: source([att("'ada@x.test',", 'Ada', '2026-11-10T10:00:00Z', '555')]), findEvent: async () => EVENT });
    expect(list.eventbrite).toBe('ok');
    expect(list.event).toEqual({ ccpp_event_id: '777', title: 'AI Open House', starts_at: EVENT.starts_at });
    expect(list.rows.map((r) => [r.email, r.has_account, r.phone])).toEqual([['ada@x.test', true, '555'], ['site@x.test', false, '']]);
    const [sql, opts] = mockPgQuery.mock.calls[0];
    expect(sql).toMatch(/FROM enrollments WHERE LOWER\(TRIM\(email\)\) IN \(:emails\)/);
    expect(opts.replacements.emails).toEqual(['ada@x.test', 'site@x.test']);
  });
  it('Eventbrite failing still shows our own registrations, marked partial, and logs without any person', async () => {
    mockOurs.mockResolvedValue([{ email_lower: 'site@x.test', name: 'Site Person', enrollment_id: null, created_at: '2026-11-15T00:00:00Z' }]);
    const list = await listRegistrants('777', { source: source(new Error('ECONNRESET')), findEvent: async () => EVENT });
    expect(list.eventbrite).toBe('unavailable');
    expect(list.rows.map((r) => r.email)).toEqual(['site@x.test']);
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('UpstreamUnavailable');
    expect(logged).not.toContain('site@x.test');
  });
  it('Eventbrite not set up is not_configured; the public list being unreadable is unavailable', async () => {
    expect((await listRegistrants('777', { source: source(new NotConfiguredError()), findEvent: async () => EVENT })).eventbrite).toBe('not_configured');
    const s = source([]);
    const l = await listRegistrants('777', { source: s, findEvent: async () => 'unavailable' });
    expect(l.eventbrite).toBe('unavailable');
    expect(s.listAttendees).not.toHaveBeenCalled();
  });
  it('our own table failing is an error, not an empty list', async () => {
    mockOurs.mockRejectedValue(new Error('relation does not exist'));
    await expect(listRegistrants('777', { source: source([]), findEvent: async () => EVENT })).rejects.toThrow('relation does not exist');
  });
  it('boundaries: nobody registered is an empty ok list with no account lookup; 2,000 people are all kept', async () => {
    const none = await listRegistrants('777', { source: source([]), findEvent: async () => EVENT });
    expect([none.eventbrite, none.rows.length]).toEqual(['ok', 0]);
    expect(mockPgQuery).not.toHaveBeenCalled();
    const many = Array.from({ length: 2000 }, (_x, i) => att(`p${i}@x.test`, `P${i}`, '2026-11-10T10:00:00Z'));
    expect((await listRegistrants('777', { source: source(many), findEvent: async () => EVENT })).rows).toHaveLength(2000);
  });
});

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../emailService', () => ({ guardedSendMail: jest.fn(), resolveEmailRecipient: jest.fn() }));
jest.mock('../../settingsService', () => ({ getSetting: jest.fn() }));

import { listReminders, scheduleReminder, sendDueReminders } from '../reminders';
import { afterQuietHours, centralClock, centralToInstant, inQuietHours, reminderTime, TooLateError } from '../reminderTime';
import { NotFoundError } from '../sessions';

beforeEach(() => { mockQuery.mockReset().mockResolvedValue([[], 0]); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('reminder times, Central (CP4.5)', () => {
  it('tonight is 6:00 PM Central today, in CST and in CDT', () => {
    expect(reminderTime('tonight', new Date('2026-11-16T15:00:00Z')).toISOString()).toBe('2026-11-17T00:00:00.000Z');
    expect(reminderTime('tonight', new Date('2026-07-01T15:00:00Z')).toISOString()).toBe('2026-07-01T23:00:00.000Z');
  });
  it('tonight asked at or after 6:00 PM is refused', () => {
    expect(() => reminderTime('tonight', new Date('2026-11-17T00:00:00Z'))).toThrow(TooLateError);
  });
  it('tomorrow is the next Central date at the session start time, exact across the DST change', () => {
    // Session at 5:30 PM CDT on Sat 31 Oct 2026; clocks fall back on Sun 1 Nov: tomorrow is 5:30 PM CST.
    const start = new Date('2026-10-31T22:30:00Z');
    expect(reminderTime('tomorrow', start, start).toISOString()).toBe('2026-11-01T23:30:00.000Z');
    expect(centralClock(new Date('2026-11-01T23:30:00Z'))).toEqual({ date: '2026-11-01', hour: 17, minute: 30 });
  });
  it('quiet hours (9:00 PM to 8:00 AM Central) move a reminder to 8:00 AM', () => {
    expect(inQuietHours(new Date('2026-11-17T03:30:00Z'))).toBe(true); // 9:30 PM CST
    expect(inQuietHours(new Date('2026-11-17T02:59:00Z'))).toBe(false); // 8:59 PM CST
    expect(afterQuietHours(new Date('2026-11-17T03:30:00Z')).toISOString()).toBe('2026-11-17T14:00:00.000Z'); // next morning 8:00 AM CST
    expect(afterQuietHours(new Date('2026-11-17T11:00:00Z')).toISOString()).toBe('2026-11-17T14:00:00.000Z'); // 5:00 AM -> 8:00 AM same day
    // A session started at 10:15 PM: same time tomorrow is in quiet hours, so 8:00 AM the day after.
    const late = new Date('2026-11-17T04:15:00Z');
    expect(reminderTime('tomorrow', late, late).toISOString()).toBe('2026-11-18T14:00:00.000Z');
  });
  it('a wall time skipped by spring-forward lands on the hour after it', () => {
    expect(centralToInstant('2026-03-08', 2, 30).toISOString()).toBe('2026-03-08T07:30:00.000Z'); // 2:30 does not exist; 3:30 CDT
  });
});

describe('scheduleReminder (CP4.5)', () => {
  const NOON = new Date('2026-11-16T18:00:00Z');
  it('asking twice makes one reminder: the second ask returns the first', async () => {
    mockQuery
      .mockResolvedValueOnce([[{ started_at: null }], 1])
      .mockResolvedValueOnce([[{ id: 'r1', kind: 'tonight', send_at: '2026-11-17T00:00:00Z', status: 'pending' }], 1]);
    expect(await scheduleReminder('e1', 'tonight', { planId: 'p1' }, NOON)).toMatchObject({ created: true, reminder: { id: 'r1', sendAt: '2026-11-17T00:00:00.000Z' } });
    expect(mockQuery.mock.calls[1][0]).toContain('ON CONFLICT (ref, kind) DO NOTHING');
    expect(mockQuery.mock.calls[1][1].replacements).toMatchObject({ ref: 'plan:p1', kind: 'tonight' });
    mockQuery
      .mockResolvedValueOnce([[{ started_at: null }], 1])
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([[{ id: 'r1', kind: 'tonight', send_at: '2026-11-17T00:00:00Z', status: 'pending' }], 1]);
    expect(await scheduleReminder('e1', 'tonight', { planId: 'p1' }, NOON)).toMatchObject({ created: false, reminder: { id: 'r1' } });
  });
  it("another student's plan or session is not found, and nothing is written", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await expect(scheduleReminder('e2', 'tomorrow', { sessionId: 's1' }, NOON)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({ id: 's1', e: 'e2' });
  });
  it('tomorrow for a session uses the session start time', async () => {
    mockQuery.mockResolvedValueOnce([[{ started_at: '2026-11-16T23:30:00Z' }], 1]).mockResolvedValueOnce([[{ id: 'r2', kind: 'tomorrow', send_at: '2026-11-17T23:30:00Z', status: 'pending' }], 1]);
    await scheduleReminder('e1', 'tomorrow', { sessionId: 's1' }, new Date('2026-11-17T00:10:00Z'));
    expect(mockQuery.mock.calls[1][1].replacements).toMatchObject({ ref: 'session:s1', at: new Date('2026-11-17T23:30:00Z') });
  });
  it('lists pending reminders and the ones sent in the last 12 hours', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'r1', kind: 'tonight', send_at: '2026-11-17T00:00:00Z', status: 'sent' }], 1]);
    expect(await listReminders('e1', NOON)).toEqual([{ id: 'r1', kind: 'tonight', sendAt: '2026-11-17T00:00:00.000Z', status: 'sent' }]);
    expect(mockQuery.mock.calls[0][0]).toContain("INTERVAL '12 hours'");
  });
});

describe('sendDueReminders (CP4.5)', () => {
  const DAY = new Date('2026-11-17T00:00:00Z'); // 6:00 PM CST
  const due = (over: Record<string, unknown> = {}) => ({ id: 'r1', enrollment_id: 'e1', email: 'ali@example.com', full_name: 'Ali Muwwakkil', ...over });
  const deps = (over: Record<string, unknown> = {}) => ({ read: jest.fn(async () => null), enabled: jest.fn(async () => true), mail: jest.fn(async () => undefined), ...over });

  it('kill switch on: nothing is claimed and nothing is sent', async () => {
    const d = deps({ read: jest.fn(async () => true) });
    expect(await sendDueReminders(DAY, d)).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(d.mail).not.toHaveBeenCalled();
  });
  it('a kill switch that cannot be read counts as on (fail closed)', async () => {
    const d = deps({ read: jest.fn(async () => { throw new Error('settings down'); }) });
    expect(await sendDueReminders(DAY, d)).toBe(0);
    expect(d.mail).not.toHaveBeenCalled();
  });
  it('in quiet hours nothing is sent; due reminders move to 8:00 AM Central', async () => {
    const d = deps();
    expect(await sendDueReminders(new Date('2026-11-17T04:00:00Z'), d)).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain("UPDATE prep_reminders SET send_at = :next WHERE status = 'pending'");
    expect(mockQuery.mock.calls[0][1].replacements.next.toISOString()).toBe('2026-11-17T14:00:00.000Z');
    expect(d.mail).not.toHaveBeenCalled();
  });
  it('claims due reminders before sending (so two runs never send one twice), then emails each', async () => {
    mockQuery.mockResolvedValueOnce([[due()], 1]);
    const d = deps();
    expect(await sendDueReminders(DAY, d)).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toMatch(/SET status = 'sent'[\s\S]*FOR UPDATE SKIP LOCKED/);
    expect(d.mail).toHaveBeenCalledWith('ali@example.com', 'Ali Muwwakkil');
  });
  it('a student no longer on the allow-list is skipped, and a failed email is marked failed', async () => {
    mockQuery.mockResolvedValueOnce([[due(), due({ id: 'r2', enrollment_id: 'e2' })], 2]);
    const d = deps({ enabled: jest.fn(async (e: string) => e === 'e1'), mail: jest.fn(async () => { throw Object.assign(new Error('smtp'), { name: 'SmtpError' }); }) });
    expect(await sendDueReminders(DAY, d)).toBe(0);
    const marks = mockQuery.mock.calls.slice(1).map((c) => c[1].replacements);
    expect(marks).toEqual(expect.arrayContaining([{ s: 'failed', c: 'SmtpError', id: 'r1' }, { s: 'skipped', c: 'NotEnabled', id: 'r2' }]));
  });
});

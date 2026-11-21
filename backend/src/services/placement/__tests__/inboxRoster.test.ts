const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../settingsService', () => ({ getSetting: async () => null }));
jest.mock('../../careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: async () => true }));

import { displayName, lookupRoster } from '../inboxRoster';

/** CP6.2 (kit F3): the roster entry, four fields, only for Career Prep learners. */
beforeEach(() => mockQuery.mockReset());

describe('lookupRoster', () => {
  it('finds the learner by canonical mailbox and returns exactly the four fields', async () => {
    mockQuery.mockResolvedValueOnce([[{ enrollment_id: 'enr-ali', full_name: 'Ann Marie Lee', email: 'ann.personal@example.com', phone: '555' }], 1]);
    const e = await lookupRoster('Ann.Lee.Careers+x@googlemail.com', { read: async () => null, enabled: async () => true });
    expect(e).toEqual({ participant_id: 'enr-ali', display_name: 'Ann L.', recruiter: null, notify_ok: true });
    expect(mockQuery.mock.calls[0][1].replacements.m).toBe('annleecareers@gmail.com');
    expect(String(mockQuery.mock.calls[0][0])).not.toMatch(/\bemail\b|\bphone\b/);
  });
  it('notify_ok is false once the platform\'s employer mail is switched on; absent, "false" or unreadable = off = true', async () => {
    const row = [[{ enrollment_id: 'enr-ali', full_name: 'Ann Lee' }], 1];
    mockQuery.mockResolvedValue(row);
    expect((await lookupRoster('annlee@gmail.com', { read: async () => true, enabled: async () => true }))?.notify_ok).toBe(false);
    expect((await lookupRoster('annlee@gmail.com', { read: async () => 'false', enabled: async () => true }))?.notify_ok).toBe(true);
    expect((await lookupRoster('annlee@gmail.com', { read: async () => null, enabled: async () => true }))?.notify_ok).toBe(true);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unreadable = Object.assign(new Error('db'), { name: 'SequelizeConnectionError' });
    expect((await lookupRoster('annlee@gmail.com', { read: async () => { throw unreadable; }, enabled: async () => true }))?.notify_ok).toBe(true);
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line).toMatchObject({ level: 'warn', event: 'placement_switch_unreadable', error_class: 'SequelizeConnectionError', outcome: 'failure' });
    warn.mockRestore();
  });
  it('not on the roster: unknown address, a non-Gmail address (no query), or Career Prep off for that learner', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    expect(await lookupRoster('nobody@gmail.com', { enabled: async () => true })).toBeNull();
    expect(await lookupRoster('ann@yahoo.com')).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    mockQuery.mockResolvedValueOnce([[{ enrollment_id: 'enr-2', full_name: 'Bo Ray' }], 1]);
    expect(await lookupRoster('bo@gmail.com', { enabled: async () => false })).toBeNull();
  });
});

describe('displayName', () => {
  it('first name and last initial, never the full name', () => {
    expect(displayName('Ann Marie Lee')).toBe('Ann L.');
    expect(displayName('  cher  ')).toBe('cher');
    expect(displayName('')).toBe('Learner');
    expect(displayName(null)).toBe('Learner');
  });
});

/**
 * The public booking service: open times and a request for one. The database, the listing gate
 * and the candidate's settings are mocked at their modules; the slot rules run for real.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../hireTalentIndex', () => ({ loadHireIndex: jest.fn() }));
jest.mock('../hireStudioSettings', () => ({ readAvailability: jest.fn() }));

import { sequelize } from '../../../config/database';
import { loadHireIndex } from '../hireTalentIndex';
import { readAvailability } from '../hireStudioSettings';
import { bookingSummary, interviewRequestSchema, requestInterview, talentSlots } from '../hireInterviews';

const q = sequelize.query as unknown as jest.Mock;
const tx = sequelize.transaction as unknown as jest.Mock;
const index = loadHireIndex as unknown as jest.Mock;
const avail = readAvailability as unknown as jest.Mock;

const E1 = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-12T16:00:00Z'); // Thu 10:00 CT
const ENTRY = { page: { enrollment_id: E1, slug: 'ann-lee' }, cases: [{ slug: 'case-a' }, { slug: 'case-b' }] };
const OPEN = { enabled: true, tz: 'America/Chicago', blocks: ['Mon-morning'], formats: ['intro', 'walkthrough'], maxPerWeek: null, minNoticeHours: 24, autoConfirm: false };
const MON_9 = '2026-11-16T15:00:00.000Z'; // Mon 16 Nov, 9:00 CST

/** Answer each SQL by what it is, so the order of calls does not matter. */
function db({ held = [] as unknown[], dupe = false } = {}) {
  q.mockImplementation(async (sql: string) => {
    if (/pg_advisory_xact_lock/.test(sql)) return [[]];
    if (/SELECT id FROM hire_interviews/.test(sql)) return [dupe ? [{ id: 'x' }] : []];
    if (/SELECT starts_at, minutes/.test(sql)) return [held];
    if (/INSERT INTO hire_interviews/.test(sql)) return [[]];
    throw new Error('unexpected SQL: ' + sql);
  });
}

const body = (o: Record<string, unknown> = {}) => ({
  talentSlug: 'ann-lee', format: 'intro', startsAt: MON_9, name: 'Jane Roe', email: 'Jane@Acme.com',
  company: 'Acme', role: 'Head of Data', message: 'We need an FDE', ...o,
});
const inserts = () => q.mock.calls.filter(([sql]) => /INSERT INTO hire_interviews/.test(sql));

beforeEach(() => {
  q.mockReset(); index.mockReset().mockResolvedValue([ENTRY]); avail.mockReset().mockResolvedValue(OPEN);
  tx.mockReset().mockImplementation(async (fn: (t: unknown) => unknown) => fn({ id: 'tx' }));
  db();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('talentSlots - GET /talent/:slug/slots', () => {
  it('lists open times for the shortest accepted format, each with its day in the viewer zone', async () => {
    const out: any = await talentSlots('ann-lee', { tz: 'America/New_York', from: '2026-11-16' }, NOW);
    expect(out.status).toBe('ok');
    expect(out.body.format).toBe('intro');
    expect(out.body.minutes).toBe(20);
    expect(out.body.slots[0]).toEqual({ start: MON_9, end: '2026-11-16T15:20:00.000Z', day: '2026-11-16' });
    expect(out.body.formats.map((f: any) => f.id)).toEqual(['intro', 'walkthrough']);
    expect(index).toHaveBeenCalledWith(['public', 'unlisted'], 'ann-lee');
  });

  it('is empty, not an error, when the candidate has not turned booking on', async () => {
    avail.mockResolvedValue({ ...OPEN, enabled: false });
    const out: any = await talentSlots('ann-lee', {}, NOW);
    expect(out.body).toMatchObject({ format: null, formats: [], slots: [] });
  });

  it('is not_found for anyone not reachable on Hire, and invalid for a bad zone or format', async () => {
    index.mockResolvedValue([]);
    expect(await talentSlots('nobody', {}, NOW)).toEqual({ status: 'not_found' });
    expect((await talentSlots('ann-lee', { tz: 'Mars/Olympus' }, NOW)).status).toBe('invalid');
    expect((await talentSlots('ann-lee', { format: 'lunch' }, NOW)).status).toBe('invalid');
  });

  it('never starts the window in the past', async () => {
    const out: any = await talentSlots('ann-lee', { from: '2020-01-01' }, NOW);
    expect(out.body.slots.every((s: any) => s.start > NOW.toISOString())).toBe(true);
  });
});

describe('bookingSummary - the profile card', () => {
  it('gives the next three open times when booking is on', async () => {
    const out = await bookingSummary(E1, NOW);
    expect(out.enabled).toBe(true);
    expect(out.nextSlots).toEqual([MON_9, '2026-11-16T15:30:00.000Z', '2026-11-16T16:00:00.000Z']);
  });

  it('is closed (Request intro stays) when off, or when nothing is open', async () => {
    avail.mockResolvedValue({ ...OPEN, enabled: false });
    expect(await bookingSummary(E1, NOW)).toEqual({ enabled: false, nextSlots: [], formats: [] });
    avail.mockResolvedValue({ ...OPEN, blocks: [] });
    expect((await bookingSummary(E1, NOW)).enabled).toBe(false);
  });
});

describe('requestInterview - POST /interviews', () => {
  it('records an open slot as requested, under a per-candidate lock, and returns no contact detail', async () => {
    const out = await requestInterview(body(), NOW);
    expect(out).toEqual({ status: 'created', http: 201, startsAt: MON_9, minutes: 20, format: 'intro' });
    expect(q.mock.calls[0][0]).toMatch(/pg_advisory_xact_lock/);
    expect(q.mock.calls[0][1].bind).toEqual([`hire_interviews:${E1}`]);
    const [, opts] = inserts()[0];
    expect(opts.transaction).toEqual({ id: 'tx' });
    expect(opts.bind[0]).toBe(E1);
    expect(opts.bind[7]).toBe('jane@acme.com'); // stored lower-case, for Phase 4's notifications
    expect(JSON.stringify(out)).not.toMatch(/@/);
  });

  it('accepts the no-JS form shape: comma-separated interviewers and an "on" checkbox', () => {
    const p = interviewRequestSchema.parse(body({ interviewers: 'a@x.com, b@x.com', record: 'on', caseStudySlug: '' }));
    expect(p.interviewers).toEqual(['a@x.com', 'b@x.com']);
    expect(p.record).toBe(true);
    expect(p.caseStudySlug).toBeUndefined();
    expect(interviewRequestSchema.safeParse(body({ interviewers: 'a@x.com,b@x.com,c@x.com,d@x.com,e@x.com,f@x.com' })).success).toBe(false);
    expect(interviewRequestSchema.safeParse(body({ phone: '555' })).success).toBe(false);
  });

  it('answers duplicate, and writes nothing, when the same employer asks for the same slot again', async () => {
    db({ dupe: true });
    expect((await requestInterview(body(), NOW)).status).toBe('duplicate');
    expect(inserts()).toHaveLength(0);
  });

  it('refuses a time that is not open: off-grid, inside the notice, or already held', async () => {
    expect((await requestInterview(body({ startsAt: '2026-11-16T15:10:00Z' }), NOW)).status).toBe('unavailable');
    avail.mockResolvedValueOnce({ ...OPEN, minNoticeHours: 120 }); // Monday is under 5 days away
    expect((await requestInterview(body(), NOW)).status).toBe('unavailable');
    db({ held: [{ starts_at: MON_9, minutes: 45 }] });
    expect((await requestInterview(body(), NOW)).status).toBe('unavailable');
    expect(inserts()).toHaveLength(0);
  });

  it('refuses when booking is off or the format is not accepted', async () => {
    expect((await requestInterview(body({ format: 'working' }), NOW)).status).toBe('unavailable');
    avail.mockResolvedValue({ ...OPEN, enabled: false });
    expect((await requestInterview(body(), NOW)).status).toBe('unavailable');
  });

  it('needs one of the person\'s published case studies for a walkthrough', async () => {
    expect((await requestInterview(body({ format: 'walkthrough' }), NOW)).status).toBe('invalid');
    expect((await requestInterview(body({ format: 'walkthrough', caseStudySlug: 'someone-elses' }), NOW)).status).toBe('invalid');
    const ok = await requestInterview(body({ format: 'walkthrough', caseStudySlug: 'case-b' }), NOW);
    expect(ok).toMatchObject({ status: 'created', minutes: 45 });
    expect(inserts()[0][1].bind[3]).toBe('case-b');
  });

  it('is not_found for unknown or unlisted-elsewhere talent, and invalid for a malformed body', async () => {
    index.mockResolvedValue([]);
    expect((await requestInterview(body(), NOW)).status).toBe('not_found');
    expect((await requestInterview({ talentSlug: 'ann-lee' }, NOW)).status).toBe('invalid');
    expect(tx).not.toHaveBeenCalled();
  });
});

/**
 * OH1u: Maya's follow-up after each Open House: attended gets a thank-you, missed gets the
 * recording (when set) and the next Open House. Booked only while the campaign is active.
 */
const query = jest.fn();
const transaction = jest.fn(async (a: unknown, b?: unknown) => (typeof a === 'function' ? (a as any)({ id: 'tx' }) : (b as any)({ id: 'sp' })));
const grant = jest.fn();
const createEmail = jest.fn();
const findOrCreate = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a), transaction: (...a: unknown[]) => (transaction as any)(...a) } }));
jest.mock('../../models', () => ({
  ScheduledEmail: { create: (...a: unknown[]) => createEmail(...a) },
  CampaignLead: { findOrCreate: (...a: unknown[]) => findOrCreate(...a) },
}));
jest.mock('../openHouseCountdown', () => ({
  ...jest.requireActual('../openHouseCountdown'),
  grantEventReminderPermission: (...a: unknown[]) => grant(...a),
}));
const admit = jest.fn(async () => ({ admitted: true, moved_from: [] }));
jest.mock('../campaignMembership', () => ({ admitToCampaign: (...a: unknown[]) => (admit as any)(...a) }));

import { followupCopy, screenFollowupCopy, firstNameOf, OPEN_HOUSE_SIGNUP_URL } from '../openHouseFollowupCopy';
import {
  bookOpenHouseFollowups, bookRecentOpenHouseFollowups, followupSendAt, sessionEnd, FOLLOWUP_PEOPLE_SQL,
  stepsForTrack, followupAiNotes,
} from '../openHouseFollowup';
import { PORTAL_TODAY_URL } from '../openHouseCountdown';

const quiet = () => undefined;
const NEXT = { when_label: 'Thursday, December 17 at 6:30 PM CST', registered: false };
const CAMPAIGN = { id: 'camp-f', status: 'active', sequence_id: 'seq-f', settings: { replay_urls: {} } };
const SESSION = { id: 'sess-1', title: 'Open House', session_date: '2026-12-03', start_time: '18:30', end_time: '19:30', status: 'completed', open_house_event_id: 'ev-1' };
const AFTER = new Date('2026-12-04T03:00:00Z'); // 9 PM CST Dec 3, well past the end

beforeEach(() => {
  jest.clearAllMocks();
  findOrCreate.mockResolvedValue([{ status: 'active', update: jest.fn() }, true]);
});

describe('follow-up copy', () => {
  const all = [
    followupCopy({ track: 'attended', firstName: 'Ana', eventDate: 'Thursday, December 3' }),
    followupCopy({ track: 'missed', firstName: 'Ana', eventDate: 'Thursday, December 3', next: NEXT }),
    followupCopy({ track: 'missed', firstName: 'Ana', eventDate: 'Thursday, December 3', next: { ...NEXT, registered: true } }),
    followupCopy({ track: 'missed', firstName: null, eventDate: 'Thursday, December 3', next: null }),
    followupCopy({ track: 'missed', firstName: 'Ana', eventDate: 'Thursday, December 3', replayUrl: 'https://enterprise.colaberry.ai/r/1', next: NEXT }),
  ];

  it('every variant passes the same copy screen as the countdown (no price, offer or no-cost word)', () => {
    for (const c of all) expect(screenFollowupCopy(c)).toEqual([]);
  });

  it('attended: thanks them and points to their Today page', () => {
    expect(all[0].subject).toMatch(/Thank you/);
    expect(all[0].body).toContain(PORTAL_TODAY_URL);
    expect(all[0].body).not.toContain(OPEN_HOUSE_SIGNUP_URL);
  });

  it('missed: never says they were absent, and thanks anyone who joined on Zoom', () => {
    expect(all[1].body).toMatch(/If you joined us on Zoom, thank you/);
    expect(all[1].body).not.toMatch(/you (were not|weren't) there|you missed/i);
  });

  it('missed: invites to the next Open House, or confirms they are already registered', () => {
    expect(all[1].body).toContain(NEXT.when_label);
    expect(all[1].body).toContain(OPEN_HOUSE_SIGNUP_URL);
    expect(all[2].body).toMatch(/already registered/);
    expect(all[2].body).not.toContain(OPEN_HOUSE_SIGNUP_URL);
    expect(all[3].body).toContain(OPEN_HOUSE_SIGNUP_URL);
    expect(all[3].body).toMatch(/^<p>Hi,<\/p>/);
  });

  it('missed: carries the recording only when one is set', () => {
    expect(all[4].body).toContain('https://enterprise.colaberry.ai/r/1');
    expect(all[1].body).not.toMatch(/recording/);
  });

  it('escapes the name and refuses an email-shaped first name', () => {
    expect(followupCopy({ track: 'attended', firstName: '<b>x', eventDate: 'd' }).body).toContain('Hi &lt;b&gt;x,');
    expect(firstNameOf('ana@x.io')).toBeNull();
    expect(firstNameOf('  Ana  Lee ')).toBe('Ana');
    expect(firstNameOf(null)).toBeNull();
  });

  it('a link outside the allowlist fails the screen', () => {
    const c = followupCopy({ track: 'attended', firstName: 'A', eventDate: 'd' });
    expect(screenFollowupCopy({ ...c, body: `${c.body} https://evil.example` })).toEqual([expect.stringMatching(/links somewhere else/)]);
  });
});

describe('timing', () => {
  it('sends the morning after at 10:00 AM Central', () => {
    expect(followupSendAt('2026-12-03', AFTER).toISOString()).toBe('2026-12-04T16:00:00.000Z');
  });
  it('sends right away when that morning has passed (a late run)', () => {
    const late = new Date('2026-12-10T12:00:00Z');
    expect(followupSendAt('2026-12-03', late)).toBe(late);
  });
  it('the session ends at end_time, or 90 minutes after the start without one', () => {
    expect(sessionEnd(SESSION).toISOString()).toBe('2026-12-04T01:30:00.000Z');
    expect(sessionEnd({ ...SESSION, end_time: null }).toISOString()).toBe('2026-12-04T02:00:00.000Z');
  });
});

describe('FOLLOWUP_PEOPLE_SQL', () => {
  it('attended = checked-in guests and present/late members; attended wins over missed', () => {
    expect(FOLLOWUP_PEOPLE_SQL).toMatch(/session_guests[\s\S]*NOT g\.awaiting_class/);
    expect(FOLLOWUP_PEOPLE_SQL).toMatch(/status::text IN \('present', 'late'\)/);
    expect(FOLLOWUP_PEOPLE_SQL).toMatch(/'missed'[\s\S]*NOT EXISTS \(SELECT 1 FROM here/);
  });
  it('skips removed leads and anyone already booked for this session (idempotent)', () => {
    expect(FOLLOWUP_PEOPLE_SQL).toMatch(/cl\.status = 'removed'/);
    expect(FOLLOWUP_PEOPLE_SQL).toMatch(/metadata->>'event_session_id' = CAST\(:sid AS text\)/);
  });
});

/** Route the service's SQL to canned rows. */
function db(opts: { campaign?: any; session?: any; people?: any[]; next?: any; nextRegs?: any[]; steps?: any[] } = {}) {
  query.mockImplementation(async (sql: string) => {
    if (/FROM campaigns/.test(sql)) return opts.campaign === undefined ? [CAMPAIGN] : opts.campaign ? [opts.campaign] : [];
    if (/FROM follow_up_sequences/.test(sql)) return [{ steps: opts.steps ?? [] }];
    if (/FROM live_sessions WHERE id = :sid/.test(sql)) return opts.session === undefined ? [SESSION] : opts.session ? [opts.session] : [];
    if (/session_date > CAST/.test(sql)) return opts.next ? [opts.next] : [];
    if (/FROM open_house_registrations WHERE event_id/.test(sql)) return opts.nextRegs ?? [];
    if (/pg_advisory_xact_lock/.test(sql)) return [];
    if (sql === FOLLOWUP_PEOPLE_SQL) return opts.people ?? [];
    if (/open_house_event_id IS NOT NULL AND status <> 'cancelled'/.test(sql)) return [{ id: 'sess-1' }];
    return [];
  });
}

describe('bookOpenHouseFollowups', () => {
  it('books nothing without the campaign, or while it is a draft', async () => {
    db({ campaign: null });
    expect((await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet })).outcome).toBe('no_campaign');
    db({ campaign: { ...CAMPAIGN, status: 'draft' } });
    expect((await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet })).outcome).toBe('not_active');
    expect(createEmail).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('waits until 30 minutes after the end, and ignores a non-Open-House or cancelled session', async () => {
    db();
    expect((await bookOpenHouseFollowups('sess-1', { now: new Date('2026-12-04T01:45:00Z'), log: quiet })).outcome).toBe('not_ended');
    db({ session: { ...SESSION, open_house_event_id: null } });
    expect((await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet })).outcome).toBe('not_open_house');
    db({ session: { ...SESSION, status: 'cancelled' } });
    expect((await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet })).outcome).toBe('not_open_house');
    db({ session: null });
    expect((await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet })).outcome).toBe('no_session');
    expect(createEmail).not.toHaveBeenCalled();
  });

  it('books one email per person with the right track, under a per-session lock', async () => {
    db({
      people: [
        { email: 'a@x.io', track: 'attended', lead_id: 1, name: 'Ana Lee' },
        { email: 'b@x.io', track: 'missed', lead_id: 2, name: 'Ben' },
        { email: 'c@x.io', track: 'missed', lead_id: 3, name: 'Cy' },
        { email: 'd@x.io', track: 'attended', lead_id: null, name: null },
      ],
      next: { d: '2026-12-17', start_time: '18:30', open_house_event_id: 'ev-2' },
      nextRegs: [{ email: 'c@x.io' }],
    });
    const r = await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet });
    expect(r).toMatchObject({ outcome: 'booked', attended: 2, missed: 2, booked: 3, no_lead: 1, errors: 0, screened_out: 0 });
    expect(query.mock.calls.some((c) => /pg_advisory_xact_lock/.test(String(c[0])))).toBe(true);
    const rows = createEmail.mock.calls.map((c) => c[0]);
    expect(rows.map((x) => x.metadata.followup_track)).toEqual(['attended', 'missed', 'missed']);
    expect(rows[0]).toMatchObject({ lead_id: 1, campaign_id: 'camp-f', sequence_id: 'seq-f', channel: 'email', status: 'pending', ai_instructions: null });
    expect(rows[0].metadata).toMatchObject({ event_followup: true, event_session_id: 'sess-1' });
    expect(rows[0].scheduled_for.toISOString()).toBe('2026-12-04T16:00:00.000Z');
    expect(rows[0].body).toContain('Hi Ana,');
    expect(rows[1].body).toContain(OPEN_HOUSE_SIGNUP_URL);
    expect(rows[2].body).toMatch(/already registered/);
    expect(grant).toHaveBeenCalledTimes(3);
    expect(findOrCreate).toHaveBeenCalledTimes(3);
  });

  it('includes the recording link set for that session', async () => {
    db({ campaign: { ...CAMPAIGN, settings: { replay_urls: { 'sess-1': 'https://enterprise.colaberry.ai/r/9' } } }, people: [{ email: 'b@x.io', track: 'missed', lead_id: 2, name: 'Ben' }] });
    await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet });
    expect(createEmail.mock.calls[0][0].body).toContain('https://enterprise.colaberry.ai/r/9');
  });

  it('one failed insert is counted and the rest still book', async () => {
    db({ people: [{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'A' }, { email: 'b@x.io', track: 'missed', lead_id: 2, name: 'B' }] });
    createEmail.mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'SequelizeDatabaseError' }));
    const r = await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet });
    expect(r).toMatchObject({ booked: 1, errors: 1 });
  });

  it("OH1w: with Ali's tagged steps, each person gets ONLY their track's step, AI-written with their links", async () => {
    const steps = [
      { audience: 'attended', subject: 'Thank you', delay_days: 0, channel: 'email', body_template: '', ai_instructions: 'Thank them.', step_goal: 'today page', ai_tone: 'warm' },
      { audience: 'missed', subject: 'Catch up', delay_days: 2, channel: 'email', body_template: '', ai_instructions: 'Catch them up.' },
    ];
    db({ steps, people: [{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'A' }, { email: 'b@x.io', track: 'missed', lead_id: 2, name: 'B' }] });
    const r = await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet });
    expect(r.booked).toBe(2);
    const rows = createEmail.mock.calls.map((c) => c[0]);
    expect(rows).toHaveLength(2); // never both emails to one person
    expect(rows[0]).toMatchObject({ lead_id: 1, step_index: 0, subject: 'Thank you', ai_instructions: 'Thank them.' });
    expect(rows[0].metadata).toMatchObject({ followup_track: 'attended', allowed_links: [PORTAL_TODAY_URL], primary_link: PORTAL_TODAY_URL, step_goal: 'today page' });
    expect(rows[1]).toMatchObject({ lead_id: 2, step_index: 1, subject: 'Catch up', ai_instructions: 'Catch them up.' });
    expect(rows[1].metadata.allowed_links).toEqual([OPEN_HOUSE_SIGNUP_URL]);
    expect(rows[1].metadata.ai_context_notes).toMatch(/NO recording link/);
    expect(rows[1].scheduled_for.getTime() - rows[0].scheduled_for.getTime()).toBe(2 * 86_400_000);
    // the approved fixed copy is the body until an AI draft passes the screen
    expect(rows[1].body).toContain(OPEN_HOUSE_SIGNUP_URL);
  });

  it('OH1w: booking moves the person into the follow-up (one campaign at a time)', async () => {
    db({ people: [{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'A' }] });
    await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet });
    expect(admit).toHaveBeenCalledWith('camp-f', 1, { supersede: true });
  });

  it('OH1w: re-activates a member who had finished the follow-up before (a second Open House)', async () => {
    const update = jest.fn();
    findOrCreate.mockResolvedValue([{ status: 'completed', update }, false]);
    db({ people: [{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'A' }] });
    await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet });
    expect(update).toHaveBeenCalledWith({ status: 'active', completed_at: null }, expect.anything());
  });

  it('OH1w: books only the one person when called for a lead (the countdown exit move)', async () => {
    db({ people: [{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'A' }, { email: 'b@x.io', track: 'missed', lead_id: 2, name: 'B' }] });
    const r = await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet, leadId: 2 });
    expect(r).toMatchObject({ booked: 1, attended: 0, missed: 1 });
    expect(createEmail.mock.calls[0][0].lead_id).toBe(2);
  });

  it('a re-run books nothing new (the SQL already excludes booked people)', async () => {
    db({ people: [] });
    const r = await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet });
    expect(r).toMatchObject({ outcome: 'booked', booked: 0 });
    expect(createEmail).not.toHaveBeenCalled();
  });
});

describe('OH1w: stepsForTrack and followupAiNotes', () => {
  const tagged = [
    { audience: 'attended', subject: 'a', delay_days: 0, channel: 'email', body_template: '' },
    { audience: 'missed', subject: 'm', delay_days: 2, channel: 'email', body_template: '' },
    { subject: 'everyone', delay_days: 5, channel: 'email', body_template: '' },
  ] as any[];
  it('tagged: each track gets its own steps plus untagged ones', () => {
    expect(stepsForTrack(tagged, 'attended').map((x) => x.index)).toEqual([0, 2]);
    expect(stepsForTrack(tagged, 'missed').map((x) => x.index)).toEqual([1, 2]);
  });
  it('untagged (the OH1u original): one fixed email at step 0', () => {
    expect(stepsForTrack([{ subject: 'x', delay_days: 0 }] as any, 'missed')).toEqual([{ index: 0, step: null }]);
    expect(stepsForTrack(null, 'attended')).toEqual([{ index: 0, step: null }]);
  });
  const base = { eventDate: 'Thursday, December 3', todayUrl: PORTAL_TODAY_URL, signupUrl: OPEN_HOUSE_SIGNUP_URL, replayUrl: null as string | null };
  it('attended: only the Today page', () => {
    const n = followupAiNotes({ ...base, track: 'attended', next: null });
    expect(n.allowed).toEqual([PORTAL_TODAY_URL]);
    expect(n.notes).toMatch(/CHECKED IN/);
  });
  it('missed: never "we missed you", recording only when set, sign-up only when not registered', () => {
    const plain = followupAiNotes({ ...base, track: 'missed', next: { when_label: 'Dec 17', registered: false } });
    expect(plain.notes).toMatch(/never say they were absent/);
    expect(plain.notes).toMatch(/NO recording link/);
    expect(plain.allowed).toEqual([OPEN_HOUSE_SIGNUP_URL]);
    const withReplay = followupAiNotes({ ...base, track: 'missed', replayUrl: 'https://x.io/r', next: { when_label: 'Dec 17', registered: true } });
    expect(withReplay.allowed).toEqual(['https://x.io/r']);
    expect(withReplay.notes).toMatch(/already registered/);
    expect(withReplay.notes).toMatch(/Never write a placeholder/);
  });
});

describe('bookRecentOpenHouseFollowups (the hourly run)', () => {
  it('is a no-op while the campaign is not active', async () => {
    db({ campaign: { ...CAMPAIGN, status: 'draft' } });
    expect(await bookRecentOpenHouseFollowups({ now: AFTER, log: quiet })).toEqual([]);
    expect(query.mock.calls.some((c) => /status <> 'cancelled'/.test(String(c[0])))).toBe(false);
  });
  it('books each recent Open House and never throws', async () => {
    db({ people: [] });
    expect((await bookRecentOpenHouseFollowups({ now: AFTER, log: quiet }))[0].outcome).toBe('booked');
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(bookRecentOpenHouseFollowups({ now: AFTER, log: quiet })).resolves.toEqual([]);
  });
});

/**
 * OH1z (Ali, 2026-11-22, "Add steps"): after the Open House, attendees get thank-you (day 0),
 * reserve your seat (day 3) and a last call (day 7); people who did not check in get the
 * catch-up (day 2) and an invite to the next Open House (day 5). Each step has its own approved
 * fallback copy and links, and every step after the first stops once the person has paid.
 */
const query = jest.fn();
const transaction = jest.fn(async (a: unknown, b?: unknown) => (typeof a === 'function' ? (a as any)({ id: 'tx' }) : (b as any)({ id: 'sp' })));
const createEmail = jest.fn();
const findOrCreate = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a), transaction: (...a: unknown[]) => (transaction as any)(...a) } }));
jest.mock('../../models', () => ({
  ScheduledEmail: { create: (...a: unknown[]) => createEmail(...a) },
  CampaignLead: { findOrCreate: (...a: unknown[]) => findOrCreate(...a) },
}));
jest.mock('../openHouseCountdown', () => ({ ...jest.requireActual('../openHouseCountdown'), grantEventReminderPermission: jest.fn() }));
jest.mock('../campaignMembership', () => ({ admitToCampaign: jest.fn(async () => ({ admitted: true, moved_from: [] })) }));

import { followupStepCopy, screenFollowupCopy, PORTAL_PLANS_URL, OPEN_HOUSE_SIGNUP_URL } from '../openHouseFollowupCopy';
import { bookOpenHouseFollowups, followupAiNotes, hasPaidMembership, PAID_MEMBER_SQL, FOLLOWUP_PEOPLE_SQL, HELD_BY_PRECEDENCE_SQL } from '../openHouseFollowup';
import { addFollowupSteps, OH1Z_STEPS } from '../openHouseFollowupUpgrade';
import { PORTAL_TODAY_URL } from '../openHouseCountdown';

const quiet = () => undefined;
const NEXT = { when_label: 'Thursday, December 17 at 6:30 PM CST', registered: false };
const BASE = { firstName: 'Ana', eventDate: 'Thursday, December 3', next: NEXT };
// Ali's two steps exactly as tagged on prod by OH1w, before OH1z.
const ALI_STEPS: any[] = [
  { audience: 'attended', subject: 'Thank You for Attending Our Open House!', delay_days: 0, channel: 'email', ai_instructions: 'Thank them.' },
  { audience: 'missed', subject: 'Catch Up on What You Missed at the Open House', delay_days: 2, channel: 'email', ai_instructions: 'Catch them up.' },
];

beforeEach(() => {
  jest.clearAllMocks();
  findOrCreate.mockResolvedValue([{ status: 'active', update: jest.fn() }, true]);
});

describe('the approved fallback copy for every step', () => {
  const copies = {
    enroll: followupStepCopy({ track: 'attended', ...BASE }, 'enroll')!,
    last_call: followupStepCopy({ track: 'attended', ...BASE }, 'last_call')!,
    invite: followupStepCopy({ track: 'missed', ...BASE }, 'invite')!,
    invite_no_next: followupStepCopy({ track: 'missed', ...BASE, next: null }, 'invite')!,
  };

  it('every new step passes the copy screen: no price, offer, discount or no-cost word, only its own link', () => {
    for (const c of Object.values(copies)) expect(screenFollowupCopy(c)).toEqual([]);
  });

  it('reserve your seat and last call link only to the plans page, never name a price', () => {
    for (const c of [copies.enroll, copies.last_call]) {
      expect(c.allowedLinks).toEqual([PORTAL_PLANS_URL]);
      expect(c.body).toContain(PORTAL_PLANS_URL);
      expect(c.body).not.toMatch(/\$|price|discount|offer|deadline/i);
    }
    expect(copies.enroll.subject).toBe('Ready to reserve your seat?');
    expect(copies.last_call.subject).toBe('Any questions before you decide?');
  });

  it('the invite names the next Open House and links to the sign-up page; never says they were absent', () => {
    expect(copies.invite.body).toContain('Thursday, December 17 at 6:30 PM CST');
    expect(copies.invite.allowedLinks).toEqual([OPEN_HOUSE_SIGNUP_URL]);
    expect(copies.invite.body).not.toMatch(/missed you|absent|not there/i);
    expect(copies.invite_no_next.body).toMatch(/coming up soon/);
  });

  it('no invite for someone already registered for the next Open House', () => {
    expect(followupStepCopy({ track: 'missed', ...BASE, next: { ...NEXT, registered: true } }, 'invite')).toBeNull();
  });

  it('an unset key falls back to the OH1u first email for the track', () => {
    expect(followupStepCopy({ track: 'attended', ...BASE }, undefined)!.body).toContain(PORTAL_TODAY_URL);
    expect(followupStepCopy({ track: 'missed', ...BASE }, undefined)!.body).toMatch(/did not see you check in/);
  });
});

describe('adding the steps to the live sequence', () => {
  it("keeps Ali's two steps, marks them, and appends the three new ones", () => {
    const r = addFollowupSteps(ALI_STEPS);
    expect(r.steps.map((s) => `${s.audience}/${s.copy_key}/${s.delay_days}`)).toEqual([
      'attended/thanks/0', 'missed/catch_up/2', 'attended/enroll/3', 'missed/invite/5', 'attended/last_call/7']);
    expect(r.steps[0].subject).toBe(ALI_STEPS[0].subject);
    expect(r.changes).toHaveLength(5);
  });

  it('is idempotent: a second run changes nothing', () => {
    const once = addFollowupSteps(ALI_STEPS).steps;
    expect(addFollowupSteps(once)).toEqual({ steps: once, changes: [] });
  });

  it('the new steps carry no placeholder and no price word', () => {
    for (const s of OH1Z_STEPS) expect(`${s.subject} ${s.ai_instructions}`).not.toMatch(/\[insert|\$\d|discount/i);
  });
});

function db(people: any[], nextRegs: any[] = [], sessionDate = '2026-12-03') {
  query.mockImplementation(async (sql: string) => {
    if (/FROM campaigns/.test(sql)) return [{ id: 'camp-f', status: 'active', sequence_id: 'seq-f', settings: { replay_urls: {} } }];
    if (/FROM follow_up_sequences/.test(sql)) return [{ steps: addFollowupSteps(ALI_STEPS).steps }];
    if (/FROM live_sessions WHERE id = :sid/.test(sql)) return [{ id: 'sess-1', title: 'Open House', session_date: sessionDate, start_time: '18:30', end_time: '19:30', status: 'completed', open_house_event_id: 'ev-1' }];
    if (/session_date > CAST/.test(sql)) return [{ d: '2026-12-17', start_time: '18:30', open_house_event_id: 'ev-2' }];
    if (/FROM open_house_registrations WHERE event_id/.test(sql)) return nextRegs;
    if (sql === FOLLOWUP_PEOPLE_SQL) return people;
    return [];
  });
}

describe('booking the five-step follow-up', () => {
  const AFTER = new Date('2026-12-04T03:00:00Z');

  it('attendees get days 0, 3, 7; people who did not check in get days 2 and 5; each with its own copy and link', async () => {
    db([{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'Ana' }, { email: 'b@x.io', track: 'missed', lead_id: 2, name: 'Ben' }]);
    const r = await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet });
    expect(r).toMatchObject({ booked: 2, errors: 0, screened_out: 0 });
    const rows = createEmail.mock.calls.map((c) => c[0]);
    const view = rows.map((x) => `${x.lead_id}:${x.metadata.copy_key}:${(x.scheduled_for.getTime() - rows[0].scheduled_for.getTime()) / 86_400_000}`);
    expect(view).toEqual(['1:thanks:0', '1:enroll:3', '1:last_call:7', '2:catch_up:2', '2:invite:5']);
    const enroll = rows[1];
    expect(enroll.subject).toBe('Ready to reserve your seat?');
    expect(enroll.body).toContain(PORTAL_PLANS_URL);
    expect(enroll.metadata).toMatchObject({ allowed_links: [PORTAL_PLANS_URL], primary_link: PORTAL_PLANS_URL, stop_if_paid: true });
    expect(enroll.metadata.ai_context_notes).toMatch(/Never name a price/);
    expect(rows[4].metadata).toMatchObject({ allowed_links: [OPEN_HOUSE_SIGNUP_URL], stop_if_paid: true });
    expect(rows[0].metadata.stop_if_paid).toBe(false); // the thank-you still goes to a payer
    expect(rows[3].metadata.stop_if_paid).toBe(false);
    expect(findOrCreate.mock.calls[0][0].defaults.total_steps).toBe(3);
  });

  it('no invite for someone already registered for the next Open House', async () => {
    db([{ email: 'b@x.io', track: 'missed', lead_id: 2, name: 'Ben' }], [{ email: 'b@x.io' }]);
    await bookOpenHouseFollowups('sess-1', { now: AFTER, log: quiet });
    expect(createEmail.mock.calls.map((c) => c[0].metadata.copy_key)).toEqual(['catch_up']);
    expect(findOrCreate.mock.calls[0][0].defaults.total_steps).toBe(1);
  });
});

describe('booking an older Open House (Nov 19, booked Nov 22 to start Nov 23)', () => {
  const NOW = new Date('2026-11-22T23:00:00Z'); // Sunday evening, long past Nov 20's morning-after
  const START = new Date('2026-11-23T16:00:00Z'); // Monday 10:00 AM CST

  it('day 0 is the start given, and every later step counts from it', async () => {
    db([{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'Ana' }], [], '2026-11-19');
    await bookOpenHouseFollowups('sess-1', { now: NOW, startAt: START, log: quiet });
    const rows = createEmail.mock.calls.map((c) => c[0]);
    expect(rows.map((x) => x.scheduled_for.toISOString())).toEqual([
      '2026-11-23T16:00:00.000Z', '2026-11-26T16:00:00.000Z', '2026-11-30T16:00:00.000Z']);
  });

  it('a start already in the past is ignored (no back-dated sends)', async () => {
    db([{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'Ana' }], [], '2026-11-19');
    await bookOpenHouseFollowups('sess-1', { now: NOW, startAt: new Date('2026-11-20T16:00:00Z'), log: quiet });
    expect(createEmail.mock.calls[0][0].scheduled_for.getTime()).toBe(NOW.getTime());
  });

  it('never moves someone out of a campaign that takes precedence (a countdown to Dec 3)', async () => {
    db([{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'Ana' }, { email: 'b@x.io', track: 'missed', lead_id: 2, name: 'Ben' }], [], '2026-11-19');
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, o: any) => (sql === HELD_BY_PRECEDENCE_SQL ? (o.replacements.leadId === 2 ? [{ '?column?': 1 }] : []) : base(sql, o)));
    const r = await bookOpenHouseFollowups('sess-1', { now: NOW, startAt: START, log: quiet });
    expect(r).toMatchObject({ booked: 1, held_by_other: 1 });
    expect(createEmail.mock.calls.every((c) => c[0].lead_id === 1)).toBe(true);
    expect(HELD_BY_PRECEDENCE_SQL).toMatch(/takes_precedence'\) = 'true'/);
    expect(HELD_BY_PRECEDENCE_SQL).toMatch(/cl\.campaign_id <> :campaignId/);
    // the countdown to THIS Open House never holds anyone (the big move after every Open House):
    // only something still queued for another session, or not tied to a session, holds them.
    expect(HELD_BY_PRECEDENCE_SQL).toMatch(/se\.status IN \('pending', 'processing', 'paused'\)\s+AND COALESCE\(se\.metadata->>'event_session_id', ''\) <> CAST\(:sid AS text\)/);
    const call = query.mock.calls.find((c) => c[0] === HELD_BY_PRECEDENCE_SQL);
    expect(call[1].replacements.sid).toBe('sess-1');
  });

  it('a dry run counts what it would book and writes nothing', async () => {
    db([{ email: 'a@x.io', track: 'attended', lead_id: 1, name: 'Ana' }, { email: 'b@x.io', track: 'missed', lead_id: 2, name: 'Ben' }], [], '2026-11-19');
    const r = await bookOpenHouseFollowups('sess-1', { now: NOW, startAt: START, dryRun: true, log: quiet });
    expect(r).toMatchObject({ booked: 2, rows: { thanks: 1, enroll: 1, last_call: 1, catch_up: 1, invite: 1 } });
    expect(createEmail).not.toHaveBeenCalled();
    expect(findOrCreate).not.toHaveBeenCalled();
  });
});

describe('stopping once someone has paid', () => {
  it('reads PaySimple subscriptions (comp excluded) and the older enrollment flag', () => {
    expect(PAID_MEMBER_SQL).toMatch(/sb\.plan::text <> 'comp' AND sb\.paysimple_payment_id IS NOT NULL/);
    expect(PAID_MEMBER_SQL).toMatch(/sb\.status::text IN \('active', 'past_due'\)/);
    expect(PAID_MEMBER_SQL).toMatch(/en\.payment_status::text = 'paid'/);
  });

  it('hasPaidMembership returns the database answer as a boolean', async () => {
    query.mockResolvedValueOnce([{ paid: true }]);
    expect(await hasPaidMembership('a@x.io')).toBe(true);
    query.mockResolvedValueOnce([]);
    expect(await hasPaidMembership('a@x.io')).toBe(false);
  });

  it('the AI notes for the later steps carry exactly one link', () => {
    const e = followupAiNotes({ track: 'attended', eventDate: 'Thursday, December 3', next: NEXT, replayUrl: null, todayUrl: PORTAL_TODAY_URL, signupUrl: OPEN_HOUSE_SIGNUP_URL, copyKey: 'last_call' });
    expect(e.allowed).toEqual([PORTAL_PLANS_URL]);
    const i = followupAiNotes({ track: 'missed', eventDate: 'Thursday, December 3', next: NEXT, replayUrl: null, todayUrl: PORTAL_TODAY_URL, signupUrl: OPEN_HOUSE_SIGNUP_URL, copyKey: 'invite' });
    expect(i.allowed).toEqual([OPEN_HOUSE_SIGNUP_URL]);
    expect(i.notes).toMatch(/Never say they were absent/);
  });
});

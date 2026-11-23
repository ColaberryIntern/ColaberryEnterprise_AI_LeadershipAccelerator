/**
 * OH1w: one campaign at a time, a "when someone finishes" setting, the hourly exit sweep, the
 * Explorer Growth hold, and the upgrade of Ali's rebuilt follow-up.
 */
const query = jest.fn();
const getSetting = jest.fn();
const cancelWhere = jest.fn(async () => 1);
const book = jest.fn();
const recent = jest.fn(async () => true);
const enroll = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
jest.mock('../settingsService', () => ({ getSetting: (...a: unknown[]) => getSetting(...a) }));
jest.mock('../scheduling/cancelScheduledMessage', () => ({ cancelScheduledMessagesWhere: (...a: unknown[]) => (cancelWhere as any)(...a) }));
jest.mock('../openHouseFollowup', () => ({
  OPEN_HOUSE_FOLLOWUP_KEY: 'open_house_followup',
  bookOpenHouseFollowups: (...a: unknown[]) => book(...a),
  isRecentOpenHouse: (...a: unknown[]) => (recent as any)(...a),
}));
jest.mock('../campaignService', () => ({ enrollLeadsInCampaign: (...a: unknown[]) => enroll(...a) }));
jest.mock('../openHouseCountdown', () => ({ OPEN_HOUSE_COUNTDOWN_KEY: 'open_house_countdown' }));

import {
  readOnComplete, validateOnComplete, admitToCampaign, finishMembership, sweepFinishedMembers,
  FINISHED_MEMBERS_SQL, RUNNING_MEMBERSHIP_SQL, MEMBERSHIP_RULES_SETTING,
} from '../campaignMembership';
import { upgradeFollowupRebuild, audienceOf, HARD_RULES_MARK, PERSONA_TO } from '../openHouseFollowupUpgrade';
import { isInOpenHouseCountdown, LIVE_SQL, COUNTDOWN_SQL, MEMBERSHIP_RULES_SETTING as HOLD_KEY } from '../explorerGrowth/governor/openHouseHold';

const quiet = () => undefined;
const rulesOn = () => getSetting.mockResolvedValue(true);

beforeEach(() => { jest.clearAllMocks(); getSetting.mockResolvedValue(null); });

describe('the "when someone finishes" setting', () => {
  it('defaults to remove; a move needs a target', () => {
    expect(readOnComplete(null)).toEqual({ action: 'remove' });
    expect(readOnComplete({ on_complete: { action: 'move' } })).toEqual({ action: 'remove' });
    expect(readOnComplete({ on_complete: { action: 'move', move_to_campaign_key: 'open_house_followup' } }))
      .toEqual({ action: 'move', move_to_campaign_key: 'open_house_followup', move_to_campaign_id: null });
  });
  it('the admin save rejects a malformed value (contract, 400)', () => {
    expect(validateOnComplete(undefined)).toEqual([]);
    expect(validateOnComplete({ action: 'remove' })).toEqual([]);
    expect(validateOnComplete('move')).toEqual(['on_complete must be an object']);
    expect(validateOnComplete({ action: 'delete' })[0]).toMatch(/must be "remove" or "move"/);
    expect(validateOnComplete({ action: 'move' })[0]).toMatch(/needs move_to_campaign_id/);
    expect(validateOnComplete({ action: 'move', move_to_campaign_id: 'c1' }, 'c1')[0]).toMatch(/into itself/);
    expect(validateOnComplete({ action: 'move', move_to_campaign_id: 'c2' }, 'c1')).toEqual([]);
  });
});

describe('one campaign at a time (admitToCampaign)', () => {
  it('rules OFF (before the cleanup): everyone is admitted, nothing is read or moved', async () => {
    expect(await admitToCampaign('c1', 7)).toEqual({ admitted: true, moved_from: [] });
    expect(query).not.toHaveBeenCalled();
  });
  it('an unreadable switch is OFF, never a reason to block or move', async () => {
    getSetting.mockRejectedValue(new Error('db down'));
    expect(await admitToCampaign('c1', 7)).toEqual({ admitted: true, moved_from: [] });
  });
  it('in no other running campaign: admitted', async () => {
    rulesOn(); query.mockResolvedValueOnce([]);
    expect(await admitToCampaign('c1', 7)).toEqual({ admitted: true, moved_from: [] });
    expect(query.mock.calls[0][0]).toBe(RUNNING_MEMBERSHIP_SQL);
  });
  it('in another running campaign: refused, and nothing changes', async () => {
    rulesOn(); query.mockResolvedValueOnce([{ campaign_id: 'c0', name: 'Cold Outbound Q1' }]);
    expect(await admitToCampaign('c1', 7)).toEqual({ admitted: false, in_campaign: 'Cold Outbound Q1' });
    expect(cancelWhere).not.toHaveBeenCalled();
  });
  it('a MOVE (supersede) ends the old membership and cancels what it still had queued', async () => {
    rulesOn();
    query.mockResolvedValueOnce([{ campaign_id: 'c0', name: 'Countdown' }]).mockResolvedValueOnce([undefined, 1]);
    expect(await admitToCampaign('c1', 7, { supersede: true })).toEqual({ admitted: true, moved_from: ['c0'] });
    expect(cancelWhere).toHaveBeenCalledWith({ campaign_id: 'c0', lead_id: 7 }, 'moved_to_another_campaign', expect.anything());
    expect(String(query.mock.calls[1][0])).toMatch(/SET status = 'completed'[\s\S]*status IN \('enrolled', 'active'\)/);
  });
  it('running = enrolled/active in an active, unarchived campaign other than this one', () => {
    expect(RUNNING_MEMBERSHIP_SQL).toMatch(/cl\.status IN \('enrolled', 'active'\)/);
    expect(RUNNING_MEMBERSHIP_SQL).toMatch(/c\.status = 'active' AND c\.archived_at IS NULL AND cl\.campaign_id <> :exceptId/);
  });
});

describe('finishMembership', () => {
  it('only an enrolled/active row changes (idempotent), and the reason is recorded', async () => {
    query.mockResolvedValueOnce([undefined, 0]);
    expect(await finishMembership('c1', 7, 'finished')).toBe(false);
    const [sql, opts] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE campaign_id = :campaignId AND lead_id = :leadId AND status IN \('enrolled', 'active'\)/);
    expect(JSON.parse(opts.replacements.meta).exit.reason).toBe('finished');
    expect(cancelWhere).not.toHaveBeenCalled(); // only a move cancels
  });
});

describe('the hourly exit sweep', () => {
  it('does nothing while the rules are off', async () => {
    expect(await sweepFinishedMembers({ log: quiet })).toEqual({ finished: 0, moved: 0, move_failed: 0, errors: 0, by_reason: {} });
    expect(query).not.toHaveBeenCalled();
  });

  it('finished = nothing queued, past the grace and past any event; enrolled-with-nothing finishes except in a ramp', () => {
    expect(FINISHED_MEMBERS_SQL).toMatch(/campaign_status = 'active' AND NOT queued AND idle AND event_past/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/member_status = 'active' OR any_send OR campaign_mode <> 'autonomous'/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/cl\.enrolled_at/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/exit_grace_hours/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/s\.event_at, '-infinity'::timestamptz\) < NOW\(\) - make_interval\(hours => :eventHours\)/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/MAX\(\(se\.metadata->>'event_starts_at'\)::timestamptz\) AS event_at/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/se\.status IN \('pending', 'processing', 'paused'\)/);
  });

  it('OH1z: every way of being done is caught: campaign over, paused and idle, a queue that will never send', () => {
    expect(FINISHED_MEMBERS_SQL).toMatch(/archived_at IS NOT NULL OR campaign_status IN \('completed', 'archived', 'cancelled'\)\)\s*\n\s*OR \(campaign_status = 'paused' AND NOT queued AND idle\)/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/campaign_status = 'active' AND queued AND NOT queued_fresh/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/make_interval\(days => :staleDays\)/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/c\.status::text <> 'draft'/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/THEN 'campaign_over'[\s\S]*THEN 'paused_idle'[\s\S]*THEN 'stale_queue'[\s\S]*ELSE 'finished'/);
  });

  function sweepDb(rows: any[], target: any = null) {
    query.mockImplementation(async (sql: string) => {
      if (sql === FINISHED_MEMBERS_SQL) return rows;
      if (/FROM campaigns/.test(sql)) return target ? [target] : [];
      if (/UPDATE campaign_leads/.test(sql)) return [undefined, 1];
      return [];
    });
  }

  it('remove (default): finishes the member', async () => {
    rulesOn(); sweepDb([{ campaign_id: 'c1', lead_id: 7, settings: {}, event_session_id: null }]);
    expect(await sweepFinishedMembers({ log: quiet })).toEqual({ finished: 1, moved: 0, move_failed: 0, errors: 0, by_reason: { finished: 1 } });
    expect(book).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
  });

  it('the countdown moves people into the follow-up, booked by attendance for THEIR Open House', async () => {
    rulesOn();
    sweepDb([{ campaign_id: 'cd', lead_id: 7, settings: { on_complete: { action: 'move', move_to_campaign_key: 'open_house_followup' } }, event_session_id: 'sess-1' }],
      { id: 'fu', key: 'open_house_followup' });
    book.mockResolvedValue({ outcome: 'booked' });
    expect(await sweepFinishedMembers({ log: quiet })).toMatchObject({ finished: 1, moved: 1 });
    expect(book).toHaveBeenCalledWith('sess-1', { leadId: 7 });
  });

  it('an older Open House (Nov 19) is NOT followed up automatically; they are still finished', async () => {
    rulesOn(); recent.mockResolvedValueOnce(false);
    sweepDb([{ campaign_id: 'cd', lead_id: 7, settings: { on_complete: { action: 'move', move_to_campaign_key: 'open_house_followup' } }, event_session_id: 'nov19' }],
      { id: 'fu', key: 'open_house_followup' });
    expect(await sweepFinishedMembers({ log: quiet })).toMatchObject({ finished: 1, moved: 0, move_failed: 1 });
    expect(book).not.toHaveBeenCalled();
  });

  it('a move into any other campaign is a superseding join; a target that is not running still finishes them', async () => {
    rulesOn();
    sweepDb([{ campaign_id: 'c1', lead_id: 7, settings: { on_complete: { action: 'move', move_to_campaign_id: 'c2' } }, event_session_id: null }], { id: 'c2', key: null });
    enroll.mockResolvedValue([{ status: 'enrolled' }]);
    expect(await sweepFinishedMembers({ log: quiet })).toMatchObject({ finished: 1, moved: 1 });
    expect(enroll).toHaveBeenCalledWith('c2', [7], { supersede: true });
    sweepDb([{ campaign_id: 'c1', lead_id: 8, settings: { on_complete: { action: 'move', move_to_campaign_id: 'gone' } }, event_session_id: null }], null);
    expect(await sweepFinishedMembers({ log: quiet })).toMatchObject({ finished: 1, moved: 0, move_failed: 1 });
  });

  it('never throws: a failing read is counted', async () => {
    rulesOn(); query.mockRejectedValue(new Error('db down'));
    expect((await sweepFinishedMembers({ log: quiet })).errors).toBe(1);
  });

  it('OH1z: each way out is recorded; a dead queue is cancelled; a paused campaign removes without the move', async () => {
    rulesOn();
    const move = { on_complete: { action: 'move', move_to_campaign_id: 'c2' } };
    sweepDb([
      { campaign_id: 'cA', lead_id: 1, settings: {}, event_session_id: null, exit_kind: 'campaign_over' },
      { campaign_id: 'cP', lead_id: 2, settings: move, event_session_id: null, exit_kind: 'paused_idle' },
      { campaign_id: 'cS', lead_id: 3, settings: {}, event_session_id: null, exit_kind: 'stale_queue' },
    ], { id: 'c2', key: null });
    const r = await sweepFinishedMembers({ log: quiet });
    expect(r).toMatchObject({ finished: 3, moved: 0, by_reason: { campaign_over: 1, paused_idle: 1, stale_queue: 1 } });
    expect(enroll).not.toHaveBeenCalled(); // paused_idle never moves
    expect(cancelWhere).toHaveBeenCalledWith({ campaign_id: 'cS', lead_id: 3 }, 'stale_overdue', expect.anything());
    expect(cancelWhere).toHaveBeenCalledTimes(1);
    const reasons = query.mock.calls.filter((c) => /UPDATE campaign_leads/.test(String(c[0]))).map((c) => JSON.parse(c[1].replacements.meta).exit.reason);
    expect(reasons).toEqual(['campaign_over', 'paused_idle', 'stale_queue']);
  });

  it('AL1: a payer in a remove_if_paid campaign is removed at once, their queue cancelled, and never moved on', async () => {
    rulesOn();
    const move = { remove_if_paid: true, on_complete: { action: 'move', move_to_campaign_id: 'c2' } };
    sweepDb([{ campaign_id: 'cAL', lead_id: 9, settings: move, event_session_id: null, exit_kind: 'paid' }], { id: 'c2', key: null });
    const r = await sweepFinishedMembers({ log: quiet });
    expect(r).toMatchObject({ finished: 1, moved: 0, by_reason: { paid: 1 } });
    expect(enroll).not.toHaveBeenCalled();
    expect(cancelWhere).toHaveBeenCalledWith({ campaign_id: 'cAL', lead_id: 9 }, 'enrollment_already_paid', expect.anything());
  });

  it('AL1: the paid exit applies only to a running campaign that opted in, with the same paid test as the send guard', () => {
    expect(FINISHED_MEMBERS_SQL).toMatch(/COALESCE\(c\.settings->>'remove_if_paid', ''\) = 'true'/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/sb\.plan::text <> 'comp' AND sb\.paysimple_payment_id IS NOT NULL/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/en\.payment_status::text = 'paid'/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/WHEN campaign_status = 'active' AND paid THEN 'paid'/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/OR \(campaign_status = 'active' AND paid\)/);
    expect(FINISHED_MEMBERS_SQL).toMatch(/LEFT JOIN leads ld ON ld\.id = cl\.lead_id/);
  });

  it('OH1z: counts a Postgres UPDATE result ({ rowCount }), not NaN', async () => {
    rulesOn();
    query.mockImplementation(async (sql: string) => {
      if (sql === FINISHED_MEMBERS_SQL) return [{ campaign_id: 'c1', lead_id: 7, settings: {}, event_session_id: null, exit_kind: 'finished' }];
      if (/UPDATE campaign_leads/.test(sql)) return [[], { rowCount: 1 }];
      return [];
    });
    expect((await sweepFinishedMembers({ log: quiet })).finished).toBe(1);
  });
});

describe('Explorer Growth hold', () => {
  it('uses the same switch key as the membership rules', () => {
    expect(HOLD_KEY).toBe(MEMBERSHIP_RULES_SETTING);
  });
  it('rules on: also holds anyone in a running campaign; off: the countdown only', () => {
    expect(LIVE_SQL).toMatch(/campaign_leads cl JOIN campaigns c[\s\S]*cl\.status IN \('enrolled', 'active'\)[\s\S]*c\.status = 'active'/);
    expect(COUNTDOWN_SQL).not.toMatch(/campaign_leads/);
  });
  it('picks the membership SQL only when the switch reads true', async () => {
    query.mockResolvedValueOnce([{ v: 'true' }]).mockResolvedValueOnce([{ n: 1 }]);
    expect(await isInOpenHouseCountdown(5)).toBe(true);
    expect(query.mock.calls[1][0]).toBe(LIVE_SQL);
    query.mockReset();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 0 }]);
    expect(await isInOpenHouseCountdown(5)).toBe(false);
    expect(query.mock.calls[1][0]).toBe(COUNTDOWN_SQL);
  });
});

describe('the one-time cleanup (scripts/cleanupCampaignMembership.ts)', () => {
  // Imported lazily: the script's main() only runs when it is executed directly.
  const { CATEGORY_SQL, FINISH_CATEGORIES, affectedRowCount } = require('../../scripts/cleanupCampaignMembership');
  it('reports the real count from a Postgres UPDATE result, not NaN (the Nov 21 apply printed NaN)', () => {
    expect(affectedRowCount({ rowCount: 15830, rows: [] })).toBe(15830);
    expect(affectedRowCount(42)).toBe(42);
    expect(affectedRowCount(undefined)).toBe(0);
    expect(affectedRowCount({})).toBe(0);
  });
  it('finishes only campaigns that are over, paused with nothing queued, or fully handled', () => {
    expect([...FINISH_CATEGORIES]).toEqual(['1', '2b', '3b']);
  });
  it('keeps anyone with a send still queued, and a ramp queue that never sent', () => {
    expect(CATEGORY_SQL).toMatch(/campaign_status IN \('paused', 'draft'\) AND has_pending THEN '2a'/);
    expect(CATEGORY_SQL).toMatch(/WHEN has_pending THEN '4'/);
    expect(CATEGORY_SQL).toMatch(/member_status = 'enrolled' AND NOT has_any THEN '3a'/);
    expect(CATEGORY_SQL).toMatch(/status IN \('pending', 'processing', 'paused'\)/);
  });
});

describe("upgrading Ali's rebuilt follow-up (his exact text from prod, 2026-11-21)", () => {
  const ALI_STEPS: any[] = [
    { ai_tone: 'warm', channel: 'email', subject: 'Thank You for Attending Our Open House!', step_goal: 'Get attendees to visit their Today page for next steps.', delay_days: 0, body_template: '',
      ai_instructions: "Start the email with a warm greeting, using the recipient's first name. Thank them sincerely for attending the Open House and express how much we appreciated their participation and engagement. Reference that they checked in during the event, which signifies their interest in our offerings. Directly mention that they can now access their personalized Today page, where they can find tailored resources and next steps to further their engagement. Include a clear call-to-action by saying, 'Please visit your Today page here: [insert link] to see what’s next for you!' Ensure the tone remains friendly and collegial throughout the email." },
    { ai_tone: 'warm', channel: 'email', subject: 'Catch Up on What You Missed at the Open House', step_goal: 'Encourage registrants who missed the Open House to watch the recording and attend the next event.', delay_days: 2, body_template: '',
      ai_instructions: "Begin the email by addressing the recipient by their first name and expressing that we missed them at the Open House. Thank them for their interest in our events and make it clear that we value their engagement. Include a brief overview of what was covered during the Open House to spark their interest. Mention that a recording of the event is available for them to catch up on what they missed, and provide a direct link to the recording. Additionally, inform them about the date and time of the next scheduled Open House, encouraging them to register. Conclude with a friendly call-to-action: 'You can watch the recording here: [insert link] and we hope to see you at our next event!' Maintain a warm and inviting tone throughout the email." },
  ];
  const ALI_PROMPT = 'You are Maya, an AI assistant working on behalf of the Open House Follow-up team at our company.\n\nKey messaging pillars:\n- Thank attendees.';
  const up = upgradeFollowupRebuild(ALI_STEPS, ALI_PROMPT);

  it('tags step 1 attended and step 2 missed', () => {
    expect(up.steps.map((s) => s.audience)).toEqual(['attended', 'missed']);
    expect(audienceOf({ subject: 'x', step_goal: 'y', audience: 'missed' })).toBe('missed');
  });
  it('leaves no placeholder and no untrue promise', () => {
    const all = up.steps.map((s) => s.ai_instructions).join(' ');
    expect(all).not.toMatch(/\[insert link\]/i);
    expect(all).not.toMatch(/we missed them/);
    expect(all).not.toMatch(/a recording of the event is available/);
    expect(all).not.toMatch(/offerings/);
    expect(up.steps[1].ai_instructions).toMatch(/If the notes include a recording link/);
    expect(up.steps[0].ai_instructions).toMatch(/Today page, using the exact link in the notes/);
  });
  it("keeps Ali's own words and settings everywhere else", () => {
    expect(up.steps[0].ai_instructions).toMatch(/^Start the email with a warm greeting/);
    expect(up.steps[1].ai_instructions).toMatch(/Maintain a warm and inviting tone/);
    expect(up.steps.map((s) => s.delay_days)).toEqual([0, 2]);
    expect(up.steps[0].subject).toBe(ALI_STEPS[0].subject);
  });
  it("sets Maya's persona and appends the hard rules", () => {
    expect(up.prompt.startsWith(PERSONA_TO)).toBe(true);
    expect(up.prompt).toContain('Key messaging pillars');
    expect(up.prompt).toContain(HARD_RULES_MARK);
  });
  it('is idempotent', () => {
    const again = upgradeFollowupRebuild(up.steps, up.prompt);
    expect(again.changes).toEqual([]);
    expect(again.steps).toEqual(up.steps);
    expect(again.prompt).toBe(up.prompt);
  });
});

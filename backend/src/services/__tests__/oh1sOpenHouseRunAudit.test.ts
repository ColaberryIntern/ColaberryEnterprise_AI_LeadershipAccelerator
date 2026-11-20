/**
 * OH1s: the Nov 19 Open House run audit. Each cell pins one cause found on prod.
 *
 *  1. scheduleNextStep chained the countdown's text step for "now", with no consent
 *     check, after every countdown email (2,547 stray rows for 171 people).
 *  2. (sequenceProgressionCheck.characterization.test.ts) the health check re-created
 *     every cancelled step.
 *  3. The scheduler took 10 rows per campaign per run: emails up to 116 minutes late.
 *  4. A rate-limit refusal cancelled the message for good.
 *  5. Nothing granted a registrant event-reminder permission, so the brand gate
 *     blocked 100% of the countdown.
 */

// ── mocks: sequenceService's models, and the database for the permission grant ──
const findSequence = jest.fn();
const countScheduled = jest.fn();
const createScheduled = jest.fn();
jest.mock('../../models', () => ({
  FollowUpSequence: { findByPk: (...a: unknown[]) => findSequence(...a) },
  ScheduledEmail: { count: (...a: unknown[]) => countScheduled(...a), create: (...a: unknown[]) => createScheduled(...a) },
  Lead: { findByPk: jest.fn().mockResolvedValue({ id: 7, name: 'Sam', email: 'sam@example.com', phone: null }) },
  Campaign: {}, CampaignLead: {}, StrategyCall: {}, Enrollment: {}, Cohort: {},
}));

const query = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

const setBrandPreference = jest.fn();
jest.mock('../../modules/communications/brandPreferenceGate', () => ({
  setBrandPreference: (...a: unknown[]) => setBrandPreference(...a),
}));

const evaluateConsent = jest.fn();
jest.mock('../consentService', () => ({ evaluateConsent: (...a: unknown[]) => evaluateConsent(...a) }));

import { isPreScheduledSequence, scheduleNextStep } from '../sequenceService';
import { CLAIM_CANDIDATES_SQL, PER_CAMPAIGN_CLAIM, COUNTDOWN_CLAIM, RUN_CLAIM, isRetryableGateBlock } from '../scheduledActionPolicy';
import { grantEventReminderPermission, EVENT_REMINDER_CATEGORY } from '../openHouseCountdown';
import { COUNTDOWN_STEPS, COUNTDOWN_SETTINGS } from '../../scripts/ensureOpenHouseCountdownCampaign';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('1. a pre-scheduled sequence is never chained step by step', () => {
  it('the real Open House countdown sequence is pre-scheduled', () => {
    expect(isPreScheduledSequence(COUNTDOWN_STEPS as any)).toBe(true);
  });

  it.each([
    ['an appointment countdown', [{ delay_days: 0, minutes_before_call: 60 }, { delay_days: 0, minutes_before_call: 10 }]],
    ['a cohort countdown', [{ delay_days: 0, days_before_cohort_start: 7 }, { delay_days: 0, days_before_cohort_start: 1 }]],
    ['an event countdown', [{ delay_days: 0, minutes_before_event: 240 }, { delay_days: 0, minutes_before_event: 30, channel: 'sms' }]],
  ])('%s is pre-scheduled', (_label, steps) => {
    expect(isPreScheduledSequence(steps as any)).toBe(true);
  });

  it.each([
    ['a drip sequence', [{ delay_days: 0 }, { delay_days: 3 }]],
    ['all-zero delays with no countdown anchor', [{ delay_days: 0 }, { delay_days: 0 }]],
    ['a drip that happens to carry an anchor on one step', [{ delay_days: 0, minutes_before_event: 30 }, { delay_days: 2 }]],
    ['no steps', []],
    ['missing steps', null],
  ])('%s is NOT pre-scheduled (it is chained after each send)', (_label, steps) => {
    expect(isPreScheduledSequence(steps as any)).toBe(false);
  });

  it('after a countdown email is sent, scheduleNextStep books NOTHING (the Nov 19 text chain)', async () => {
    findSequence.mockResolvedValue({ id: 'seq', steps: COUNTDOWN_STEPS });
    const sent = { id: 'a1', lead_id: 7, sequence_id: 'seq', campaign_id: 'c', step_index: 2 };
    await expect(scheduleNextStep(sent)).resolves.toBeNull();
    expect(createScheduled).not.toHaveBeenCalled();
    expect(countScheduled).not.toHaveBeenCalled();
  });

  it('a drip sequence still chains its next step (unchanged behavior)', async () => {
    findSequence.mockResolvedValue({ id: 'seq', steps: [{ delay_days: 0, subject: 'a' }, { delay_days: 2, subject: 'b' }] });
    countScheduled.mockResolvedValue(0);
    createScheduled.mockImplementation((row: any) => Promise.resolve({ id: 'next', ...row }));
    const next = await scheduleNextStep({ id: 'a1', lead_id: 7, sequence_id: 'seq', campaign_id: 'c', step_index: 0 });
    expect(next).not.toBeNull();
    expect(createScheduled).toHaveBeenCalledTimes(1);
    expect(createScheduled.mock.calls[0][0].step_index).toBe(1);
  });
});

describe('3. countdown rows get the run, ahead of drip mail', () => {
  const sql = CLAIM_CANDIDATES_SQL.replace(/\s+/g, ' ');
  it('a drip campaign still takes 10 per run; a countdown may take the whole run', () => {
    expect(PER_CAMPAIGN_CLAIM).toBe(10);
    expect(COUNTDOWN_CLAIM).toBe(RUN_CLAIM);
    expect(sql).toContain(`WHERE rn <= ${PER_CAMPAIGN_CLAIM} OR (countdown IS TRUE AND rn <= ${COUNTDOWN_CLAIM})`);
    expect(sql).toContain(`LIMIT ${RUN_CLAIM}`);
  });
  it('countdown rows sort first, then the round-robin order as before', () => {
    expect(sql).toContain('ORDER BY (countdown IS TRUE) DESC, rn, scheduled_for ASC');
    expect(sql).toContain("(metadata->>'event_countdown') = 'true' AS countdown");
  });
  it('still only considers due, pending rows with attempts left (the claim UPDATE is the lock)', () => {
    expect(sql).toContain("WHERE status = 'pending' AND scheduled_for <= NOW() AND attempts_made < max_attempts");
  });
});

describe('4. "not now" is retried, "not this person" is cancelled', () => {
  it.each(['global_rate_limit_exceeded', 'scheduler_paused'])('%s is retryable', (r) => {
    expect(isRetryableGateBlock(r)).toBe(true);
  });
  it.each(['brand_no_relationship', 'consent_no_express_sms', 'lead_unsubscribed', 'kill_switch_active', '', null, undefined])(
    '%s is NOT retryable (cancelled as before)', (r) => {
      expect(isRetryableGateBlock(r as any)).toBe(false);
    });
});

describe('5. registering for an Open House grants event-reminder permission', () => {
  const campaignRow = (over: Record<string, unknown> = {}) => [{ tenant_id: 't', brand_id: 'b', category: EVENT_REMINDER_CATEGORY, phone: '+16825550100', ...over }];

  it('the countdown campaign sends under the event_reminder category', () => {
    expect((COUNTDOWN_SETTINGS as any).communication_category).toBe(EVENT_REMINDER_CATEGORY);
  });

  it('grants email always, texts only with express consent, calls never', async () => {
    query.mockResolvedValueOnce(campaignRow()).mockResolvedValueOnce([]);
    evaluateConsent.mockResolvedValue({ verdict: 'allow' });
    await expect(grantEventReminderPermission('c', 7)).resolves.toBe('granted');
    expect(setBrandPreference).toHaveBeenCalledWith({
      leadId: 7, tenantId: 't', brandId: 'b', category: 'event_reminder',
      emailAllowed: true, smsAllowed: true, voiceAllowed: false, source: 'open_house_registration',
    });
  });

  it('no texting consent -> email only', async () => {
    query.mockResolvedValueOnce(campaignRow()).mockResolvedValueOnce([]);
    evaluateConsent.mockResolvedValue({ verdict: 'deny' });
    await grantEventReminderPermission('c', 7);
    expect(setBrandPreference.mock.calls[0][0]).toMatchObject({ emailAllowed: true, smsAllowed: false, voiceAllowed: false });
  });

  it('an existing preference (someone who turned reminders off) is NEVER overwritten', async () => {
    query.mockResolvedValueOnce(campaignRow()).mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(grantEventReminderPermission('c', 7)).resolves.toBe('kept_existing');
    expect(setBrandPreference).not.toHaveBeenCalled();
  });

  it('never grants a category other than event_reminder (no marketing permission by the back door)', async () => {
    query.mockResolvedValueOnce(campaignRow({ category: 'marketing' }));
    await expect(grantEventReminderPermission('c', 7)).resolves.toBe('not_event_reminder');
    query.mockResolvedValueOnce(campaignRow({ category: null }));
    await expect(grantEventReminderPermission('c', 7)).resolves.toBe('not_event_reminder');
    expect(setBrandPreference).not.toHaveBeenCalled();
  });

  it('a campaign with no brand needs no grant', async () => {
    query.mockResolvedValueOnce(campaignRow({ brand_id: null }));
    await expect(grantEventReminderPermission('c', 7)).resolves.toBe('no_brand_scope');
  });

  it('never throws: a database fault returns failed and the sign-up goes on', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(grantEventReminderPermission('c', 7)).resolves.toBe('failed');
  });
});

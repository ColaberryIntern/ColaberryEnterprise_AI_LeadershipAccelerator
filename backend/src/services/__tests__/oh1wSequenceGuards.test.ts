/**
 * OH1w: an audience-tagged follow-up (Ali's rebuild: step 1 attended, step 2 missed) is booked per
 * person by its event. The sequence engine must never chain step 2 after step 1, and a plain
 * enrollment must never send every step to everyone.
 */
const findSequence = jest.fn();
const countScheduled = jest.fn();
const createScheduled = jest.fn();
jest.mock('../../models', () => ({
  FollowUpSequence: { findByPk: (...a: unknown[]) => findSequence(...a) },
  ScheduledEmail: { count: (...a: unknown[]) => countScheduled(...a), create: (...a: unknown[]) => createScheduled(...a) },
  Lead: { findByPk: jest.fn().mockResolvedValue({ id: 7, name: 'Sam', email: 'sam@example.com', phone: null, source: 'web' }) },
  Campaign: {}, CampaignLead: { findOrCreate: jest.fn() }, StrategyCall: {}, Enrollment: {}, Cohort: {},
}));
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { isAudienceTaggedSequence, isPreScheduledSequence, scheduleNextStep, enrollLeadInSequence } from '../sequenceService';

const TAGGED = [
  { delay_days: 0, channel: 'email', subject: 'Thank you', body_template: '', audience: 'attended' },
  { delay_days: 2, channel: 'email', subject: 'Catch up', body_template: '', audience: 'missed' },
];
const UNTAGGED = [
  { delay_days: 0, channel: 'email', subject: 'Thank you', body_template: '' },
  { delay_days: 2, channel: 'email', subject: 'Catch up', body_template: '' },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('isAudienceTaggedSequence', () => {
  it('true when any step names its audience', () => {
    expect(isAudienceTaggedSequence(TAGGED as any)).toBe(true);
    expect(isAudienceTaggedSequence([{ ...UNTAGGED[0] }, { ...UNTAGGED[1], audience: 'missed' }] as any)).toBe(true);
  });
  it('false for a plain drip, empty or missing steps', () => {
    expect(isAudienceTaggedSequence(UNTAGGED as any)).toBe(false);
    expect(isAudienceTaggedSequence([])).toBe(false);
    expect(isAudienceTaggedSequence(null)).toBe(false);
  });
  it('does not change what counts as pre-scheduled', () => {
    expect(isPreScheduledSequence(TAGGED as any)).toBe(false);
  });
});

describe('the sequence engine leaves a tagged follow-up alone', () => {
  it('after step 1 (attended) is sent, step 2 (missed) is NOT chained', async () => {
    findSequence.mockResolvedValue({ id: 'seq', steps: TAGGED, is_active: true });
    await expect(scheduleNextStep({ id: 'a1', lead_id: 7, sequence_id: 'seq', campaign_id: 'c', step_index: 0 })).resolves.toBeNull();
    expect(createScheduled).not.toHaveBeenCalled();
  });

  it("the same two steps untagged still chain (Ali's rebuild as it stands today would)", async () => {
    findSequence.mockResolvedValue({ id: 'seq', steps: UNTAGGED, is_active: true });
    countScheduled.mockResolvedValue(0);
    createScheduled.mockImplementation((row: any) => Promise.resolve({ id: 'n', ...row }));
    expect(await scheduleNextStep({ id: 'a1', lead_id: 7, sequence_id: 'seq', campaign_id: 'c', step_index: 0 })).not.toBeNull();
  });

  it('a plain enrollment into a tagged follow-up schedules nothing (fail closed)', async () => {
    findSequence.mockResolvedValue({ id: 'seq', steps: TAGGED, is_active: true });
    await expect(enrollLeadInSequence(7, 'seq', 'c')).resolves.toEqual([]);
    expect(createScheduled).not.toHaveBeenCalled();
    expect(countScheduled).not.toHaveBeenCalled();
  });
});

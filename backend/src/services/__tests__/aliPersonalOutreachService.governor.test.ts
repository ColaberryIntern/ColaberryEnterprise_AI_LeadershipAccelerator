const m = {
  query: jest.fn(),
  campaignFindOne: jest.fn(),
  enrolCampaign: jest.fn(),
  envFlags: { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true },
};
jest.mock('../../config/env', () => ({ env: { get growthJourney() { return m.envFlags; } } }));
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => m.query(...a) } }));
jest.mock('../campaignService', () => ({ enrollLeadsInCampaign: (...a: unknown[]) => m.enrolCampaign(...a) }));
jest.mock('../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => s }));
jest.mock('../../models', () => {
  const { phase5ModelsMock } = require('../growthJourney/__tests__/fixtures/phase5Tables');
  const { Table } = require('../growthJourney/__tests__/fixtures/phase4Tables');
  const ownership = new Table('growth_journey_conversation_ownership', 'own');
  return { ...phase5ModelsMock, GrowthJourneyConversationOwnership: ownership, Campaign: { findOne: (...a: unknown[]) => m.campaignFindOne(...a) }, __tables: { ownership } };
});
// The guard imports the open-status list as a value from the model file, whose Model.init needs the real database module.
jest.mock('../../models/GrowthJourneyExecution', () => ({ OPEN_EXECUTION_STATUSES: ['pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress'] }));

import * as models from '../../models';
import type { Table } from '../growthJourney/__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../growthJourney/__tests__/fixtures/phase5Tables';
import { runAliPersonalOutreach } from '../aliPersonalOutreachService';

/**
 * T516 - the Ali personal-outreach cron defers to the journey: a lead the
 * journey is mid-conversation with, or a human owns, is left out of the
 * hourly enrolment; the lookup is lazy, fails closed, and is inert with the
 * master off. The high-intent query, the daily count and the enrol call are
 * the injected boundary (the cron's own SQL is not under test here).
 */

const ownership = (models as unknown as { __tables: { ownership: Table } }).__tables.ownership;
const CANDIDATES = [101, 102, 103, 104];
const receipt = (leadId: number, status: string) => T5.executions.insert({
  tenant_id: 't-col', brand_id: 'b-ent', program_id: 'p-ent', decision_id: `d-${leadId}-${status}`, subject_ref: `lead:${leadId}`, lead_id: leadId, enrollment_id: null,
  channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c-flow', campaign_key: 'k', sequence_id: 's', mode: 'limited', status, status_reason: status, control_ids: [], attempts: 0,
});

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  resetPhase5Tables();
  ownership.reset();
  for (const fn of [m.query, m.campaignFindOne, m.enrolCampaign]) fn.mockReset();
  m.envFlags = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true };
  m.campaignFindOne.mockResolvedValue({ id: 'c-ali', status: 'active' });
  // The cron's two raw queries, in call order: the day's count, then the high-intent list; then per-lead lookups.
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes('COUNT(*) as cnt')) return [{ cnt: '0' }];
    if (sql.includes('SELECT DISTINCT sub.lead_id')) return CANDIDATES.map((lead_id) => ({ lead_id, name: `Lead ${lead_id}`, email: `l${lead_id}@example.com`, click_count: 2 }));
    return [];
  });
  m.enrolCampaign.mockImplementation(async (_c: string, ids: number[]) => ids.map((leadId) => ({ leadId, status: 'enrolled' })));
});

const enrolledIds = () => (m.enrolCampaign.mock.calls[0]?.[1] as number[] | undefined) ?? [];

describe('acceptance 4: the list drops exactly the leads with an open receipt or ownership', () => {
  it('an open receipt (any open status) and an open ownership row are dropped; a terminal receipt and a cleared ownership stay in', async () => {
    receipt(101, 'enrolled');
    receipt(102, 'completed');
    ownership.insert({ tenant_id: 't-col', brand_id: 'b-ent', lead_id: 103, cleared_at: null });
    ownership.insert({ tenant_id: 't-col', brand_id: 'b-ent', lead_id: 104, cleared_at: new Date() });
    await runAliPersonalOutreach();
    expect(m.enrolCampaign).toHaveBeenCalledTimes(1);
    expect(m.enrolCampaign).toHaveBeenCalledWith('c-ali', [102, 104]);
    const line = (console.log as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('ali_outreach_journey_excluded'))!;
    expect(JSON.parse(line)).toMatchObject({ context: { excluded: 2, remaining_candidates: 2 } });
    expect(line).not.toContain('@');
  });

  it('every open status holds a lead out; nothing owned -> the list is unchanged', async () => {
    for (const [i, status] of ['pending_review', 'approved', 'enrolling', 'in_progress'].entries()) receipt(CANDIDATES[i], status);
    await runAliPersonalOutreach();
    expect(m.enrolCampaign).not.toHaveBeenCalled();
    resetPhase5Tables();
    m.enrolCampaign.mockClear();
    await runAliPersonalOutreach();
    expect(enrolledIds()).toEqual(CANDIDATES);
  });
});

describe('acceptance 5: a lookup error enrols nobody that run, logged', () => {
  it('a receipt read that throws -> 0 enrol calls and one error line with the class and the candidate count', async () => {
    const spy = jest.spyOn(T5.executions, 'findAll').mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    await runAliPersonalOutreach();
    spy.mockRestore();
    expect(m.enrolCampaign).not.toHaveBeenCalled();
    const line = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('ali_outreach_journey_lookup_failed'))!;
    expect(JSON.parse(line)).toMatchObject({ level: 'error', outcome: 'failure', error_class: 'SequelizeConnectionError', context: { candidates: 4 } });
  });
});

describe('inert with the master off', () => {
  it('master flag off (production today): neither table is read and the cron enrols exactly the list it found', async () => {
    m.envFlags = { ...m.envFlags, growthJourneyEnabled: false };
    receipt(101, 'enrolled'); // would be dropped if consulted
    const spy = jest.spyOn(T5.executions, 'findAll');
    await runAliPersonalOutreach();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(enrolledIds()).toEqual(CANDIDATES);
  });
});

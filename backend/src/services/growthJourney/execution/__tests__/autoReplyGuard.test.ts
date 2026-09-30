const m = { envFlags: { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true } };
jest.mock('../../../../config/env', () => ({ env: { get growthJourney() { return m.envFlags; } } }));
jest.mock('../../../../models', () => {
  const { phase5ModelsMock } = require('../../__tests__/fixtures/phase5Tables');
  const { Table } = require('../../__tests__/fixtures/phase4Tables');
  const ownership = new Table('growth_journey_conversation_ownership', 'own');
  return { ...phase5ModelsMock, GrowthJourneyConversationOwnership: ownership, __tables: { ownership } };
});
// env is stubbed without a database URL here, so the two model FILES the guard's chain reaches are handed their values.
jest.mock('../../../../models/GrowthJourneyExecution', () => ({ OPEN_EXECUTION_STATUSES: ['pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress'] }));
jest.mock('../../ledger', () => ({ recordJourneyEvent: jest.fn() }));

import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import * as models from '../../../../models';
import { OPEN_EXECUTION_STATUSES } from '../../../../models/GrowthJourneyExecution';
import { TERMINAL_STATUSES } from '../receiptTransitions';
import type { Table } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import { journeyAutoReplySkip } from '../autoReplyGuard';

/**
 * T515 follow-up - the guard over T503's tables, which filter for real: a lead
 * whose only receipts are CLOSED is not the journey's conversation, and the
 * auto-reply is not silenced for them. (The verifier's V6 - the open-status
 * filter dropped from the receipt arm - survived 35/35; this suite is what it
 * fails now.)
 */

const ownership = (models as unknown as { __tables: { ownership: Table } }).__tables.ownership;
const LEAD = 515;
let seq = 0;
const receipt = (status: string, leadId = LEAD) => T5.executions.insert({
  tenant_id: 't-col', brand_id: 'b-ent', program_id: 'p-ent', decision_id: `d-${(seq += 1)}`, subject_ref: `lead:${leadId}`, lead_id: leadId, enrollment_id: null,
  channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c', campaign_key: 'k', sequence_id: 's', mode: 'limited', status, status_reason: status, control_ids: [], attempts: 0,
});
const on = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({ growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true, ...over });

beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  resetPhase5Tables();
  ownership.reset();
});

describe('the receipt arm is the OPEN statuses, and nothing else', () => {
  it('a lead whose only receipts are closed - every terminal status at once - is not held: the auto-reply may answer them', async () => {
    for (const status of TERMINAL_STATUSES) receipt(status);
    expect(T5.executions.rows).toHaveLength(TERMINAL_STATUSES.length);
    expect(await journeyAutoReplySkip(LEAD, on())).toBeNull();
  });

  it.each([...OPEN_EXECUTION_STATUSES])('one %s receipt holds the lead: open_receipt', async (status) => {
    receipt('completed');
    receipt(status);
    expect(await journeyAutoReplySkip(LEAD, on())).toBe('open_receipt');
  });

  it('another lead\'s open receipt holds nothing here', async () => {
    receipt('enrolled', 999);
    expect(await journeyAutoReplySkip(LEAD, on())).toBeNull();
  });

  it('the two lists agree: every receipt status is exactly one of open or terminal', () => {
    const all = [...OPEN_EXECUTION_STATUSES, ...TERMINAL_STATUSES].sort();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(['approved', 'blocked', 'cancelled', 'completed', 'enrolled', 'enrolling', 'expired', 'failed', 'in_progress', 'pending_review', 'rejected']);
  });
});

describe('the ownership arm is the open row, and the gates', () => {
  it('a cleared ownership row holds nothing; an open one holds: open_ownership', async () => {
    ownership.insert({ tenant_id: 't-col', brand_id: 'b-ent', lead_id: LEAD, cleared_at: new Date() });
    expect(await journeyAutoReplySkip(LEAD, on())).toBeNull();
    ownership.insert({ tenant_id: 't-col', brand_id: 'b-other', lead_id: LEAD, cleared_at: null });
    expect(await journeyAutoReplySkip(LEAD, on())).toBe('open_ownership');
  });

  it('the master off: null before any read, whatever the tables hold', async () => {
    receipt('enrolled');
    ownership.insert({ tenant_id: 't-col', brand_id: 'b-ent', lead_id: LEAD, cleared_at: null });
    const reads = [jest.spyOn(T5.executions, 'findOne'), jest.spyOn(ownership, 'findOne')];
    expect(await journeyAutoReplySkip(LEAD, on({ growthJourneyEnabled: false }))).toBeNull();
    for (const spy of reads) expect(spy).not.toHaveBeenCalled();
    reads.forEach((s) => s.mockRestore());
  });

  it('a read that throws: guard_unavailable (fail closed), one error line with the class and the lead id', async () => {
    const spy = jest.spyOn(ownership, 'findOne').mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    expect(await journeyAutoReplySkip(LEAD, on())).toBe('guard_unavailable');
    spy.mockRestore();
    const line = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('growth_journey.auto_reply_guard_failed'))!;
    expect(JSON.parse(line)).toMatchObject({ level: 'error', outcome: 'failure', error_class: 'SequelizeConnectionError', context: { lead_id: LEAD } });
  });
});

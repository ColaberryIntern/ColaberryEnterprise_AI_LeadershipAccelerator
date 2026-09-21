const m = { ledger: jest.fn() };
jest.mock('../../../../models', () => {
  const { phase5ModelsMock } = require('../../__tests__/fixtures/phase5Tables');
  const { Table } = require('../../__tests__/fixtures/phase4Tables');
  const outcomes = new Table('growth_journey_outcomes', 'out');
  return { ...phase5ModelsMock, GrowthJourneyOutcome: outcomes, __tables: { outcomes } };
});
jest.mock('../../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => m.ledger(...a) }));

import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import * as models from '../../../../models';
import { AS_OF_4, type Table } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import { EXECUTION_OUTCOME_SOURCE } from '../reconcileExecutions';
import { COMPLETED_REPLY_WINDOW_DAYS, recordReplyOutcome, replyKeyOf } from '../replyOutcome';

/**
 * T515 - a reply as an outcome on its receipt, over T503's tables (the DDL's
 * unique indexes enforced) and the real recorder: which receipt, one reply one
 * outcome, two receipts two outcomes, the windows and the gates.
 */

const outcomes = (models as unknown as { __tables: { outcomes: Table } }).__tables.outcomes;
const LEAD = 515;
const DAY = 86_400_000;
const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({
  growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true, ...over,
});
let seq = 0;
const receipt = (over: Record<string, unknown> = {}) => T5.executions.insert({
  tenant_id: 't-col', brand_id: 'b-ent', program_id: 'p-ent', decision_id: `d-${(seq += 1)}`, subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null,
  channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c-flow', campaign_key: 'k', sequence_id: 's-flow', mode: 'limited', status: 'enrolled',
  status_reason: 'enrolled', control_ids: [], proposal_id: null, approved_by: 'x', approved_at: AS_OF_4, claimed_at: AS_OF_4, attempts: 1, created_at: new Date(AS_OF_4.getTime() - DAY), ...over,
});
const run = (over: Record<string, unknown> = {}) => recordReplyOutcome({ leadId: LEAD, campaignId: 'c-flow', providerMessageId: '<m-1@mail.example>', flags: flags(), asOf: AS_OF_4, ...over });
/** The recorded/replayed member's key, or a loud failure naming what came back instead. */
const refOf = (r: Awaited<ReturnType<typeof recordReplyOutcome>>): string => ('source_ref' in r ? r.source_ref : `NOT RECORDED: ${r.status}`);

beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  resetPhase5Tables();
  outcomes.reset();
  m.ledger.mockReset().mockResolvedValue({ recorded: true });
});

describe('which receipt', () => {
  it('an open receipt for the replied-to campaign: contact_replied, keyed on the receipt and the message, the source the executions table, the metadata ids only', async () => {
    const r = receipt();
    const out = await run();
    expect(out).toEqual({ status: 'recorded', execution_id: r.id, source_ref: `${r.id}:reply:m-1@mail.example` });
    expect(outcomes.rows).toHaveLength(1);
    expect(outcomes.rows[0]).toMatchObject({ outcome_type: 'contact_replied', source: EXECUTION_OUTCOME_SOURCE, source_ref: `${r.id}:reply:m-1@mail.example`, lead_id: LEAD, decision_id: r.decision_id, subject_ref: `lead:${LEAD}`, metadata: { campaign_id: 'c-flow' }, occurred_at: AS_OF_4 });
    expect(JSON.stringify(outcomes.rows[0].metadata)).not.toContain('@');
  });

  it('a receipt completed inside the window counts; one completed before it does not; the newest wins', async () => {
    // The fixture stamps updated_at itself on insert; the settle time is set on the row after.
    receipt({ status: 'completed', decision_id: 'd-old' }).updated_at = new Date(AS_OF_4.getTime() - (COMPLETED_REPLY_WINDOW_DAYS + 1) * DAY);
    expect(await run()).toEqual({ status: 'no_receipt' });
    const recent = receipt({ status: 'completed', decision_id: 'd-recent' });
    recent.updated_at = new Date(AS_OF_4.getTime() - (COMPLETED_REPLY_WINDOW_DAYS - 1) * DAY);
    expect((await run()).status).toBe('recorded');
    expect(outcomes.rows[0].source_ref).toContain(recent.id);
    expect(COMPLETED_REPLY_WINDOW_DAYS).toBe(14);
  });

  it('another campaign, another lead, a terminal receipt other than completed: no receipt, no outcome', async () => {
    receipt({ campaign_id: 'c-other' });
    receipt({ lead_id: 516, subject_ref: 'lead:516' });
    receipt({ status: 'cancelled', decision_id: 'd-cancelled', lead_id: 517, subject_ref: 'lead:517' });
    expect(await run({ leadId: 517 })).toEqual({ status: 'no_receipt' });
    expect(await run()).toEqual({ status: 'no_receipt' });
    expect(outcomes.rows).toEqual([]);
  });

  it('no campaign resolved by the webhook -> no_campaign before any read; the execution flag off -> disabled before any read', async () => {
    const spy = jest.spyOn(T5.executions, 'findOne');
    expect(await run({ campaignId: null })).toEqual({ status: 'no_campaign' });
    expect(await run({ flags: flags({ journeyExecution: false }) })).toEqual({ status: 'disabled' });
    expect(await run({ flags: flags({ growthJourneyEnabled: false }) })).toEqual({ status: 'disabled' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('acceptance 4: two identical deliveries, one outcome; two receipts, two outcomes', () => {
  it('the same webhook delivered twice lands on the first row: replayed, one row, one ledger row', async () => {
    receipt();
    expect((await run()).status).toBe('recorded');
    const ledgerRows = m.ledger.mock.calls.length;
    expect((await run()).status).toBe('replayed');
    expect(outcomes.rows).toHaveLength(1);
    expect(m.ledger.mock.calls.length).toBe(ledgerRows);
  });

  it('two receipts for one lead (two campaigns) each get their own outcome for their own reply - the key is the receipt, not the lead', async () => {
    const a = receipt({ campaign_id: 'c-a' });
    const b = receipt({ campaign_id: 'c-b', channel: 'in_app', decision_id: 'd-b' });
    expect(refOf(await run({ campaignId: 'c-a', providerMessageId: '<r-a>' }))).toBe(`${a.id}:reply:r-a`);
    expect(refOf(await run({ campaignId: 'c-b', providerMessageId: '<r-b>' }))).toBe(`${b.id}:reply:r-b`);
    expect(outcomes.rows.map((o) => o.source_ref).sort()).toEqual([`${a.id}:reply:r-a`, `${b.id}:reply:r-b`].sort());
  });

  it('two different messages to the same receipt are two outcomes; without a provider id the day stands in', async () => {
    receipt();
    expect((await run({ providerMessageId: '<one>' })).status).toBe('recorded');
    expect((await run({ providerMessageId: '<two>' })).status).toBe('recorded');
    expect(refOf(await run({ providerMessageId: null }))).toMatch(/:reply:day:\d{4}-\d{2}-\d{2}$/);
    expect((await run({ providerMessageId: null })).status).toBe('replayed');
    expect(outcomes.rows).toHaveLength(3);
    expect(replyKeyOf('  <abc> ', AS_OF_4)).toBe('abc');
    expect(replyKeyOf('', AS_OF_4)).toBe(`day:${AS_OF_4.toISOString().slice(0, 10)}`);
  });
});

describe('failure path', () => {
  it('a read that throws is one error line with its class and a failed result; nothing throws out', async () => {
    const spy = jest.spyOn(T5.executions, 'findOne').mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    expect(await run()).toEqual({ status: 'failed', error_class: 'SequelizeConnectionError' });
    spy.mockRestore();
    const line = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('growth_journey.reply.outcome_failed'))!;
    expect(JSON.parse(line)).toMatchObject({ level: 'error', outcome: 'failure', error_class: 'SequelizeConnectionError', context: { lead_id: LEAD, campaign_id: 'c-flow' } });
  });
});

const m = {
  enrol: jest.fn(),
  ledger: jest.fn(),
};
jest.mock('../../../../models', () => {
  const { phase5ModelsMock } = require('../../__tests__/fixtures/phase5Tables');
  const { Table } = require('../../__tests__/fixtures/phase4Tables');
  const scheduled = new Table('scheduled_emails', 'se');
  const outcomes = new Table('growth_journey_outcomes', 'out');
  const proposals = new Table('proposed_agent_actions', 'paa');
  return { ...phase5ModelsMock, ScheduledEmail: scheduled, GrowthJourneyOutcome: outcomes, ProposedAgentAction: proposals, __tables: { scheduled, outcomes, proposals } };
});
// The enrol calls are spies here only so a reconciler that reached for them would be SEEN (the plan's M2); the
// no-send scanner refuses the import outright, and this module has no such import.
jest.mock('../../../sequenceService', () => ({ enrollLeadInSequence: (...a: unknown[]) => m.enrol(...a), enrollLeadsInCampaign: (...a: unknown[]) => m.enrol(...a) }));
jest.mock('../../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => m.ledger(...a) }));

import fs from 'fs';
import path from 'path';
import * as models from '../../../../models';
import { AS_OF_4, type Table } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import {
  APPROVED_TTL_HOURS, ENROLLING_STALE_MINUTES, EXECUTION_OUTCOME_SOURCE, MAX_ENROL_ATTEMPTS, RECONCILE_LIMIT, RECONCILER_EDGES,
  reconcileExecutions, reconcilerEdgesHold, safeReason,
} from '../reconcileExecutions';
import { RECEIPT_TRANSITIONS } from '../receiptTransitions';

/**
 * T512 — the reconciler over T503's tables (the shipped unique indexes enforced
 * by the fixture world) and the real outcome recorder. The scheduled rows are
 * the campaign engine's word; the ledger is the spy. Nothing here can enrol.
 */

const tables = (models as unknown as { __tables: { scheduled: Table; outcomes: Table; proposals: Table } }).__tables;
const TENANT = 't-col';
const BRAND = 'b-ent';
const LEAD = 512;
const MINUTE = 60_000;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(AS_OF_4.getTime() - ms);

let seq = 0;
const receipt = (over: Record<string, unknown> = {}) => T5.executions.insert({
  tenant_id: TENANT, brand_id: BRAND, program_id: 'p-ent', decision_id: `d-${(seq += 1)}`, subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null,
  channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c-flow', campaign_key: 'colaberry_business_discovery_questions', sequence_id: 's-flow',
  mode: 'limited', status: 'enrolled', status_reason: 'enrolled', control_ids: [], proposal_id: null, approved_by: 'limited_rollout:ctl-1', approved_at: ago(HOUR),
  claimed_at: ago(30 * MINUTE), attempts: 1, scheduled_email_id: null, nudge_id: null, outcome: null, last_error_class: null, created_at: ago(HOUR), ...over,
});
const email = (over: Record<string, unknown> = {}) => tables.scheduled.insert({
  lead_id: LEAD, campaign_id: 'c-flow', sequence_id: 's-flow', step_index: 0, status: 'pending', sent_at: null, metadata: null, created_at: ago(20 * MINUTE), ...over,
});
const row = (id: string) => T5.executions.rows.find((r) => r.id === id) as Record<string, unknown>;
const run = (over: Record<string, unknown> = {}) => reconcileExecutions({ asOf: AS_OF_4, ...over });
const transitions = () => m.ledger.mock.calls.filter((c) => String(c[0]).startsWith('growth_journey.execution.')).map((c) => [(c[4] as { from: string }).from, (c[4] as { to: string }).to, (c[4] as { reason: string }).reason]);
const outcomesOf = (receiptId: string) => tables.outcomes.rows.filter((o) => String(o.source_ref).startsWith(`${receiptId}:`)).map((o) => [o.outcome_type, o.source_ref, o.source]);

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
beforeEach(() => {
  resetPhase5Tables();
  tables.scheduled.reset();
  tables.outcomes.reset();
  tables.proposals.reset();
  m.enrol.mockReset();
  m.ledger.mockReset().mockResolvedValue({ recorded: true });
});

describe('the machine', () => {
  it('walks only edges the receipt state machine has', () => {
    expect(reconcilerEdgesHold()).toBe(true);
    expect(RECONCILER_EDGES.length).toBe(12);
    for (const [from, to] of RECONCILER_EDGES) expect(RECEIPT_TRANSITIONS[from]).toContain(to);
  });

  it('is bounded and scans only open receipts, oldest-touched first', async () => {
    for (let i = 0; i < 4; i += 1) receipt({ lead_id: 600 + i, subject_ref: `lead:${600 + i}`, status: 'completed', decision_id: `done-${i}` });
    for (let i = 0; i < 3; i += 1) receipt({ lead_id: 700 + i, subject_ref: `lead:${700 + i}`, status: 'approved', approved_at: ago(HOUR) });
    const s = await run({ limit: 2 });
    expect(s.scanned).toBe(2);
    expect((await run()).scanned).toBe(3);
    expect(RECONCILE_LIMIT).toBe(500);
  });
});

describe('enrolled / in_progress: the scheduled rows are the campaign engine\'s word', () => {
  it('a send moves the receipt to in_progress with one contact_sent outcome; the pending rest leaves it there', async () => {
    const r = receipt();
    const e0 = email({ status: 'sent', sent_at: ago(10 * MINUTE) });
    email({ step_index: 1 });
    const s = await run();
    expect(row(r.id).status).toBe('in_progress');
    expect(row(r.id).status_reason).toBe('first_send_recorded');
    expect(outcomesOf(r.id)).toEqual([['contact_sent', `${r.id}:${e0.id}`, EXECUTION_OUTCOME_SOURCE]]);
    expect(tables.outcomes.rows[0].occurred_at).toEqual(ago(10 * MINUTE));
    expect(transitions()).toEqual([['enrolled', 'in_progress', 'first_send_recorded']]);
    expect(s.moved).toEqual({ in_progress: 1 });
  });

  it('a paused row is still open: a sequence with one sent and one paused is not completed', async () => {
    const r = receipt({ status: 'in_progress' });
    email({ status: 'sent', sent_at: ago(10 * MINUTE) });
    email({ step_index: 1, status: 'paused' });
    await run();
    expect(row(r.id).status).toBe('in_progress');
    expect(transitions()).toEqual([]);
  });

  it('every row settled with sends -> completed (sent), through in_progress in one pass from enrolled', async () => {
    const r = receipt();
    email({ status: 'sent', sent_at: ago(15 * MINUTE) });
    email({ step_index: 1, status: 'sent', sent_at: ago(5 * MINUTE) });
    await run();
    expect(row(r.id).status).toBe('completed');
    expect(row(r.id).outcome).toBe('sent');
    expect(transitions()).toEqual([['enrolled', 'in_progress', 'first_send_recorded'], ['in_progress', 'completed', 'sequence_settled']]);
    expect(outcomesOf(r.id).map((o) => o[0])).toEqual(['contact_sent', 'contact_sent']);
  });

  it('a send and then a cancel -> completed (partial), with a contact_sent and a contact_blocked outcome', async () => {
    const r = receipt({ status: 'in_progress' });
    email({ status: 'sent', sent_at: ago(15 * MINUTE) });
    email({ step_index: 1, status: 'cancelled', metadata: { blocked_reason: 'lead_unsubscribed' } });
    await run();
    expect(row(r.id).status).toBe('completed');
    expect(row(r.id).outcome).toBe('partial');
    expect(outcomesOf(r.id).map((o) => o[0]).sort()).toEqual(['contact_blocked', 'contact_sent']);
    expect(tables.outcomes.rows.find((o) => o.outcome_type === 'contact_blocked')!.metadata).toEqual({ blocked_reason: 'lead_unsubscribed' });
  });

  it('acceptance 3: a journey_hold:pause:brand cancel reaches the receipt as blocked:journey_hold:pause:brand, read from the metadata the scheduler writes', async () => {
    const r = receipt();
    email({ status: 'cancelled', metadata: { blocked_reason: 'journey_hold:pause:brand', blocked_email: 'person@example.com' } });
    await run();
    expect(row(r.id).status).toBe('blocked');
    expect(row(r.id).status_reason).toBe('blocked:journey_hold:pause:brand');
    expect(row(r.id).outcome).toBe('blocked');
    expect(transitions()).toEqual([['enrolled', 'blocked', 'blocked:journey_hold:pause:brand']]);
    const [blocked] = tables.outcomes.rows;
    expect(blocked.outcome_type).toBe('contact_blocked');
    expect(blocked.metadata).toEqual({ blocked_reason: 'journey_hold:pause:brand' });
    expect(JSON.stringify([row(r.id), blocked, m.ledger.mock.calls])).not.toContain('@');
  });

  it('a blocked_reason that is not a reason string is replaced, never copied', () => {
    expect(safeReason('person@example.com')).toBe('reason_redacted');
    expect(safeReason(undefined)).toBe('unknown');
    expect(safeReason('')).toBe('unknown');
    expect(safeReason(42)).toBe('unknown');
    expect(safeReason('x'.repeat(200))).toHaveLength(120);
    expect(safeReason('journey_hold:kill_switch')).toBe('journey_hold:kill_switch');
  });

  it('every row failed -> failed:send; a mix of failed and cancelled with nothing sent -> failed:send_and_blocked', async () => {
    const a = receipt();
    email({ status: 'failed' });
    const b = receipt({ lead_id: 513, subject_ref: 'lead:513' });
    email({ lead_id: 513, status: 'failed' });
    email({ lead_id: 513, step_index: 1, status: 'cancelled', metadata: { blocked_reason: 'rate_limited' } });
    await run();
    expect([row(a.id).status, row(a.id).status_reason, row(a.id).last_error_class]).toEqual(['failed', 'failed:send', 'SendFailed']);
    expect([row(b.id).status, row(b.id).status_reason]).toEqual(['failed', 'failed:send_and_blocked']);
    expect(outcomesOf(b.id).map((o) => o[0]).sort()).toEqual(['contact_blocked', 'contact_failed']);
  });

  it('reads only the lead\'s rows for the receipt\'s campaign since the claim: an older row, another campaign, another lead do not count', async () => {
    const r = receipt();
    email({ created_at: ago(2 * HOUR), status: 'cancelled', metadata: { blocked_reason: 'old' } });
    email({ campaign_id: 'c-other', status: 'cancelled', metadata: { blocked_reason: 'other_campaign' } });
    email({ lead_id: 999, status: 'cancelled', metadata: { blocked_reason: 'other_lead' } });
    await run();
    expect(row(r.id).status).toBe('enrolled');
    expect(tables.outcomes.rows).toEqual([]);
    expect(transitions()).toEqual([]);
  });

  it('an in-app receipt has no scheduled rows and is left to the portal', async () => {
    const r = receipt({ channel: 'in_app', action_type: 'SHOW_IN_APP_NUDGE', campaign_id: null, campaign_key: null, sequence_id: null, nudge_id: 'nudge-1' });
    email({ status: 'sent', sent_at: ago(MINUTE) });
    await run();
    expect(row(r.id).status).toBe('enrolled');
    expect(tables.outcomes.rows).toEqual([]);
  });
});

describe('enrolling: an interrupted enrolment is attached or returned, never redone', () => {
  it('acceptance 1: a crash between the enrolment and the update reconciles to enrolled with the step-0 row attached and no second enrolment', async () => {
    const r = receipt({ status: 'enrolling', status_reason: 'claimed', claimed_at: ago(20 * MINUTE), attempts: 1 });
    email({ step_index: 1, created_at: ago(19 * MINUTE) });
    const step0 = email({ step_index: 0, created_at: ago(19 * MINUTE) });
    await run();
    expect(row(r.id).status).toBe('enrolled');
    expect(row(r.id).scheduled_email_id).toBe(step0.id);
    expect(row(r.id).status_reason).toBe('attached_after_interruption');
    expect(m.enrol).not.toHaveBeenCalled();
    expect(tables.scheduled.rows).toHaveLength(2);
    expect(transitions()).toEqual([['enrolling', 'enrolled', 'attached_after_interruption']]);
  });

  it('the in-app half: the nudge row the interrupted enrolment wrote is attached', async () => {
    const r = receipt({ status: 'enrolling', channel: 'in_app', campaign_id: null, claimed_at: ago(20 * MINUTE), attempts: 1 });
    const nudge = T5.nudges.insert({ tenant_id: TENANT, brand_id: BRAND, execution_id: r.id, lead_id: LEAD, enrollment_id: null, subject_ref: `lead:${LEAD}`, decision_id: r.decision_id, status: 'pending' });
    await run();
    expect(row(r.id).status).toBe('enrolled');
    expect(row(r.id).nudge_id).toBe(nudge.id);
    expect(T5.nudges.rows).toHaveLength(1);
  });

  it('a claim younger than the stale window is the adapter\'s, untouched', async () => {
    const r = receipt({ status: 'enrolling', claimed_at: ago((ENROLLING_STALE_MINUTES - 1) * MINUTE), attempts: 1 });
    await run();
    expect(row(r.id).status).toBe('enrolling');
    expect(transitions()).toEqual([]);
  });

  it('a stale claim with no row and attempts left goes back to approved for the adapter to claim again', async () => {
    const r = receipt({ status: 'enrolling', claimed_at: ago(20 * MINUTE), attempts: 1 });
    await run();
    expect(row(r.id).status).toBe('approved');
    expect(row(r.id).claimed_at).toBeNull();
    expect(row(r.id).attempts).toBe(1);
    expect(transitions()).toEqual([['enrolling', 'approved', 'enrolment_interrupted']]);
    expect(m.enrol).not.toHaveBeenCalled();
  });

  it('acceptance 2: three failed claims -> failed / retries_exhausted; a fourth run changes nothing', async () => {
    const r = receipt({ status: 'enrolling', claimed_at: ago(20 * MINUTE), attempts: MAX_ENROL_ATTEMPTS });
    await run();
    expect(row(r.id).status).toBe('failed');
    expect(row(r.id).status_reason).toBe('retries_exhausted');
    expect(row(r.id).last_error_class).toBe('RetriesExhausted');
    expect(transitions()).toEqual([['enrolling', 'failed', 'retries_exhausted']]);
    // T512 verifier's V6: the ledger row names this pass as its actor, so a receipt's life reads who moved it.
    expect(m.ledger.mock.calls[0][5]).toBe('growth_journey_reconciler');
    const before = JSON.stringify(row(r.id));
    m.ledger.mockClear();
    const s = await run();
    expect(JSON.stringify(row(r.id))).toBe(before);
    expect(s.scanned).toBe(0);
    expect(m.ledger).not.toHaveBeenCalled();
    expect(MAX_ENROL_ATTEMPTS).toBe(3);
  });

  it('the cap is the attempts already spent: attempts 2 still returns to approved, attempts 3 does not', async () => {
    const two = receipt({ status: 'enrolling', claimed_at: ago(20 * MINUTE), attempts: 2 });
    const three = receipt({ lead_id: 513, subject_ref: 'lead:513', status: 'enrolling', claimed_at: ago(20 * MINUTE), attempts: 3 });
    await run();
    expect(row(two.id).status).toBe('approved');
    expect(row(three.id).status).toBe('failed');
  });
});

describe('approved and pending_review: nothing holds the slot forever', () => {
  it('an approval older than the TTL expires; one inside it does not', async () => {
    const old = receipt({ status: 'approved', approved_at: ago((APPROVED_TTL_HOURS + 1) * HOUR), claimed_at: null });
    const fresh = receipt({ lead_id: 513, subject_ref: 'lead:513', status: 'approved', approved_at: ago((APPROVED_TTL_HOURS - 1) * HOUR), claimed_at: null });
    await run();
    expect([row(old.id).status, row(old.id).status_reason, row(old.id).outcome]).toEqual(['expired', 'approval_expired', 'expired']);
    expect(row(fresh.id).status).toBe('approved');
    expect(transitions()).toEqual([['approved', 'expired', 'approval_expired']]);
    expect(APPROVED_TTL_HOURS).toBe(72);
  });

  it('acceptance 4: an expired proposal expires the receipt and the proposal, and frees the (lead, brand, channel) slot for a new plan', async () => {
    const proposal = tables.proposals.insert({ status: 'pending', expires_at: ago(MINUTE), target_table: 'growth_journey_executions' });
    const r = receipt({ status: 'pending_review', mode: 'review', proposal_id: proposal.id, approved_by: null, approved_at: null, claimed_at: null });
    // The slot is held: the DDL's partial unique index refuses a second open receipt for the person on the channel.
    expect(() => receipt({ status: 'approved', claimed_at: null })).toThrow(/growth_journey_executions_open_lead_unique/);
    await run();
    expect([row(r.id).status, row(r.id).status_reason]).toEqual(['expired', 'proposal_expired']);
    expect(tables.proposals.rows[0].status).toBe('expired');
    expect(transitions()).toEqual([['pending_review', 'expired', 'proposal_expired']]);
    expect(m.ledger.mock.calls[0][4]).toMatchObject({ proposal_id: proposal.id });
    const next = receipt({ status: 'approved', claimed_at: null });
    expect(row(next.id).status).toBe('approved');
  });

  it('a proposal not yet expired, a proposal already expired by a late approve, and a receipt with no proposal', async () => {
    const live = tables.proposals.insert({ status: 'pending', expires_at: new Date(AS_OF_4.getTime() + HOUR) });
    const late = tables.proposals.insert({ status: 'expired', expires_at: ago(HOUR) });
    const a = receipt({ status: 'pending_review', proposal_id: live.id, claimed_at: null });
    const b = receipt({ lead_id: 513, subject_ref: 'lead:513', status: 'pending_review', proposal_id: late.id, claimed_at: null });
    const c = receipt({ lead_id: 514, subject_ref: 'lead:514', status: 'pending_review', proposal_id: null, claimed_at: null });
    await run();
    expect(row(a.id).status).toBe('pending_review');
    expect(row(b.id).status).toBe('expired');
    expect(row(c.id).status).toBe('pending_review');
    expect(tables.proposals.rows.map((p) => p.status)).toEqual(['pending', 'expired']);
  });

  it('the flip is conditional on pending: an approval cut between its two writes keeps the admin\'s decision on the proposal while the receipt still expires', async () => {
    // T512 verifier's V3: an unconditional flip would overwrite `approved` with `expired`.
    const approved = tables.proposals.insert({ status: 'approved', expires_at: ago(MINUTE) });
    const rejected = tables.proposals.insert({ status: 'rejected', expires_at: ago(MINUTE) });
    const a = receipt({ status: 'pending_review', proposal_id: approved.id, claimed_at: null });
    const b = receipt({ lead_id: 513, subject_ref: 'lead:513', status: 'pending_review', proposal_id: rejected.id, claimed_at: null });
    await run();
    expect([row(a.id).status, row(b.id).status]).toEqual(['expired', 'expired']);
    expect(tables.proposals.rows.map((p) => p.status)).toEqual(['approved', 'rejected']);
  });
});

describe('idempotent, conditional, and one receipt\'s failure is its own', () => {
  it('acceptance 5: running twice writes no second outcome and no second ledger row', async () => {
    const r = receipt();
    email({ status: 'sent', sent_at: ago(15 * MINUTE) });
    email({ step_index: 1, status: 'cancelled', metadata: { blocked_reason: 'lead_unsubscribed' } });
    const first = await run();
    expect(first.outcomes).toEqual({ recorded: 2, replayed: 0 });
    const ledgerRows = m.ledger.mock.calls.length;
    const snapshot = JSON.stringify([tables.outcomes.rows, row(r.id)]);
    const second = await run();
    expect(second.outcomes).toEqual({ recorded: 0, replayed: 0 });
    expect(second.scanned).toBe(0);
    expect(m.ledger.mock.calls.length).toBe(ledgerRows);
    expect(JSON.stringify([tables.outcomes.rows, row(r.id)])).toBe(snapshot);
  });

  it('an outcome recorded for a row already indexed is a replay, not a second row', async () => {
    const r = receipt({ status: 'in_progress' });
    email({ status: 'sent', sent_at: ago(15 * MINUTE) });
    email({ step_index: 1 });
    expect((await run()).outcomes).toEqual({ recorded: 1, replayed: 0 });
    tables.scheduled.rows[1].status = 'sent';
    tables.scheduled.rows[1].sent_at = ago(MINUTE);
    expect((await run()).outcomes).toEqual({ recorded: 1, replayed: 1 });
    expect(tables.outcomes.rows).toHaveLength(2);
    expect(row(r.id).status).toBe('completed');
  });

  it('a move is conditional on the status the receipt was read at: a row the adapter moved meanwhile gets no ledger row', async () => {
    const r = receipt({ status: 'enrolling', claimed_at: ago(20 * MINUTE), attempts: 1 });
    const real = T5.executions.update;
    const spy = jest.spyOn(T5.executions, 'update').mockImplementationOnce(async (patch, q) => {
      row(r.id).status = 'enrolled'; // the adapter finished after our read
      return real(patch, q);
    });
    const s = await run();
    spy.mockRestore();
    expect(row(r.id).status).toBe('enrolled');
    expect(transitions()).toEqual([]);
    expect(s.moved).toEqual({});
  });

  it('one receipt\'s read error is one summary entry with its class; the next receipt still reconciles', async () => {
    const bad = receipt({ status: 'enrolled', claimed_at: ago(30 * MINUTE) });
    const good = receipt({ lead_id: 513, subject_ref: 'lead:513', status: 'approved', approved_at: ago(80 * HOUR), claimed_at: null });
    const real = tables.scheduled.findAll;
    const spy = jest.spyOn(tables.scheduled, 'findAll').mockImplementationOnce(async () => { throw Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }); });
    const s = await run();
    spy.mockRestore();
    expect(tables.scheduled.findAll).toBe(real);
    expect(s.errors).toEqual([{ execution_id: bad.id, error_class: expect.any(String) }]);
    expect(s.errors[0].error_class).not.toBe('Error');
    expect(row(bad.id).status).toBe('enrolled');
    expect(row(good.id).status).toBe('expired');
    const logged = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('growth_journey.reconcile.receipt_failed'))!;
    expect(JSON.parse(logged)).toMatchObject({ level: 'error', outcome: 'failure', context: { execution_id: bad.id, status: 'enrolled' } });
  });

  it('no address rides on a receipt, an outcome or a ledger row; the reconciler names no append-only model and cannot enrol', async () => {
    const r = receipt();
    email({ status: 'cancelled', metadata: { blocked_reason: 'test_action_non_test_domain', blocked_email: 'person@example.com' } });
    await run();
    expect(JSON.stringify([row(r.id), tables.outcomes.rows, m.ledger.mock.calls])).not.toContain('@');
    const src = fs.readFileSync(path.join(__dirname, '..', 'reconcileExecutions.ts'), 'utf8');
    expect(/GrowthJourney(Classification|Transition|Decision|ScoreSnapshot|Outcome)\b/.test(src)).toBe(false);
    expect(/sequenceService|enrollLeadInSequence|enrollLeadsInCampaign|ScheduledEmail\.create/.test(src)).toBe(false);
    expect(src.split('\n').length).toBeLessThan(300);
  });
});

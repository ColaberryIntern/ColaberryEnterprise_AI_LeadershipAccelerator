import * as fs from 'fs';
import * as path from 'path';

const m = {
  logEvent: jest.fn(),
  openHumanConversation: jest.fn(),
  clearHumanConversation: jest.fn(),
  recordOutcome: jest.fn(),
  cooldownDaysFor: jest.fn(),
  integrateDisposition: jest.fn(),
};
jest.mock('../../../../models', () => ({ GrowthJourneyHandoff: {}, GrowthJourneyPolicy: {} }));
jest.mock('../../../ledgerService', () => ({ logEvent: (...a: unknown[]) => m.logEvent(...a) }));
jest.mock('../../conversationOwnershipService', () => ({
  openHumanConversation: (...a: unknown[]) => m.openHumanConversation(...a),
  clearHumanConversation: (...a: unknown[]) => m.clearHumanConversation(...a),
}));
jest.mock('../../outcomes/outcomeRecorder', () => ({ recordOutcome: (...a: unknown[]) => m.recordOutcome(...a) }));
// T406: the one door to the existing systems, mocked at its boundary; its own suite drives the writers.
jest.mock('../../integration/integrateDisposition', () => ({ integrateDisposition: (...a: unknown[]) => m.integrateDisposition(...a) }));
jest.mock('../returnToAi', () => ({
  ...jest.requireActual('../returnToAi'),
  cooldownDaysFor: (...a: unknown[]) => m.cooldownDaysFor(...a),
}));

import type { GrowthJourneyHandoffStatus } from '../../../../models/GrowthJourneyHandoff';
import {
  ACCEPT_FROM,
  CLOSING_DISPOSITIONS,
  DISPOSITION_FROM,
  HandoffTransitionError,
  RELEASE_FROM,
  RETURN_DISPOSITIONS,
  acceptHandoff,
  dispositionHandoff,
  releaseHandoff,
} from '../dispositionService';

/**
 * T405 — the state machine, with its collaborators at their boundaries.
 *
 * The route test drives the real ownership writer and outcome recorder; this
 * file pins the CONTRACT the machine has with them - which arguments, in which
 * order, and that a refused transition reaches none of them - and walks the
 * whole transition table, every status × every move.
 */

const AS_OF = new Date('2026-09-16T15:00:00Z');
const ACTOR = { id: 'staff-1', email: 'staff@colaberry.com' };
const ALL_STATUSES: readonly GrowthJourneyHandoffStatus[] = ['queued', 'assigned', 'accepted', 'dispositioned', 'returned_to_ai', 'expired', 'cancelled'];

type Row = Record<string, unknown> & { status: GrowthJourneyHandoffStatus; update: jest.Mock };
function row(status: GrowthJourneyHandoffStatus, over: Record<string, unknown> = {}): Row {
  const r: Row = {
    id: 'h-1', tenant_id: 't-col', brand_id: 'b-ent', subject_ref: 'lead:501', lead_id: 501, decision_id: 'd-1', owner_queue: 'sales',
    best_channel: 'email', evidence: { brand_program_path: { program: { slug: 'business-growth' } } }, ticket_id: 't-9',
    assigned_to_type: 'org_member', assigned_to_id: 'om-1', accepted_at: null, return_to_ai: null,
    status, update: jest.fn(),
    ...over,
  };
  r.update.mockImplementation(async (patch: Record<string, unknown>) => Object.assign(r, patch));
  return r;
}
const asModel = (r: Row) => r as unknown as Parameters<typeof acceptHandoff>[0];

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.logEvent.mockResolvedValue(undefined);
  m.openHumanConversation.mockResolvedValue({ row: { id: 'own-1' }, replayed: false });
  m.clearHumanConversation.mockResolvedValue({ cleared: 1 });
  m.recordOutcome.mockResolvedValue({ row: { id: 'out-1' }, replayed: false });
  m.cooldownDaysFor.mockResolvedValue({ days: 14, source: 'default' });
  m.integrateDisposition.mockResolvedValue({ status: 'skipped', reason: 'learner_program', program_kind: 'learner', disposition: 'qualified', writes: [], refusals: [], outcome_ids: [], ids: {} });
});

describe('the transition table', () => {
  it('names its own vocabulary: accept from queued|assigned, disposition from accepted, release from assigned|accepted; two returning and four closing dispositions', () => {
    expect(ACCEPT_FROM).toEqual(['queued', 'assigned']);
    expect(DISPOSITION_FROM).toEqual(['accepted']);
    expect(RELEASE_FROM).toEqual(['assigned', 'accepted']);
    expect(RETURN_DISPOSITIONS).toEqual(['not_ready', 'nurture']);
    expect(CLOSING_DISPOSITIONS).toEqual(['qualified', 'converted', 'no_contact', 'disqualified']);
    expect(new Set([...RETURN_DISPOSITIONS, ...CLOSING_DISPOSITIONS]).size).toBe(6);
  });

  it.each(ALL_STATUSES)('from %s: each move is allowed exactly when the table says, and a refusal touches nothing', async (status) => {
    const moves: Array<[string, readonly GrowthJourneyHandoffStatus[], (r: Row) => Promise<unknown>]> = [
      ['accepted', ACCEPT_FROM, (r) => acceptHandoff(asModel(r), ACTOR, AS_OF)],
      ['dispositioned', DISPOSITION_FROM, (r) => dispositionHandoff(asModel(r), { disposition: 'qualified', reason: 'budget confirmed' }, ACTOR, AS_OF)],
      ['released', RELEASE_FROM, (r) => releaseHandoff(asModel(r), ACTOR, 'ooo', AS_OF)],
    ];
    for (const [action, allowedFrom, move] of moves) {
      const r = row(status);
      if (allowedFrom.includes(status)) {
        await expect(move(r)).resolves.toBeDefined();
        expect(r.update).toHaveBeenCalledTimes(1);
      } else {
        const err = await move(r).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HandoffTransitionError);
        expect(err).toMatchObject({ name: 'HandoffTransitionError', error_class: 'ValidationError', status: 409, from: status, action, message: `handoff is ${status}; it cannot be ${action}` });
        expect(r.update).not.toHaveBeenCalled();
      }
      for (const fn of Object.values(m)) fn.mockClear();
    }
    // A refused move reaches no collaborator: no ownership row, no outcome, no ledger row.
    const closed = row('dispositioned');
    await expect(acceptHandoff(asModel(closed), ACTOR, AS_OF)).rejects.toBeInstanceOf(HandoffTransitionError);
    expect(m.openHumanConversation).not.toHaveBeenCalled();
    expect(m.recordOutcome).not.toHaveBeenCalled();
    expect(m.logEvent).not.toHaveBeenCalled();
  });
});

describe('accept', () => {
  it('moves the row, opens the ownership row for the human, records handoff_accepted and one ledger row - ids only, tenant and brand on the scope', async () => {
    const r = row('assigned');
    await acceptHandoff(asModel(r), ACTOR, AS_OF);
    expect(r.update).toHaveBeenCalledWith({ status: 'accepted', accepted_at: AS_OF, assigned_to_type: 'human', assigned_to_id: 'staff-1', assignment_blocked_reason: null });
    expect(m.openHumanConversation).toHaveBeenCalledWith({ tenantId: 't-col', brandId: 'b-ent', leadId: 501, ownerId: 'staff-1', channel: 'email', source: 'handoff_accepted', sinceAt: AS_OF });
    expect(m.recordOutcome).toHaveBeenCalledWith({
      tenant_id: 't-col', brand_id: 'b-ent', subject_ref: 'lead:501', lead_id: 501, handoff_id: 'h-1', decision_id: 'd-1',
      outcome_type: 'handoff_accepted', source: 'growth_journey_handoffs', source_ref: 'h-1:accepted', occurred_at: AS_OF,
    });
    expect(m.logEvent).toHaveBeenCalledWith('growth_journey.handoff.accepted', 'admin:staff-1', 'growth_journey_handoff', 'h-1',
      { handoff_id: 'h-1', subject_ref: 'lead:501', lead_id: 501, owner_queue: 'sales', from: 'assigned', ownership_id: 'own-1', outcome_id: 'out-1' },
      { tenant_id: 't-col', brand_id: 'b-ent' });
    // The actor's email is never handed to any collaborator.
    expect(JSON.stringify(m.logEvent.mock.calls)).not.toContain('@');
    expect(JSON.stringify(m.recordOutcome.mock.calls)).not.toContain('@');
    expect(JSON.stringify(m.openHumanConversation.mock.calls)).not.toContain('@');
  });

  it('a subject with no lead anchor gets no ownership row (the table is keyed on lead_id); the outcome and the ledger row are still written', async () => {
    const r = row('queued', { lead_id: null, subject_ref: 'enrollment:e-1' });
    await acceptHandoff(asModel(r), ACTOR, AS_OF);
    expect(m.openHumanConversation).not.toHaveBeenCalled();
    expect(m.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ lead_id: null, subject_ref: 'enrollment:e-1' }));
    expect(m.logEvent).toHaveBeenCalledWith(expect.any(String), 'admin:staff-1', 'growth_journey_handoff', 'h-1', expect.objectContaining({ ownership_id: null }), expect.anything());
  });

  it('a replayed outcome (the same accept recorded twice) is not a failure', async () => {
    m.recordOutcome.mockResolvedValue({ row: { id: 'out-0' }, replayed: true });
    const r = row('queued');
    await expect(acceptHandoff(asModel(r), ACTOR, AS_OF)).resolves.toBe(r);
    expect(m.logEvent).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String), 'h-1', expect.objectContaining({ outcome_id: 'out-0' }), expect.anything());
  });

  it('a failing ownership write propagates: the row moved, nothing swallowed', async () => {
    m.openHumanConversation.mockRejectedValue(new Error('connection reset'));
    const r = row('queued');
    await expect(acceptHandoff(asModel(r), ACTOR, AS_OF)).rejects.toThrow('connection reset');
    expect(m.recordOutcome).not.toHaveBeenCalled();
    expect(m.logEvent).not.toHaveBeenCalled();
  });
});

describe('disposition', () => {
  it.each(RETURN_DISPOSITIONS)('%s returns the subject to the AI: returned_to_ai, return_to_ai { program_slug, cooldown_until, reason }, the ownership cleared, the outcome and the ledger row', async (disposition) => {
    m.cooldownDaysFor.mockResolvedValue({ days: 7, source: 'body' });
    const r = row('accepted');
    const result = await dispositionHandoff(asModel(r), { disposition, reason: 'revisit in Q1', cooldown_days: 7 }, ACTOR, AS_OF);
    const until = new Date(AS_OF.getTime() + 7 * 86_400_000);
    expect(m.cooldownDaysFor).toHaveBeenCalledWith('b-ent', 7);
    expect(r.update).toHaveBeenCalledWith({
      disposition, disposition_reason: 'revisit in Q1', disposition_at: AS_OF, dispositioned_by: 'admin:staff-1',
      status: 'returned_to_ai', return_to_ai: { program_slug: 'business-growth', cooldown_until: until.toISOString(), reason: `${disposition}:revisit in Q1` }, integration_refused: null,
    });
    expect(m.integrateDisposition).not.toHaveBeenCalled();
    expect(m.clearHumanConversation).toHaveBeenCalledWith({ leadId: 501, brandId: 'b-ent', clearedBy: 'admin:staff-1', reason: `dispositioned:${disposition}`, asOf: AS_OF });
    expect(m.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({
      outcome_type: 'handoff_dispositioned', source: 'growth_journey_handoffs', source_ref: `h-1:${disposition}`, occurred_at: AS_OF,
      metadata: { disposition, returned_to_ai: true, cooldown_until: until.toISOString() },
    }));
    expect(m.logEvent).toHaveBeenCalledWith('growth_journey.handoff.returned_to_ai', 'admin:staff-1', 'growth_journey_handoff', 'h-1',
      expect.objectContaining({ from: 'accepted', disposition, reason: 'revisit in Q1', cooldown_until: until.toISOString(), cooldown_source: 'body', ownership_cleared: 1, outcome_id: 'out-1' }),
      { tenant_id: 't-col', brand_id: 'b-ent' });
    expect(result).toEqual({ row: r, status: 'returned_to_ai', cooldown_until: until, cooldown_source: 'body', ownership_cleared: 1, outcome_id: 'out-1', integration: null });
  });

  it.each(CLOSING_DISPOSITIONS)('%s closes: dispositioned, no cooldown asked for, the ownership cleared, the outcome says returned_to_ai false', async (disposition) => {
    const r = row('accepted');
    const result = await dispositionHandoff(asModel(r), { disposition, reason: 'the human decided' }, ACTOR, AS_OF);
    expect(m.cooldownDaysFor).not.toHaveBeenCalled();
    expect(r.update).toHaveBeenCalledWith({ disposition, disposition_reason: 'the human decided', disposition_at: AS_OF, dispositioned_by: 'admin:staff-1', status: 'dispositioned', integration_refused: null });
    expect(r.return_to_ai).toBeNull();
    expect(m.clearHumanConversation).toHaveBeenCalledTimes(1);
    expect(m.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ source_ref: `h-1:${disposition}`, metadata: { disposition, returned_to_ai: false, cooldown_until: null } }));
    expect(m.logEvent).toHaveBeenCalledWith('growth_journey.handoff.dispositioned', 'admin:staff-1', 'growth_journey_handoff', 'h-1', expect.objectContaining({ disposition, cooldown_until: null, cooldown_source: null }), { tenant_id: 't-col', brand_id: 'b-ent' });
    expect(result).toMatchObject({ status: 'dispositioned', cooldown_until: null, cooldown_source: null, ownership_cleared: 1 });
  });

  it('the cooldown source is whatever returnToAi answered (policy / default), and a packet with no programme records program_slug unknown', async () => {
    m.cooldownDaysFor.mockResolvedValue({ days: 21, source: 'policy' });
    const r = row('accepted', { evidence: { brand_program_path: { program: null } } });
    const result = await dispositionHandoff(asModel(r), { disposition: 'nurture', reason: 'newsletter only for now' }, ACTOR, AS_OF);
    expect(m.cooldownDaysFor).toHaveBeenCalledWith('b-ent', undefined);
    expect(result.cooldown_source).toBe('policy');
    expect(r.return_to_ai).toMatchObject({ program_slug: 'unknown', cooldown_until: new Date(AS_OF.getTime() + 21 * 86_400_000).toISOString() });
  });

  it('a subject with no lead anchor clears nothing (0 is a valid answer) and the disposition still lands', async () => {
    const r = row('accepted', { lead_id: null });
    const result = await dispositionHandoff(asModel(r), { disposition: 'no_contact', reason: 'asked not to be contacted' }, ACTOR, AS_OF);
    expect(m.clearHumanConversation).not.toHaveBeenCalled();
    expect(result.ownership_cleared).toBe(0);
    expect(r.status).toBe('dispositioned');
  });

  it('the ownership row is cleared BEFORE the row turns terminal: a failing clear leaves the handoff accepted (a retry is legal), never dispositioned with the lead still paused', async () => {
    m.clearHumanConversation.mockRejectedValue(new Error('connection reset'));
    const r = row('accepted');
    await expect(dispositionHandoff(asModel(r), { disposition: 'not_ready', reason: 'revisit in Q1' }, ACTOR, AS_OF)).rejects.toThrow('connection reset');
    expect(r.update).not.toHaveBeenCalled();
    expect(r.status).toBe('accepted');
    expect(m.recordOutcome).not.toHaveBeenCalled();
    expect(m.logEvent).not.toHaveBeenCalled();
    // The reads come first: a failing policy read also leaves everything untouched, the ownership row included.
    m.clearHumanConversation.mockResolvedValue({ cleared: 1 });
    m.cooldownDaysFor.mockRejectedValue(new Error('policy read failed'));
    await expect(dispositionHandoff(asModel(r), { disposition: 'nurture', reason: 'newsletter only' }, ACTOR, AS_OF)).rejects.toThrow('policy read failed');
    expect(m.clearHumanConversation).toHaveBeenCalledTimes(1);
    expect(r.update).not.toHaveBeenCalled();
    // And on the success path the order is clear, then update, then the outcome, then the ledger.
    m.cooldownDaysFor.mockResolvedValue({ days: 14, source: 'default' });
    const order: string[] = [];
    m.clearHumanConversation.mockImplementation(async () => { order.push('clear'); return { cleared: 1 }; });
    r.update.mockImplementation(async (patch: Record<string, unknown>) => { order.push('update'); return Object.assign(r, patch); });
    m.recordOutcome.mockImplementation(async () => { order.push('outcome'); return { row: { id: 'out-1' }, replayed: false }; });
    m.logEvent.mockImplementation(async () => { order.push('ledger'); });
    m.integrateDisposition.mockImplementation(async () => { order.push('integration'); return { status: 'skipped', reason: 'learner_program', program_kind: 'learner', disposition: 'qualified', writes: [], refusals: [], outcome_ids: [], ids: {} }; });
    await dispositionHandoff(asModel(r), { disposition: 'qualified', reason: 'budget confirmed' }, ACTOR, AS_OF);
    expect(order).toEqual(['integration', 'clear', 'update', 'outcome', 'ledger']);
  });

  it('the integration writers are not called from here: no organisation, pipeline stage, conversion or ticket touched (T406)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'dispositionService.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/Organization|pipeline_stage|convertLeadToClient|createTicket|Ticket\b|OrgMember|sendNewLeadAlert|requestInstantCallback|notify/);
    // The disposition service never imports the decision model or reaches the outcome row again once written.
    expect(code).not.toMatch(/GrowthJourneyDecision\b/);
    expect(code).not.toMatch(/\.destroy\(/);
  });
});

describe('the one door to the existing systems (T406)', () => {
  const written = { status: 'written', reason: null, program_kind: 'business', disposition: 'qualified', writes: ['account_rollup', 'pipeline_advance'], refusals: [], outcome_ids: ['out-9'], ids: { organization_id: 'org-1', stage: 'meeting_scheduled', advanced: true } };

  it.each(['qualified', 'converted'])('%s calls integrateDisposition once, with the row, the verdict, the actor (id + platform identity) and the clock, before the ownership clear and the terminal update', async (disposition) => {
    m.integrateDisposition.mockResolvedValue({ ...written, disposition });
    const r = row('accepted');
    const result = await dispositionHandoff(asModel(r), { disposition: disposition as 'qualified', reason: 'the human decided' }, { ...ACTOR, platformIdentityId: 'pid-1' }, AS_OF);
    expect(m.integrateDisposition).toHaveBeenCalledTimes(1);
    expect(m.integrateDisposition).toHaveBeenCalledWith({ handoff: r, disposition, actor: { id: 'staff-1', platformIdentityId: 'pid-1' }, asOf: AS_OF });
    expect(r.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'dispositioned', integration_refused: null }));
    expect(result.integration).toEqual({ ...written, disposition });
    expect(m.logEvent).toHaveBeenCalledWith('growth_journey.handoff.dispositioned', 'admin:staff-1', 'growth_journey_handoff', 'h-1', expect.objectContaining({ integration: { status: 'written', reason: null, writes: ['account_rollup', 'pipeline_advance'], refusals: [], outcome_ids: ['out-9'] } }), expect.anything());
    // The email never reaches the door; a missing platform identity is null, never the admin id.
    expect(JSON.stringify(m.integrateDisposition.mock.calls)).not.toContain('@');
    m.integrateDisposition.mockClear();
    await dispositionHandoff(asModel(row('accepted')), { disposition: 'qualified', reason: 'the human decided' }, ACTOR, AS_OF);
    expect(m.integrateDisposition.mock.calls[0][0]).toMatchObject({ actor: { id: 'staff-1', platformIdentityId: null } });
  });

  it.each(['not_ready', 'nurture', 'no_contact', 'disqualified'])('%s never opens the door, and the row records integration_refused null', async (disposition) => {
    const r = row('accepted');
    const result = await dispositionHandoff(asModel(r), { disposition: disposition as 'no_contact', reason: 'the human decided' }, ACTOR, AS_OF);
    expect(m.integrateDisposition).not.toHaveBeenCalled();
    expect(r.integration_refused).toBeNull();
    expect(result.integration).toBeNull();
  });

  it('a refusal (the kill switch, a lead with no company) never fails the verdict: the row is dispositioned with integration_refused set, the outcome and the ledger row written', async () => {
    m.integrateDisposition.mockResolvedValue({ ...written, status: 'refused', reason: 'lead_has_no_company', writes: [], refusals: [{ writer: 'flotation_intake', reason: 'lead_has_no_company' }], outcome_ids: [], ids: {} });
    const r = row('accepted');
    const result = await dispositionHandoff(asModel(r), { disposition: 'qualified', reason: 'wants the discovery call' }, ACTOR, AS_OF);
    expect(r.status).toBe('dispositioned');
    expect(r.integration_refused).toBe('lead_has_no_company');
    expect(m.recordOutcome).toHaveBeenCalledTimes(1);
    expect(m.logEvent).toHaveBeenCalledWith('growth_journey.handoff.dispositioned', expect.any(String), expect.any(String), 'h-1', expect.objectContaining({ integration: expect.objectContaining({ status: 'refused', reason: 'lead_has_no_company' }) }), expect.anything());
    expect(result.integration?.status).toBe('refused');
    // A composed reason is cut to the column's 64 characters, never rejected.
    m.integrateDisposition.mockResolvedValue({ ...written, status: 'refused', reason: 'x', writes: [], refusals: [{ writer: 'account_rollup', reason: 'r'.repeat(90) }], outcome_ids: [], ids: {} });
    const r2 = row('accepted');
    await dispositionHandoff(asModel(r2), { disposition: 'qualified', reason: 'wants the discovery call' }, ACTOR, AS_OF);
    expect((r2.integration_refused as string).length).toBe(64);
  });

  it('a writer that THROWS (the database, not a refusal) leaves the handoff accepted with the human still owning the thread - the retry re-runs writers that find what they wrote', async () => {
    m.integrateDisposition.mockRejectedValue(new Error('connection reset'));
    const r = row('accepted');
    await expect(dispositionHandoff(asModel(r), { disposition: 'converted', reason: 'signed the proposal' }, ACTOR, AS_OF)).rejects.toThrow('connection reset');
    expect(m.clearHumanConversation).not.toHaveBeenCalled();
    expect(r.update).not.toHaveBeenCalled();
    expect(r.status).toBe('accepted');
    expect(m.recordOutcome).not.toHaveBeenCalled();
    expect(m.logEvent).not.toHaveBeenCalled();
  });
});

describe('release', () => {
  it('returns the row to the queue - assignee and acceptance gone, the ticket kept, the reason on the row - clears the ownership and writes the ledger row', async () => {
    const r = row('accepted', { accepted_at: AS_OF });
    const result = await releaseHandoff(asModel(r), ACTOR, 'out of office', AS_OF);
    expect(r.update).toHaveBeenCalledWith({ status: 'queued', accepted_at: null, assigned_to_type: null, assigned_to_id: null, assignment_blocked_reason: 'released' });
    expect(r.ticket_id).toBe('t-9');
    expect(m.clearHumanConversation).toHaveBeenCalledWith({ leadId: 501, brandId: 'b-ent', clearedBy: 'admin:staff-1', reason: 'released:out of office', asOf: AS_OF });
    expect(m.recordOutcome).not.toHaveBeenCalled();
    expect(m.logEvent).toHaveBeenCalledWith('growth_journey.handoff.released', 'admin:staff-1', 'growth_journey_handoff', 'h-1', expect.objectContaining({ from: 'accepted', reason: 'out of office', ownership_cleared: 1 }), { tenant_id: 't-col', brand_id: 'b-ent' });
    expect(result).toEqual({ row: r, ownership_cleared: 1 });
  });

  it('from assigned (never accepted) there is no ownership row to clear; the release is still recorded', async () => {
    m.clearHumanConversation.mockResolvedValue({ cleared: 0 });
    const r = row('assigned');
    const result = await releaseHandoff(asModel(r), ACTOR, 'wrong queue', AS_OF);
    expect(result.ownership_cleared).toBe(0);
    expect(r.status).toBe('queued');
    expect(m.logEvent).toHaveBeenCalledTimes(1);
  });
});

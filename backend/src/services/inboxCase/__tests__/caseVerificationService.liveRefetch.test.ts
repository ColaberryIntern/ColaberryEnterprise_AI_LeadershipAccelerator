// /inbox-zero T5 (CC-20260910-3q7x). The verifier used to confirm an
// EMAIL_SEND by checking its receipt carried a message_id — the shape of
// success. This suite drives the three real outcomes of a live re-fetch and
// pins the settle path the plan auditor failed twice: an exhausted
// verification must (1) reach SKIPPED through edges the action state machine
// actually allows, (2) leave the item dispositioned so the closure guard's
// every_item_dispositioned passes, and (3) land the CASE in FAILED so nothing
// auto-resolves an unconfirmed send — only Ali's explicit close can.

import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

const verifyExternalEffect = jest.fn();
jest.mock('../externalVerifiers', () => ({ verifyExternalEffect: (...a: any[]) => verifyExternalEffect(...a) }));

import * as actionStateMachine from '../actionStateMachine';
import { MAX_VERIFICATION_ATTEMPTS, verifyCase } from '../caseVerificationService';
import { evaluateClosureGuard } from '../caseClosureService';

const transitionSpy = jest.spyOn(actionStateMachine, 'assertActionTransition');

beforeEach(() => {
  for (const m of [fakeInboxCase, fakeInboxCaseAction, fakeInboxCaseEvent, fakeInboxCaseItem, fakeInboxCaseQuestion]) m.rows.clear();
  verifyExternalEffect.mockReset();
  transitionSpy.mockClear();
});

async function seedCase(state = 'EXECUTING') {
  const c = await fakeInboxCase.create({ title: 'Reply to Priya', mode: 'TOPIC', state, correlation_id: randomUUID(), reopen_count: 0 });
  // A real case always has an opening event; the closure guard checks it.
  await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_opened', actor_type: 'admin', actor_id: 'ali', details: {}, correlation_id: c.correlation_id });
  return c;
}

async function seedItem(caseId: string) {
  return fakeInboxCaseItem.create({
    case_id: caseId, source_type: 'email', source_id: 'msg-1', provider: 'gmail_colaberry', source_url: 'https://mail.google.com/x',
    title: 'Priya: SOW?', occurred_at: new Date(), inclusion_status: 'INCLUDED', disposition: null, snapshot: {}, source_hash: 'h',
  });
}

async function seedSend(caseId: string, itemId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseAction.create({
    case_id: caseId, item_id: itemId, action_type: 'EMAIL_SEND', target_source: 'gmail_colaberry', target_id: 'msg-1',
    status: 'SUCCEEDED', external_receipt: { message_id: 'sent-1' }, payload: {}, depends_on_action_ids: [],
    idempotency_key: randomUUID(), attempt_count: 1, verification_attempt_count: 0, acting_admin: 'ali', correlation_id: randomUUID(),
    executed_at: new Date(), ...overrides,
  });
}

describe('verified', () => {
  it('a confirmed re-fetch moves the action to VERIFIED and the case to RESOLVED', async () => {
    const c: any = await seedCase();
    const item: any = await seedItem(c.id);
    const a: any = await seedSend(c.id, item.id);
    verifyExternalEffect.mockResolvedValue({ kind: 'verified', detail: 'SENT label present' });

    const r = await verifyCase(c.id, 'ali');

    expect(a.status).toBe('VERIFIED');
    expect(a.verification_status).toBe('VERIFIED');
    expect(r).toMatchObject({ verified: 1, verificationFailed: 0, unverifiable: 0, exhausted: 0, finalCaseState: 'RESOLVED' });
    expect(c.state).toBe('RESOLVED');
    expect(item.disposition).toBe('RESOLVED');
  });
});

describe('missing — the provider says it never landed', () => {
  it('moves the action to FAILED + VERIFICATION_FAILED and the case to FAILED, so it stays actionable', async () => {
    const c: any = await seedCase();
    const item: any = await seedItem(c.id);
    const a: any = await seedSend(c.id, item.id);
    verifyExternalEffect.mockResolvedValue({ kind: 'missing', detail: 'message sent-1 not found' });

    const r = await verifyCase(c.id, 'ali');

    expect(a.status).toBe('FAILED');
    expect(a.verification_status).toBe('VERIFICATION_FAILED');
    expect(a.error_class).toBe('VerificationMissing');
    expect(c.state).toBe('FAILED');
    expect(r.verificationFailed).toBe(1);
    expect(transitionSpy).toHaveBeenCalledWith('SUCCEEDED', 'FAILED');
    // Retry Failed remains available: FAILED -> EXECUTING is a legal edge.
    expect(actionStateMachine.canTransitionAction('FAILED', 'EXECUTING')).toBe(true);
  });
});

describe('unverifiable — we could not ask', () => {
  it('leaves the action SUCCEEDED + PENDING, counts the attempt, and keeps the case in EXECUTING (never VERIFIED, never RESOLVED)', async () => {
    const c: any = await seedCase();
    const item: any = await seedItem(c.id);
    const a: any = await seedSend(c.id, item.id);
    verifyExternalEffect.mockResolvedValue({ kind: 'unverifiable', error_class: 'TimeoutError', detail: 'BC GET timed out' });

    const r = await verifyCase(c.id, 'ali');

    expect(a.status).toBe('SUCCEEDED');
    expect(a.verification_status).toBe('PENDING');
    expect(a.verification_attempt_count).toBe(1);
    expect(a.error_class).toBe('TimeoutError');
    expect(c.state).toBe('EXECUTING');
    expect(r).toMatchObject({ unverifiable: 1, exhausted: 0, finalCaseState: 'EXECUTING' });
    expect(item.disposition).toBeNull(); // nothing settled yet
    expect(transitionSpy).not.toHaveBeenCalled(); // no status write happened
  });

  it(`the ${MAX_VERIFICATION_ATTEMPTS}rd consecutive failure settles it SUCCEEDED -> FAILED -> SKIPPED with VerificationExhausted, disposes the item NEEDS_ALI, lands the case in FAILED`, async () => {
    const c: any = await seedCase();
    const item: any = await seedItem(c.id);
    const a: any = await seedSend(c.id, item.id, { verification_attempt_count: MAX_VERIFICATION_ATTEMPTS - 1, verification_status: 'PENDING' });
    verifyExternalEffect.mockResolvedValue({ kind: 'unverifiable', error_class: 'ProviderNotConfiguredError', detail: 'Gmail client not configured' });

    const r = await verifyCase(c.id, 'ali');

    expect(a.status).toBe('SKIPPED');
    expect(a.verification_status).toBe('VERIFICATION_FAILED');
    expect(a.verification_attempt_count).toBe(MAX_VERIFICATION_ATTEMPTS);
    expect(a.error_class).toBe('VerificationExhausted');
    // Two LEGAL hops, asserted through the state machine — not a forbidden SUCCEEDED -> SKIPPED.
    expect(transitionSpy.mock.calls).toEqual([['SUCCEEDED', 'FAILED'], ['FAILED', 'SKIPPED']]);
    expect(item.disposition).toBe('NEEDS_ALI');
    expect(item.disposition_reason).toMatch(/^Verification exhausted after 3 attempts: Gmail client not configured/);
    expect(c.state).toBe('FAILED');
    expect(r).toMatchObject({ exhausted: 1, finalCaseState: 'FAILED' });
    const events = Array.from(fakeInboxCaseEvent.rows.values()) as any[];
    const ex = events.find((e) => e.event_type === 'action_verification_exhausted');
    expect(ex).toBeTruthy();
    expect(ex.details).toMatchObject({ attempts: 3, action_type: 'EMAIL_SEND', last_error_class: 'ProviderNotConfiguredError' });
  });

  it('after exhaustion the closure guard no longer blocks on the action, and blocks on nothing once Ali resolves the item', async () => {
    const c: any = await seedCase();
    const item: any = await seedItem(c.id);
    await seedSend(c.id, item.id, { verification_attempt_count: MAX_VERIFICATION_ATTEMPTS - 1 });
    verifyExternalEffect.mockResolvedValue({ kind: 'unverifiable', error_class: 'TimeoutError', detail: 't/o' });
    await verifyCase(c.id, 'ali');

    const before = await evaluateClosureGuard(c.id);
    const conditions = before.blockers.map((b) => b.condition);
    expect(conditions).not.toContain('all_actions_verified'); // the action is SKIPPED, not SUCCEEDED
    expect(conditions).not.toContain('no_failed_actions'); // ...and not FAILED
    expect(conditions).not.toContain('every_item_dispositioned'); // NEEDS_ALI is a disposition

    // Ali confirms the send landed and marks the item resolved: the case can close.
    await item.update({ disposition: 'RESOLVED' });
    const after = await evaluateClosureGuard(c.id);
    expect(after).toEqual({ canClose: true, blockers: [] });
  });

  it('does not overwrite a disposition another path already set', async () => {
    const c: any = await seedCase();
    const item: any = await seedItem(c.id);
    await item.update({ disposition: 'WAITING', disposition_reason: 'set by hand' });
    await seedSend(c.id, item.id, { verification_attempt_count: MAX_VERIFICATION_ATTEMPTS - 1 });
    verifyExternalEffect.mockResolvedValue({ kind: 'unverifiable', error_class: 'TimeoutError', detail: 't/o' });
    await verifyCase(c.id, 'ali');
    expect(item.disposition).toBe('WAITING');
    expect(item.disposition_reason).toBe('set by hand');
  });
});

describe('scope', () => {
  it('internal action types verify with no re-fetch at all', async () => {
    const c: any = await seedCase();
    const a: any = await fakeInboxCaseAction.create({
      case_id: c.id, item_id: null, action_type: 'NO_ACTION', target_source: 'case', status: 'SUCCEEDED', external_receipt: {},
      payload: {}, depends_on_action_ids: [], idempotency_key: randomUUID(), attempt_count: 1, verification_attempt_count: 0, acting_admin: 'ali', correlation_id: randomUUID(),
    });
    await verifyCase(c.id, 'ali');
    expect(a.status).toBe('VERIFIED');
    expect(verifyExternalEffect).not.toHaveBeenCalled();
  });

  it('a receipt missing its id is FAILED before any re-fetch is attempted', async () => {
    const c: any = await seedCase();
    const item: any = await seedItem(c.id);
    const a: any = await seedSend(c.id, item.id, { external_receipt: { unexpected: true } });
    await verifyCase(c.id, 'ali');
    expect(a.status).toBe('FAILED');
    expect(verifyExternalEffect).not.toHaveBeenCalled();
  });
});

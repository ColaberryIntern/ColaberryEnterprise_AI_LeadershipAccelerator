import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));

// caseRepository (used here for getCaseOrThrow/transitionCase) now syncs the
// Tickets board on every transition. caseTicketService transitively imports
// the full models barrel via ticketService.ts, which would poison every
// other model mock in this file — stub it out entirely.
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

import { verifyCase } from '../caseVerificationService';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseEvent.rows.clear();
});

async function seedCase(state = 'EXECUTING') {
  return fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state, correlation_id: randomUUID(), reopen_count: 0 });
}

async function seedAction(caseId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseAction.create({
    case_id: caseId,
    action_type: 'NO_ACTION',
    target_source: 'case',
    status: 'SUCCEEDED',
    external_receipt: {},
    depends_on_action_ids: [],
    idempotency_key: randomUUID(),
    attempt_count: 1,
    acting_admin: 'system',
    correlation_id: randomUUID(),
    ...overrides,
  });
}

describe('verifyCase — receipt verification', () => {
  it('verifies an internal action (no receipt keys required)', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id, { action_type: 'MARK_WAITING' });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(a.status).toBe('VERIFIED');
    expect(a.verification_status).toBe('VERIFIED');
  });

  it('verifies an EMAIL_SEND action whose receipt carries message_id', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id, { action_type: 'EMAIL_SEND', external_receipt: { message_id: 'abc123' } });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(a.status).toBe('VERIFIED');
  });

  it('marks verification FAILED when a succeeded external action has a receipt missing the expected key', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id, { action_type: 'EMAIL_SEND', external_receipt: { unexpected_field: true } });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(a.status).toBe('FAILED');
    expect(a.verification_status).toBe('VERIFICATION_FAILED');
  });

  it('does not touch an action that never reached SUCCEEDED', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id, { status: 'PROPOSED', external_receipt: null });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(a.status).toBe('PROPOSED');
  });
});

describe('verifyCase — case state determination', () => {
  it('moves the case to RESOLVED when every action verifies cleanly with no waiting/delegated markers', async () => {
    const c = await seedCase();
    await seedAction(c.id, { action_type: 'NO_ACTION' });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(c.state).toBe('RESOLVED');
  });

  it('moves the case to WAITING when a MARK_WAITING action succeeded', async () => {
    const c = await seedCase();
    await seedAction(c.id, { action_type: 'MARK_WAITING' });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(c.state).toBe('WAITING');
  });

  it('moves the case to DELEGATED when a MARK_DELEGATED action succeeded', async () => {
    const c = await seedCase();
    await seedAction(c.id, { action_type: 'MARK_DELEGATED' });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(c.state).toBe('DELEGATED');
  });

  it('moves the case to FAILED when any action verification fails', async () => {
    const c = await seedCase();
    await seedAction(c.id, { action_type: 'EMAIL_SEND', external_receipt: {} }); // missing message_id -> verification failure
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(c.state).toBe('FAILED');
  });

  it('moves the case to FAILED when an action already FAILED at execution time', async () => {
    const c = await seedCase();
    await seedAction(c.id, { status: 'FAILED', action_type: 'BASECAMP_COMMENT' });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(c.state).toBe('FAILED');
  });

  it('does not re-transition a case that is not currently EXECUTING', async () => {
    const c = await seedCase('WAITING');
    await seedAction(c.id, { action_type: 'NO_ACTION' });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(c.state).toBe('WAITING'); // untouched — verify only drives the EXECUTING -> * transition
  });

  it('stamps last_verified_at on the case', async () => {
    const c = await seedCase();
    await seedAction(c.id, { action_type: 'NO_ACTION' });
    await verifyCase(c.id, 'ali@colaberry.com');
    expect(c.last_verified_at).toBeInstanceOf(Date);
  });
});

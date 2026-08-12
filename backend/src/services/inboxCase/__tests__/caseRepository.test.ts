import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));

const mockEnsureCaseTicket = jest.fn(async () => {});
const mockSyncTicketForCase = jest.fn(async () => {});
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: (...args: any[]) => mockEnsureCaseTicket(...args),
  syncTicketForCase: (...args: any[]) => mockSyncTicketForCase(...args),
  postCaseProgressNote: jest.fn(async () => {}),
}));

import { openCase, transitionCase, maybeAdvanceFromNeedsAli } from '../caseRepository';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxCaseQuestion.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  mockEnsureCaseTicket.mockClear();
  mockSyncTicketForCase.mockClear();
});

async function seedCase(state = 'NEEDS_ALI') {
  const c = await openCase({
    title: 'Test case',
    mode: 'TOPIC',
    normalized_query: 'test',
    source_query: {},
    opened_by: 'ali@colaberry.com',
  });
  await c.update({ state });
  return c;
}

describe('openCase', () => {
  it('creates a ticket for every newly opened case', async () => {
    await seedCase('DISCOVERING');
    expect(mockEnsureCaseTicket).toHaveBeenCalledTimes(1);
  });
});

describe('transitionCase', () => {
  it('syncs the ticket board on every successful transition', async () => {
    const c = await seedCase('DISCOVERING');
    await transitionCase(c.id, 'ASSESSING', { actor_type: 'system', actor_id: 'test', event_type: 'x' });
    expect(mockSyncTicketForCase).toHaveBeenCalledWith(c.id, 'ASSESSING');
  });
});

describe('maybeAdvanceFromNeedsAli — the fix for "case stuck in NEEDS_ALI after last question answered"', () => {
  it('advances NEEDS_ALI -> READY_TO_PLAN when no OPEN questions remain', async () => {
    const c = await seedCase('NEEDS_ALI');
    await fakeInboxCaseQuestion.create({ case_id: c.id, status: 'ANSWERED', question: 'q1' });

    await maybeAdvanceFromNeedsAli(c.id, 'ali@colaberry.com');

    expect(c.state).toBe('READY_TO_PLAN');
  });

  it('does NOT advance while at least one question is still OPEN', async () => {
    const c = await seedCase('NEEDS_ALI');
    await fakeInboxCaseQuestion.create({ case_id: c.id, status: 'ANSWERED', question: 'q1' });
    await fakeInboxCaseQuestion.create({ case_id: c.id, status: 'OPEN', question: 'q2' });

    await maybeAdvanceFromNeedsAli(c.id, 'ali@colaberry.com');

    expect(c.state).toBe('NEEDS_ALI');
  });

  it('is a no-op when the case is not currently in NEEDS_ALI', async () => {
    const c = await seedCase('AWAITING_APPROVAL');
    await maybeAdvanceFromNeedsAli(c.id, 'ali@colaberry.com');
    expect(c.state).toBe('AWAITING_APPROVAL');
  });

  it('is a no-op when the case has zero questions at all', async () => {
    const c = await seedCase('NEEDS_ALI');
    await maybeAdvanceFromNeedsAli(c.id, 'ali@colaberry.com');
    // Zero OPEN questions (there are none) satisfies the "none still open" check.
    expect(c.state).toBe('READY_TO_PLAN');
  });

  it('syncs the ticket board when it advances the case', async () => {
    const c = await seedCase('NEEDS_ALI');
    await maybeAdvanceFromNeedsAli(c.id, 'ali@colaberry.com');
    expect(mockSyncTicketForCase).toHaveBeenCalledWith(c.id, 'READY_TO_PLAN');
  });
});

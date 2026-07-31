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

import { evaluateClosureGuard, closeCase } from '../caseClosureService';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxCaseQuestion.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseEvent.rows.clear();
});

async function seedCase(state = 'EXECUTING') {
  return fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state, correlation_id: randomUUID(), reopen_count: 0 });
}

async function seedCleanCase() {
  const c = await seedCase();
  await fakeInboxCaseItem.create({ case_id: c.id, inclusion_status: 'INCLUDED', disposition: 'RESOLVED', title: 'item' });
  await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });
  return c;
}

describe('evaluateClosureGuard — blocks with a specific reason', () => {
  it('blocks when an item has no disposition', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({ case_id: c.id, inclusion_status: 'INCLUDED', disposition: null, title: 'undispositioned' });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.canClose).toBe(false);
    expect(result.blockers.some((b) => b.condition === 'every_item_dispositioned')).toBe(true);
  });

  it('does not require excluded items to have a disposition', async () => {
    const c = await seedCleanCase();
    await fakeInboxCaseItem.create({ case_id: c.id, inclusion_status: 'EXCLUDED', disposition: null, title: 'excluded' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.canClose).toBe(true);
  });

  it('blocks when a question is still OPEN', async () => {
    const c = await seedCleanCase();
    await fakeInboxCaseQuestion.create({ case_id: c.id, status: 'OPEN', question: 'Who owns this?' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.canClose).toBe(false);
    expect(result.blockers.some((b) => b.condition === 'all_questions_answered')).toBe(true);
  });

  it('blocks when an action is still PROPOSED', async () => {
    const c = await seedCleanCase();
    await fakeInboxCaseAction.create({ case_id: c.id, status: 'PROPOSED', action_type: 'NO_ACTION' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.blockers.some((b) => b.condition === 'no_actions_left_proposed')).toBe(true);
  });

  it('blocks when an approved action never finished executing', async () => {
    const c = await seedCleanCase();
    await fakeInboxCaseAction.create({ case_id: c.id, status: 'APPROVED', action_type: 'NO_ACTION' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.blockers.some((b) => b.condition === 'all_approved_actions_executed')).toBe(true);
  });

  it('blocks when a succeeded action has not been verified', async () => {
    const c = await seedCleanCase();
    await fakeInboxCaseAction.create({ case_id: c.id, status: 'SUCCEEDED', action_type: 'NO_ACTION' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.blockers.some((b) => b.condition === 'all_actions_verified')).toBe(true);
  });

  it('blocks when any action FAILED', async () => {
    const c = await seedCleanCase();
    await fakeInboxCaseAction.create({ case_id: c.id, status: 'FAILED', action_type: 'BASECAMP_COMMENT' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.blockers.some((b) => b.condition === 'no_failed_actions')).toBe(true);
  });

  it('blocks a WAITING item with no owner/follow-up recorded', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({ case_id: c.id, inclusion_status: 'INCLUDED', disposition: 'WAITING', disposition_reason: null, title: 'waiting item' });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.blockers.some((b) => b.condition === 'waiting_items_have_owner_and_followup')).toBe(true);
  });

  it('allows a WAITING item that DOES have an owner/follow-up note', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({
      case_id: c.id,
      inclusion_status: 'INCLUDED',
      disposition: 'WAITING',
      disposition_reason: 'owner: vendor@example.com, follow up 2026-08-04',
      title: 'waiting item',
    });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.blockers.some((b) => b.condition === 'waiting_items_have_owner_and_followup')).toBe(false);
  });

  it('blocks a DELEGATED item missing a Basecamp source link', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({
      case_id: c.id,
      inclusion_status: 'INCLUDED',
      disposition: 'DELEGATED',
      disposition_reason: 'assigned to vendor team',
      source_url: null,
      title: 'delegated item',
    });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const result = await evaluateClosureGuard(c.id);
    expect(result.blockers.some((b) => b.condition === 'delegated_items_have_owner_and_link')).toBe(true);
  });

  it('a fully clean case passes every condition', async () => {
    const c = await seedCleanCase();
    const result = await evaluateClosureGuard(c.id);
    expect(result.canClose).toBe(true);
    expect(result.blockers).toEqual([]);
  });
});

describe('closeCase', () => {
  it('refuses to close and returns the exact blockers when the guard fails', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({ case_id: c.id, inclusion_status: 'INCLUDED', disposition: null, title: 'undispositioned' });

    const result = await closeCase(c.id, 'ali@colaberry.com');
    expect(result.closed).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(c.closed_at).toBeUndefined();
  });

  it('closes a clean case: stamps closed_at and transitions to RESOLVED', async () => {
    const c = await seedCleanCase();
    const result = await closeCase(c.id, 'ali@colaberry.com');
    expect(result.closed).toBe(true);
    expect(c.closed_at).toBeInstanceOf(Date);
    expect(c.state).toBe('RESOLVED');
  });

  it('can close a case already sitting in WAITING once the guard passes', async () => {
    const c = await seedCase('WAITING');
    await fakeInboxCaseItem.create({ case_id: c.id, inclusion_status: 'INCLUDED', disposition: 'WAITING', disposition_reason: 'owner: vendor, follow up 2026-08-04', title: 'item' });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const result = await closeCase(c.id, 'ali@colaberry.com');
    expect(result.closed).toBe(true);
    expect(c.state).toBe('RESOLVED');
  });
});

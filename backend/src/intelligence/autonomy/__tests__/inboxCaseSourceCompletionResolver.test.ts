/**
 * InboxCaseEngine Source-Completion Resolver — unit tests.
 *
 * Deliberately does NOT mock caseClosureService/caseRepository — this test mocks only
 * the model layer (+ caseTicketService, to keep the ticket board out of scope, mirroring
 * caseClosureService.test.ts's own established pattern) and lets evaluateClosureGuard()/
 * closeCase() run for REAL against the same fake models, so this suite proves the
 * resolver and the real closure authority genuinely agree — not that a mock says they do.
 */
import { randomUUID } from 'crypto';
import { makeFakeModel } from '../../../services/inboxCase/__tests__/testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();
const fakeOpsBcTodo = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));
jest.mock('../../../models/OpsBcTodo', () => ({ __esModule: true, default: fakeOpsBcTodo }));
jest.mock('../../../services/inboxCase/caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

import {
  classifyOpenBasecampTodoItems,
  applyItemDispositions,
  closeEligibleCases,
  fetchNonTerminalCaseIds,
  reCheckAndCloseInboxCasesOnSourceCompletion,
  previewInboxCaseSourceCompletionResolution,
} from '../inboxCaseSourceCompletionResolver';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxCaseQuestion.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  fakeOpsBcTodo.rows.clear();
});

async function seedCase(state = 'ASSESSING') {
  return fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state, correlation_id: randomUUID(), reopen_count: 0 });
}

async function seedBcTodoItem(caseId: string, bcId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseItem.create({
    case_id: caseId,
    source_type: 'basecamp_todo',
    source_id: bcId,
    provider: 'basecamp',
    inclusion_status: 'INCLUDED',
    disposition: null,
    title: 'A basecamp to-do',
    ...overrides,
  });
}

async function seedBcTodo(bcId: string, status: string) {
  return fakeOpsBcTodo.create({ bc_id: bcId, status });
}

describe('classifyOpenBasecampTodoItems', () => {
  it('classifies a completed to-do RESOLVED and an active one with no signal', async () => {
    const c = await seedCase();
    await seedBcTodoItem(c.id, 'bc-1');
    await seedBcTodoItem(c.id, 'bc-2');
    await seedBcTodo('bc-1', 'completed');
    await seedBcTodo('bc-2', 'active');

    const results = await classifyOpenBasecampTodoItems();
    expect(results).toHaveLength(2);
    const byBcId = new Map(results.map((r) => [r.bc_id, r]));
    expect(byBcId.get('bc-1')!.disposition).toBe('RESOLVED');
    expect(byBcId.get('bc-2')!.disposition).toBeNull();
  });

  it('never includes an already-dispositioned item', async () => {
    const c = await seedCase();
    await seedBcTodoItem(c.id, 'bc-3', { disposition: 'RESOLVED' });
    await seedBcTodo('bc-3', 'completed');

    const results = await classifyOpenBasecampTodoItems();
    expect(results).toHaveLength(0);
  });

  it('never includes an EXCLUDED item', async () => {
    const c = await seedCase();
    await seedBcTodoItem(c.id, 'bc-4', { inclusion_status: 'EXCLUDED' });
    await seedBcTodo('bc-4', 'completed');

    const results = await classifyOpenBasecampTodoItems();
    expect(results).toHaveLength(0);
  });

  it('never includes a non-basecamp_todo item, even if undispositioned', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({ case_id: c.id, source_type: 'email', source_id: 'e-1', provider: 'gmail_colaberry', inclusion_status: 'INCLUDED', disposition: null, title: 'an email' });

    const results = await classifyOpenBasecampTodoItems();
    expect(results).toHaveLength(0);
  });
});

describe('applyItemDispositions', () => {
  it('writes disposition + reason and logs a case event for a real signal', async () => {
    const c = await seedCase();
    const item = await seedBcTodoItem(c.id, 'bc-5');
    await seedBcTodo('bc-5', 'completed');

    const classifications = await classifyOpenBasecampTodoItems();
    const results = await applyItemDispositions(classifications);

    expect(results[0].applied).toBe(true);
    expect(item.disposition).toBe('RESOLVED');
    expect(item.disposition_reason).toMatch(/completed/i);
    expect(fakeInboxCaseEvent.rows.size).toBe(1);
    const [event] = Array.from(fakeInboxCaseEvent.rows.values());
    expect(event.event_type).toBe('item_completed_at_source');
  });

  it('does not write anything for a no-signal (still-active) item', async () => {
    const c = await seedCase();
    const item = await seedBcTodoItem(c.id, 'bc-6');
    await seedBcTodo('bc-6', 'active');

    const classifications = await classifyOpenBasecampTodoItems();
    const results = await applyItemDispositions(classifications);

    expect(results[0].applied).toBe(false);
    expect(item.disposition).toBeNull();
    expect(fakeInboxCaseEvent.rows.size).toBe(0);
  });

  it('idempotent: running the same classifications twice only writes once', async () => {
    const c = await seedCase();
    const item = await seedBcTodoItem(c.id, 'bc-7');
    await seedBcTodo('bc-7', 'completed');

    const classifications = await classifyOpenBasecampTodoItems();
    const first = await applyItemDispositions(classifications);
    const second = await applyItemDispositions(classifications); // same stale classification list, re-applied

    expect(first[0].applied).toBe(true);
    expect(second[0].applied).toBe(false); // item.disposition is no longer null — safe no-op
    expect(item.disposition).toBe('RESOLVED'); // unchanged, not double-written
  });

  it('a classification pointing at a nonexistent item id is a safe no-op, not an error, and does not abort the batch', async () => {
    const c = await seedCase();
    await seedBcTodoItem(c.id, 'bc-8'); // real item
    await seedBcTodo('bc-8', 'completed');

    const classifications = await classifyOpenBasecampTodoItems();
    // Inject a classification pointing at a nonexistent item id — must not abort the batch.
    const withBadRow = [
      { item_id: 'does-not-exist', case_id: c.id, bc_id: 'bc-ghost', outcome: 'completed_at_source' as const, disposition: 'RESOLVED' as const, reason: 'x' },
      ...classifications,
    ];

    const results = await applyItemDispositions(withBadRow);
    expect(results[0].applied).toBe(false); // the bad row, safely skipped, no write_error (not found is not a thrown error)
    expect(results[0].write_error).toBeUndefined();
    expect(results[1].applied).toBe(true); // the real row, still processed
  });

  it('a genuine thrown DB error on the write path is caught, logged, and recorded as write_error — the rest of the batch still processes', async () => {
    const c = await seedCase();
    const goodItem = await seedBcTodoItem(c.id, 'bc-99');
    const badItem = await seedBcTodoItem(c.id, 'bc-100');
    await seedBcTodo('bc-99', 'completed');
    await seedBcTodo('bc-100', 'completed');

    // Force a genuine thrown exception on this one item's write path — the exact
    // scenario plan.md's T003 entry names ("a DB write throws for one item — that
    // item's error is logged and the batch continues, other items still processed").
    badItem.update = jest.fn(async () => {
      throw new Error('simulated DB write failure');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const classifications = await classifyOpenBasecampTodoItems();
    const results = await applyItemDispositions(classifications);

    const badResult = results.find((r) => r.item_id === badItem.id)!;
    const goodResult = results.find((r) => r.item_id === goodItem.id)!;

    expect(badResult.applied).toBe(false);
    expect(badResult.write_error).toBe('simulated DB write failure');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(badItem.id));
    expect(goodResult.applied).toBe(true); // the batch continues past the bad row

    errorSpy.mockRestore();
  });
});

describe('closeEligibleCases', () => {
  it('closes a case whose real guard passes', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({ case_id: c.id, inclusion_status: 'INCLUDED', disposition: 'RESOLVED', title: 'item' });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const results = await closeEligibleCases([c.id]);
    expect(results[0].closed).toBe(true);
    expect(c.state).toBe('RESOLVED');
  });

  it('leaves a case with a real open blocker untouched and correctly reports it not closed', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({ case_id: c.id, inclusion_status: 'INCLUDED', disposition: null, title: 'still open' });

    const results = await closeEligibleCases([c.id]);
    expect(results[0].closed).toBe(false);
    expect(results[0].closable).toBe(false);
    expect(c.state).not.toBe('RESOLVED');
  });

  it('an already-RESOLVED case is a safe no-op, not an error', async () => {
    const c = await seedCase('RESOLVED');
    const results = await closeEligibleCases([c.id]);
    expect(results[0].write_error).toBeUndefined();
  });

  it('a genuinely thrown error while closing one case (no InboxCase row exists, but its child records make the guard pass) is caught, logged, and recorded, without aborting the rest of the batch', async () => {
    const goodCase = await seedCase();
    await fakeInboxCaseItem.create({ case_id: goodCase.id, inclusion_status: 'INCLUDED', disposition: 'RESOLVED', title: 'item' });
    await fakeInboxCaseEvent.create({ case_id: goodCase.id, event_type: 'case_discovery_started' });

    // A "ghost" case: its child records (item + event) make evaluateClosureGuard()
    // return canClose:true, but no InboxCase row itself exists for this id — so
    // closeCase()'s own getCaseOrThrow() genuinely throws CaseNotFoundError. This
    // exercises closeEligibleCases' real catch block, not a simulated one.
    const ghostCaseId = 'ghost-case-id';
    await fakeInboxCaseItem.create({ case_id: ghostCaseId, inclusion_status: 'INCLUDED', disposition: 'RESOLVED', title: 'item' });
    await fakeInboxCaseEvent.create({ case_id: ghostCaseId, event_type: 'case_discovery_started' });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const results = await closeEligibleCases([ghostCaseId, goodCase.id]);

    const badResult = results.find((r) => r.case_id === ghostCaseId)!;
    const goodResult = results.find((r) => r.case_id === goodCase.id)!;

    expect(badResult.write_error).toBeDefined();
    expect(badResult.closed).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    expect(goodResult.closed).toBe(true); // the batch continues past the bad row

    errorSpy.mockRestore();
  });
});

describe('reCheckAndCloseInboxCasesOnSourceCompletion — end to end', () => {
  it('a case with exactly one completed to-do item and nothing else blocking closes for real', async () => {
    const c = await seedCase();
    await seedBcTodoItem(c.id, 'bc-9');
    await seedBcTodo('bc-9', 'completed');
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const report = await reCheckAndCloseInboxCasesOnSourceCompletion();

    expect(report.items_disposed).toBe(1);
    expect(report.cases_closed).toBe(1);
    expect(c.state).toBe('RESOLVED');
  });

  it('a case with 2 undispositioned to-dos, only 1 completed — item disposed, case stays open', async () => {
    const c = await seedCase();
    await seedBcTodoItem(c.id, 'bc-10');
    await seedBcTodoItem(c.id, 'bc-11');
    await seedBcTodo('bc-10', 'completed');
    await seedBcTodo('bc-11', 'active');
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const report = await reCheckAndCloseInboxCasesOnSourceCompletion();

    expect(report.items_disposed).toBe(1);
    expect(report.cases_closed).toBe(0);
    expect(c.state).not.toBe('RESOLVED');
  });

  it('a case that already has zero undispositioned items closes via the general guard sweep, with no Basecamp signal involved', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({ case_id: c.id, inclusion_status: 'INCLUDED', disposition: 'RESOLVED', title: 'already handled via Quick Resolve' });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const report = await reCheckAndCloseInboxCasesOnSourceCompletion();

    expect(report.items_disposed).toBe(0); // no basecamp_todo item touched at all
    expect(report.cases_closed).toBe(1); // closed purely by the general sweep
    expect(c.state).toBe('RESOLVED');
  });

  it('an email-only case is never touched by either the item pass or the closure sweep', async () => {
    const c = await seedCase();
    await fakeInboxCaseItem.create({ case_id: c.id, source_type: 'email', provider: 'gmail_colaberry', source_id: 'e-2', inclusion_status: 'INCLUDED', disposition: null, title: 'unhandled email' });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const report = await reCheckAndCloseInboxCasesOnSourceCompletion();

    expect(report.items_disposed).toBe(0);
    expect(report.cases_closed).toBe(0);
    expect(c.state).not.toBe('RESOLVED');
  });

  it('idempotent end to end: running twice disposes/closes zero the second time', async () => {
    const c = await seedCase();
    await seedBcTodoItem(c.id, 'bc-12');
    await seedBcTodo('bc-12', 'completed');
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    const first = await reCheckAndCloseInboxCasesOnSourceCompletion();
    const second = await reCheckAndCloseInboxCasesOnSourceCompletion();

    expect(first.cases_closed).toBe(1);
    expect(second.items_disposed).toBe(0);
    expect(second.cases_closed).toBe(0);
  });
});

describe('previewInboxCaseSourceCompletionResolution — read-only, matches the real apply', () => {
  it('reports the same would-close set as the real apply actually closes, with zero writes', async () => {
    const c1 = await seedCase();
    await seedBcTodoItem(c1.id, 'bc-13');
    await seedBcTodo('bc-13', 'completed');
    await fakeInboxCaseEvent.create({ case_id: c1.id, event_type: 'case_discovery_started' });

    const c2 = await seedCase();
    await seedBcTodoItem(c2.id, 'bc-14');
    await seedBcTodo('bc-14', 'active');

    const preview = await previewInboxCaseSourceCompletionResolution();

    // Zero writes actually happened.
    const rawItem1 = Array.from(fakeInboxCaseItem.rows.values()).find((r: any) => r.source_id === 'bc-13');
    expect(rawItem1.disposition).toBeNull();
    expect(c1.state).not.toBe('RESOLVED');

    // But the preview correctly predicts what apply would do.
    const c1Result = preview.case_results.find((r) => r.case_id === c1.id)!;
    const c2Result = preview.case_results.find((r) => r.case_id === c2.id)!;
    expect(c1Result.closable).toBe(true);
    expect(c2Result.closable).toBe(false);

    // Now actually apply and confirm the preview's prediction matches reality.
    const applied = await reCheckAndCloseInboxCasesOnSourceCompletion();
    expect(applied.cases_closed).toBe(1);
    expect(c1.state).toBe('RESOLVED');
  });
});

describe('fetchNonTerminalCaseIds', () => {
  it('excludes RESOLVED cases and includes every other state', async () => {
    const resolved = await seedCase('RESOLVED');
    const assessing = await seedCase('ASSESSING');
    const executing = await seedCase('EXECUTING');

    const ids = await fetchNonTerminalCaseIds();
    expect(ids).not.toContain(resolved.id);
    expect(ids).toContain(assessing.id);
    expect(ids).toContain(executing.id);
  });
});

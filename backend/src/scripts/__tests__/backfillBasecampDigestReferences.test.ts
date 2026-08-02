/**
 * backfillDigestItem: dry-run makes zero writes; execute mode adds resolved
 * Basecamp items to the SAME case and clears stale wrong EMAIL_SEND actions.
 * Idempotency proven by the "already-linked elsewhere" and "no basecamp_refs
 * in body" boundary cases matching what a second real run would encounter.
 */
import { makeFakeModel } from '../../services/inboxCase/__tests__/testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel() as any;
fakeInboxCase.sequelize = { query: jest.fn() };
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
jest.mock('../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));

jest.mock('../../services/inboxCase/caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

const mockFetchExactReference = jest.fn();
const mockResolveDigestTodoByTitle = jest.fn();
jest.mock('../../services/inboxCase/sources/basecampCaseSource', () => ({
  fetchExactReference: (...args: any[]) => mockFetchExactReference(...args),
  resolveDigestTodoByTitle: (...args: any[]) => mockResolveDigestTodoByTitle(...args),
}));

const mockExtractBodyText = jest.fn(() => 'body text');
jest.mock('../../services/inbox/inboxSyncService', () => ({
  getColaberryGmailClient: jest.fn(),
  extractBodyText: (...args: any[]) => mockExtractBodyText(...args),
}));

import { backfillDigestItem, findCandidates, CandidateRow } from '../backfillBasecampDigestReferences';
import { DIGEST_SAMPLE_12A } from '../../services/inboxCase/__tests__/fixtures/basecampDigestSamples';

const REF_1 = { url: 'https://3.basecamp.com/1/buckets/9/todos/555', accountId: '1', projectId: '9', recordingType: 'todos', recordingId: '555' };
const REF_2 = { url: 'https://3.basecamp.com/1/buckets/9/todos/556', accountId: '1', projectId: '9', recordingType: 'todos', recordingId: '556' };

function resolvedTodo(recordingId: string) {
  return {
    source_type: 'basecamp_todo' as const,
    source_id: recordingId,
    provider: 'basecamp' as const,
    source_url: `https://3.basecamp.com/1/buckets/9/todos/${recordingId}`,
    title: `Resolved to-do ${recordingId}`,
    occurred_at: new Date(),
    snapshot: { exact_reference: true },
  };
}

function fakeGmailClient() {
  return { users: { messages: { get: jest.fn(async () => ({ data: { payload: {} } })) } } } as any;
}

function candidateRow(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    case_id: 'case-1',
    case_title: 'Colaberry Inc You Have 2 To Dos Due Soon',
    case_state: 'AWAITING_APPROVAL',
    item_id: 'item-1',
    source_id: 'gmail-msg-1',
    ...overrides,
  };
}

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseQuestion.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  mockFetchExactReference.mockReset();
  mockResolveDigestTodoByTitle.mockReset();
  mockExtractBodyText.mockReset().mockReturnValue('body text');
});

function resolvedTextTodo(sourceId: string, title: string) {
  return {
    source_type: 'basecamp_todo' as const,
    source_id: sourceId,
    provider: 'basecamp' as const,
    source_url: `https://3.basecamp.com/1/buckets/9/todos/${sourceId}`,
    title,
    occurred_at: new Date(),
    snapshot: { resolved_from_digest_text: true },
  };
}

// extractBasecampReferences is the REAL function (not mocked) — feed it real
// URL text via mockExtractBodyText so the whole pipeline is exercised.
function bodyWithRefs(...refs: { url: string }[]) {
  return refs.map((r) => `See: ${r.url}`).join('\n');
}

describe('backfillDigestItem — dry run', () => {
  it('makes zero writes and reports what would happen', async () => {
    mockExtractBodyText.mockReturnValue(bodyWithRefs(REF_1, REF_2));
    mockFetchExactReference.mockImplementation(async (ref: any) => resolvedTodo(ref.recordingId));
    const gmail = fakeGmailClient();

    const result = await backfillDigestItem(candidateRow(), gmail, false);

    expect(result.referencesFound).toBe(2);
    expect(result.itemsResolved).toBe(2);
    expect(fakeInboxCaseItem.rows.size).toBe(0); // nothing persisted
    expect(result.snapshotUpdated).toBe(false);
  });
});

describe('backfillDigestItem — execute', () => {
  it('adds resolved items to the SAME case and updates the digest item snapshot', async () => {
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: { from_address: 'notifications@app.basecamp.com' } });
    mockExtractBodyText.mockReturnValue(bodyWithRefs(REF_1, REF_2));
    mockFetchExactReference.mockImplementation(async (ref: any) => resolvedTodo(ref.recordingId));
    const gmail = fakeGmailClient();

    const result = await backfillDigestItem(candidateRow(), gmail, true);

    expect(result.itemsResolved).toBe(2);
    const created = Array.from(fakeInboxCaseItem.rows.values()).filter((i: any) => i.source_type === 'basecamp_todo');
    expect(created).toHaveLength(2);
    expect(created.every((i: any) => i.case_id === 'case-1')).toBe(true);
    const digestItem = fakeInboxCaseItem.rows.get('item-1');
    expect(digestItem.snapshot.basecamp_refs).toHaveLength(2);
  });

  it('rejects a stale PROPOSED EMAIL_SEND action against the digest item', async () => {
    await fakeInboxCase.create({ id: 'case-1', correlation_id: 'corr-1' });
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: {} });
    const action = await fakeInboxCaseAction.create({ case_id: 'case-1', item_id: 'item-1', action_type: 'EMAIL_SEND', status: 'PROPOSED' });
    mockExtractBodyText.mockReturnValue('no links here');
    const gmail = fakeGmailClient();

    const result = await backfillDigestItem(candidateRow(), gmail, true);

    expect(result.actionsCleared).toBe(1);
    expect(action.status).toBe('REJECTED');
  });

  it('skips (not rejects) a stale FAILED EMAIL_SEND action, since FAILED has no reject transition', async () => {
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: {} });
    const action = await fakeInboxCaseAction.create({ case_id: 'case-1', item_id: 'item-1', action_type: 'EMAIL_SEND', status: 'FAILED' });
    mockExtractBodyText.mockReturnValue('no links here');
    const gmail = fakeGmailClient();

    const result = await backfillDigestItem(candidateRow(), gmail, true);

    expect(result.actionsCleared).toBe(1);
    expect(action.status).toBe('SKIPPED');
  });

  it('does not touch an already-SUCCEEDED or EXECUTING action (only PROPOSED/FAILED are cleared)', async () => {
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: {} });
    const action = await fakeInboxCaseAction.create({ case_id: 'case-1', item_id: 'item-1', action_type: 'EMAIL_SEND', status: 'SUCCEEDED' });
    mockExtractBodyText.mockReturnValue('no links here');
    const gmail = fakeGmailClient();

    const result = await backfillDigestItem(candidateRow(), gmail, true);

    expect(result.actionsCleared).toBe(0);
    expect(action.status).toBe('SUCCEEDED');
  });
});

describe('backfillDigestItem — idempotency and boundaries', () => {
  it('skips a reference already linked elsewhere (idempotency: a second run over the same ref is a no-op)', async () => {
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: {} });
    const { computeSourceHash } = require('../../services/inboxCase/textNormalization');
    await fakeInboxCaseItem.create({ id: 'existing-todo', case_id: 'some-other-case', source_hash: computeSourceHash('basecamp', '555') });
    mockExtractBodyText.mockReturnValue(bodyWithRefs(REF_1));
    const gmail = fakeGmailClient();

    const result = await backfillDigestItem(candidateRow(), gmail, true);

    expect(result.itemsResolved).toBe(0); // already linked, not re-resolved
    expect(mockFetchExactReference).not.toHaveBeenCalled();
  });

  it('reports zero references and does not call fetchExactReference when the body has no Basecamp links', async () => {
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: {} });
    mockExtractBodyText.mockReturnValue('plain text, no links at all');
    const gmail = fakeGmailClient();

    const result = await backfillDigestItem(candidateRow(), gmail, true);

    expect(result.referencesFound).toBe(0);
    expect(mockFetchExactReference).not.toHaveBeenCalled();
  });

  it('does not fail the whole item when one of several references fails to resolve', async () => {
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: {} });
    mockExtractBodyText.mockReturnValue(bodyWithRefs(REF_1, REF_2));
    mockFetchExactReference.mockImplementation(async (ref: any) => (ref.recordingId === '555' ? resolvedTodo('555') : null));
    const gmail = fakeGmailClient();

    const result = await backfillDigestItem(candidateRow(), gmail, true);

    expect(result.itemsResolved).toBe(1);
  });
});

describe('backfillDigestItem — text-parsing fallback (run 20260802-093200-digest-text-todo-parsing, T005a)', () => {
  it('resolves and persists via the text path when the body has zero URL refs but parseable text to-dos (real captured sample)', async () => {
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: {} });
    mockExtractBodyText.mockReturnValue(DIGEST_SAMPLE_12A);
    mockResolveDigestTodoByTitle.mockImplementation(async (title: string) =>
      title === 'Final review and approval of enterprise.colaberry.ai' ? resolvedTextTodo('9001', title) : null
    );
    const gmail = fakeGmailClient();

    const result = await backfillDigestItem(candidateRow(), gmail, true);

    expect(mockFetchExactReference).not.toHaveBeenCalled(); // no URL refs in this sample — URL path never fires
    expect(result.referencesFound).toBe(12); // exact parsed to-do count for this sample
    expect(result.itemsResolved).toBeGreaterThan(0);
    expect(mockResolveDigestTodoByTitle).toHaveBeenCalledWith('Final review and approval of enterprise.colaberry.ai');
    const created = Array.from(fakeInboxCaseItem.rows.values()).find((i: any) => i.source_id === '9001');
    expect(created).toBeDefined();
    expect(created.case_id).toBe('case-1');
  });

  it('never calls the text-parse path when the URL path already found references (mutually exclusive per item)', async () => {
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: {} });
    mockExtractBodyText.mockReturnValue(bodyWithRefs(REF_1));
    mockFetchExactReference.mockImplementation(async (ref: any) => resolvedTodo(ref.recordingId));
    const gmail = fakeGmailClient();

    await backfillDigestItem(candidateRow(), gmail, true);

    expect(mockResolveDigestTodoByTitle).not.toHaveBeenCalled();
  });

  it('is idempotent: running execute:true twice against the same digest item and text-resolution result creates only one item', async () => {
    await fakeInboxCaseItem.create({ id: 'item-1', case_id: 'case-1', snapshot: {} });
    mockExtractBodyText.mockReturnValue(DIGEST_SAMPLE_12A);
    mockResolveDigestTodoByTitle.mockImplementation(async (title: string) =>
      title === 'Final review and approval of enterprise.colaberry.ai' ? resolvedTextTodo('9001', title) : null
    );
    const gmail = fakeGmailClient();

    const first = await backfillDigestItem(candidateRow(), gmail, true);
    expect(first.itemsResolved).toBeGreaterThan(0);
    const createdAfterFirstRun = Array.from(fakeInboxCaseItem.rows.values()).filter((i: any) => i.source_id === '9001');
    expect(createdAfterFirstRun).toHaveLength(1);

    const second = await backfillDigestItem(candidateRow(), gmail, true);

    expect(second.itemsResolved).toBe(0); // already-linked check fires, no re-resolution counted
    const createdAfterSecondRun = Array.from(fakeInboxCaseItem.rows.values()).filter((i: any) => i.source_id === '9001');
    expect(createdAfterSecondRun).toHaveLength(1); // still exactly one — no duplicate
  });
});

describe('findCandidates — SQL filter (T005a: broadened to also catch present-but-empty basecamp_refs)', () => {
  it('queries for both the missing-key condition and the present-but-empty jsonb_array_length condition', async () => {
    fakeInboxCase.sequelize.query.mockResolvedValue([]);

    await findCandidates();

    expect(fakeInboxCase.sequelize.query).toHaveBeenCalledTimes(1);
    const [sql, options] = fakeInboxCase.sequelize.query.mock.calls[0];
    expect(sql).toContain("(ici.snapshot ? 'basecamp_refs') = false");
    expect(sql).toContain("jsonb_array_length(ici.snapshot->'basecamp_refs') = 0");
    expect(options.replacements.sender).toBe('notifications@app.basecamp.com');
  });
});

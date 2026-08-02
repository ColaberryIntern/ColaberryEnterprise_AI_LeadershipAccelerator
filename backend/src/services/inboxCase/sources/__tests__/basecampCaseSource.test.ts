// Regression coverage for the fix in this run: fetchCommentsForItem used to
// persist source_url: null for every comment even though its parent
// recording already has a real, working Basecamp URL — comments now link to
// the parent item's page so Ali can inspect the ticket a comment came from
// (see execution-contract.md, 20260801-000656-inbox-case-ux-clarity).

const mockBcGet = jest.fn();

jest.mock('../../../ops/basecampClient', () => ({ bcGet: mockBcGet }));
jest.mock('../../../../models/OpsBcTodo', () => ({ __esModule: true, default: { findAll: jest.fn(async () => []) } }));

import { basecampCaseSource, fetchExactReference } from '../basecampCaseSource';

describe('basecampCaseSource — comment source_url', () => {
  beforeEach(() => {
    mockBcGet.mockReset();
  });

  it('points a comment at its parent recording URL instead of null', async () => {
    mockBcGet.mockImplementation(async (path: string) => {
      if (path.endsWith('/comments.json')) {
        return [{ id: 999, content: 'Following up on this', created_at: new Date().toISOString(), creator: {} }];
      }
      return {
        id: 42,
        title: 'Vendor onboarding checklist',
        app_url: 'https://3.basecamp.com/12345/buckets/67/todos/42',
        bucket: { id: 67, name: 'Vendor Onboarding' },
        updated_at: new Date().toISOString(),
      };
    });

    const items = await basecampCaseSource.findCandidates({
      mode: 'PERSON',
      knownEmails: [],
      knownDisplayNames: ['Kes'],
      windowDays: 90,
      exactPhrase: '',
      subjectVariants: [],
      basecampRefsFromEmails: [
        { url: 'https://3.basecamp.com/12345/buckets/67/todos/42', accountId: '12345', projectId: '67', recordingType: 'todos', recordingId: '42' },
      ],
      timeoutMs: 5000,
    } as any);

    const comment = items.find((i) => i.source_type === 'basecamp_comment');
    expect(comment).toBeDefined();
    expect(comment!.source_url).toBe('https://3.basecamp.com/12345/buckets/67/todos/42');
  });
});

// Guards against a future accidental un-export breaking caseAutoSyncService.ts's
// reuse of this function to resolve Basecamp references embedded in digest
// emails (see execution-contract.md, 20260802-053423-digest-basecamp-action-decomposition).
describe('fetchExactReference — exported for reuse', () => {
  beforeEach(() => {
    mockBcGet.mockReset();
  });

  it('is directly importable and resolves a real recording to a RawCandidateItem', async () => {
    mockBcGet.mockResolvedValue({
      id: 555,
      title: 'Vendor onboarding checklist',
      app_url: 'https://3.basecamp.com/1/buckets/9/todos/555',
      bucket: { id: 9, name: 'Vendor Onboarding' },
      updated_at: new Date().toISOString(),
    });

    const result = await fetchExactReference({
      accountId: '1',
      projectId: '9',
      recordingType: 'todos',
      recordingId: '555',
      url: 'https://3.basecamp.com/1/buckets/9/todos/555',
    });

    expect(result).not.toBeNull();
    expect(result!.source_type).toBe('basecamp_todo');
    expect(result!.source_id).toBe('555');
    expect(mockBcGet).toHaveBeenCalledWith('/buckets/9/todos/555.json');
  });

  it('returns null (never throws) when the Basecamp API call fails', async () => {
    mockBcGet.mockRejectedValue(new Error('Basecamp 404'));

    const result = await fetchExactReference({
      accountId: '1',
      projectId: '9',
      recordingType: 'todos',
      recordingId: '999',
      url: 'https://3.basecamp.com/1/buckets/9/todos/999',
    });

    expect(result).toBeNull();
  });
});

const mockGmailSend = jest.fn(async () => ({ data: { id: 'sent-msg-1', threadId: 'thread-1' } }));
const mockGmailModify = jest.fn(async () => ({ data: {} }));
const mockLabelsList = jest.fn(async () => ({ data: { labels: [] } }));
const mockLabelsCreate = jest.fn(async () => ({ data: { id: 'label-new-1' } }));

const fakeGmailClient = {
  users: {
    messages: { send: mockGmailSend, modify: mockGmailModify },
    labels: { list: mockLabelsList, create: mockLabelsCreate },
  },
};

jest.mock('../../inbox/inboxSyncService', () => ({
  getColaberryGmailClient: jest.fn(() => fakeGmailClient),
  getPersonalGmailClient: jest.fn(() => fakeGmailClient),
}));

const mockArchiveHotmail = jest.fn(async () => undefined);
jest.mock('../../inbox/graphMailService', () => ({
  archiveMessage: (...args: any[]) => mockArchiveHotmail(...args),
  isConfigured: () => true,
}));

const mockBcPost = jest.fn(async () => ({ id: 555, created_at: '2026-07-31T00:00:00Z' }));
const mockBcPut = jest.fn(async () => null);
jest.mock('../../ops/basecampClient', () => ({
  bcPost: (...args: any[]) => mockBcPost(...args),
  bcPut: (...args: any[]) => mockBcPut(...args),
}));

import {
  executeEmailSend,
  executeEmailLabel,
  executeEmailArchive,
  executeBasecampComment,
  executeInternalAction,
  ClassifiedExecutionError,
} from '../caseActionExecutors';

function makeItem(overrides: Partial<any> = {}) {
  return {
    id: 'item-1',
    provider: 'gmail_colaberry',
    source_id: 'msg-1',
    title: 'Original subject',
    snapshot: { from_address: 'kes@example.com', message_id: '<orig@example.com>', thread_id: 'thread-1' },
    ...overrides,
  } as any;
}

function makeAction(overrides: Partial<any> = {}) {
  return {
    id: 'action-1',
    action_type: 'EMAIL_SEND',
    payload: { subject: 'Re: Original subject', body: 'Approved.' },
    target_id: null,
    ...overrides,
  } as any;
}

beforeEach(() => {
  mockGmailSend.mockClear();
  mockGmailModify.mockClear();
  mockLabelsList.mockClear();
  mockLabelsCreate.mockClear();
  mockArchiveHotmail.mockClear();
  mockBcPost.mockClear();
  mockBcPut.mockClear();
});

describe('executeEmailSend', () => {
  it('sends a threaded reply and returns a receipt with the new message/thread id', async () => {
    const receipt = await executeEmailSend(makeAction(), makeItem());
    expect(mockGmailSend).toHaveBeenCalledTimes(1);
    expect(receipt.message_id).toBe('sent-msg-1');
    expect(receipt.sent_to).toBe('kes@example.com');
  });

  it('includes In-Reply-To threading when the original message_id is known', async () => {
    await executeEmailSend(makeAction(), makeItem());
    const callArgs = mockGmailSend.mock.calls[0][0];
    const decoded = Buffer.from(callArgs.requestBody.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    expect(decoded).toContain('In-Reply-To: <orig@example.com>');
  });

  it('throws a classified, catchable error when the item has no target', async () => {
    await expect(executeEmailSend(makeAction(), null)).rejects.toThrow(ClassifiedExecutionError);
  });

  it('throws when the Gmail client is not configured', async () => {
    const { getColaberryGmailClient } = require('../../inbox/inboxSyncService');
    getColaberryGmailClient.mockReturnValueOnce(null);
    await expect(executeEmailSend(makeAction(), makeItem())).rejects.toThrow(ClassifiedExecutionError);
  });
});

describe('executeEmailLabel', () => {
  it('creates the label if it does not exist yet, then removes INBOX and applies it', async () => {
    const receipt = await executeEmailLabel(makeAction({ action_type: 'EMAIL_LABEL', payload: { label: 'Inbox Intel/Resolved' } }), makeItem());
    expect(mockLabelsCreate).toHaveBeenCalledTimes(1);
    expect(mockGmailModify).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody: expect.objectContaining({ removeLabelIds: ['INBOX'] }) })
    );
    expect(receipt.label_applied).toBe('Inbox Intel/Resolved');
  });

  it('reuses an existing label instead of creating a duplicate', async () => {
    mockLabelsList.mockResolvedValueOnce({ data: { labels: [{ id: 'existing-label', name: 'Inbox Intel/Resolved' }] } });
    await executeEmailLabel(makeAction({ payload: { label: 'Inbox Intel/Resolved' } }), makeItem());
    expect(mockLabelsCreate).not.toHaveBeenCalled();
  });
});

describe('executeEmailArchive', () => {
  it('routes Gmail providers to label-based archiving, not Hotmail move', async () => {
    await executeEmailArchive(makeAction({ action_type: 'EMAIL_ARCHIVE' }), makeItem({ provider: 'gmail_colaberry' }));
    expect(mockGmailModify).toHaveBeenCalledTimes(1);
    expect(mockArchiveHotmail).not.toHaveBeenCalled();
  });

  it('archives via the Hotmail/Graph adapter for hotmail-provider items', async () => {
    const receipt = await executeEmailArchive(makeAction({ action_type: 'EMAIL_ARCHIVE' }), makeItem({ provider: 'hotmail', source_id: 'hm-1' }));
    expect(mockArchiveHotmail).toHaveBeenCalledWith('hm-1');
    expect(receipt.archived).toBe(true);
  });
});

describe('executeBasecampComment', () => {
  it('posts a comment via the shared basecampClient and returns the comment id', async () => {
    const receipt = await executeBasecampComment(
      makeAction({ action_type: 'BASECAMP_COMMENT', target_id: '555', payload: { project_id: '9', comment: 'Resolved.' } }),
      null
    );
    expect(mockBcPost).toHaveBeenCalledWith('/buckets/9/recordings/555/comments.json', { content: 'Resolved.' });
    expect(receipt.comment_id).toBe(555);
  });

  it('throws a classified error when project_id/recording id cannot be determined', async () => {
    await expect(executeBasecampComment(makeAction({ action_type: 'BASECAMP_COMMENT', target_id: null, payload: {} }), null)).rejects.toThrow(
      ClassifiedExecutionError
    );
  });
});

describe('executeInternalAction', () => {
  it('always succeeds deterministically with no external call', async () => {
    const receipt = await executeInternalAction(makeAction({ action_type: 'MARK_WAITING', payload: { owner: 'vendor@example.com' } }));
    expect(receipt.action_type).toBe('MARK_WAITING');
    expect(mockGmailSend).not.toHaveBeenCalled();
    expect(mockBcPost).not.toHaveBeenCalled();
  });
});

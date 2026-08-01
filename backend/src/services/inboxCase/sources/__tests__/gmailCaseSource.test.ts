// Regression coverage for the fix in this run: gmailCaseSource used to persist
// source_url: null for every message, leaving Ali with no way to open the
// original email from the case workspace (see execution-contract.md,
// 20260801-000656-inbox-case-ux-clarity).

const mockList = jest.fn();
const mockGet = jest.fn();

jest.mock('../../../inbox/inboxSyncService', () => {
  const actual = jest.requireActual('../../../inbox/inboxSyncService');
  return {
    ...actual,
    getColaberryGmailClient: () => ({ users: { messages: { list: mockList, get: mockGet } } }),
    getPersonalGmailClient: () => null,
  };
});

import { gmailColaberryCaseSource } from '../gmailCaseSource';

function fakeMessage(id: string) {
  return {
    data: {
      id,
      threadId: `thread-${id}`,
      internalDate: `${Date.now()}`,
      payload: {
        headers: [
          { name: 'Subject', value: 'Payment schedule question' },
          { name: 'From', value: 'Vendor <vendor@example.com>' },
          { name: 'To', value: 'ali@colaberry.com' },
        ],
        parts: [],
      },
    },
  };
}

describe('gmailCaseSource — source_url', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockGet.mockReset();
  });

  it('constructs a working Gmail web deep link from the message id instead of null', async () => {
    mockList.mockResolvedValue({ data: { messages: [{ id: 'abc123' }] } });
    mockGet.mockResolvedValue(fakeMessage('abc123'));

    const items = await gmailColaberryCaseSource.findCandidates({
      mode: 'PERSON',
      knownEmails: ['vendor@example.com'],
      knownDisplayNames: [],
      windowDays: 90,
      exactPhrase: '',
      subjectVariants: [],
      basecampRefsFromEmails: [],
      timeoutMs: 5000,
    } as any);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.source_url).toBe('https://mail.google.com/mail/u/0/#all/abc123');
    }
  });
});

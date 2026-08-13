// Regression coverage for the fix in this run: hotmailCaseSource used to
// persist source_url: null for every message even though Microsoft Graph
// returns a webLink to open the message in Outlook Web Access — it just
// wasn't in the $select list (see graphMailService.ts) or read here.

const mockFetchFolderMessages = jest.fn();

jest.mock('../../../inbox/graphMailService', () => ({
  isConfigured: () => true,
  fetchFolderMessages: mockFetchFolderMessages,
}));

import { hotmailCaseSource } from '../hotmailCaseSource';

function fakeGraphMessage(id: string, webLink: string) {
  return {
    id,
    conversationId: `conv-${id}`,
    subject: 'Payment schedule question',
    from: { emailAddress: { address: 'vendor@example.com', name: 'Vendor' } },
    toRecipients: [{ emailAddress: { address: 'ali@colaberry.com', name: 'Ali' } }],
    ccRecipients: [],
    body: { content: 'Body text', contentType: 'text' },
    receivedDateTime: new Date().toISOString(),
    hasAttachments: false,
    internetMessageHeaders: [],
    webLink,
  };
}

describe('hotmailCaseSource — source_url', () => {
  beforeEach(() => {
    mockFetchFolderMessages.mockReset();
  });

  it('uses the Graph webLink instead of null', async () => {
    mockFetchFolderMessages.mockImplementation(async (folder: string) =>
      folder === 'inbox' ? [fakeGraphMessage('msg1', 'https://outlook.office.com/mail/inbox/id/msg1')] : []
    );

    const items = await hotmailCaseSource.findCandidates({
      mode: 'PERSON',
      knownEmails: ['vendor@example.com'],
      knownDisplayNames: [],
      windowDays: 90,
      exactPhrase: '',
      subjectVariants: [],
      basecampRefsFromEmails: [],
      timeoutMs: 5000,
    } as any);

    expect(items).toHaveLength(1);
    expect(items[0].source_url).toBe('https://outlook.office.com/mail/inbox/id/msg1');
  });

  it('falls back to null when Graph does not return a webLink for a message', async () => {
    mockFetchFolderMessages.mockImplementation(async (folder: string) =>
      folder === 'inbox' ? [fakeGraphMessage('msg2', undefined as any)] : []
    );

    const items = await hotmailCaseSource.findCandidates({
      mode: 'PERSON',
      knownEmails: ['vendor@example.com'],
      knownDisplayNames: [],
      windowDays: 90,
      exactPhrase: '',
      subjectVariants: [],
      basecampRefsFromEmails: [],
      timeoutMs: 5000,
    } as any);

    expect(items).toHaveLength(1);
    expect(items[0].source_url).toBeNull();
  });
});

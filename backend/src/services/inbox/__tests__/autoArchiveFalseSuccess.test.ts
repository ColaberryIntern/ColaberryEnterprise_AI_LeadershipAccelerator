/**
 * Archive must never record success it did not achieve.
 *
 * The original archiveHotmail() RETURNED quietly when it could not reach Graph,
 * and archiveEmail() then wrote an `archived` audit event anyway. The database
 * recorded ~1,638 Hotmail archives while 171 of those messages were still in the
 * inbox — and nothing ever retried them, because the system believed the work was
 * done. The failure was invisible precisely because it logged success.
 *
 * The invariant under test: a skipped or failed archive records `archive_failed`,
 * never `archived`.
 */
const mockMsGraph = { isConfigured: jest.fn(), archiveMessage: jest.fn() };
const mockGraphMail = { isConfigured: jest.fn(), archiveMessage: jest.fn() };

jest.mock('../msGraphService', () => mockMsGraph, { virtual: true });
jest.mock('../graphMailService', () => mockGraphMail, { virtual: true });
jest.mock('../inboxAuditService', () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('googleapis', () => ({ google: {} }));

import { archiveEmail } from '../autoArchiveService';
import { logAuditEvent } from '../inboxAuditService';

const audit = logAuditEvent as jest.Mock;
const hotmail = { id: 'e1', provider: 'hotmail', provider_message_id: 'msg-1' };

/** Actions recorded across all audit calls in a test. */
function recordedActions(): string[] {
  return audit.mock.calls.map((c) => c[0].action);
}

describe('archive never records a success it did not achieve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    audit.mockResolvedValue(undefined);
    mockMsGraph.archiveMessage.mockResolvedValue(undefined);
    mockGraphMail.archiveMessage.mockResolvedValue(undefined);
  });

  it('records archive_failed — NOT archived — when no Graph client is configured', async () => {
    mockMsGraph.isConfigured.mockReturnValue(false);
    mockGraphMail.isConfigured.mockReturnValue(false);

    await archiveEmail(hotmail);

    expect(recordedActions()).toContain('archive_failed');
    expect(recordedActions()).not.toContain('archived');
  });

  it('names the missing credentials in the failure reason, not a vague message', async () => {
    mockMsGraph.isConfigured.mockReturnValue(false);
    mockGraphMail.isConfigured.mockReturnValue(false);

    await archiveEmail(hotmail);

    const failure = audit.mock.calls.find((c) => c[0].action === 'archive_failed');
    expect(failure![0].reasoning).toMatch(/MS_GRAPH_CLIENT_ID/);
  });

  it('records archive_failed when the Graph move itself throws', async () => {
    mockMsGraph.isConfigured.mockReturnValue(false);
    mockGraphMail.isConfigured.mockReturnValue(true);
    mockGraphMail.archiveMessage.mockRejectedValue(new Error('Graph 503'));

    await archiveEmail(hotmail);

    expect(recordedActions()).toContain('archive_failed');
    expect(recordedActions()).not.toContain('archived');
  });

  it('records archived only when the move actually succeeded', async () => {
    mockMsGraph.isConfigured.mockReturnValue(false);
    mockGraphMail.isConfigured.mockReturnValue(true);

    await archiveEmail(hotmail);

    expect(mockGraphMail.archiveMessage).toHaveBeenCalledWith('msg-1');
    expect(recordedActions()).toContain('archived');
    expect(recordedActions()).not.toContain('archive_failed');
  });

  it('still does not throw to its caller — archive remains non-critical', async () => {
    mockMsGraph.isConfigured.mockReturnValue(false);
    mockGraphMail.isConfigured.mockReturnValue(false);

    await expect(archiveEmail(hotmail)).resolves.toBeUndefined();
  });
});

/**
 * Hotmail archive client resolution.
 *
 * Regression cover for a wiring mismatch that silently disabled Hotmail
 * archiving in production. Two Graph clients exist:
 *
 *   msGraphService    confidential — CLIENT_ID + CLIENT_SECRET + TENANT_ID + REFRESH_TOKEN
 *   graphMailService  public       — CLIENT_ID + REFRESH_TOKEN
 *
 * Production provisions the public pair only. autoArchiveService was hard-wired
 * to the confidential client, so `isConfigured()` was false on every call and
 * every archive was skipped — while Hotmail *sync*, which reads through the
 * public client, worked the whole time. ~281 alert emails piled up in the inbox
 * as a result. The case that matters most is therefore
 * "confidential unconfigured, public configured" — the exact production shape.
 */
const mockMsGraph = { isConfigured: jest.fn(), archiveMessage: jest.fn() };
const mockGraphMail = { isConfigured: jest.fn(), archiveMessage: jest.fn() };

jest.mock('../msGraphService', () => mockMsGraph, { virtual: true });
jest.mock('../graphMailService', () => mockGraphMail, { virtual: true });
// Must resolve, not return undefined: the service chains .catch() on this.
jest.mock('../inboxAuditService', () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('googleapis', () => ({ google: {} }));

import { archiveEmail } from '../autoArchiveService';
import { logAuditEvent } from '../inboxAuditService';

const hotmail = { id: 'e1', provider: 'hotmail', provider_message_id: 'msg-1' };

describe('Hotmail archive client resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (logAuditEvent as jest.Mock).mockResolvedValue(undefined);
    mockMsGraph.archiveMessage.mockResolvedValue(undefined);
    mockGraphMail.archiveMessage.mockResolvedValue(undefined);
  });

  it('falls back to the public client when the confidential one is unconfigured (the production case)', async () => {
    mockMsGraph.isConfigured.mockReturnValue(false);
    mockGraphMail.isConfigured.mockReturnValue(true);

    await archiveEmail(hotmail);

    expect(mockGraphMail.archiveMessage).toHaveBeenCalledWith('msg-1');
    expect(mockMsGraph.archiveMessage).not.toHaveBeenCalled();
  });

  it('prefers the confidential client when it IS configured', async () => {
    mockMsGraph.isConfigured.mockReturnValue(true);
    mockGraphMail.isConfigured.mockReturnValue(true);

    await archiveEmail(hotmail);

    expect(mockMsGraph.archiveMessage).toHaveBeenCalledWith('msg-1');
    expect(mockGraphMail.archiveMessage).not.toHaveBeenCalled();
  });

  it('skips without throwing when neither client is configured', async () => {
    mockMsGraph.isConfigured.mockReturnValue(false);
    mockGraphMail.isConfigured.mockReturnValue(false);

    await expect(archiveEmail(hotmail)).resolves.toBeUndefined();

    expect(mockMsGraph.archiveMessage).not.toHaveBeenCalled();
    expect(mockGraphMail.archiveMessage).not.toHaveBeenCalled();
  });

  it('does not throw when the chosen client errors — archive is non-critical', async () => {
    mockMsGraph.isConfigured.mockReturnValue(false);
    mockGraphMail.isConfigured.mockReturnValue(true);
    mockGraphMail.archiveMessage.mockRejectedValue(new Error('Graph 503'));

    await expect(archiveEmail(hotmail)).resolves.toBeUndefined();
  });
});

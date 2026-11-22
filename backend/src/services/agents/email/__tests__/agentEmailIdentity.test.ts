const mockQuery = jest.fn();
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../../../config/env', () => ({ env: { agentEmailFromDomain: 'colaberry.com', mandrillInboundDomain: 'reply.colaberry.ai' } }));

import { agentForRecipient, bareAddress, identityOf, isAgentOwnAddress, resolveAgentEmailIdentity, validSlug } from '../agentEmailIdentity';

const MAYA = { agent_name: 'Maya', email_slug: 'maya', email_display_name: 'Maya' };

beforeEach(() => mockQuery.mockReset());

describe('agent email identity', () => {
  it('Maya shows maya@colaberry.com and takes replies at maya@reply.colaberry.ai', () => {
    expect(identityOf(MAYA)).toEqual({
      agentName: 'Maya', slug: 'maya', displayName: 'Maya', fromAddress: 'maya@colaberry.com',
      fromHeader: '"Maya" <maya@colaberry.com>', replyTo: 'maya@reply.colaberry.ai',
    });
  });

  it('no slug, a malformed slug, or a reserved slug has no identity', () => {
    expect(identityOf({ ...MAYA, email_slug: null })).toBeNull();
    for (const bad of ['Maya!', 'a', 'ticket', 'ticket-abc', 'ali', 'info', 'enrollment', 'support', '1maya', 'x'.repeat(40)]) {
      expect(validSlug(bad)).toBe(false);
    }
    expect(identityOf({ ...MAYA, email_slug: 'ali' })).toBeNull();
  });

  it('a display name cannot break the From header', () => {
    expect(identityOf({ ...MAYA, email_display_name: 'Maya" <evil@x.com>\r\nBcc: y' })!.fromHeader).toBe('"Maya evil@x.comBcc: y" <maya@colaberry.com>');
    expect(identityOf({ ...MAYA, email_display_name: 'Maya\\' })!.fromHeader).toBe('"Maya" <maya@colaberry.com>');
    for (const staff of ['ram', 'jackie', 'kes', 'dhee']) expect(validSlug(staff)).toBe(false);
  });

  it('resolves by agent name', async () => {
    mockQuery.mockResolvedValue([MAYA]);
    expect((await resolveAgentEmailIdentity('Maya'))!.replyTo).toBe('maya@reply.colaberry.ai');
    mockQuery.mockResolvedValue([]);
    expect(await resolveAgentEmailIdentity('Nobody')).toBeNull();
  });

  describe('agentForRecipient', () => {
    it('finds Maya from "Maya <maya@reply.colaberry.ai>", any case', async () => {
      mockQuery.mockResolvedValue([MAYA]);
      expect((await agentForRecipient('Maya <MAYA@Reply.Colaberry.ai>'))!.agentName).toBe('Maya');
      expect(mockQuery.mock.calls[0][1].replacements).toEqual({ slug: 'maya' });
    });

    it('never resolves a ticket address, a reserved name, the wrong domain, or junk', async () => {
      mockQuery.mockResolvedValue([MAYA]);
      expect(await agentForRecipient('ticket-0f8e7d6c-1234-4abc-8def-0123456789ab-a1b2c3d4@reply.colaberry.ai')).toBeNull();
      expect(await agentForRecipient('ali@reply.colaberry.ai')).toBeNull();
      expect(await agentForRecipient('maya@colaberry.com')).toBeNull();
      expect(await agentForRecipient('not an address')).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('an unknown slug on the reply domain is null', async () => {
      mockQuery.mockResolvedValue([]);
      expect(await agentForRecipient('nobody@reply.colaberry.ai')).toBeNull();
    });
  });

  it('bareAddress and own-address loop check', () => {
    expect(bareAddress('Pat <PAT@x.com>')).toBe('pat@x.com');
    expect(bareAddress('')).toBeNull();
    const id = identityOf(MAYA)!;
    expect(isAgentOwnAddress('maya@colaberry.com', id)).toBe(true);
    expect(isAgentOwnAddress('reese@reply.colaberry.ai', id)).toBe(true);
    expect(isAgentOwnAddress('pat@acme.com', id)).toBe(false);
  });
});

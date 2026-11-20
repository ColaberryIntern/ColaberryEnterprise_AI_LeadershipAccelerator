/**
 * W32: the client's own view of their pilot. Signed, expiring links; their progress only; the
 * request answers the same whether or not the email is known.
 */
const mockFindOne = jest.fn();
const mockFindByPk = jest.fn();
const mockSendLink = jest.fn();

jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', frontendUrl: 'https://enterprise.colaberry.ai/' } }));
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockFindOne(...a), findByPk: (...a: any[]) => mockFindByPk(...a) },
}));
jest.mock('../../emailService', () => ({ sendEnterpriseClientLink: (...a: any[]) => mockSendLink(...a) }));

/* eslint-disable import/first */
import jwt from 'jsonwebtoken';
import { clientLink, clientStatus, issueClientToken, requestClientLink, statusForToken, verifyClientToken } from '../enterpriseClientPortal';
/* eslint-enable import/first */

const ROW: any = {
  id: 'i-1', email: 'dana@acme.test', full_name: 'Dana Reyes', company: 'Acme Logistics', createdAt: new Date('2026-11-20T15:00:00Z'),
  interviewed_at: new Date('2026-11-20T15:20:00Z'), researched_at: new Date('2026-11-20T15:25:00Z'), options_email_sent_at: null,
  proposal_sent_at: null, signed_at: null, lost_at: null,
  pilot_options: [{ title: 'Order intake agent', what_it_does: 'internal detail' }],
  research: { summary: 'INTERNAL research' }, transcript: 'INTERNAL transcript', options_email_body: 'INTERNAL draft',
};

beforeEach(() => jest.clearAllMocks());

describe('the link', () => {
  it('is a signed, expiring token for this audience, never the bare intake id', () => {
    const t = issueClientToken('i-1');
    expect(verifyClientToken(t)).toBe('i-1');
    expect(clientLink('i-1')).toMatch(/^https:\/\/enterprise\.colaberry\.ai\/my-pilot\/status\?token=/);
    expect(clientLink('i-1')).not.toContain('i-1&');
    // Another audience (an admin or portal token) is not a client token.
    expect(verifyClientToken(jwt.sign({ sub: 'i-1' }, 'test-secret', { audience: 'participant' }))).toBeNull();
    expect(verifyClientToken(jwt.sign({ sub: 'i-1' }, 'other-secret', { audience: 'enterprise-client' }))).toBeNull();
    expect(verifyClientToken(jwt.sign({ sub: 'i-1', exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret', { audience: 'enterprise-client' }))).toBeNull();
    expect(verifyClientToken('i-1')).toBeNull();
  });

  it('is emailed only to an address we have, and the caller learns nothing either way', async () => {
    mockFindOne.mockResolvedValue(ROW);
    await expect(requestClientLink(' Dana@Acme.test ')).resolves.toBeUndefined();
    expect(mockFindOne.mock.calls[0][0].where).toEqual({ email: 'dana@acme.test' });
    expect(mockSendLink).toHaveBeenCalledWith(expect.objectContaining({ to: 'dana@acme.test', company: 'Acme Logistics' }));
    mockFindOne.mockResolvedValue(null);
    await expect(requestClientLink('nobody@else.test')).resolves.toBeUndefined();
    expect(mockSendLink).toHaveBeenCalledTimes(1);
  });
});

describe('what they see', () => {
  it('their steps, dated, and the next thing to do; nothing internal', () => {
    const s = clientStatus(ROW);
    expect(s.firstName).toBe('Dana');
    expect(s.steps.map((x) => x.done)).toEqual([true, true, true, false, false, false]);
    expect(s.next).toContain('email you to set up a first meeting');
    const all = JSON.stringify(s);
    expect(all).not.toMatch(/INTERNAL|what_it_does|internal detail/);
  });

  it('shows the option names only once Ali has sent them', () => {
    expect(clientStatus(ROW).options).toEqual([]);
    expect(clientStatus({ ...ROW, options_email_sent_at: new Date() }).options).toEqual(['Order intake agent']);
  });

  it('asks them to finish the interview first, and closes cleanly when lost', () => {
    expect(clientStatus({ ...ROW, interviewed_at: null }).next).toContain('Finish your 10-minute AI interview');
    expect(clientStatus({ ...ROW, lost_at: new Date() })).toMatchObject({ closed: 'lost' });
  });

  it('a valid token reads its own intake; anything else reads nothing', async () => {
    mockFindByPk.mockResolvedValue(ROW);
    expect((await statusForToken(issueClientToken('i-1')))?.company).toBe('Acme Logistics');
    expect(mockFindByPk).toHaveBeenCalledWith('i-1');
    expect(await statusForToken('garbage')).toBeNull();
  });
});

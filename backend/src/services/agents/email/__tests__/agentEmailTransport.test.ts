const mockEnv: Record<string, unknown> = { mandrillApiKey: 'k' };
const mockSendMail = jest.fn();
const mockResolve = jest.fn();
jest.mock('../../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../emailService', () => ({
  guardedSendMail: (o: any) => mockSendMail(o),
  resolveEmailRecipient: (...a: any[]) => mockResolve(...a),
  htmlToPlainText: (h: string) => h.replace(/<[^>]+>/g, ''),
  emailHeaders: (tag: string) => ({ 'X-Tag': tag }),
}));

import { sendAgentEmail } from '../agentEmailTransport';

const MAYA = { agentName: 'Maya', slug: 'maya', displayName: 'Maya', fromAddress: 'maya@colaberry.com', fromHeader: '"Maya" <maya@colaberry.com>', replyTo: 'maya@reply.colaberry.ai' };
const send = () => sendAgentEmail({ identity: MAYA, to: 'pat@acme.com', subject: 'Re: hi', html: '<p>Hello</p>' });

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.mandrillApiKey = 'k';
  mockResolve.mockImplementation(async (to: string, subject: string) => ({ to, subject }));
  mockSendMail.mockResolvedValue({ messageId: '<abc@mandrill>', response: '250 ok', accepted: ['pat@acme.com'], rejected: [] });
});

describe('sendAgentEmail', () => {
  it('sends From the agent with Reply-To on the reply domain, and returns the message id', async () => {
    expect(await send()).toEqual({ ok: true, messageId: 'abc@mandrill' });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"Maya" <maya@colaberry.com>', replyTo: '"Maya" <maya@reply.colaberry.ai>', to: 'pat@acme.com', subject: 'Re: hi',
      html: '<p>Hello</p>', text: 'Hello', headers: { 'X-Tag': 'agent-email-maya' },
    }));
  });

  it('threads under the message it answers, and refuses an empty body', async () => {
    await sendAgentEmail({ identity: MAYA, to: 'pat@acme.com', subject: 'Re: hi', html: '<p>Hello</p>', inReplyTo: '<m1@acme.com>' });
    expect(mockSendMail.mock.calls[0][0].headers).toEqual({ 'X-Tag': 'agent-email-maya', 'In-Reply-To': '<m1@acme.com>', References: '<m1@acme.com>' });
    expect(await sendAgentEmail({ identity: MAYA, to: 'pat@acme.com', subject: 'Re: hi', html: '  ' })).toMatchObject({ ok: false, errorClass: 'ContractViolation' });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('follows the normal test-mode redirect', async () => {
    mockResolve.mockResolvedValue({ to: 'test@colaberry.com', subject: '[TEST] Re: hi' });
    await send();
    expect(mockResolve).toHaveBeenCalledWith('pat@acme.com', 'Re: hi');
    expect(mockSendMail.mock.calls[0][0].to).toBe('test@colaberry.com');
  });

  it('never reports a send that did not happen', async () => {
    mockEnv.mandrillApiKey = '';
    expect(await send()).toMatchObject({ ok: false, errorClass: 'UpstreamUnavailable' });
    mockEnv.mandrillApiKey = 'k';
    mockSendMail.mockResolvedValue({ response: 'blocked_by_kill_switch', accepted: [], rejected: ['pat@acme.com'] });
    expect(await send()).toMatchObject({ ok: false, errorClass: 'SendBlocked' });
    mockSendMail.mockResolvedValue({ response: '250', accepted: [], rejected: ['pat@acme.com'] });
    expect(await send()).toMatchObject({ ok: false, errorClass: 'ProviderRejected' });
    mockSendMail.mockRejectedValue(Object.assign(new Error('ECONNRESET'), { name: 'NetworkError' }));
    expect(await send()).toMatchObject({ ok: false, error: 'ECONNRESET', errorClass: 'NetworkError' });
  });
});

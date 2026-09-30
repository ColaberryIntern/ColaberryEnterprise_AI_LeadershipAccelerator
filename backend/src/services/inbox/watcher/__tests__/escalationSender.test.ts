/**
 * Escalation is the watcher's entire safety story: everything it cannot fix
 * safely is supposed to reach a human. So an escalation that does not arrive is
 * not a degraded mode, it is the watcher lying about its own coverage.
 *
 * The defect these tests pin: `sendRawEmail` RETURNS `{ ok: false }` when SMTP
 * is not configured — it does not throw. The runner awaited it inside a
 * try/catch and never looked at the result, so with no SMTP the watcher would
 * poll for 30 hours, "escalate" every message it could not handle, log every
 * one of them as escalated, and mail Ali nothing at all.
 */
import {
  EscalationUndeliverableError,
  deliverEscalation,
} from '../escalationSender';

const INPUT = {
  to: ['ali@colaberry.com'],
  subject: '[Watcher escalation] refund_request from nzeribeikenna@gmail.com',
  text: 'The watcher stopped rather than answering this one.',
  html: '<pre>The watcher stopped rather than answering this one.</pre>',
};

describe('deliverEscalation', () => {
  it('THROWS when the sender reports ok:false, which is what SMTP-not-configured looks like', async () => {
    const send = jest.fn().mockResolvedValue({ ok: false, error: 'SMTP not configured' });

    await expect(deliverEscalation(send, INPUT)).rejects.toThrow(EscalationUndeliverableError);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('names the provider error, so the operator is not left guessing why Ali heard nothing', async () => {
    const send = jest.fn().mockResolvedValue({ ok: false, error: 'blocked by kill switch' });

    await expect(deliverEscalation(send, INPUT)).rejects.toThrow(/blocked by kill switch/);
  });

  it('THROWS when the sender reports ok:false with no error string at all', async () => {
    const send = jest.fn().mockResolvedValue({ ok: false });

    await expect(deliverEscalation(send, INPUT)).rejects.toThrow(/no error detail/);
  });

  it('THROWS when the sender throws, rather than swallowing it into silence', async () => {
    const send = jest.fn().mockRejectedValue(new Error('ECONNREFUSED smtp.mandrillapp.com:587'));

    await expect(deliverEscalation(send, INPUT)).rejects.toThrow(EscalationUndeliverableError);
    await expect(deliverEscalation(send, INPUT)).rejects.toThrow(/ECONNREFUSED/);
  });

  it('THROWS when the sender resolves undefined, which no contract permits but a mock can produce', async () => {
    const send = jest.fn().mockResolvedValue(undefined as any);

    await expect(deliverEscalation(send, INPUT)).rejects.toThrow(EscalationUndeliverableError);
  });

  it('returns the provider message id on a real delivery', async () => {
    const send = jest.fn().mockResolvedValue({ ok: true, messageId: '<esc-1@colaberry.com>' });

    await expect(deliverEscalation(send, INPUT)).resolves.toEqual({
      messageId: '<esc-1@colaberry.com>',
    });
  });
});

/**
 * Delivering an escalation, and refusing to pretend one was delivered.
 *
 * ── THE DEFECT THIS MODULE EXISTS FOR ───────────────────────────────────────
 *
 * Escalation is the watcher's whole safety argument. Everything it will not fix
 * on its own — money, anything that would overwrite student work, anything it
 * cannot verify — is supposed to reach a human instead. If escalation silently
 * does nothing, the watcher is not degraded, it is misrepresenting its own
 * coverage: the log says "escalated", the run exits 0, and nobody is told.
 *
 * `sendRawEmail` does not throw when it cannot send. It RETURNS:
 *
 *     if (!transporter) return { ok: false, error: 'SMTP not configured' };
 *
 * and likewise for the kill switch and the dev email guard. The runner awaited
 * it inside a try/catch and never read the result, so every one of those paths
 * was invisible. With no SMTP in the environment the watcher would have polled
 * for 30 hours, logged an escalation for every message it could not handle, and
 * mailed Ali nothing at all.
 *
 * So the contract here is: an escalation either goes out or it throws. There is
 * no third outcome, and specifically there is no quiet one. The caller is
 * expected to let it propagate — a watcher that cannot reach a human has no
 * safe way to continue and should stop loudly rather than keep polling.
 */

export class EscalationUndeliverableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscalationUndeliverableError';
  }
}

export interface RawEmailInput {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

/** The shape of `services/emailService.sendRawEmail`, narrowed to what we use. */
export type RawEmailSender = (
  input: RawEmailInput,
) => Promise<{ ok: boolean; error?: string; messageId?: string } | undefined>;

/**
 * Send one escalation. Throws EscalationUndeliverableError unless the provider
 * affirmatively reported success.
 *
 * Note the `ok !== true` rather than `!ok`: a sender that resolves undefined, or
 * resolves an object without the field, is not a success either. The failure
 * being guarded is "looked healthy while doing nothing", and a missing field is
 * the cheapest way to reintroduce it.
 */
export async function deliverEscalation(
  send: RawEmailSender,
  input: RawEmailInput,
): Promise<{ messageId?: string }> {
  let result: Awaited<ReturnType<RawEmailSender>>;
  try {
    result = await send(input);
  } catch (err: any) {
    throw new EscalationUndeliverableError(
      `Escalation to ${input.to.join(', ')} threw before it could be delivered: ` +
      `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}. Nobody has been told about ` +
      'the message that triggered it.',
    );
  }

  if (result?.ok !== true) {
    throw new EscalationUndeliverableError(
      `Escalation to ${input.to.join(', ')} was NOT delivered: ` +
      `${result?.error ?? 'the sender reported failure with no error detail'}. ` +
      'This is the silent-failure mode the watcher must never run in: it would keep polling, ' +
      'keep logging escalations, and keep telling nobody.',
    );
  }

  return { messageId: result.messageId };
}

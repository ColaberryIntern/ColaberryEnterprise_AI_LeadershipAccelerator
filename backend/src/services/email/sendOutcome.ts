import type nodemailer from 'nodemailer';

/**
 * Did a send that RESOLVED actually leave the building?
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 *
 * It started life inside emailService, which builds an SMTP transport as an
 * import side effect - so every caller that wanted this pure function had to
 * drag the transport in with it, and every suite that mocks `emailService`
 * wholesale silently lost it. `studioBugReport.test.ts` did exactly that and
 * failed with three undefined-is-not-a-function errors. A function with no
 * dependencies belongs somewhere with no dependencies.
 *
 * ── WHY A CALLER CANNOT JUST `await` AND ASSUME ─────────────────────────────
 *
 * `guardedSendMail` resolves in three situations that are not deliveries: the
 * kill switch is on, the dev guard blocked it, or - the one that cost us
 * Sohail's three bug reports on 2026-11-11 - the relay accepted a message with
 * an empty envelope sender and then dropped it.
 *
 * `accepted.length` alone does NOT catch that third case. The no-from probe
 * came back with a populated `accepted` array and
 * `response: '250 2.0.0 Ok: queued as ...'`, and the mail still never existed
 * as far as Mandrill was concerned. The envelope sender is the field that told
 * the two apart, so it is the field checked here.
 */
export interface SendOutcome {
  delivered: boolean;
  reason?: 'blocked' | 'nothing_accepted' | 'no_envelope_sender';
}

export function readSendOutcome(info: nodemailer.SentMessageInfo | undefined): SendOutcome {
  const response = typeof info?.response === 'string' ? info.response : '';
  if (response.startsWith('blocked_by_')) return { delivered: false, reason: 'blocked' };

  const accepted = Array.isArray(info?.accepted) ? info!.accepted : [];
  if (accepted.length === 0) return { delivered: false, reason: 'nothing_accepted' };

  const envelopeFrom = String((info as { envelope?: { from?: unknown } })?.envelope?.from ?? '').trim();
  if (envelopeFrom === '') return { delivered: false, reason: 'no_envelope_sender' };

  return { delivered: true };
}

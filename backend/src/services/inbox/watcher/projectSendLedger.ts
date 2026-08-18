import fs from 'fs';
import { sendLedgerPath } from './outboundIdentity';

/**
 * Projecting `send-ledger.jsonl` out of the Postgres `email_send_ledger` table.
 *
 * ── WHY THIS IS NEEDED ──────────────────────────────────────────────────────
 *
 * The watcher identifies its own outbound mail two ways, on purpose: the
 * `X-Colaberry-Outbound-Copy` header stamped on each message, and the provider
 * message ids recorded in the send ledger. Two discriminators so that neither
 * one failing quietly can let the watcher answer Ali's 25 BCC copies as though
 * they were 25 students reporting 25 problems.
 *
 * The batch was run with `--ledger db`. That path claims and records in
 * Postgres and writes no JSONL at all, so the second discriminator was not
 * degraded, it was absent. `loadOutboundLedger` reported `missing`, and the
 * watcher fell back to escalate-only for the entire 30-hour window — mailing
 * Ali about every message rather than handling the ones it was built to handle.
 *
 * ── WHY THE PROJECTION IS SOUND ─────────────────────────────────────────────
 *
 * The two sides only meet if the id the DB stored is the id that was delivered.
 * The canary settled that empirically: `provider_message_id` in the ledger row
 * matched the delivered RFC822 `Message-ID` exactly. `loadOutboundLedger`
 * normalises both sides through `normalizeMessageId`, so bracket and case
 * differences do not matter.
 *
 * ── WHY EVERY EDGE HERE THROWS RATHER THAN WRITING SOMETHING ────────────────
 *
 * A ledger is only useful if it is complete. A projection that silently skipped
 * a row, or wrote an empty file, would hand the watcher a ledger that looks
 * authoritative and is not — and a send this file does not know about is
 * exactly the message the watcher would answer as if a student had written it.
 * So: no rows is an error, a row without a message id is an error, and an
 * existing ledger file is never overwritten.
 */

export class LedgerProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerProjectionError';
  }
}

export interface SentLedgerRow {
  idempotency_key: string;
  recipient: string;
  subject: string;
  business_event_id: string;
  provider_message_id: string | null;
  sent_at: string | null;
}

/** Reads the `sent` rows for one business event. Injected so this is testable. */
export type SentRowQuery = (businessEventId: string) => Promise<SentLedgerRow[]>;

/**
 * Write `<runDir>/send-ledger.jsonl` from the DB ledger, in the record shape
 * `loadOutboundLedger` replays (`{ type: 'sent', key, message_id, ... }`).
 */
export async function projectSendLedger(
  runDir: string,
  businessEventId: string,
  query: SentRowQuery,
): Promise<{ written: number; path: string }> {
  const file = sendLedgerPath(runDir);

  // Checked BEFORE the query, so a mistaken invocation cannot clobber a real
  // file-ledger run that is the only record of who has already been emailed.
  if (fs.existsSync(file)) {
    throw new LedgerProjectionError(
      `${file} already exists. Refusing to overwrite it: if the batch ran with --ledger file ` +
      'this is the only record of who has already been emailed. Move it aside deliberately ' +
      'if you are certain it is stale.',
    );
  }

  const rows = await query(businessEventId);

  if (rows.length === 0) {
    throw new LedgerProjectionError(
      `The DB ledger has no sent rows for business event "${businessEventId}". An empty ledger ` +
      'is indistinguishable from a lost one, and writing it would tell the watcher it can ' +
      'identify outbound mail it in fact knows nothing about. Check the event id first.',
    );
  }

  const lines: string[] = [];
  for (const row of rows) {
    const messageId = (row.provider_message_id ?? '').trim();
    if (!messageId) {
      throw new LedgerProjectionError(
        `Ledger row ${row.idempotency_key} (${row.recipient}) is marked sent but has no ` +
        'provider_message_id. The watcher cannot identify that outbound copy, so it could read ' +
        "Ali's BCC of it as a student reply. Resolve that row against Mandrill's own log " +
        'before projecting.',
      );
    }
    lines.push(JSON.stringify({
      ts: row.sent_at ?? new Date().toISOString(),
      type: 'sent',
      key: row.idempotency_key,
      recipient: row.recipient,
      subject: row.subject,
      business_event_id: row.business_event_id,
      message_id: messageId,
      projected_from: 'email_send_ledger',
    }));
  }

  // One write of the complete content. A partial file is worse than none: it
  // would load as `available` while missing sends.
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return { written: lines.length, path: file };
}

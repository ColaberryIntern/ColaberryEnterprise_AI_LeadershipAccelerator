import fs from 'fs';
import { sendLedgerPath, loadOutboundLedger } from './outboundIdentity';

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

/** Reads every `sent` row, whatever business event it belongs to. */
export type AllSentRowQuery = () => Promise<SentLedgerRow[]>;

export interface LedgerReconcileResult {
  appended: number;
  alreadyPresent: number;
  appendedKeys: string[];
  path: string;
}

/**
 * Bring an EXISTING ledger up to date with the DB, append-only.
 *
 * ── WHY REFUSING TO OVERWRITE WAS NOT ENOUGH ────────────────────────────────
 *
 * `projectSendLedger` guards the file hard, and correctly: it can be the only
 * record of who has already been emailed. But the campaign did not stop when
 * the projection ran. More mail went out to the same students under new
 * business event ids, each send recorded in `email_send_ledger` and none of
 * them in the JSONL. The projection could not help — it refuses on an existing
 * file, which is the right answer to the wrong question.
 *
 * The drift is not cosmetic. It disables the watcher twice over:
 *
 *   THE SEAM. Ali is BCC'd, so our own copy of each of those sends is sitting
 *   in the mailbox the watcher reads. It carries `X-Colaberry-Outbound-Copy`
 *   but its Message-ID is not in the ledger, so `identifyOutbound` reports a
 *   `seamDisagreement` and the cycle drops to escalate-only for the rest of the
 *   pass. Sixteen such messages were enough to keep the whole window in
 *   escalate-only last time.
 *
 *   THE ROSTER. `isCampaignRecipient` is derived from the ledger's recipients.
 *   A student the file does not know about is `not_campaign_recipient`, and
 *   that path SKIPS rather than escalates. So the drift does not just stop the
 *   watcher replying — it makes it ignore the very students it exists for.
 *
 * ── APPEND-ONLY, AND WHY ────────────────────────────────────────────────────
 *
 * Existing lines are never rewritten, reordered or removed. The file is the
 * record of what was actually sent; this only adds sends the DB knows about and
 * the file does not, keyed on `idempotency_key`. Running it twice appends
 * nothing the second time, which is what makes it safe on a cron or in a
 * pre-flight.
 *
 * The same two refusals as the projection apply, for the same reasons: a row
 * without a provider message id is fatal rather than skipped, and the whole
 * batch is validated before a single byte is appended.
 */
export async function reconcileSendLedger(
  runDir: string,
  query: AllSentRowQuery,
): Promise<LedgerReconcileResult> {
  const file = sendLedgerPath(runDir);

  if (!fs.existsSync(file)) {
    throw new LedgerProjectionError(
      `${file} does not exist, so there is nothing to reconcile. Create it first with ` +
      '--project-ledger. Topping up a file that is not there would produce a ledger holding ' +
      'only the most recent sends, which reads as authoritative and is not.',
    );
  }

  // Reuse the watcher's own loader rather than a second parser: if the watcher
  // would refuse to read this file, appending to it fixes nothing and a human
  // needs to look at it first.
  const before = loadOutboundLedger(runDir);
  if (!before.available) {
    throw new LedgerProjectionError(
      `${file} does not load cleanly (${before.unavailableReason}): ${before.detail} ` +
      'Refusing to append to a ledger the watcher itself would reject.',
    );
  }

  const existingKeys = new Set<string>();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const rec = JSON.parse(trimmed);
    if (rec?.type === 'sent' && typeof rec.key === 'string') existingKeys.add(rec.key);
  }

  const rows = await query();
  const missing = rows.filter((r) => !existingKeys.has(r.idempotency_key));

  // Validate the WHOLE batch before appending any of it, so a bad row late in
  // the list cannot leave the ledger half-updated.
  const lines: string[] = [];
  for (const rowToAdd of missing) {
    const messageId = (rowToAdd.provider_message_id ?? '').trim();
    if (!messageId) {
      throw new LedgerProjectionError(
        `Ledger row ${rowToAdd.idempotency_key} (${rowToAdd.recipient}) is marked sent but has ` +
        'no provider_message_id. The watcher cannot identify that outbound copy, so it could ' +
        "read Ali's BCC of it as a student reply. Nothing was appended. Resolve that row " +
        "against the provider's own log first.",
      );
    }
    lines.push(JSON.stringify({
      ts: rowToAdd.sent_at ?? new Date().toISOString(),
      type: 'sent',
      key: rowToAdd.idempotency_key,
      recipient: rowToAdd.recipient,
      subject: rowToAdd.subject,
      business_event_id: rowToAdd.business_event_id,
      message_id: messageId,
      projected_from: 'email_send_ledger',
      reconciled: true,
    }));
  }

  const result: LedgerReconcileResult = {
    appended: lines.length,
    alreadyPresent: rows.length - lines.length,
    appendedKeys: missing.map((r) => r.idempotency_key),
    path: file,
  };
  if (lines.length === 0) return result;

  fs.appendFileSync(file, lines.join('\n') + '\n', 'utf8');

  // The append is only useful if the watcher can still read the result. Checked
  // rather than assumed, because a ledger that silently became unloadable is
  // exactly the escalate-only degradation this function exists to end.
  const after = loadOutboundLedger(runDir);
  if (!after.available) {
    throw new LedgerProjectionError(
      `Appended ${lines.length} rows to ${file} but the result no longer loads ` +
      `(${after.unavailableReason}): ${after.detail} Inspect the tail of the file by hand.`,
    );
  }
  return result;
}

import fs from 'fs';
import path from 'path';
import { computeIdempotencyKey } from './idempotencyKey';

/**
 * A file-backed send ledger, for the one-off student-unblock batch.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
 *
 * This exists because the durable fix — a Postgres table with a UNIQUE index,
 * see db/ensureEmailSendLedgerSchema.ts — needs a review and a deploy, and the
 * send has to happen before either. So this covers the failure that is actually
 * going to happen tonight, and only that one.
 *
 * COVERED: a crash, an abort, a Ctrl-C or a provider error partway through 25
 * sends, followed by somebody re-running the script. The keys already sent are
 * on disk, fsync'd before the provider was ever called, so the re-run steps
 * over them.
 *
 * NOT COVERED: two processes racing. A UNIQUE index arbitrates that inside the
 * database; a file cannot. The exclusive lock below reduces it — a second run
 * refuses to start while the first holds the lock — but a lock is cooperative
 * and a stale one after a hard kill needs a human to clear. If two operators
 * run this at the same moment on two machines against a synced folder, both
 * will send. That is a real hole and it is accepted only because exactly one
 * process is meant to run this, once.
 *
 * ALSO NOT COVERED: a provider that accepted the message and then failed to
 * tell us so (a socket dropped after Mandrill's ACK). That gets recorded as a
 * failure, and a retry would duplicate. The script's answer is to abort the
 * whole run on any send error and let a human check Mandrill's own log rather
 * than retrying automatically. At-most-once and at-least-once cannot both be
 * had across a network boundary; this picks at-most-once and stops.
 *
 * REQUIREMENT: the ledger must live on a local disk. fsync durability and the
 * atomicity of the O_EXCL lock are not guaranteed on a network or
 * cloud-synced filesystem.
 */

export type LedgerState = 'claimed' | 'sent' | 'failed';

export interface LedgerRecord {
  ts: string;
  type: 'claim' | 'sent' | 'failed' | 'released';
  key: string;
  recipient?: string;
  subject?: string;
  business_event_id?: string;
  attempt?: number;
  message_id?: string;
  error_class?: string;
  error?: string;
  operator?: string;
  reason?: string;
}

export interface FileClaimResult {
  granted: boolean;
  reason?: 'already_sent' | 'in_flight';
  idempotencyKey: string;
  attempts: number;
}

export class LedgerCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerCorruptError';
  }
}

export class LedgerLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerLockedError';
  }
}

interface Entry {
  state: LedgerState;
  attempts: number;
}

export class FileSendLedger {
  private fd: number;
  private state = new Map<string, Entry>();

  private constructor(
    private readonly ledgerPath: string,
    private readonly lockPath: string,
  ) {
    this.fd = fs.openSync(ledgerPath, 'a');
  }

  /**
   * Acquire the lock, replay the log, return a usable ledger.
   *
   * `create` must be passed explicitly the first time. Without it a MISSING
   * ledger is an error rather than an empty one — because a ledger that has
   * been deleted, or a --run-dir typo, looks exactly like a first run, and
   * "looks like a first run" means mailing all 25 people a second time.
   */
  static open(runDir: string, opts: { create: boolean }): FileSendLedger {
    const ledgerPath = path.join(runDir, 'send-ledger.jsonl');
    const lockPath = path.join(runDir, 'send-ledger.lock');

    if (!fs.existsSync(ledgerPath) && !opts.create) {
      throw new Error(
        `No ledger at ${ledgerPath}. If this is genuinely the first run, pass --init-ledger. ` +
        'If it is not, find the ledger before sending anything: without it this script ' +
        'cannot tell who has already been emailed.',
      );
    }

    // O_EXCL create is atomic on both NTFS and POSIX: exactly one process wins.
    try {
      const lockFd = fs.openSync(lockPath, 'wx');
      fs.writeSync(lockFd, `pid=${process.pid} started=${new Date().toISOString()}\n`);
      fs.closeSync(lockFd);
    } catch (err: any) {
      if (err?.code === 'EEXIST') {
        throw new LedgerLockedError(
          `Another send run holds ${lockPath} (${fs.readFileSync(lockPath, 'utf8').trim()}). ` +
          'If that process is definitely dead, delete the lock file by hand after checking ' +
          'the ledger tail — do not assume it crashed before sending.',
        );
      }
      throw err;
    }

    const ledger = new FileSendLedger(ledgerPath, lockPath);
    try {
      ledger.replay();
    } catch (err) {
      ledger.close();
      throw err;
    }
    return ledger;
  }

  /**
   * Rebuild state from the log. A line that will not parse ABORTS rather than
   * being skipped: a half-written claim line is precisely the case where
   * skipping it would let the same person be mailed twice.
   */
  private replay(): void {
    if (!fs.existsSync(this.ledgerPath)) return;
    const raw = fs.readFileSync(this.ledgerPath, 'utf8');
    const lines = raw.split('\n');
    lines.forEach((line, i) => {
      if (line.trim() === '') {
        if (i !== lines.length - 1) {
          throw new LedgerCorruptError(`${this.ledgerPath}: blank line at ${i + 1}`);
        }
        return;
      }
      let rec: LedgerRecord;
      try {
        rec = JSON.parse(line);
      } catch {
        throw new LedgerCorruptError(
          `${this.ledgerPath}: line ${i + 1} is not valid JSON. This is most likely a ` +
          'claim that was interrupted mid-write, which means a send may or may not have ' +
          "happened. Check Mandrill's log for that recipient before touching this file. " +
          'Refusing to run.',
        );
      }
      if (!rec?.key || !rec?.type) {
        throw new LedgerCorruptError(`${this.ledgerPath}: line ${i + 1} has no key/type`);
      }
      const prev = this.state.get(rec.key);
      switch (rec.type) {
        case 'claim':
          this.state.set(rec.key, { state: 'claimed', attempts: rec.attempt ?? (prev?.attempts ?? 0) + 1 });
          break;
        case 'sent':
          this.state.set(rec.key, { state: 'sent', attempts: prev?.attempts ?? 1 });
          break;
        case 'failed':
        case 'released':
          this.state.set(rec.key, { state: 'failed', attempts: prev?.attempts ?? 1 });
          break;
        default:
          throw new LedgerCorruptError(`${this.ledgerPath}: line ${i + 1} unknown type ${rec.type}`);
      }
    });
  }

  private append(rec: LedgerRecord): void {
    // One writeSync of one newline-terminated buffer to an O_APPEND fd, then
    // fsync. The claim is on the platter before the provider is called; that
    // ordering is the entire guarantee this class offers.
    fs.writeSync(this.fd, Buffer.from(`${JSON.stringify(rec)}\n`, 'utf8'));
    fs.fsyncSync(this.fd);
  }

  /**
   * Claim the right to send. Mirrors the database claim's state machine:
   * absent or `failed` may proceed; `claimed` and `sent` may not.
   */
  claim(id: { recipient: string; subject: string; businessEventId: string }): FileClaimResult {
    const key = computeIdempotencyKey(id.recipient, id.subject, id.businessEventId);
    const existing = this.state.get(key);

    if (existing && existing.state !== 'failed') {
      return {
        granted: false,
        reason: existing.state === 'sent' ? 'already_sent' : 'in_flight',
        idempotencyKey: key,
        attempts: existing.attempts,
      };
    }

    const attempt = (existing?.attempts ?? 0) + 1;
    this.append({
      ts: new Date().toISOString(),
      type: 'claim',
      key,
      recipient: id.recipient,
      subject: id.subject,
      business_event_id: id.businessEventId,
      attempt,
    });
    this.state.set(key, { state: 'claimed', attempts: attempt });
    return { granted: true, idempotencyKey: key, attempts: attempt };
  }

  recordSent(key: string, messageId?: string): void {
    this.append({ ts: new Date().toISOString(), type: 'sent', key, message_id: messageId });
    const prev = this.state.get(key);
    this.state.set(key, { state: 'sent', attempts: prev?.attempts ?? 1 });
  }

  recordFailed(key: string, errorClass: string, error: string): void {
    this.append({ ts: new Date().toISOString(), type: 'failed', key, error_class: errorClass, error });
    const prev = this.state.get(key);
    this.state.set(key, { state: 'failed', attempts: prev?.attempts ?? 1 });
  }

  /**
   * Move a claim stranded by a crash back to retryable. Never touches a `sent`
   * key, so no operator mistake can turn a delivered mail into a sendable one.
   */
  release(key: string, operator: string, reason: string): { released: boolean } {
    const existing = this.state.get(key);
    if (!existing || existing.state !== 'claimed') return { released: false };
    this.append({ ts: new Date().toISOString(), type: 'released', key, operator, reason });
    this.state.set(key, { state: 'failed', attempts: existing.attempts });
    return { released: true };
  }

  stateOf(key: string): LedgerState | undefined {
    return this.state.get(key)?.state;
  }

  summary(): { sent: number; claimed: number; failed: number } {
    let sent = 0; let claimed = 0; let failed = 0;
    for (const e of this.state.values()) {
      if (e.state === 'sent') sent += 1;
      else if (e.state === 'claimed') claimed += 1;
      else failed += 1;
    }
    return { sent, claimed, failed };
  }

  close(): void {
    try { fs.closeSync(this.fd); } catch { /* already closed */ }
    try { fs.unlinkSync(this.lockPath); } catch { /* never acquired */ }
  }
}

/** Claim, send, record — the file-ledger equivalent of idempotentSend.sendOnce. */
export async function sendOnceViaFile(
  ledger: FileSendLedger,
  id: { recipient: string; subject: string; businessEventId: string; idempotencyKey: string },
  send: () => Promise<{ ok: boolean; messageId?: string; error?: string; errorClass?: string }>,
): Promise<
  | { outcome: 'sent'; idempotencyKey: string; messageId?: string }
  | { outcome: 'skipped'; reason: string; idempotencyKey: string }
  | { outcome: 'failed'; idempotencyKey: string; errorClass: string; error: string }
> {
  const derived = computeIdempotencyKey(id.recipient, id.subject, id.businessEventId);
  if (id.idempotencyKey && id.idempotencyKey !== derived) {
    throw new Error(
      `IdempotencyKeyMismatch: draft carries ${id.idempotencyKey} but the message being sent ` +
      `derives ${derived}. Refusing to send.`,
    );
  }

  const claim = ledger.claim(id);
  if (!claim.granted) {
    return { outcome: 'skipped', reason: claim.reason!, idempotencyKey: claim.idempotencyKey };
  }

  let result: { ok: boolean; messageId?: string; error?: string; errorClass?: string };
  try {
    result = await send();
  } catch (err: any) {
    const errorClass = err?.name || 'UnknownSendError';
    ledger.recordFailed(claim.idempotencyKey, errorClass, String(err?.message ?? err));
    return { outcome: 'failed', idempotencyKey: claim.idempotencyKey, errorClass, error: String(err?.message ?? err) };
  }

  if (!result.ok) {
    const errorClass = result.errorClass || 'ProviderRejected';
    ledger.recordFailed(claim.idempotencyKey, errorClass, result.error ?? 'provider reported not ok');
    return {
      outcome: 'failed', idempotencyKey: claim.idempotencyKey, errorClass,
      error: result.error ?? 'provider reported not ok',
    };
  }

  ledger.recordSent(claim.idempotencyKey, result.messageId);
  return { outcome: 'sent', idempotencyKey: claim.idempotencyKey, messageId: result.messageId };
}

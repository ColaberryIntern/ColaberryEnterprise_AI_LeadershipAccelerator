/**
 * The file-backed ledger, which is what actually protects tonight's send.
 *
 * These tests use a real temp directory and real fsync'd writes, because the
 * property under test is "what survives on disk across a process boundary" and
 * a mocked fs would be testing the mock. A second FileSendLedger.open() on the
 * same directory IS the simulated crash-and-rerun: it replays the log from
 * scratch exactly as a fresh process would.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  FileSendLedger,
  LedgerCorruptError,
  LedgerLockedError,
  sendOnceViaFile,
} from '../fileSendLedger';
import { computeIdempotencyKey } from '../idempotencyKey';

const EVENT = 'story000-unblock-2026-08-17';
const SUBJECT = 'Your Daily Priority Assistant, and a fresh sign in link';
const RECIPIENT = 'bitania3@gmail.com';
const KEY = computeIdempotencyKey(RECIPIENT, SUBJECT, EVENT);
const ID = { recipient: RECIPIENT, subject: SUBJECT, businessEventId: EVENT };

let dir: string;
let open: FileSendLedger[] = [];

function openLedger(opts: { create: boolean } = { create: true }): FileSendLedger {
  const l = FileSendLedger.open(dir, opts);
  open.push(l);
  return l;
}

/** Close, then reopen — the simulated crash and re-run. */
function reopen(l: FileSendLedger): FileSendLedger {
  l.close();
  return openLedger({ create: false });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'send-ledger-'));
  open = [];
});

afterEach(() => {
  for (const l of open) { try { l.close(); } catch { /* already closed */ } }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the key formula matches the drafts already on disk', () => {
  // Hardcoded from drafts-manifest.json. If the formula drifts, these break —
  // which is the point: the gate (verify-drafts.js) computes the same value in
  // its own JavaScript, and the two implementations must not diverge quietly.
  it.each([
    ['bitania3@gmail.com', 'Your Daily Priority Assistant, and a fresh sign in link', '9602f29db9d97f1feed0a10ca2202951'],
    ['millionabate19@gmail.com', 'Your account problem, found and fixed', '395dcfc6778da3619ce53394c732b912'],
    ['qninying@gmail.com', 'Your three questions, answered', '4a547c2c66b39628aa9ba3eaa01f7285'],
    ['regina.asafor@gmail.com', 'A question about your build', 'b27bba5f3b29ee56a9584294bc810b34'],
    ['taiwo@colaberry.com', 'Your two questions, answered', 'e8f6423cf683a627d7b54a05f83c52cc'],
  ])('%s -> %s', (recipient, subject, expected) => {
    expect(computeIdempotencyKey(recipient as string, subject as string, EVENT)).toBe(expected);
  });
});

describe('opening the ledger', () => {
  it('refuses to start when the ledger is missing and --init-ledger was not passed', () => {
    expect(() => FileSendLedger.open(dir, { create: false })).toThrow(/pass --init-ledger/);
  });

  it('a second process cannot open a ledger the first still holds', () => {
    openLedger();

    expect(() => FileSendLedger.open(dir, { create: false })).toThrow(LedgerLockedError);
  });

  it('releases the lock on close, so a clean re-run can proceed', () => {
    const first = openLedger();
    first.close();

    expect(() => openLedger({ create: false })).not.toThrow();
  });
});

describe('claim, the crash case this exists for', () => {
  it('a claim written before the send survives a crash and blocks the re-run', () => {
    const first = openLedger();
    const claim = first.claim(ID);
    expect(claim).toEqual({ granted: true, idempotencyKey: KEY, attempts: 1 });
    // Process dies here — after the claim, before any outcome was recorded.

    const second = reopen(first);

    expect(second.claim(ID)).toEqual({
      granted: false, reason: 'in_flight', idempotencyKey: KEY, attempts: 1,
    });
  });

  it('a SENT key is never claimable again, across processes', () => {
    const first = openLedger();
    const claim = first.claim(ID);
    first.recordSent(claim.idempotencyKey, 'mandrill-1');

    const second = reopen(first);

    expect(second.claim(ID)).toEqual({
      granted: false, reason: 'already_sent', idempotencyKey: KEY, attempts: 1,
    });
    expect(second.stateOf(KEY)).toBe('sent');
  });

  it('a FAILED key is claimable again, and the attempt count carries across the restart', () => {
    const first = openLedger();
    const claim = first.claim(ID);
    first.recordFailed(claim.idempotencyKey, 'TimeoutError', 'socket hang up');

    const second = reopen(first);
    const retry = second.claim(ID);

    expect(retry).toEqual({ granted: true, idempotencyKey: KEY, attempts: 2 });
  });

  it('release rescues a stranded claim but refuses to touch a sent one', () => {
    const l = openLedger();
    const claim = l.claim(ID);

    expect(l.release(claim.idempotencyKey, 'ali', 'process killed')).toEqual({ released: true });
    expect(l.stateOf(KEY)).toBe('failed');

    const again = l.claim(ID);
    l.recordSent(again.idempotencyKey, 'mandrill-2');

    expect(l.release(KEY, 'ali', 'trying to resend')).toEqual({ released: false });
    expect(l.stateOf(KEY)).toBe('sent');
  });
});

describe('durability and corruption', () => {
  it('the claim is on disk BEFORE the provider is called, not after', async () => {
    const l = openLedger();
    let onDiskAtSendTime = '';

    await sendOnceViaFile(l, { ...ID, idempotencyKey: KEY }, async () => {
      onDiskAtSendTime = fs.readFileSync(path.join(dir, 'send-ledger.jsonl'), 'utf8');
      return { ok: true, messageId: 'mid-1' };
    });

    // Read from inside the provider call: the claim line was already durable.
    const lines = onDiskAtSendTime.trim().split('\n').map((l2) => JSON.parse(l2));
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('claim');
    expect(lines[0].key).toBe(KEY);
  });

  it('a half-written trailing line ABORTS the run instead of being skipped', () => {
    const l = openLedger();
    l.claim(ID);
    l.close();
    // Exactly what a kill mid-writeSync would leave behind.
    fs.appendFileSync(path.join(dir, 'send-ledger.jsonl'), '{"ts":"2026-08-16T21:00:00Z","ty');

    expect(() => openLedger({ create: false })).toThrow(LedgerCorruptError);
  });

  it('a corrupt ledger does not leave the lock behind, so the fix is not blocked by a second error', () => {
    const l = openLedger();
    l.claim(ID);
    l.close();
    fs.appendFileSync(path.join(dir, 'send-ledger.jsonl'), 'garbage\n');

    expect(() => openLedger({ create: false })).toThrow(LedgerCorruptError);
    expect(fs.existsSync(path.join(dir, 'send-ledger.lock'))).toBe(false);
  });

  it('the log is append-only: recording an outcome never rewrites the claim line', () => {
    const l = openLedger();
    const claim = l.claim(ID);
    l.recordSent(claim.idempotencyKey, 'mid-9');

    const types = fs.readFileSync(path.join(dir, 'send-ledger.jsonl'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line).type);

    expect(types).toEqual(['claim', 'sent']);
  });
});

describe('sendOnceViaFile', () => {
  it('calls the provider exactly once across two attempts at the same message', async () => {
    const l = openLedger();
    const provider = jest.fn().mockResolvedValue({ ok: true, messageId: 'mid-3' });

    const first = await sendOnceViaFile(l, { ...ID, idempotencyKey: KEY }, provider);
    const second = await sendOnceViaFile(l, { ...ID, idempotencyKey: KEY }, provider);

    expect(provider).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ outcome: 'sent', idempotencyKey: KEY, messageId: 'mid-3' });
    expect(second).toEqual({ outcome: 'skipped', reason: 'already_sent', idempotencyKey: KEY });
  });

  it('a provider that throws leaves the key retryable and the next run does send', async () => {
    const l = openLedger();
    const provider = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce({ ok: true, messageId: 'mid-4' });

    const failed = await sendOnceViaFile(l, { ...ID, idempotencyKey: KEY }, provider);
    const retried = await sendOnceViaFile(l, { ...ID, idempotencyKey: KEY }, provider);

    expect(failed).toEqual({
      outcome: 'failed', idempotencyKey: KEY, errorClass: 'TimeoutError', error: 'socket hang up',
    });
    expect(retried).toEqual({ outcome: 'sent', idempotencyKey: KEY, messageId: 'mid-4' });
  });

  it('a provider reporting ok:false is a failure, not a silent success', async () => {
    const l = openLedger();

    const result = await sendOnceViaFile(l, { ...ID, idempotencyKey: KEY },
      async () => ({ ok: false, error: 'relay refused' }));

    expect(result).toEqual({
      outcome: 'failed', idempotencyKey: KEY, errorClass: 'ProviderRejected', error: 'relay refused',
    });
    expect(l.stateOf(KEY)).toBe('failed');
  });

  it('a draft key that no longer describes its own message is refused before the provider is touched', async () => {
    const l = openLedger();
    const provider = jest.fn();

    await expect(sendOnceViaFile(
      l,
      { ...ID, subject: 'A subject that was edited after drafting', idempotencyKey: KEY },
      provider,
    )).rejects.toThrow(/IdempotencyKeyMismatch/);
    expect(provider).not.toHaveBeenCalled();
  });

  it('summary counts each key once, by its latest state', async () => {
    const l = openLedger();
    await sendOnceViaFile(l, { ...ID, idempotencyKey: KEY }, async () => ({ ok: true, messageId: 'm' }));
    const other = { recipient: 'qninying@gmail.com', subject: 'Your three questions, answered', businessEventId: EVENT };
    await sendOnceViaFile(l, { ...other, idempotencyKey: computeIdempotencyKey(other.recipient, other.subject, EVENT) },
      async () => ({ ok: false, error: 'nope' }));

    expect(l.summary()).toEqual({ sent: 1, claimed: 0, failed: 1 });
  });
});

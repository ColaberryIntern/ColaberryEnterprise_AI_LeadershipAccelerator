/**
 * The watcher tells its own outbound mail from a student's reply two ways: the
 * `X-Colaberry-Outbound-Copy` header, and the provider message ids recorded in
 * `send-ledger.jsonl`. Two identifications, deliberately, so that neither one
 * failing silently can make the watcher answer its own email.
 *
 * The batch was run with `--ledger db`, which writes the Postgres
 * `email_send_ledger` table and NO jsonl. So the second discriminator was
 * simply absent, the ledger loaded as `missing`, and the watcher degraded to
 * escalate-only for the whole 30 hours.
 *
 * This projects the file the watcher expects out of the rows the batch actually
 * wrote. The canary proved the projection is sound: the `provider_message_id`
 * stored by the DB ledger matched the delivered `Message-ID` exactly.
 *
 * The round-trip assertion is the one that matters — project, then load with
 * the watcher's own loader and check it reports `available`. Asserting the file
 * contents alone would let the two halves drift and still pass.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadOutboundLedger, sendLedgerPath, normalizeMessageId } from '../outboundIdentity';
import { LedgerProjectionError, projectSendLedger } from '../projectSendLedger';

const EVENT = 'story000-unblock-2026-08-17';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-projection-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const row = (over: Partial<any> = {}) => ({
  idempotency_key: '9602f29db9d97f1feed0a10ca2202951',
  recipient: 'mungai.martin@gmail.com',
  subject: 'Your build, and a fresh sign in link',
  business_event_id: EVENT,
  provider_message_id: '<CAMPAIGN-1@colaberry.com>',
  sent_at: '2026-08-17T02:05:00.000Z',
  ...over,
});

/** Stands in for the `SELECT ... FROM email_send_ledger WHERE status = 'sent'`. */
const queryReturning = (rows: any[]) => jest.fn().mockResolvedValue(rows);

describe('projectSendLedger', () => {
  it('writes a ledger the watcher loader accepts, closing the escalate-only degradation', async () => {
    const query = queryReturning([row()]);

    const result = await projectSendLedger(dir, EVENT, query);

    expect(result.written).toBe(1);
    const view = loadOutboundLedger(dir);
    expect(view.available).toBe(true);
    expect(view.sentCount).toBe(1);
  });

  it('normalises the id so a delivered Message-ID matches whatever case the DB stored', async () => {
    const query = queryReturning([row({ provider_message_id: '<CAMPAIGN-1@colaberry.com>' })]);

    await projectSendLedger(dir, EVENT, query);

    const view = loadOutboundLedger(dir);
    // The delivered header, lower-cased and unbracketed, is what identifyOutbound looks up.
    expect(view.messageIds.has(normalizeMessageId('<campaign-1@colaberry.com>'))).toBe(true);
    expect(view.messageIds.size).toBe(1);
  });

  it('carries the business event through, so a stray campaign is not mistaken for ours', async () => {
    const query = queryReturning([row()]);

    await projectSendLedger(dir, EVENT, query);

    const view = loadOutboundLedger(dir);
    expect([...view.businessEventIds]).toEqual([EVENT]);
  });

  it('projects every sent row, not just the first', async () => {
    const query = queryReturning([
      row(),
      row({ idempotency_key: 'k2', provider_message_id: '<campaign-2@colaberry.com>' }),
      row({ idempotency_key: 'k3', provider_message_id: '<campaign-3@colaberry.com>' }),
    ]);

    const result = await projectSendLedger(dir, EVENT, query);

    expect(result.written).toBe(3);
    expect(loadOutboundLedger(dir).messageIds.size).toBe(3);
  });

  it('REFUSES to overwrite an existing ledger, which may be a real file-ledger run', async () => {
    fs.writeFileSync(sendLedgerPath(dir), '{"type":"sent","key":"real","message_id":"<a@b>"}\n');
    const query = queryReturning([row()]);

    await expect(projectSendLedger(dir, EVENT, query)).rejects.toThrow(LedgerProjectionError);
    await expect(projectSendLedger(dir, EVENT, query)).rejects.toThrow(/already exists/);
    expect(query).not.toHaveBeenCalled();
  });

  it('THROWS on a sent row with no provider message id, naming the key rather than writing a poisoned line', async () => {
    const query = queryReturning([row({ provider_message_id: null })]);

    await expect(projectSendLedger(dir, EVENT, query)).rejects.toThrow(
      /9602f29db9d97f1feed0a10ca2202951/,
    );
    // Nothing half-written is left behind for the watcher to read as corrupt.
    expect(fs.existsSync(sendLedgerPath(dir))).toBe(false);
  });

  it('THROWS when the event matched no sent rows, because an empty ledger is indistinguishable from a lost one', async () => {
    const query = queryReturning([]);

    await expect(projectSendLedger(dir, EVENT, query)).rejects.toThrow(/no sent rows/);
    expect(fs.existsSync(sendLedgerPath(dir))).toBe(false);
  });

  it('scopes the query to the business event it was asked for', async () => {
    const query = queryReturning([row()]);

    await projectSendLedger(dir, EVENT, query);

    expect(query).toHaveBeenCalledWith(EVENT);
  });
});

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
import {
  loadOutboundLedger,
  sendLedgerPath,
  normalizeMessageId,
  isCampaignRecipient,
} from '../outboundIdentity';
import {
  LedgerProjectionError,
  projectSendLedger,
  reconcileSendLedger,
} from '../projectSendLedger';

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

/**
 * Keeping an EXISTING ledger current.
 *
 * `projectSendLedger` refuses to overwrite, which is right — the file can be
 * the only record of who has been emailed. But refusing is not the same as
 * having a way forward, and the gap showed: mail kept going out to these
 * students under new business events (Chuks, Farhat, Taiwo, Quincy, Shabana,
 * Million, Marcus, Hellen, Liza, Jude, Swati, Michael Castellanos and more),
 * every one of those sends recorded in Postgres and none of them in the file.
 *
 * That is not a cosmetic drift. It breaks the watcher two ways at once:
 *
 *   1. Ali is BCC'd, so our own copy lands in the mailbox the watcher reads.
 *      With its Message-ID absent from the ledger, `identifyOutbound` sees the
 *      outbound-copy header on a message it cannot find in the ledger, reports
 *      `seamDisagreement`, and the cycle drops to ESCALATE-ONLY.
 *   2. The roster is derived from the ledger's recipients. A student who is not
 *      in the file is `not_campaign_recipient`, so their genuine reply is
 *      SKIPPED — silently ignored rather than escalated.
 *
 * So this appends what is missing and never rewrites a byte of what is there.
 */
describe('reconcileSendLedger tops up a ledger that has fallen behind the DB', () => {
  const existing = (over: Partial<any> = {}) => ({
    ts: '2026-08-17T02:05:00.000Z',
    type: 'sent',
    key: 'k-original',
    recipient: 'bfglz@yahoo.com',
    subject: 'Your build, and a fresh sign in link',
    business_event_id: EVENT,
    message_id: '<campaign-1@colaberry.com>',
    ...over,
  });

  const seed = (...records: any[]) =>
    fs.writeFileSync(sendLedgerPath(dir), records.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const later = (over: Partial<any> = {}) =>
    row({
      idempotency_key: 'k-later',
      recipient: 'chukseneh@outlook.com',
      business_event_id: 'eneh-sixthings-2026-08-18',
      provider_message_id: '<later-1@colaberry.com>',
      sent_at: '2026-08-18T12:00:00.000Z',
      ...over,
    });

  it('appends the send the file was missing', async () => {
    // The file already knows about `row()`; only `later()` is new to it.
    seed(existing({ key: '9602f29db9d97f1feed0a10ca2202951' }));

    const result = await reconcileSendLedger(dir, queryReturning([row(), later()]));

    expect(result.appended).toBe(1);
  });

  it('leaves the line that was already there untouched, byte for byte', async () => {
    seed(existing());
    const before = fs.readFileSync(sendLedgerPath(dir), 'utf8');

    await reconcileSendLedger(dir, queryReturning([row(), later()]));

    expect(fs.readFileSync(sendLedgerPath(dir), 'utf8').startsWith(before)).toBe(true);
  });

  it('does not re-append a send the file already records', async () => {
    seed(existing({ key: '9602f29db9d97f1feed0a10ca2202951' }));

    const result = await reconcileSendLedger(dir, queryReturning([row()]));

    expect(result.appended).toBe(0);
  });

  it('is a no-op on a ledger that is already current', async () => {
    seed(existing({ key: '9602f29db9d97f1feed0a10ca2202951' }));
    const before = fs.readFileSync(sendLedgerPath(dir), 'utf8');

    await reconcileSendLedger(dir, queryReturning([row()]));

    expect(fs.readFileSync(sendLedgerPath(dir), 'utf8')).toBe(before);
  });

  it('puts the newly-seen student on the campaign roster', async () => {
    seed(existing());

    await reconcileSendLedger(dir, queryReturning([row(), later()]));

    // Without this the student's genuine reply is skipped as not_campaign_recipient.
    expect(isCampaignRecipient(loadOutboundLedger(dir), 'chukseneh@outlook.com')).toBe(true);
  });

  it("registers the new send's message id, so our own BCC copy is recognised", async () => {
    seed(existing());

    await reconcileSendLedger(dir, queryReturning([row(), later()]));

    expect(
      loadOutboundLedger(dir).messageIds.has(normalizeMessageId('<later-1@colaberry.com>')),
    ).toBe(true);
  });

  it('leaves the ledger loadable, which is the whole point of topping it up', async () => {
    seed(existing());

    await reconcileSendLedger(dir, queryReturning([row(), later()]));

    expect(loadOutboundLedger(dir).available).toBe(true);
  });

  it('counts every send afterwards, the old and the new', async () => {
    seed(existing());

    await reconcileSendLedger(dir, queryReturning([row(), later()]));

    expect(loadOutboundLedger(dir).sentCount).toBe(3);
  });

  it('THROWS on a row with no provider message id rather than poisoning the ledger', async () => {
    seed(existing());

    await expect(
      reconcileSendLedger(dir, queryReturning([later({ provider_message_id: null })])),
    ).rejects.toThrow(/k-later/);
  });

  it('appends nothing at all when one row in the batch is unusable', async () => {
    seed(existing());
    const before = fs.readFileSync(sendLedgerPath(dir), 'utf8');

    await reconcileSendLedger(
      dir,
      queryReturning([later(), later({ idempotency_key: 'k-bad', provider_message_id: '' })]),
    ).catch(() => undefined);

    expect(fs.readFileSync(sendLedgerPath(dir), 'utf8')).toBe(before);
  });

  it('REFUSES when there is no ledger to top up, rather than inventing a partial one', async () => {
    await expect(reconcileSendLedger(dir, queryReturning([row()]))).rejects.toThrow(
      /--project-ledger/,
    );
  });

  it('REFUSES to append to a ledger it cannot fully parse', async () => {
    fs.writeFileSync(sendLedgerPath(dir), '{"type":"sent","key":"a","message_id":"<a@b>"}\nnot-json\n');

    await expect(reconcileSendLedger(dir, queryReturning([row()]))).rejects.toThrow(
      LedgerProjectionError,
    );
  });
});

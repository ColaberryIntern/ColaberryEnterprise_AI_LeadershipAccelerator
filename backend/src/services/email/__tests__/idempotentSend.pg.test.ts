/**
 * The idempotency guard, proved against a REAL Postgres.
 *
 * Everything important about this design is a property of the database, not of
 * the TypeScript. "Two claims cannot both win" is a statement about a UNIQUE
 * index and about what `ON CONFLICT ... DO UPDATE ... WHERE` returns when its
 * predicate is false. A mocked `sequelize.query` cannot evidence either: it
 * would return whatever this file told it to, which is a test of the fixture.
 *
 * So this suite runs the real DDL and the real statements against a real
 * server. It is opt-in via EMAIL_DEDUP_TEST_PG_URL and skipped otherwise, so CI
 * (which has no database) stays green — see jest.ci.config.ts for why a
 * permanently-red gate is worse than none.
 *
 * Run it with:
 *   docker run -d --name dedup-test-pg -e POSTGRES_PASSWORD=deduptest \
 *     -e POSTGRES_DB=deduptest -p 55432:5432 postgres:16-alpine
 *   EMAIL_DEDUP_TEST_PG_URL=postgres://postgres:deduptest@127.0.0.1:55432/deduptest \
 *     npx jest src/services/email/__tests__/idempotentSend.pg.test.ts
 */
const PG_URL = process.env.EMAIL_DEDUP_TEST_PG_URL;

jest.mock('../../../config/database', () => {
  const { Sequelize } = require('sequelize');
  return {
    sequelize: new Sequelize(process.env.EMAIL_DEDUP_TEST_PG_URL || 'postgres://invalid', {
      dialect: 'postgres',
      logging: false,
      pool: { max: 25, min: 0, acquire: 30000, idle: 5000 },
    }),
  };
});

import { sequelize } from '../../../config/database';
import {
  ensureEmailSendLedgerSchema,
  assertEmailSendLedgerSchema,
} from '../../../db/ensureEmailSendLedgerSchema';
import {
  claimSend,
  computeIdempotencyKey,
  recordSendFailure,
  recordSendSuccess,
  releaseClaim,
  sendOnce,
} from '../idempotentSend';

const describePg = PG_URL ? describe : describe.skip;

const EVENT = 'story000-unblock-2026-08-17';
const SUBJECT = 'Your Daily Priority Assistant, and a fresh sign in link';

/** A distinct recipient per test, so no test can pass on another's rows. */
let n = 0;
const nextRecipient = () => `student${++n}@example.com`;

async function statusOf(key: string): Promise<string | undefined> {
  const [rows]: any = await sequelize.query(
    'SELECT status FROM email_send_ledger WHERE idempotency_key = $key',
    { bind: { key } },
  );
  return rows?.[0]?.status;
}

async function rowCount(key: string): Promise<number> {
  const [rows]: any = await sequelize.query(
    'SELECT COUNT(*)::int AS c FROM email_send_ledger WHERE idempotency_key = $key',
    { bind: { key } },
  );
  return rows[0].c;
}

describePg('email_send_ledger against a real Postgres', () => {
  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await sequelize.query('DROP TABLE IF EXISTS email_send_ledger');
    await ensureEmailSendLedgerSchema();
  });

  afterAll(async () => {
    await sequelize.close();
    jest.restoreAllMocks();
  });

  describe('the schema post-condition', () => {
    it('reports ok against the catalog the DDL just produced', async () => {
      await expect(assertEmailSendLedgerSchema()).resolves.toEqual({ ok: true, missing: [] });
    });

    it('is re-runnable: a second ensure is a clean no-op that still reports ok', async () => {
      await ensureEmailSendLedgerSchema();

      await expect(assertEmailSendLedgerSchema()).resolves.toEqual({ ok: true, missing: [] });
    });

    it('catches an index that exists under the right name but is NOT unique', async () => {
      await sequelize.query('DROP INDEX email_send_ledger_key_unique');
      await sequelize.query(
        'CREATE INDEX email_send_ledger_key_unique ON email_send_ledger (idempotency_key)',
      );

      const result = await assertEmailSendLedgerSchema();

      expect(result.missing).toEqual(['index-not-unique:email_send_ledger_key_unique']);
      expect(result.ok).toBe(false);

      await sequelize.query('DROP INDEX email_send_ledger_key_unique');
      await sequelize.query(
        'CREATE UNIQUE INDEX email_send_ledger_key_unique ON email_send_ledger (idempotency_key)',
      );
      await expect(assertEmailSendLedgerSchema()).resolves.toEqual({ ok: true, missing: [] });
    });
  });

  describe('the constraint itself', () => {
    it('the database refuses a second row carrying the same idempotency key', async () => {
      const recipient = nextRecipient();
      const key = computeIdempotencyKey(recipient, SUBJECT, EVENT);
      const insert = () => sequelize.query(
        `INSERT INTO email_send_ledger
           (idempotency_key, recipient, subject, business_event_id, status, attempts)
         VALUES ($key, $recipient, $subject, $event, 'claimed', 1)`,
        { bind: { key, recipient, subject: SUBJECT, event: EVENT } },
      );

      await insert();

      // Not "our code declines to insert" — the server rejects it.
      await expect(insert()).rejects.toMatchObject({ parent: { code: '23505' } });
      expect(await rowCount(key)).toBe(1);
    });

    it('the natural key (lower(recipient), subject, event) is unique independently of the hash', async () => {
      const recipient = nextRecipient();
      const key = computeIdempotencyKey(recipient, SUBJECT, EVENT);
      await sequelize.query(
        `INSERT INTO email_send_ledger
           (idempotency_key, recipient, subject, business_event_id, status, attempts)
         VALUES ($key, $recipient, $subject, $event, 'claimed', 1)`,
        { bind: { key, recipient, subject: SUBJECT, event: EVENT } },
      );

      // Same person, same message, DIFFERENT hash — the case where key
      // computation has drifted. The hash index cannot see this collision.
      await expect(sequelize.query(
        `INSERT INTO email_send_ledger
           (idempotency_key, recipient, subject, business_event_id, status, attempts)
         VALUES ($key, $recipient, $subject, $event, 'claimed', 1)`,
        { bind: { key: 'deadbeef'.repeat(4), recipient: recipient.toUpperCase(), subject: SUBJECT, event: EVENT } },
      )).rejects.toMatchObject({ parent: { code: '23505' } });
    });
  });

  describe('claimSend', () => {
    it('the same key cannot be claimed twice', async () => {
      const recipient = nextRecipient();

      const first = await claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT });
      const second = await claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT });

      expect(first.granted).toBe(true);
      expect(second).toEqual({
        granted: false,
        reason: 'in_flight',
        idempotencyKey: computeIdempotencyKey(recipient, SUBJECT, EVENT),
      });
      expect(await rowCount(computeIdempotencyKey(recipient, SUBJECT, EVENT))).toBe(1);
    });

    it('CONCURRENCY: twenty simultaneous first claims, one wins and every loser loses IN FLIGHT', async () => {
      const recipient = nextRecipient();
      const key = computeIdempotencyKey(recipient, SUBJECT, EVENT);

      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT })),
      );

      expect(results.filter((r) => r.granted)).toHaveLength(1);
      // The REASON matters as much as the count. A loser reporting
      // 'duplicate_natural_key' means its INSERT raised 23505 — i.e. the claim
      // was a check-then-act that the index happened to rescue. That is luck,
      // not design, and the retry path below is where the luck runs out. The
      // only acceptable loss here is the arbitrated one.
      const reasons = new Set(results.filter((r) => !r.granted).map((r: any) => r.reason));
      expect([...reasons]).toEqual(['in_flight']);
      // One row, and its attempts counter was never incremented by a loser:
      // a refused claim writes nothing at all.
      expect(await rowCount(key)).toBe(1);
      const [rows]: any = await sequelize.query(
        'SELECT attempts FROM email_send_ledger WHERE idempotency_key = $key', { bind: { key } });
      expect(rows[0].attempts).toBe(1);
    });

    /**
     * THE test that separates a claim from a check.
     *
     * On a `failed` row every concurrent caller is ENTITLED to retry, so the
     * unique index no longer rescues anybody: a SELECT-then-UPDATE lets all
     * twenty read 'failed', all twenty update, and all twenty send. There is no
     * second INSERT for the index to reject. Only an arbitrated statement — one
     * whose predicate is re-evaluated against the row version the winner just
     * committed — can hold the line here.
     *
     * This is not hypothetical for this campaign: a batch that aborts on a
     * provider error leaves rows exactly in this state, and the recovery is to
     * re-run the script. Two operators re-running it at once is a Sunday night.
     */
    it('CONCURRENCY: twenty simultaneous RETRIES of one failed row, exactly one is granted', async () => {
      const recipient = nextRecipient();
      const key = computeIdempotencyKey(recipient, SUBJECT, EVENT);
      const seed = await claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT });
      if (!seed.granted) throw new Error('setup failed: seed claim refused');
      await recordSendFailure(seed.ledgerId, 'TimeoutError', 'mandrill timed out');

      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT })),
      );

      expect(results.filter((r) => r.granted)).toHaveLength(1);
      const reasons = new Set(results.filter((r) => !r.granted).map((r: any) => r.reason));
      expect([...reasons]).toEqual(['in_flight']);
      // attempts went 1 -> 2, once. Twenty winners would read 21.
      const [rows]: any = await sequelize.query(
        'SELECT attempts, status FROM email_send_ledger WHERE idempotency_key = $key', { bind: { key } });
      expect(rows[0].attempts).toBe(2);
      expect(rows[0].status).toBe('claimed');
    });

    it('a mismatched supplied key is rejected rather than sent under a key describing a different message', async () => {
      await expect(claimSend({
        recipient: nextRecipient(),
        subject: SUBJECT,
        businessEventId: EVENT,
        idempotencyKey: 'a'.repeat(32),
      })).rejects.toThrow(/IdempotencyKeyMismatch/);
    });
  });

  describe('outcome recording', () => {
    it('a FAILED provider call leaves the key retryable, and the retry increments attempts', async () => {
      const recipient = nextRecipient();
      const key = computeIdempotencyKey(recipient, SUBJECT, EVENT);
      const first = await claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT });
      if (!first.granted) throw new Error('setup failed: first claim was refused');

      await recordSendFailure(first.ledgerId, 'TimeoutError', 'mandrill timed out');
      expect(await statusOf(key)).toBe('failed');

      const retry = await claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT });

      if (!retry.granted) throw new Error(`retry was refused: ${retry.reason}`);
      expect(retry.attempts).toBe(2);
      expect(await statusOf(key)).toBe('claimed');
      expect(await rowCount(key)).toBe(1);
    });

    it('a SUCCESSFUL send is not repeatable — the claim is refused for good', async () => {
      const recipient = nextRecipient();
      const key = computeIdempotencyKey(recipient, SUBJECT, EVENT);
      const first = await claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT });
      if (!first.granted) throw new Error('setup failed: first claim was refused');
      await recordSendSuccess(first.ledgerId, 'mandrill-msg-1');

      const again = await claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT });

      expect(again).toEqual({ granted: false, reason: 'already_sent', idempotencyKey: key });
      expect(await statusOf(key)).toBe('sent');
    });

    it('releaseClaim can rescue a stranded claim but can NEVER un-send a sent one', async () => {
      const stranded = nextRecipient();
      const strandedKey = computeIdempotencyKey(stranded, SUBJECT, EVENT);
      await claimSend({ recipient: stranded, subject: SUBJECT, businessEventId: EVENT });

      await expect(releaseClaim(strandedKey, 'ali', 'process died mid-batch'))
        .resolves.toEqual({ released: true });
      expect(await statusOf(strandedKey)).toBe('failed');

      const delivered = nextRecipient();
      const deliveredKey = computeIdempotencyKey(delivered, SUBJECT, EVENT);
      const claim = await claimSend({ recipient: delivered, subject: SUBJECT, businessEventId: EVENT });
      if (!claim.granted) throw new Error('setup failed');
      await recordSendSuccess(claim.ledgerId, 'mandrill-msg-2');

      await expect(releaseClaim(deliveredKey, 'ali', 'trying to resend'))
        .resolves.toEqual({ released: false });
      expect(await statusOf(deliveredKey)).toBe('sent');
    });
  });

  describe('sendOnce end to end', () => {
    it('calls the provider exactly once across two attempts at the same message', async () => {
      const recipient = nextRecipient();
      const provider = jest.fn().mockResolvedValue({ ok: true, messageId: 'mid-42' });

      const first = await sendOnce({ recipient, subject: SUBJECT, businessEventId: EVENT }, provider);
      const second = await sendOnce({ recipient, subject: SUBJECT, businessEventId: EVENT }, provider);

      expect(provider).toHaveBeenCalledTimes(1);
      expect(first.outcome).toBe('sent');
      expect(second).toEqual({
        outcome: 'skipped',
        reason: 'already_sent',
        idempotencyKey: computeIdempotencyKey(recipient, SUBJECT, EVENT),
      });
    });

    it('a provider that throws is retried on the NEXT run, and the provider is then called a second time', async () => {
      const recipient = nextRecipient();
      const provider = jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { name: 'TimeoutError' }))
        .mockResolvedValueOnce({ ok: true, messageId: 'mid-43' });

      const failed = await sendOnce({ recipient, subject: SUBJECT, businessEventId: EVENT }, provider);
      const retried = await sendOnce({ recipient, subject: SUBJECT, businessEventId: EVENT }, provider);

      expect(failed.outcome).toBe('failed');
      expect(retried.outcome).toBe('sent');
      expect(provider).toHaveBeenCalledTimes(2);
      expect(await statusOf(computeIdempotencyKey(recipient, SUBJECT, EVENT))).toBe('sent');
    });

    it('a provider reporting ok:false is a failure, not a silent success', async () => {
      const recipient = nextRecipient();
      const provider = jest.fn().mockResolvedValue({ ok: false, error: 'blocked by kill switch' });

      const result = await sendOnce({ recipient, subject: SUBJECT, businessEventId: EVENT }, provider);

      expect(result.outcome).toBe('failed');
      expect(await statusOf(computeIdempotencyKey(recipient, SUBJECT, EVENT))).toBe('failed');
    });

    it('the provider is never called when the claim is refused', async () => {
      const recipient = nextRecipient();
      await claimSend({ recipient, subject: SUBJECT, businessEventId: EVENT });
      const provider = jest.fn();

      const result = await sendOnce({ recipient, subject: SUBJECT, businessEventId: EVENT }, provider);

      expect(provider).not.toHaveBeenCalled();
      expect(result).toEqual({
        outcome: 'skipped',
        reason: 'in_flight',
        idempotencyKey: computeIdempotencyKey(recipient, SUBJECT, EVENT),
      });
    });
  });
});

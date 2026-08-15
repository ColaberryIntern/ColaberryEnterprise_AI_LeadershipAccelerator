/**
 * The run loop, against a fake database and a fake transport.
 *
 * Three things are load-bearing here and each has burned this program before:
 * a re-run must not mail anybody twice, one student's failure must not stop the
 * rest of the book, and a dry run must not touch PaySimple or the database.
 */

const ledger: any[] = [];
let subscriptionRows: any[] = [];
let pendingRefs: string[] = [];
const executed: string[] = [];
/** Makes ledger SELECTs return nothing while INSERTs still hit the unique
 *  index, which is the read-then-insert race between two containers. */
let hideLedgerReads = false;

const sendMail = jest.fn();
const startCheckout = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(async (sql: string, opts: any = {}) => {
      const rep = opts.replacements || {};
      executed.push(sql.trim().split('\n')[0].trim());

      if (/^\s*CREATE /i.test(sql)) return [];
      if (sql.includes('to_regclass')) return [{ t: 'subscription_renewal_reminders' }];

      if (sql.includes('FROM subscriptions s')) return subscriptionRows;

      if (sql.includes('SELECT 1 FROM subscriptions WHERE payment_ref')) {
        return pendingRefs.includes(rep.ref) ? [{ '?column?': 1 }] : [];
      }

      if (sql.includes('SELECT reminder_kind')) {
        if (hideLedgerReads) return [];
        return ledger.filter((r) => r.subscription_id === rep.sid && r.period_end === rep.pe);
      }

      if (sql.includes('INSERT INTO subscription_renewal_reminders')) {
        const clash = ledger.some((r) =>
          r.subscription_id === rep.sid && r.period_end === rep.pe && r.reminder_kind === rep.kind);
        if (clash) return [undefined, 0];
        ledger.push({
          subscription_id: rep.sid, enrollment_id: rep.eid, period_end: rep.pe,
          reminder_kind: rep.kind, recipient_email: rep.email, payment_ref: rep.ref,
          payment_link: rep.link, amount_cents: rep.amt, status: 'claimed', sent_at: null,
        });
        return [undefined, 1];
      }

      if (sql.includes('UPDATE subscription_renewal_reminders')) {
        const row = ledger.find((r) =>
          r.subscription_id === rep.sid && r.period_end === rep.pe && r.reminder_kind === rep.kind);
        if (row) { row.status = 'sent'; row.sent_at = new Date(); row.message_id = rep.mid; }
        return [undefined, row ? 1 : 0];
      }

      if (sql.includes('DELETE FROM subscription_renewal_reminders')) {
        const i = ledger.findIndex((r) =>
          r.subscription_id === rep.sid && r.period_end === rep.pe
          && r.reminder_kind === rep.kind && r.status === 'claimed');
        if (i > -1) ledger.splice(i, 1);
        return [undefined, i > -1 ? 1 : 0];
      }

      return [];
    }),
  },
}));

jest.mock('../../subscriptionService', () => ({ startCheckout: (...a: any[]) => startCheckout(...a) }));
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: jest.fn(async () => false) }));
jest.mock('../../settingsService', () => ({ getTestOverrides: jest.fn(async () => ({ enabled: false, email: '' })) }));
jest.mock('../../devEmailGuard', () => ({ decideDevEmailRouting: jest.fn(() => ({ action: 'pass', originalRecipients: '' })) }));
jest.mock('../../../config/featureFlags', () => ({ isDev: false }));
jest.mock('../../../config/env', () => ({ env: { mandrillApiKey: 'test-key' } }));
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (...a: any[]) => sendMail(...a) }) },
}));

import { runRenewalReminders, DRY_RUN_LINK } from '../renewalReminderService';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-15T02:00:00.000Z');

let seq = 0;
function row(over: any = {}) {
  seq += 1;
  return {
    id: `sub-${seq}`,
    enrollment_id: `enr-${seq}`,
    plan: 'monthly',
    status: 'active',
    amount_cents: 19900,
    current_period_end: new Date(NOW + 3 * DAY),
    email: `student${seq}@example.com`,
    full_name: `Student ${seq}`,
    ...over,
  };
}

beforeEach(() => {
  ledger.length = 0;
  executed.length = 0;
  subscriptionRows = [];
  pendingRefs = [];
  hideLedgerReads = false;
  seq = 0;
  jest.clearAllMocks();
  sendMail.mockResolvedValue({ messageId: '<msg@mandrill>' });
  startCheckout.mockImplementation(async () => ({
    ok: true, payment_link: 'https://sandbox.paysimple.com/checkout/LIVE1',
    plan: 'monthly', amount: 199, full_amount: 199, applied_credit: 0,
  }));
});

describe('dry run', () => {
  test('plans the mail but sends nothing, mints nothing, and writes nothing', async () => {
    subscriptionRows = [row(), row({ current_period_end: new Date(NOW + 40 * DAY) })];
    const s = await runRenewalReminders({ nowMs: NOW });

    expect(s.dry_run).toBe(true);
    expect(s.planned).toHaveLength(1);
    expect(s.sent).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(startCheckout).not.toHaveBeenCalled();
    expect(ledger).toHaveLength(0);
    expect(executed.some((q) => /^CREATE|^INSERT|^UPDATE|^DELETE/i.test(q))).toBe(false);
  });

  test('shows a placeholder link, clearly not a real one', async () => {
    subscriptionRows = [row()];
    const s = await runRenewalReminders({ nowMs: NOW });
    expect(s.planned[0].payment_link).toBe(DRY_RUN_LINK);
    expect(s.planned[0].text).toContain(DRY_RUN_LINK);
  });

  test('still renders the real amount and the real date', async () => {
    subscriptionRows = [row({ current_period_end: '2026-08-18T18:26:46.821Z' })];
    const s = await runRenewalReminders({ nowMs: NOW });
    expect(s.planned[0].text).toContain('$199.00');
    expect(s.planned[0].text).toContain('Tuesday, August 18, 2026');
  });

  test('reports what it refused and why', async () => {
    subscriptionRows = [
      row({ plan: 'comp', amount_cents: 0 }),
      row({ current_period_end: new Date(NOW - 5 * DAY) }),
      row({ status: 'canceled' }),
    ];
    const s = await runRenewalReminders({ nowMs: NOW });
    expect(s.planned).toHaveLength(0);
    const reasons = s.selection.skipped.map((x) => x.reason);
    expect(reasons).toEqual(expect.arrayContaining(['comped', 'already_lapsed', 'not_active']));
  });
});

describe('idempotency', () => {
  test('a second run on the same day sends nothing', async () => {
    subscriptionRows = [row(), row(), row()];

    const first = await runRenewalReminders({ send: true, nowMs: NOW });
    expect(first.sent).toBe(3);
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(ledger.filter((l) => l.status === 'sent')).toHaveLength(3);

    sendMail.mockClear();
    startCheckout.mockClear();

    const second = await runRenewalReminders({ send: true, nowMs: NOW });
    expect(second.sent).toBe(0);
    expect(second.skipped_already_sent).toBe(3);
    expect(sendMail).not.toHaveBeenCalled();
    expect(startCheckout).not.toHaveBeenCalled();
    expect(ledger).toHaveLength(3);
  });

  test('a run a few hours later on the same period still sends nothing', async () => {
    subscriptionRows = [row()];
    await runRenewalReminders({ send: true, nowMs: NOW });
    sendMail.mockClear();

    for (const offset of [1, 6, 12, 23]) {
      const s = await runRenewalReminders({ send: true, nowMs: NOW + offset * 3600 * 1000 });
      expect(s.sent).toBe(0);
    }
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('the final notice is a separate key, so it still goes out after the advance one', async () => {
    const r = row({ current_period_end: new Date(NOW + 5 * DAY) });
    subscriptionRows = [r];

    const advance = await runRenewalReminders({ send: true, nowMs: NOW });
    expect(advance.sent).toBe(1);
    expect(ledger[0].reminder_kind).toBe('advance_7d');

    // Four days later the same subscription is one day out.
    pendingRefs = [];
    const final = await runRenewalReminders({ send: true, nowMs: NOW + 4.2 * DAY });
    expect(final.sent).toBe(1);
    expect(ledger.map((l) => l.reminder_kind).sort()).toEqual(['advance_7d', 'final_1d']);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  test('the final notice reuses the link minted for the advance notice', async () => {
    // One checkout link per (subscription, period) means one pending
    // subscription row, which is what keeps appPaymentReconcileService from
    // seeing a genuine duplicate to cancel.
    const r = row({ current_period_end: new Date(NOW + 5 * DAY) });
    subscriptionRows = [r];

    await runRenewalReminders({ send: true, nowMs: NOW });
    expect(startCheckout).toHaveBeenCalledTimes(1);

    const final = await runRenewalReminders({ send: true, nowMs: NOW + 4.2 * DAY });
    expect(startCheckout).toHaveBeenCalledTimes(1); // not called again
    expect(final.planned[0].reused_link).toBe(true);
    expect(final.planned[0].payment_link).toBe('https://sandbox.paysimple.com/checkout/LIVE1');
  });

  test('a next period is a new key, so the student is reminded again next month', async () => {
    const first = row({ id: 'sub-a', enrollment_id: 'enr-a', current_period_end: new Date(NOW + 3 * DAY) });
    subscriptionRows = [first];
    await runRenewalReminders({ send: true, nowMs: NOW });
    expect(ledger).toHaveLength(1);

    // They paid, so a fresh subscription row exists with next month's date.
    subscriptionRows = [
      first,
      row({ id: 'sub-b', enrollment_id: 'enr-a', current_period_end: new Date(NOW + 34 * DAY) }),
    ];
    const next = await runRenewalReminders({ send: true, nowMs: NOW + 30 * DAY });
    expect(next.sent).toBe(1);
    expect(ledger.filter((l) => l.subscription_id === 'sub-b')).toHaveLength(1);
  });

  test('a concurrent run that loses the insert race does not also send', async () => {
    // The read-then-insert window is real: two containers can both read an
    // empty ledger and both decide to send. The unique index is what actually
    // settles it, so simulate the other process winning between our read and
    // our insert by hiding the ledger from reads while leaving it enforced.
    const r = row({ id: 'sub-x' });
    subscriptionRows = [r];
    ledger.push({
      subscription_id: r.id, period_end: new Date(r.current_period_end).toISOString(),
      reminder_kind: 'advance_7d', recipient_email: r.email, status: 'claimed', sent_at: null,
    });
    hideLedgerReads = true;

    const s = await runRenewalReminders({ send: true, nowMs: NOW });

    expect(s.sent).toBe(0);
    expect(s.skipped_already_sent).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();
    expect(ledger).toHaveLength(1); // the other run's claim is untouched
    hideLedgerReads = false;
  });

  test('a claim left behind by a crashed run blocks a resend', async () => {
    // Deliberate: on an ambiguous outcome we would rather skip a student than
    // mail a paying customer about their money twice. Recovery is a human.
    const r = row({ id: 'sub-crashed' });
    subscriptionRows = [r];
    ledger.push({
      subscription_id: r.id, period_end: new Date(r.current_period_end).toISOString(),
      reminder_kind: 'advance_7d', recipient_email: r.email, status: 'claimed', sent_at: null,
    });

    const s = await runRenewalReminders({ send: true, nowMs: NOW });
    expect(s.sent).toBe(0);
    expect(s.skipped_already_sent).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('one failure does not stop the run', () => {
  test('a transport error on the second student still mails the third', async () => {
    subscriptionRows = [row(), row(), row()];
    sendMail
      .mockResolvedValueOnce({ messageId: '<a>' })
      .mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))
      .mockResolvedValueOnce({ messageId: '<c>' });

    const s = await runRenewalReminders({ send: true, nowMs: NOW });

    expect(s.sent).toBe(2);
    expect(s.failed).toHaveLength(1);
    expect(s.failed[0].email).toBe('student2@example.com');
    expect(s.failed[0].error_class).toBe('UpstreamUnavailable');
    expect(s.outcome).toBe('partial');
    expect(sendMail).toHaveBeenCalledTimes(3);
  });

  test('a failed send releases its claim, so tomorrow can retry that student', async () => {
    subscriptionRows = [row({ id: 'sub-fail' })];
    sendMail.mockRejectedValueOnce(new Error('smtp exploded'));

    const first = await runRenewalReminders({ send: true, nowMs: NOW });
    expect(first.sent).toBe(0);
    expect(first.failed).toHaveLength(1);
    expect(ledger).toHaveLength(0); // claim given back

    sendMail.mockResolvedValue({ messageId: '<retry>' });
    const second = await runRenewalReminders({ send: true, nowMs: NOW + DAY });
    expect(second.sent).toBe(1);
  });

  test('a checkout failure is isolated to that student and classified', async () => {
    subscriptionRows = [row(), row({ id: 'sub-bad' }), row()];
    startCheckout.mockImplementation(async (enrollmentId: string) =>
      enrollmentId === 'enr-2'
        ? { ok: false, reason: 'checkout_failed', message: 'PaySimple 500' }
        : { ok: true, payment_link: 'https://sandbox.paysimple.com/checkout/OK', plan: 'monthly', amount: 199, full_amount: 199, applied_credit: 0 });

    const s = await runRenewalReminders({ send: true, nowMs: NOW });
    expect(s.sent).toBe(2);
    expect(s.failed).toHaveLength(1);
    expect(s.failed[0].error_class).toBe('UpstreamUnavailable');
    expect(s.failed[0].message).toContain('checkout_failed');
    expect(ledger.filter((l) => l.status === 'sent')).toHaveLength(2);
  });

  test('a checkout failure never leaves a claim that would block a retry', async () => {
    subscriptionRows = [row({ id: 'sub-only' })];
    startCheckout.mockResolvedValueOnce({ ok: false, reason: 'billing_unconfigured' });
    const s = await runRenewalReminders({ send: true, nowMs: NOW });
    expect(s.failed[0].error_class).toBe('ConfigError');
    expect(ledger).toHaveLength(0);
  });

  test('a run where every student fails reports failure, not success', async () => {
    subscriptionRows = [row(), row()];
    sendMail.mockRejectedValue(new Error('everything is down'));
    const s = await runRenewalReminders({ send: true, nowMs: NOW });
    expect(s.sent).toBe(0);
    expect(s.failed).toHaveLength(2);
    expect(s.outcome).toBe('failure');
  });
});

describe('send guards', () => {
  test('the kill switch stops delivery and does not leave a claim behind', async () => {
    const { isKillSwitchActive } = require('../../launchSafety');
    (isKillSwitchActive as jest.Mock).mockResolvedValue(true);
    subscriptionRows = [row()];

    const s = await runRenewalReminders({ send: true, nowMs: NOW });
    expect(s.sent).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(ledger).toHaveLength(0);

    (isKillSwitchActive as jest.Mock).mockResolvedValue(false);
  });
});

describe('the mail itself', () => {
  test('is addressed correctly, carries the real link, and is not tracked', async () => {
    subscriptionRows = [row({ email: 'real@example.com', full_name: 'Real Student' })];
    await runRenewalReminders({ send: true, nowMs: NOW });

    const opts = sendMail.mock.calls[0][0];
    expect(opts.to).toBe('real@example.com');
    expect(opts.from).toBe('"Ali Muwwakkil" <ali@colaberry.com>');
    expect(opts.replyTo).toBe('ali@colaberry.com');
    expect(opts.text).toContain('https://sandbox.paysimple.com/checkout/LIVE1');
    expect(opts.text).toContain('Real,');
    expect(opts.headers['X-MC-Track']).toBe('none');
    expect(opts.text).not.toContain(DRY_RUN_LINK);
  });

  test('shows the credit-reduced charge when startCheckout applies a credit', async () => {
    startCheckout.mockResolvedValue({
      ok: true, payment_link: 'https://sandbox.paysimple.com/checkout/CRED',
      plan: 'monthly', amount: 149, full_amount: 199, applied_credit: 50,
    });
    subscriptionRows = [row()];
    await runRenewalReminders({ send: true, nowMs: NOW });

    const opts = sendMail.mock.calls[0][0];
    expect(opts.text).toContain('$50.00 of account credit');
    expect(opts.text).toContain('this payment is $149.00');
  });
});

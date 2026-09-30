/**
 * Unit tests for the daily reporting orchestrator's hardening (CC-20260623-q8m4).
 *
 * Guards two production defects found 2026-06-23:
 *   1. SILENT SEND FAILURES: the orchestrator alerted only when a report failed
 *      PREFLIGHT (`totalFail > 0`). A report that passed preflight then failed
 *      its actual send (exit != 0) was logged "healthy run - audit email
 *      suppressed" and Ali was never told. Anthropic Partner Network and
 *      Interview Prep were broken for days inside this blind spot.
 *      -> shouldSendAuditEmail must fire on a send failure too.
 *   2. TRANSIENT TLS BLIPS: a Mandrill `tlsv1 alert internal error` (ESOCKET on
 *      CONN) killed a whole reporting run. sendMailWithRetry must retry the
 *      transient class and give up (throw) only after the cap, while a real
 *      (non-transient) error throws immediately.
 *
 * Requiring the modules has no I/O side effects.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { summarizeReporting, shouldSendAuditEmail } = require('../lib/reportingAuditDecision');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendMailWithRetry, isTransient } = require('../lib/sendMailWithRetry');

type Overall = 'ok' | 'warn' | 'fail';
const audit = (overall: Overall) => ({ overall });
const send = (exitCode: number | null) => (exitCode === null ? null : { exitCode });
// Build an Error carrying a nodemailer-style `.code` without resorting to `any`.
const errWithCode = (message: string, code?: string): Error =>
  Object.assign(new Error(message), code ? { code } : {});

describe('summarizeReporting', () => {
  it('counts sent, send-failures, preflight-failures and warnings', () => {
    const auditResults = [audit('ok'), audit('warn'), audit('fail'), audit('ok')];
    const sendResults = [send(0), send(1), send(-2), send(0)];
    const c = summarizeReporting(auditResults, sendResults);
    expect(c.total).toBe(4);
    expect(c.sentCount).toBe(2);        // the two exit=0
    expect(c.sendFailCount).toBe(1);    // exit=1 (the -2 is a preflight skip, not a send failure)
    expect(c.totalFail).toBe(1);        // one preflight 'fail'
    expect(c.totalWarn).toBe(1);
  });

  it('treats spawn errors (-1) and orchestrator guard (-3) as send failures, but not preflight-skip (-2)', () => {
    const auditResults = [audit('ok'), audit('ok'), audit('fail')];
    const sendResults = [send(-1), send(-3), send(-2)];
    const c = summarizeReporting(auditResults, sendResults);
    expect(c.sendFailCount).toBe(2);
  });

  it('audit-only run (all sends null) reports zero send failures', () => {
    const auditResults = [audit('ok'), audit('warn')];
    const sendResults = [send(null), send(null)];
    const c = summarizeReporting(auditResults, sendResults);
    expect(c.sendFailCount).toBe(0);
    expect(c.sentCount).toBe(0);
  });
});

describe('shouldSendAuditEmail', () => {
  it('alerts on a preflight failure', () => {
    expect(shouldSendAuditEmail({ totalFail: 1, sendFailCount: 0 })).toBe(true);
  });

  it('alerts on a SEND failure even when preflight passed (the regression we are fixing)', () => {
    expect(shouldSendAuditEmail({ totalFail: 0, sendFailCount: 1 })).toBe(true);
  });

  it('stays silent on a fully healthy run (warn-only is not a failure)', () => {
    expect(shouldSendAuditEmail({ totalFail: 0, sendFailCount: 0 })).toBe(false);
  });
});

describe('isTransient', () => {
  it('flags ESOCKET / TLS handshake errors as transient', () => {
    expect(isTransient({ code: 'ESOCKET', message: 'tlsv1 alert internal error' })).toBe(true);
    expect(isTransient({ message: 'Client network socket disconnected before secure TLS connection' })).toBe(true);
    expect(isTransient({ code: 'ETIMEDOUT' })).toBe(true);
  });
  it('does NOT retry a real auth/content error', () => {
    expect(isTransient({ code: 'EAUTH', message: 'Invalid login: 535 authentication failed' })).toBe(false);
    expect(isTransient(null)).toBe(false);
  });
});

describe('sendMailWithRetry', () => {
  const noSleep = { sleep: async () => undefined, baseDelayMs: 1 };

  it('returns the result on first success without retrying', async () => {
    const calls: unknown[] = [];
    const transport = { sendMail: async (m: unknown) => { calls.push(m); return { messageId: 'ok-1' }; } };
    const r = await sendMailWithRetry(transport, { subject: 'x' }, noSleep);
    expect(r.messageId).toBe('ok-1');
    expect(calls.length).toBe(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    let n = 0;
    const transport = {
      sendMail: async () => {
        n += 1;
        if (n < 2) { throw errWithCode('tlsv1 alert internal error', 'ESOCKET'); }
        return { messageId: 'ok-after-retry' };
      },
    };
    const r = await sendMailWithRetry(transport, { subject: 'x' }, noSleep);
    expect(r.messageId).toBe('ok-after-retry');
    expect(n).toBe(2);
  });

  it('throws immediately on a non-transient error (no retry)', async () => {
    let n = 0;
    const transport = {
      sendMail: async () => { n += 1; throw errWithCode('auth failed', 'EAUTH'); },
    };
    await expect(sendMailWithRetry(transport, { subject: 'x' }, noSleep)).rejects.toThrow('auth failed');
    expect(n).toBe(1);
  });

  it('gives up after the attempt cap on a persistent transient error', async () => {
    let n = 0;
    const transport = {
      sendMail: async () => { n += 1; throw errWithCode('socket hang up', 'ECONNRESET'); },
    };
    await expect(sendMailWithRetry(transport, { subject: 'x' }, { ...noSleep, attempts: 3 })).rejects.toThrow('socket hang up');
    expect(n).toBe(3);
  });
});

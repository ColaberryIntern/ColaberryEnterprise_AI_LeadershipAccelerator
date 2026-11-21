/**
 * CH7.5 failure alerts: one alert per message per failure state change per recipient, however often
 * the tick runs; a retry that fails again alerts again; a failed send is tried twice more then
 * failed; no mail transport means failed, never "sent"; organizer text cannot inject HTML into the
 * alert email. The in-memory store keeps the Postgres rules (unique key, claim token, lease).
 */
jest.mock('../../../../config/env', () => ({ env: { frontendUrl: 'https://enterprise.colaberry.ai/', mandrillApiKey: '' } }));
const mockEmit = jest.fn(async () => ({}));
const mockMail = jest.fn(async () => undefined);
jest.mock('../../../alertService', () => ({ emitAlert: (...a: unknown[]) => mockEmit(...(a as [])) }));
jest.mock('../../../emailService', () => ({ sendAlertEmail: (...a: unknown[]) => mockMail(...(a as [])) }));

import { alertContent, defaultAlertSenders, mailSafe, runFailureAlerts, type AlertDeps } from '../failureAlerts';
import { ALERT_LEASE_MS, ALERT_WINDOW_MS, DASHBOARD, MAX_ALERT_ATTEMPTS, type AlertContent, type AlertOutcome, type AlertRepo, type ClaimedAlert, type FailureState } from '../types';

interface StateEvent { id: string; message_id: string; state: FailureState; at: Date; sent: number; not_sent: number }
interface Row extends ClaimedAlert { status: 'pending' | 'sending' | 'sent' | 'failed'; next_attempt_at: Date | null; claimed_at: Date | null; error: string | null; created_at: Date }

class FakeAlertRepo implements AlertRepo {
  emails: string[] = ['ops@colaberry.com', 'jackie@colaberry.com'];
  events: StateEvent[] = [];
  titles = new Map<string, string>([['m1', 'Demo Tuesday: reminder']]);
  rows: Row[] = [];
  async recipients() { return [...this.emails]; }
  async queue(recipients: string[], since: Date, now: Date) {
    let n = 0;
    for (const e of this.events.filter((x) => x.at >= since && this.titles.has(x.message_id))) {
      for (const r of [DASHBOARD, ...recipients]) {
        if (this.rows.some((x) => x.state_event_id === e.id && x.recipient === r)) continue; // UNIQUE (state_event_id, recipient)
        this.rows.push({ id: `alert-${this.rows.length + 1}`, state_event_id: e.id, message_id: e.message_id, failure_state: e.state, recipient: r, attempt: 0, status: 'pending', next_attempt_at: null, claimed_at: null, error: null, created_at: now });
        n += 1;
      }
    }
    return n;
  }
  async claim(now: Date, limit: number) {
    const stale = now.getTime() - ALERT_LEASE_MS;
    for (const r of this.rows) if (r.status === 'sending' && r.claimed_at!.getTime() < stale && r.attempt >= MAX_ALERT_ATTEMPTS) r.status = 'failed';
    const due = this.rows.filter((r) => r.attempt < MAX_ALERT_ATTEMPTS && ((r.status === 'pending' && (!r.next_attempt_at || r.next_attempt_at <= now)) || (r.status === 'sending' && r.claimed_at!.getTime() < stale))).slice(0, limit);
    for (const r of due) { r.status = 'sending'; r.attempt += 1; r.claimed_at = now; }
    return due.map((r) => ({ id: r.id, state_event_id: r.state_event_id, message_id: r.message_id, failure_state: r.failure_state, recipient: r.recipient, attempt: r.attempt }));
  }
  async context(a: ClaimedAlert) {
    const t = this.titles.get(a.message_id);
    const e = this.events.find((x) => x.id === a.state_event_id)!;
    return t ? { title: t, sent: e.sent, not_sent: e.not_sent } : null;
  }
  async settle(a: ClaimedAlert, out: AlertOutcome) {
    const r = this.rows.find((x) => x.id === a.id)!;
    if (r.status !== 'sending' || r.attempt !== a.attempt) return; // a stale claim records nothing
    if (out.kind === 'sent') r.status = 'sent';
    else if (out.kind === 'retry') { r.status = 'pending'; r.next_attempt_at = out.at; r.error = out.error; }
    else { r.status = 'failed'; r.error = out.error; }
  }
}

const T0 = new Date('2026-11-20T16:00:00Z');
const at = (ms: number): Date => new Date(T0.getTime() + ms);
function setup() {
  const repo = new FakeAlertRepo();
  const dashboard: AlertContent[] = [];
  const mails: Array<{ to: string; c: AlertContent }> = [];
  const logs: Array<{ event: string; ctx: Record<string, unknown> }> = [];
  const senders = {
    dashboard: jest.fn(async (c: AlertContent) => { dashboard.push(c); }),
    email: jest.fn(async (to: string, c: AlertContent) => { mails.push({ to, c }); }),
    emailReady: jest.fn(() => true),
  };
  const deps: AlertDeps = { repo, senders, log: (_l, event, ctx) => { logs.push({ event, ctx }); } };
  return { repo, senders, deps, dashboard, mails, logs };
}

describe('one alert per state change', () => {
  it('a failed message alerts the dashboard and each settings recipient once; re-running sends nothing more', async () => {
    const { repo, deps, dashboard, mails } = setup();
    repo.events.push({ id: 's1', message_id: 'm1', state: 'failed', at: T0, sent: 0, not_sent: 2 });
    expect(await runFailureAlerts(deps, T0)).toEqual({ queued: 3, sent: 3, retried: 0, failed: 0 });
    expect(dashboard).toHaveLength(1);
    expect(mails.map((m) => m.to).sort()).toEqual(['jackie@colaberry.com', 'ops@colaberry.com']);
    for (const n of [1, 2, 3]) expect(await runFailureAlerts(deps, at(n * 60_000))).toEqual({ queued: 0, sent: 0, retried: 0, failed: 0 });
    expect(mails).toHaveLength(2);
  });

  it('a retry that fails again is a new state change and alerts again; the first one is not repeated', async () => {
    const { repo, deps, mails } = setup();
    repo.events.push({ id: 's1', message_id: 'm1', state: 'partially_failed', at: T0, sent: 1, not_sent: 1 });
    await runFailureAlerts(deps, T0);
    repo.events.push({ id: 's2', message_id: 'm1', state: 'failed', at: at(600_000), sent: 0, not_sent: 1 });
    expect((await runFailureAlerts(deps, at(600_000))).sent).toBe(3);
    expect(mails.map((m) => m.c.state)).toEqual(['partially_failed', 'partially_failed', 'failed', 'failed']);
  });

  it('a recipient added later hears about recent failures only, and nobody is mailed twice', async () => {
    const { repo, deps, mails } = setup();
    repo.events.push({ id: 'old', message_id: 'm1', state: 'failed', at: new Date(T0.getTime() - ALERT_WINDOW_MS - 1), sent: 0, not_sent: 1 });
    repo.events.push({ id: 's1', message_id: 'm1', state: 'failed', at: T0, sent: 0, not_sent: 1 });
    await runFailureAlerts(deps, T0);
    repo.emails.push('taiwo@colaberry.com');
    await runFailureAlerts(deps, at(60_000));
    expect(mails.map((m) => `${m.to}:${m.c.state_event_id}`).sort()).toEqual(['jackie@colaberry.com:s1', 'ops@colaberry.com:s1', 'taiwo@colaberry.com:s1']);
  });

  it('no alert recipients: the dashboard still gets it', async () => {
    const { repo, deps, dashboard, mails } = setup();
    repo.emails = [];
    repo.events.push({ id: 's1', message_id: 'm1', state: 'failed', at: T0, sent: 0, not_sent: 1 });
    await runFailureAlerts(deps, T0);
    expect([dashboard.length, mails.length]).toEqual([1, 0]);
  });
});

describe('failure path', () => {
  it('a failed email is tried after 1 minute, then 5 minutes, then marked failed and logged; the dashboard is unaffected', async () => {
    const { repo, senders, deps, logs } = setup();
    repo.emails = ['ops@colaberry.com'];
    senders.email.mockRejectedValue(Object.assign(new Error('454 relay'), { name: 'SmtpError' }));
    repo.events.push({ id: 's1', message_id: 'm1', state: 'failed', at: T0, sent: 0, not_sent: 1 });
    expect(await runFailureAlerts(deps, T0)).toEqual({ queued: 2, sent: 1, retried: 1, failed: 0 });
    expect((await runFailureAlerts(deps, at(59_000))).retried).toBe(0); // not due yet
    expect((await runFailureAlerts(deps, at(60_000))).retried).toBe(1);
    expect((await runFailureAlerts(deps, at(60_000 + 299_000))).failed).toBe(0);
    expect((await runFailureAlerts(deps, at(60_000 + 300_000))).failed).toBe(1);
    expect(await runFailureAlerts(deps, at(3600_000))).toEqual({ queued: 0, sent: 0, retried: 0, failed: 0 });
    expect(senders.email).toHaveBeenCalledTimes(MAX_ALERT_ATTEMPTS);
    expect(repo.rows.find((r) => r.recipient === 'ops@colaberry.com')).toEqual(expect.objectContaining({ status: 'failed', error: 'SmtpError: 454 relay' }));
    expect(logs.filter((l) => l.event === 'comms_hub_alert_failed')).toEqual([expect.objectContaining({ ctx: expect.objectContaining({ error_class: 'SmtpError', to: 'email', attempt: 3 }) })]);
    expect(JSON.stringify(logs)).not.toContain('ops@colaberry.com');
  });

  it('a send that never answers times out and is retried', async () => {
    jest.useFakeTimers();
    try {
      const { repo, senders, deps } = setup();
      repo.emails = ['ops@colaberry.com'];
      senders.email.mockImplementationOnce(() => new Promise(() => undefined));
      repo.events.push({ id: 's1', message_id: 'm1', state: 'failed', at: T0, sent: 0, not_sent: 1 });
      const run = runFailureAlerts(deps, T0);
      await jest.advanceTimersByTimeAsync(30_000);
      expect((await run).retried).toBe(1);
      expect(repo.rows.find((r) => r.recipient === 'ops@colaberry.com')!.error).toMatch(/^TimeoutError/);
    } finally { jest.useRealTimers(); }
  });

  it('no mail transport configured: the email is failed at once, never reported as sent', async () => {
    const { repo, senders, deps } = setup();
    senders.emailReady.mockReturnValue(false);
    repo.events.push({ id: 's1', message_id: 'm1', state: 'failed', at: T0, sent: 0, not_sent: 1 });
    expect(await runFailureAlerts(deps, T0)).toEqual({ queued: 3, sent: 1, retried: 0, failed: 2 });
    expect(senders.email).not.toHaveBeenCalled();
    expect(repo.rows.filter((r) => r.status === 'failed').map((r) => r.error)).toEqual([expect.stringMatching(/^SmtpNotConfigured/), expect.stringMatching(/^SmtpNotConfigured/)]);
  });

  it('a crash mid-send is tried again after the lease, and a stale claim records nothing', async () => {
    const { repo, deps, senders } = setup();
    repo.emails = [];
    repo.events.push({ id: 's1', message_id: 'm1', state: 'failed', at: T0, sent: 0, not_sent: 1 });
    await repo.queue([], new Date(0), T0);
    const [stuck] = await repo.claim(T0, 10); // a worker claimed it and died
    expect((await runFailureAlerts(deps, at(ALERT_LEASE_MS - 1))).sent).toBe(0);
    expect((await runFailureAlerts(deps, at(ALERT_LEASE_MS + 1))).sent).toBe(1);
    await repo.settle(stuck, { kind: 'failed', error: 'late' });
    expect(repo.rows[0].status).toBe('sent');
    expect(senders.dashboard).toHaveBeenCalledTimes(1);
  });

  it('a message that no longer exists is failed, not retried forever', async () => {
    const { repo, deps } = setup();
    repo.events.push({ id: 's1', message_id: 'm1', state: 'failed', at: T0, sent: 0, not_sent: 1 });
    await repo.queue([], new Date(0), T0);
    repo.titles.clear();
    expect((await runFailureAlerts(deps, T0)).failed).toBe(1);
  });
});

describe('what an alert says', () => {
  const claimed = (state: FailureState): ClaimedAlert => ({ id: 'a', state_event_id: 's1', message_id: 'm1', failure_state: state, recipient: 'ops@colaberry.com', attempt: 1 });
  it('partly sent: how many got it and where to retry; failed is more severe', () => {
    const p = alertContent(claimed('partially_failed'), { title: 'Demo Tuesday: reminder', sent: 2, not_sent: 1 });
    expect(p).toEqual(expect.objectContaining({ title: 'Communications Hub: Demo Tuesday: reminder only partly sent', severity: 3 }));
    expect(p.description).toBe('2 of 3 recipients received it. Open Schedule and history in the Communications Hub to see who missed it and retry: https://enterprise.colaberry.ai/admin/comms-hub/schedule');
    const f = alertContent(claimed('failed'), { title: 'Holiday hours', sent: 0, not_sent: 1 });
    expect([f.title, f.severity, f.description.startsWith('0 of 1 recipient received it.')]).toEqual(['Communications Hub: Holiday hours did not send', 4, true]);
  });
  it('organizer text cannot put HTML into the alert email', () => {
    expect(mailSafe('Demo <img src=x onerror=alert(1)> & "Q&A"')).toBe('Demo img src=x onerror=alert(1) and QandA');
  });
});

describe('the existing alert path', () => {
  const content = (title: string): AlertContent => ({ title, description: '1 of 2 recipients received it. <b>x</b>', severity: 3, state: 'partially_failed', message_id: 'm1', state_event_id: 'abcdef12-3456-4789-8abc-def012345678' });
  it('the dashboard alert is one per state change (its reference is in the title, so emitAlert cannot fold two together) and mail-safe for subscriber emails', async () => {
    await defaultAlertSenders.dashboard(content('Communications Hub: <script>x</script> & Q only partly sent'));
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'warning', severity: 3, entityType: 'comms_hub_message', entityId: 'm1', impactArea: 'communications',
      title: 'Communications Hub: scriptx/script and Q only partly sent (ref abcdef12)', description: '1 of 2 recipients received it. bx/b',
    }));
  });
  it('the email goes through sendAlertEmail with organizer text made mail-safe; no transport configured is not ready', async () => {
    await defaultAlertSenders.email('ops@colaberry.com', content('Communications Hub: A & B did not send'));
    expect(mockMail).toHaveBeenCalledWith('ops@colaberry.com', expect.objectContaining({ title: 'Communications Hub: A and B did not send', type: 'warning' }));
    expect(defaultAlertSenders.emailReady()).toBe(false);
  });
});


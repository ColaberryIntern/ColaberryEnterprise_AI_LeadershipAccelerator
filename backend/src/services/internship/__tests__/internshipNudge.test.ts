/**
 * The nudge — the one message the console can send a student.
 *
 * Every test here is about what a request CANNOT cause:
 *
 *   - it cannot choose the words (no subject, body or HTML parameter exists);
 *   - it cannot send by accident (dry run is the default, not the opt-out);
 *   - it cannot send twice (one template, per intern, per day, through the ledger);
 *   - it cannot send while the kill switch is on;
 *   - it cannot smuggle markup into a student's inbox through the one free-text field.
 */
const mockSendOnce = jest.fn();
const mockGuardedSend = jest.fn();
const mockKillSwitch = jest.fn();

jest.mock('../../email/idempotentSend', () => ({ sendOnce: (...a: unknown[]) => mockSendOnce(...a) }));
jest.mock('../../emailService', () => ({ guardedSendMail: (...a: unknown[]) => mockGuardedSend(...a) }));
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: () => mockKillSwitch() }));

import {
  sendNudge, renderNudge, nudgeBusinessEventId, isNudgeTemplate, NUDGE_TEMPLATES,
} from '../internshipNudge';

const NOW = new Date('2026-10-02T15:00:00Z');
const base = {
  applicationId: 'app-1',
  to: 'intern@example.com',
  firstName: 'Sarbjit',
  template: 'quiet_check_in' as const,
  now: NOW,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockKillSwitch.mockResolvedValue(false);
  mockSendOnce.mockImplementation(async (_id: unknown, send: () => Promise<unknown>) => {
    await send();
    return { outcome: 'sent', idempotencyKey: 'k', messageId: 'm' };
  });
  mockGuardedSend.mockResolvedValue({ messageId: 'm' });
});

describe('what a request can choose', () => {
  it('offers a fixed set of templates and nothing else', () => {
    expect(Object.keys(NUDGE_TEMPLATES).sort()).toEqual(['project_start', 'quiet_check_in', 'weeks_1_3_reminder']);
    expect(isNudgeTemplate('quiet_check_in')).toBe(true);
    expect(isNudgeTemplate('anything_else')).toBe(false);
    expect(isNudgeTemplate('constructor')).toBe(false);   // not inherited from Object.prototype
  });

  it('renders each template with a subject and both bodies', () => {
    for (const key of Object.keys(NUDGE_TEMPLATES)) {
      const r = renderNudge(key as never, 'Sarbjit');
      expect(r.subject.length).toBeGreaterThan(5);
      expect(r.html).toContain('Sarbjit');
      expect(r.text).toContain('Sarbjit');
    }
  });

  it('falls back to a greeting rather than addressing nobody', () => {
    expect(renderNudge('quiet_check_in', '').text).toContain('Hi there,');
  });

  it('uses no em dashes, per the repo\'s outbound copy rule', () => {
    for (const key of Object.keys(NUDGE_TEMPLATES)) {
      const r = renderNudge(key as never, 'Sarbjit');
      expect(r.text).not.toMatch(/[—–]/);
      expect(r.html).not.toMatch(/[—–]/);
    }
  });
});

describe('the one free-text field', () => {
  it('appends the manager\'s note to both bodies', () => {
    const r = renderNudge('quiet_check_in', 'Sarbjit', 'Your week 2 lab looked close, want a hand?');

    expect(r.text).toContain('Your week 2 lab looked close');
    expect(r.html).toContain('Your week 2 lab looked close');
  });

  it('ESCAPES it, so no markup reaches a student\'s inbox', () => {
    // The only caller-supplied string that lands in an email body.
    const r = renderNudge('quiet_check_in', 'Sarbjit', '<img src=x onerror=alert(1)>');

    expect(r.html).toContain('&lt;img');
    expect(r.html).not.toContain('<img');
  });

  it('caps its length rather than mailing an essay', () => {
    const r = renderNudge('quiet_check_in', 'Sarbjit', 'x'.repeat(900));

    expect(r.text.match(/x+/)![0]).toHaveLength(400);
  });

  it('ignores a whitespace-only note instead of appending a blank line', () => {
    expect(renderNudge('quiet_check_in', 'Sarbjit', '   ')).toEqual(renderNudge('quiet_check_in', 'Sarbjit'));
  });
});

describe('it cannot send by accident', () => {
  it('is a DRY RUN by default', async () => {
    // Not an opt-out. A nudge that sends unless you remember a flag is one forgotten flag away from
    // mailing a real student from a test run.
    const out = await sendNudge(base);

    expect(out.outcome).toBe('dry_run');
    expect(mockSendOnce).not.toHaveBeenCalled();
    expect(mockGuardedSend).not.toHaveBeenCalled();
  });

  it('stays a dry run when asked for one explicitly', async () => {
    expect((await sendNudge({ ...base, dryRun: true })).outcome).toBe('dry_run');
    expect(mockGuardedSend).not.toHaveBeenCalled();
  });

  it('sends only when dryRun is explicitly false', async () => {
    const out = await sendNudge({ ...base, dryRun: false });

    expect(out.outcome).toBe('sent');
    expect(mockGuardedSend).toHaveBeenCalled();
  });

  it('reports the dry run with what WOULD have been sent', async () => {
    const out: any = await sendNudge(base);

    expect(out.to).toBe('intern@example.com');
    expect(out.subject).toBe('Checking in on your internship');
    expect(out.businessEventId).toContain('2026-10-02');
  });
});

describe('it cannot send twice', () => {
  it('keys one nudge per template, per intern, per DAY', () => {
    const a = nudgeBusinessEventId('quiet_check_in', 'app-1', NOW);

    expect(a).toBe('internship-nudge-quiet_check_in-app-1-2026-10-02');
    // Same day, same key: a retry or a double click is the same nudge.
    expect(nudgeBusinessEventId('quiet_check_in', 'app-1', new Date('2026-10-02T23:59:00Z'))).toBe(a);
    // Different day, different nudge.
    expect(nudgeBusinessEventId('quiet_check_in', 'app-1', new Date('2026-10-03T00:01:00Z'))).not.toBe(a);
    // Different template and different intern are different nudges too.
    expect(nudgeBusinessEventId('project_start', 'app-1', NOW)).not.toBe(a);
    expect(nudgeBusinessEventId('quiet_check_in', 'app-2', NOW)).not.toBe(a);
  });

  it('carries no time of day, which would defeat the ledger entirely', () => {
    // With a timestamp every retry is a "new" event and nothing is protected.
    expect(nudgeBusinessEventId('quiet_check_in', 'app-1', NOW)).not.toMatch(/\d{2}:\d{2}/);
  });

  it('hands that key to the ledger rather than inventing its own', async () => {
    await sendNudge({ ...base, dryRun: false });

    expect(mockSendOnce.mock.calls[0][0]).toMatchObject({
      recipient: 'intern@example.com',
      businessEventId: 'internship-nudge-quiet_check_in-app-1-2026-10-02',
    });
  });
});

describe('the stops', () => {
  it('refuses while the kill switch is active', async () => {
    mockKillSwitch.mockResolvedValue(true);

    const out: any = await sendNudge({ ...base, dryRun: false });

    expect(out.outcome).toBe('skipped');
    expect(out.reason).toBe('kill_switch_active');
    expect(mockGuardedSend).not.toHaveBeenCalled();
  });

  it('reports the kill switch even on a DRY run', async () => {
    // A dry run that cheerfully previews a message the system would refuse to send is misleading.
    mockKillSwitch.mockResolvedValue(true);

    expect((await sendNudge(base)).outcome).toBe('skipped');
  });

  it('refuses when there is no recipient rather than mailing nowhere', async () => {
    const out: any = await sendNudge({ ...base, to: '' });

    expect(out.outcome).toBe('skipped');
    expect(out.reason).toBe('no_recipient');
  });
});

describe('what goes on the wire', () => {
  it('BCCs Ali, per the standing rule that he keeps a copy of every send', async () => {
    await sendNudge({ ...base, dryRun: false });

    expect(mockGuardedSend.mock.calls[0][0].bcc).toBe('ali@colaberry.com');
  });

  it('sends to the resolved address and nothing else', async () => {
    await sendNudge({ ...base, dryRun: false });

    expect(mockGuardedSend.mock.calls[0][0].to).toBe('intern@example.com');
  });

  it('reports a transport failure instead of claiming a send', async () => {
    mockGuardedSend.mockRejectedValue(new Error('smtp refused'));
    mockSendOnce.mockImplementation(async (_id: unknown, send: () => Promise<any>) => {
      const r = await send();
      return r.ok ? { outcome: 'sent', idempotencyKey: 'k' } : { outcome: 'failed', idempotencyKey: 'k', ...r };
    });

    const out: any = await sendNudge({ ...base, dryRun: false });

    expect(out.outcome).toBe('failed');
    expect(out.error).toContain('smtp refused');
  });
});

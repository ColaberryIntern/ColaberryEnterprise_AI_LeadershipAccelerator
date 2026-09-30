/**
 * Off the campaign roster is not the same as "not a person".
 *
 * THE BUG THIS CLOSES
 *
 * The roster answers "who did the send harness mail", which is the right gate
 * for "may we auto-reply to them". It was also being used as the gate for
 * "should a human hear about this", and those are different questions. In the
 * 2026-08-25 window `not_campaign_recipient` fired 3,667 times and it is the
 * ONE skip reason that never escalates, so Sai Tejesh (staff) and Kepha Ohanga
 * (a student who simply was not on that campaign) were both seen, judged
 * strangers, and dropped in silence while waiting on an answer.
 *
 * WHY THE ROSTER COULD NOT SIMPLY BE REMOVED
 *
 * Checked rather than assumed: Basecamp sends from `notifications@`, and the
 * automated-sender guard matches only `mailer-daemon`, `postmaster`, `bounce`
 * and `no-reply`-shaped local parts, with no Precedence or Auto-Submitted
 * header on those messages. So the roster really is the only thing standing
 * between this watcher and the standup-notification flood that halted its first
 * live run. The first test below is the regression guard for exactly that, and
 * it is the one to run first if this file ever goes red.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runCycle, WatcherPorts, InboundMessage } from '../watcherRun';
import { SEND_LEDGER_FILENAME } from '../outboundIdentity';
import { WATCH_WINDOW_FILENAME } from '../watchWindow';

const ON_ROSTER = 'qninying@gmail.com';
const OFF_ROSTER_STUDENT = 'kephamo2004@gmail.com';   // deferred, not on this campaign
const OFF_ROSTER_STAFF = 'saitejesh@colaberry.com';   // staff, never on any campaign
const BASECAMP = 'notifications@3.basecamp.com';      // what it actually escalated

function stateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-offroster-'));
}

function writeLedger(dir: string, recipients: string[]): void {
  const lines = recipients.map((r, i) => JSON.stringify({
    type: 'sent', key: `key-${i}`, recipient: r,
    subject: 'Your build', business_event_id: 'evt-1',
    message_id: `<sent-${i}@colaberry.com>`,
  }));
  fs.writeFileSync(path.join(dir, SEND_LEDGER_FILENAME), `${lines.join('\n')}\n`);
}

function openWindow(dir: string): void {
  const started = new Date(Date.now() - 60_000);
  fs.writeFileSync(path.join(dir, WATCH_WINDOW_FILENAME), JSON.stringify({
    run_id: 'run-1',
    started_at: started.toISOString(),
    expires_at: new Date(started.getTime() + 30 * 3600_000).toISOString(),
    duration_hours: 30,
  }));
}

function inbound(from: string, threadId: string, body: string): InboundMessage {
  return {
    providerMessageId: `pm-${threadId}`,
    messageIdHeader: `<${threadId}@mail>`,
    threadId,
    fromAddress: from,
    fromName: null,
    subject: 'A question',
    bodyText: body,
    headers: {},
    receivedAt: new Date().toISOString(),
  };
}

/** `known` decides what the student/staff lookup reports for every address. */
function ports(messages: InboundMessage[], known: boolean | null) {
  const escalations: Array<{ threadKey: string; reason: string }> = [];
  const replies: string[] = [];
  const lookedUp: string[] = [];
  const p: WatcherPorts = {
    fetchRecentInbound: async () => messages,
    fetchThreadMessages: async (_t, fallback) => [fallback],
    sendReply: async (input) => {
      replies.push(input.to);
      return { providerMessageId: 'r1', messageIdHeader: '<r1@colaberry.com>' };
    },
    escalate: async (input) => { escalations.push({ threadKey: input.threadKey, reason: input.reason }); },
    data: {
      loadStudentFacts: async () => null,
      isKnownPerson: async (email: string) => { lookedUp.push(email); return known; },
      requestFreshLoginLink: async () => { throw new Error('must not be called'); },
    } as any,
  };
  return { ports: p, escalations, replies, lookedUp };
}

const OPTS = (dir: string) => ({
  stateDir: dir, runId: 'run-1', dryRun: false,
  caps: { perThread: 1, perRecipient: 2, perWindow: 15 },
});

describe('the flood guard that must not regress', () => {
  it('still drops a Basecamp notification silently, even though it is off-roster', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [ON_ROSTER]);
    // `known: false` is what the real lookup returns for a notifications address:
    // it is in neither the enrollments nor the admin table.
    const run = ports([inbound(BASECAMP, 'thread-bc', 'Quincy assigned you a to-do')], false);

    const out = await runCycle(run.ports, OPTS(dir));

    expect(run.escalations).toEqual([]);
    expect(run.replies).toEqual([]);
    expect(out.skipped).toBe(1);
    expect(out.escalated).toBe(0);
  });
});

describe('an off-roster PERSON reaches a human', () => {
  it('escalates a known student who was not on this campaign', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [ON_ROSTER]);
    const run = ports([inbound(OFF_ROSTER_STUDENT, 'thread-kepha', 'when does my payment resume?')], true);

    const out = await runCycle(run.ports, OPTS(dir));

    expect(run.escalations.map((e) => e.threadKey)).toEqual(['thread-kepha']);
    expect(run.escalations[0].reason).toBe('off_roster_known_person');
    // Escalated, never answered: the roster still governs auto-reply.
    expect(run.replies).toEqual([]);
    expect(out.escalated).toBe(1);
  });

  it('escalates a known staff member', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [ON_ROSTER]);
    const run = ports([inbound(OFF_ROSTER_STAFF, 'thread-sai', 'I cannot log in')], true);

    await runCycle(run.ports, OPTS(dir));

    expect(run.escalations.map((e) => e.threadKey)).toEqual(['thread-sai']);
    expect(run.replies).toEqual([]);
  });

  it('a failed lookup escalates rather than resolving to stranger', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [ON_ROSTER]);
    const run = ports([inbound(OFF_ROSTER_STUDENT, 'thread-dberr', 'a question')], null);

    await runCycle(run.ports, OPTS(dir));

    // "We could not check" must never read as "not a person" — that is exactly
    // how the original defect swallowed real mail.
    expect(run.escalations.map((e) => e.reason)).toEqual(['off_roster_lookup_failed']);
  });

  it('escalates an off-roster person only ONCE, not on every tick', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [ON_ROSTER]);
    const msgs = [inbound(OFF_ROSTER_STAFF, 'thread-once', 'still stuck')];

    const first = ports(msgs, true);
    await runCycle(first.ports, OPTS(dir));
    expect(first.escalations).toHaveLength(1);

    // Same message still sitting in the mailbox, which is what actually happens.
    const second = ports(msgs, true);
    await runCycle(second.ports, OPTS(dir));
    expect(second.escalations).toEqual([]);
  });
});

describe('the on-roster path is unchanged', () => {
  it('does not consult the person lookup for someone on the roster', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [ON_ROSTER]);
    const run = ports([inbound(ON_ROSTER, 'thread-on', 'my sign in link does not work')], false);

    await runCycle(run.ports, OPTS(dir));

    // The roster answered it. A lookup here would mean the gate moved, and a
    // `false` from it would wrongly drop a genuine campaign recipient.
    expect(run.lookedUp).toEqual([]);
  });
});

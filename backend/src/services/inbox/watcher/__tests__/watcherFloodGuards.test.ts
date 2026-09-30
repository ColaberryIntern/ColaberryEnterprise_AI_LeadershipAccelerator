/**
 * The two defects that made the watcher unsafe to run, and the guards that close
 * them. Both were found by RUNNING it, not by any test — which is the reason
 * these exist and the reason each one was watched failing first.
 *
 * 1. It re-escalated the same message on every tick. Measured on the live run:
 *    one thread escalated 7 times, and a second cycle escalated 17 having
 *    already escalated 7. At 12 ticks an hour across a 30-hour window that is
 *    thousands of emails to one person.
 * 2. It was not restricted to the campaign roster, so what it actually escalated
 *    was Basecamp standup notifications.
 *
 * The student-facing guards held throughout that run — zero emails reached a
 * student, zero tokens rotated — so the tests below deliberately re-assert those
 * too. A fix for a flooding bug must not buy quiet by loosening the guards that
 * were already right.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runCycle, WatcherPorts, InboundMessage } from '../watcherRun';
import { replayWatcherLog } from '../watcherLog';
import { SEND_LEDGER_FILENAME } from '../outboundIdentity';
import { WATCH_WINDOW_FILENAME } from '../watchWindow';

const STUDENT = 'qninying@gmail.com';
const OTHER_STUDENT = 'bfglz@yahoo.com';
/** A real Basecamp notification shape — this is what it was escalating. */
const BASECAMP = 'notifications@3.basecamp.com';

function stateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-flood-'));
}

/** A ledger naming exactly who the campaign mailed. */
function writeLedger(dir: string, recipients: string[]): void {
  const lines = recipients.map((r, i) => JSON.stringify({
    type: 'sent',
    key: `key-${i}`,
    recipient: r,
    subject: 'Your build, and a fresh sign in link',
    business_event_id: 'story000-unblock-2026-08-17',
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
    providerMessageId: `pm-${threadId}-${from}`,
    messageIdHeader: `<${threadId}-${from}@mail>`,
    threadId,
    fromAddress: from,
    fromName: null,
    subject: 'Re: Your build, and a fresh sign in link',
    bodyText: body,
    headers: {},
    receivedAt: new Date().toISOString(),
  };
}

/** Ports that record what left the process instead of sending it. */
function recordingPorts(messages: InboundMessage[]) {
  const escalations: string[] = [];
  const replies: string[] = [];
  const tokenRotations: string[] = [];
  const ports: WatcherPorts = {
    fetchRecentInbound: async () => messages,
    fetchThreadMessages: async (_t, fallback) => [fallback],
    sendReply: async (input) => {
      replies.push(input.to);
      return { providerMessageId: 'reply-1', messageIdHeader: '<reply-1@colaberry.com>' };
    },
    escalate: async (input) => { escalations.push(input.threadKey); },
    data: {
      loadStudentFacts: async () => null,
      requestFreshLoginLink: async (email: string) => {
        tokenRotations.push(email);
        return { ok: true } as any;
      },
    } as any,
  };
  return { ports, escalations, replies, tokenRotations };
}

const OPTS = (dir: string) => ({
  stateDir: dir,
  runId: 'run-1',
  dryRun: false,
  caps: { perThread: 1, perRecipient: 2, perWindow: 15 },
});

describe('defect 1 — a thread is escalated once, not on every tick', () => {
  it('does not escalate the same thread twice across two cycles', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    // Body deliberately says nothing classifiable, so it escalates.
    const msgs = [inbound(STUDENT, 'thread-A', 'hey, quick question about all this')];

    const first = recordingPorts(msgs);
    await runCycle(first.ports, OPTS(dir));
    expect(first.escalations).toEqual(['thread-A']);

    // Second cycle, same message still in the mailbox — which is exactly what
    // happens, because nothing marks a Gmail message as handled.
    const second = recordingPorts(msgs);
    const out = await runCycle(second.ports, OPTS(dir));

    expect(second.escalations).toEqual([]);
    expect(out.skipped).toBe(1);
  });

  it('survives a restart — the record is replayed from the log, not held in memory', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(STUDENT, 'thread-B', 'not sure what to do next here')];

    await runCycle(recordingPorts(msgs).ports, OPTS(dir));

    // A fresh replay is what a restarted process sees.
    const replayed = replayWatcherLog(dir);
    expect(replayed.escalatedThreads.has('thread-B')).toBe(true);

    const after = recordingPorts(msgs);
    await runCycle(after.ports, OPTS(dir));
    expect(after.escalations).toEqual([]);
  });

  it('records the attempt BEFORE the send, so a crash under-escalates', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(STUDENT, 'thread-C', 'something odd is happening')];

    const ports: WatcherPorts = {
      ...recordingPorts(msgs).ports,
      escalate: async () => { throw new Error('provider died mid-send'); },
    };

    await expect(runCycle(ports, OPTS(dir))).rejects.toThrow('provider died mid-send');

    // The thread must still be closed. A crash that frees the slot is how the
    // flood restarts on the next tick.
    expect(replayWatcherLog(dir).escalatedThreads.has('thread-C')).toBe(true);
  });

  it('escalates two DIFFERENT threads — the guard is per thread, not a global latch', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT, OTHER_STUDENT]);
    const msgs = [
      inbound(STUDENT, 'thread-D', 'a question'),
      inbound(OTHER_STUDENT, 'thread-E', 'a different question'),
    ];

    const run = recordingPorts(msgs);
    await runCycle(run.ports, OPTS(dir));

    expect(run.escalations.sort()).toEqual(['thread-D', 'thread-E']);
  });
});

describe('defect 2 — only the campaign roster is considered', () => {
  it('ignores a Basecamp notification instead of escalating it', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(BASECAMP, 'thread-bc', 'Quincy assigned you a to-do')];

    const run = recordingPorts(msgs);
    const out = await runCycle(run.ports, OPTS(dir));

    expect(run.escalations).toEqual([]);
    expect(run.replies).toEqual([]);
    expect(out.skipped).toBe(1);
    expect(out.escalated).toBe(0);
  });

  it('still considers a real campaign recipient in the same batch', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [
      inbound(BASECAMP, 'thread-bc2', 'standup reminder'),
      inbound(STUDENT, 'thread-real', 'I am stuck on the repo step'),
    ];

    const run = recordingPorts(msgs);
    await runCycle(run.ports, OPTS(dir));

    // The noise is dropped and the student is not.
    expect(run.escalations).toEqual(['thread-real']);
  });

  it('matches a `Name <addr>` sender, which is how Gmail hands them back', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(`Quincy Ninying <${STUDENT}>`, 'thread-F', 'a question')];

    const run = recordingPorts(msgs);
    await runCycle(run.ports, OPTS(dir));

    expect(run.escalations).toEqual(['thread-F']);
  });

  /**
   * The case I got wrong first, and the existing suite caught.
   *
   * My first version made a missing ledger mean "the roster is empty, so nobody
   * is on it" — which quietly reversed this module's contract that an
   * unavailable ledger degrades to ESCALATE-ONLY, not to silence. A human still
   * hears about every message; the watcher just stops sending. What makes that
   * safe from flooding is the per-thread record, not a roster.
   */
  it('with no ledger it still tells a human, but only ONCE per thread', async () => {
    const dir = stateDir();
    openWindow(dir);
    // No ledger written at all — the roster is unknown, not empty.
    const msgs = [inbound(STUDENT, 'thread-G', 'a question')];

    const first = recordingPorts(msgs);
    const out = await runCycle(first.ports, OPTS(dir));

    expect(out.escalateOnly).toBe(true);
    expect(first.escalations).toEqual(['thread-G']);   // degrades to a human
    expect(first.replies).toEqual([]);                 // but sends nothing itself

    // And the flood is still closed, which is what makes the above safe.
    const second = recordingPorts(msgs);
    await runCycle(second.ports, OPTS(dir));
    expect(second.escalations).toEqual([]);
  });
});

describe('the guards that already held must keep holding', () => {
  it('a dry run sends nothing and rotates no token', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(STUDENT, 'thread-H', 'my sign in link does not work')];

    const run = recordingPorts(msgs);
    const out = await runCycle(run.ports, { ...OPTS(dir), dryRun: true });

    expect(run.escalations).toEqual([]);
    expect(run.replies).toEqual([]);
    expect(run.tokenRotations).toEqual([]);
    expect(out.sent).toBe(0);
  });

  it('a BCC self-copy is not treated as a student reply', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const ours = inbound(STUDENT, 'thread-I', 'the campaign body');
    ours.messageIdHeader = '<sent-0@colaberry.com>';   // the ledger's own id

    const run = recordingPorts([ours]);
    const out = await runCycle(run.ports, OPTS(dir));

    expect(run.escalations).toEqual([]);
    expect(out.skipped).toBe(1);
  });
});

/**
 * Defect 3 — found by reading the 2026-08-19 window's own log, not by a test.
 *
 * That window ran escalate-only by setting WATCHER_MAX_REPLIES_TOTAL=0, which
 * makes `checkCaps` block EVERY candidate. The cap-blocked branch called
 * `ports.escalate()` directly instead of going through `escalateWith()`, so it
 * skipped both invariants this file exists to defend: it never consulted
 * `escalatedThreads`, and it wrote its log line AFTER the send rather than
 * before. The measured result was 143 escalation events across 43 distinct
 * threads — 33 of them to one person — which is defect 1 again, through a door
 * that was left open.
 *
 * The suite missed it because the fixture above says `perWindow: 15` where
 * CapLimits declares `total`. `sent.length >= undefined` is false, so no test
 * in this file had ever reached the cap branch at all.
 */
describe('defect 3 — a cap-blocked escalation is still one per thread', () => {
  /** Exactly the shape the live window ran: every message hits the total cap. */
  const CAPPED = (dir: string) => ({
    stateDir: dir,
    runId: 'run-1',
    dryRun: false,
    caps: { perThread: 1, perRecipient: 2, total: 0 },
  });

  /** Classifiable, so it reaches the cap check rather than escalating earlier. */
  const REPO_ISSUE = 'I cannot connect my github repo';

  it('does not re-escalate a capped thread on the next tick', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(STUDENT, 'thread-cap-A', REPO_ISSUE)];

    const first = recordingPorts(msgs);
    const out1 = await runCycle(first.ports, CAPPED(dir));
    expect(first.escalations).toEqual(['thread-cap-A']);
    expect(out1.sent).toBe(0);

    // The same message is still sitting in the mailbox on the next tick.
    const second = recordingPorts(msgs);
    await runCycle(second.ports, CAPPED(dir));
    expect(second.escalations).toEqual([]);
  });

  it('records the capped attempt BEFORE the send, so a crash under-escalates', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(STUDENT, 'thread-cap-B', REPO_ISSUE)];

    const ports: WatcherPorts = {
      ...recordingPorts(msgs).ports,
      escalate: async () => { throw new Error('provider died mid-send'); },
    };

    await expect(runCycle(ports, CAPPED(dir))).rejects.toThrow('provider died mid-send');
    expect(replayWatcherLog(dir).escalatedThreads.has('thread-cap-B')).toBe(true);
  });

  it('still reaches a human once for each distinct capped thread', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT, OTHER_STUDENT]);
    const msgs = [
      inbound(STUDENT, 'thread-cap-C', REPO_ISSUE),
      inbound(OTHER_STUDENT, 'thread-cap-D', REPO_ISSUE),
    ];

    const run = recordingPorts(msgs);
    await runCycle(run.ports, CAPPED(dir));
    expect(run.escalations.sort()).toEqual(['thread-cap-C', 'thread-cap-D']);
  });
});

/**
 * Filing an answered thread out of the inbox.
 *
 * The capability question was settled against the live OAuth token rather than
 * against `gmailService.ts`, whose SCOPES constant still says readonly+send
 * while the granted refresh token carries gmail.modify. Reading the source
 * would have produced a confident "it cannot move mail", which is wrong.
 */
describe('answered threads are filed, escalated ones are not', () => {
  function filingPorts(messages: InboundMessage[], opts: { fail?: boolean } = {}) {
    const base = recordingPorts(messages);
    const filed: string[] = [];
    const ports: WatcherPorts = {
      ...base.ports,
      data: {
        loadStudentFacts: async () => ({
          email: STUDENT, name: 'Quincy', activeEnrollmentCount: 1, enrollmentId: 'e1',
          portalTokenExpiresAt: null, projectId: 'p1', githubRepo: 'acme/repo',
          webhookRegistered: true, webhookLastDeliveryAt: null,
          story000Present: true, acceptanceCriteriaCount: 4, unverifiable: [],
        }),
        requestFreshLoginLink: async () => { throw new Error('must never be called'); },
      } as any,
      fileThread: async ({ threadKey }) => {
        if (opts.fail) throw new Error('gmail said no');
        filed.push(threadKey);
      },
    };
    return { ports, filed, base };
  }

  it('files a thread only after the reply is actually sent', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(STUDENT, 'thread-file-A', 'I cannot connect my github repo')];

    const run = filingPorts(msgs);
    const out = await runCycle(run.ports, OPTS(dir));

    expect(out.sent).toBe(1);
    expect(run.filed).toEqual(['thread-file-A']);

    const events = replayWatcherLog(dir);
    expect(events.answeredThreads.has('thread-file-A')).toBe(true);
  });

  it('leaves an ESCALATED thread in the inbox, because a handoff is not a resolution', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    // Unclassifiable, so it escalates rather than being answered.
    const msgs = [inbound(STUDENT, 'thread-file-B', 'hello, a general musing')];

    const run = filingPorts(msgs);
    const out = await runCycle(run.ports, OPTS(dir));

    expect(out.escalated).toBe(1);
    expect(out.sent).toBe(0);
    expect(run.filed).toEqual([]);
  });

  it('a filing failure does not fail the cycle or unsend the reply', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(STUDENT, 'thread-file-C', 'I cannot connect my github repo')];

    const run = filingPorts(msgs, { fail: true });
    const out = await runCycle(run.ports, OPTS(dir));

    expect(out.sent).toBe(1);
    expect(run.filed).toEqual([]);
  });

  it('a dry run files nothing', async () => {
    const dir = stateDir();
    openWindow(dir);
    writeLedger(dir, [STUDENT]);
    const msgs = [inbound(STUDENT, 'thread-file-D', 'I cannot connect my github repo')];

    const run = filingPorts(msgs);
    const out = await runCycle(run.ports, { ...OPTS(dir), dryRun: true });

    expect(out.sent).toBe(0);
    expect(run.filed).toEqual([]);
  });
});

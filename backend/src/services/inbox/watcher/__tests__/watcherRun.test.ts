/**
 * The cycle, wired together with fake ports.
 *
 * The unit tests prove each guard works. This one proves they are actually
 * CONNECTED — that the ledger reaches the guard, the guard reaches the
 * classifier, the cap reaches the escalation, and that nothing reaches the wire
 * in dry run. Every one of those is a seam, and a seam is where two correct
 * halves fail to meet.
 */

process.env.CORA_SUPPORT_ADDRESS = 'support@colaberry.com';
process.env.CORA_MAILBOX_ADDRESS = 'ali@colaberry.com';

import fs from 'fs';
import os from 'os';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runCycle } = require('../watcherRun');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { openWindow } = require('../watchWindow');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendLedgerPath, OUTBOUND_COPY_HEADER } = require('../outboundIdentity');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { watcherLogPath } = require('../watcherLog');

const BUSINESS_EVENT = 'story000-unblock-2026-08-17';
const CAPS = { perThread: 1, perRecipient: 2, total: 3 };
const RUN_ID = 'test-run';

let dir: string;
let sent: any[];
let escalations: any[];
/** Every address the cycle asked to have a fresh login link minted for. */
let mutations: string[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-cycle-'));
  sent = [];
  escalations = [];
  mutations = [];
  openWindow(dir, { now: new Date('2026-08-17T02:00:00.000Z'), runId: RUN_ID });
  fs.writeFileSync(
    sendLedgerPath(dir),
    JSON.stringify({
      ts: '2026-08-17T02:05:00.000Z', type: 'sent', key: 'k1', recipient: 'bfglz@yahoo.com',
      subject: 'Your build, and a fresh sign in link', business_event_id: BUSINESS_EVENT,
      message_id: '<campaign-1@colaberry.com>',
    }) + '\n',
  );
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const NOW = new Date('2026-08-17T04:00:00.000Z');

const bccCopy = {
  providerMessageId: 'g-1', messageIdHeader: '<campaign-1@colaberry.com>', threadId: 't1',
  fromAddress: '"Ali Muwwakkil" <ali@colaberry.com>', fromName: 'Ali Muwwakkil',
  subject: 'Your build, and a fresh sign in link', bodyText: 'Sign in at /portal/login. Your link has expired.',
  headers: { 'message-id': '<campaign-1@colaberry.com>', [OUTBOUND_COPY_HEADER.toLowerCase()]: BUSINESS_EVENT },
  receivedAt: '2026-08-17T02:05:00.000Z',
};

const studentReply = (over: Partial<any> = {}) => ({
  providerMessageId: 'g-2', messageIdHeader: '<student-1@yahoo.com>', threadId: 't1',
  fromAddress: 'Liza Ayele <bfglz@yahoo.com>', fromName: 'Liza Ayele',
  subject: 'Re: Your build, and a fresh sign in link',
  bodyText: 'The sign in link has expired again, I still cannot get in.',
  headers: { 'message-id': '<student-1@yahoo.com>' },
  receivedAt: '2026-08-17T03:00:00.000Z',
  ...over,
});

function facts(over: Partial<any> = {}) {
  return {
    email: 'bfglz@yahoo.com', name: 'Liza Ayele', activeEnrollmentCount: 1, enrollmentId: 'e1',
    portalTokenExpiresAt: '2026-08-15T20:41:59.000Z', projectId: 'p1', githubRepo: null,
    webhookRegistered: false, webhookLastDeliveryAt: null, story000Present: true,
    acceptanceCriteriaCount: 5, unverifiable: [], ...over,
  };
}

/**
 * `linkLands` and `postRepairExpiry` are gone with the repair they configured.
 * `requestFreshLoginLink` is deliberately still WIRED, and still records into
 * `mutations`, even though nothing calls it: a spy on a port that should never
 * fire is how a regression that reintroduces the call gets caught.
 */
function makePorts(messages: any[]) {
  return {
    fetchRecentInbound: async () => messages,
    fetchThreadMessages: async (threadId: string | null) =>
      messages.filter((m) => m.threadId === threadId),
    sendReply: async (input: any) => {
      sent.push(input);
      return { providerMessageId: 'g-reply-1', messageIdHeader: '<watcher-reply-1@colaberry.com>' };
    },
    escalate: async (input: any) => { escalations.push(input); },
    data: {
      loadStudentFacts: async () => facts(),
      requestFreshLoginLink: async (email: string) => { mutations.push(email); },
    },
  };
}

const readLog = (): any[] =>
  fs.readFileSync(watcherLogPath(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

describe("Ali's 25 BCC copies do not become 25 replies", () => {
  it('skips every self-copy and sends nothing, with the ledger named as the reason', async () => {
    const copies = Array.from({ length: 25 }, (_, i) => ({
      ...bccCopy, providerMessageId: `g-${i}`, threadId: `t${i}`,
    }));
    const out = await runCycle(makePorts(copies), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });
    expect(out.seen).toBe(25);
    expect(out.skipped).toBe(25);
    expect(out.sent).toBe(0);
    expect(escalations).toEqual([]);
    const reasons = new Set(readLog().filter((e) => e.type === 'skipped').map((e) => e.reason));
    expect([...reasons]).toEqual(['our_own_outbound_ledger']);
  });
});

/**
 * ── THE DEFECT THESE TESTS EXIST FOR ────────────────────────────────────────
 *
 * The dry run reached `diagnose()` before it checked `dryRun`, and the
 * `login_link` diagnosis APPLIES ITS REPAIR — it calls requestFreshLoginLink,
 * which rotates a real student's portal token and mails them a real magic link,
 * and only then re-reads the row to verify. So "rehearsing" the watcher rotated
 * live tokens and mailed students, on a run whose entire documented contract is
 * "sends nothing, writes only the log".
 *
 * A rehearsal that mutates is not a rehearsal. The order is now: classify,
 * then stop. Nothing downstream of the dry-run check may touch a student.
 */
describe('a dry run is genuinely inert', () => {
  it('does NOT mint a fresh login link, so no live token is rotated by a rehearsal', async () => {
    await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: true, caps: CAPS, now: NOW,
    });

    expect(mutations).toEqual([]);
  });

  it('reaches nothing, while the live run on the same input reaches the wire', async () => {
    await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: true, caps: CAPS, now: NOW,
    });
    expect(mutations).toEqual([]);
    expect(sent).toEqual([]);

    // The positive control this test exists to be.
    //
    // It used to read `expect(mutations).toEqual(['bfglz@yahoo.com'])` -- the
    // live run reached a real repair, so the dry run's empty `mutations` was
    // the check working rather than the fixture stopping short. There is no
    // repair to reach any more, so the control moves to the wire: the same
    // input sends on a live run and sent nothing on the rehearsal. Without a
    // control in one direction or the other, an assertion that nothing happened
    // is indistinguishable from a fixture that never got there.
    await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });
    expect(sent).toHaveLength(1);
    expect(mutations).toEqual([]);   // and no token was rotated on either path
  });

  it('puts no escalation on the wire either, and records why in the log', async () => {
    const refund = studentReply({
      providerMessageId: 'g-9', messageIdHeader: '<student-9@yahoo.com>', threadId: 't9',
      bodyText: 'I want a refund for the yearly subscription, please.',
    });

    const out = await runCycle(makePorts([refund]), {
      stateDir: dir, runId: RUN_ID, dryRun: true, caps: CAPS, now: NOW,
    });

    expect(escalations).toEqual([]);
    expect(out.sent).toBe(0);
    const suppressedEscalations = readLog().filter((e) => e.type === 'escalation_suppressed');
    expect(suppressedEscalations).toHaveLength(1);
    expect(suppressedEscalations[0].dry_run).toBe(true);
  });
});

describe('dry run is the default posture and reaches no wire', () => {
  it('classifies a reply, records what it would answer, and reaches nothing', async () => {
    const out = await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: true, caps: CAPS, now: NOW,
    });
    expect(out.sent).toBe(0);
    expect(out.suppressed).toBe(1);
    expect(sent).toEqual([]);
    const suppressed = readLog().find((e) => e.type === 'reply_suppressed');
    expect(suppressed.reason).toBe('dry_run');
    expect(suppressed.issue_class).toBe('login_link');
  });

  it('does not consume a reply ceiling, so a later live run is not pre-exhausted', async () => {
    await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: true, caps: CAPS, now: NOW,
    });
    const out = await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });
    expect(out.sent).toBe(1);
  });
});

describe('a real student reply is answered once and only once', () => {
  it('sends one reply that states what was checked, and only what was checked', async () => {
    const out = await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });
    expect(out.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('Liza Ayele <bfglz@yahoo.com>');
    expect(sent[0].threadId).toBe('t1');
    expect(sent[0].inReplyTo).toBe('<student-1@yahoo.com>');

    const record = readLog().find((e) => e.type === 'reply_sent');
    // One claim, and it is a reading rather than a repair. This used to assert
    // two claims, the second of which was 'I confirmed it is live until ...'
    // about a token the watcher had just minted. Nothing is minted now, so a
    // second claim reappearing here means something started acting again.
    expect(record.claims).toHaveLength(1);
    expect(record.claims[0]).toContain('exactly one active enrollment');
    // No post-change evidence, because there was no change to confirm.
    expect(record.evidence.filter((e: any) => e.postChange === true)).toHaveLength(0);
    expect(record.evidence.length).toBeGreaterThan(0);
    expect(record.reply_message_id).toBe('<watcher-reply-1@colaberry.com>');
    // What it claimed is recorded next to what it actually read.
    expect(record.evidence[0].what).toContain('enrollments');
  });

  it('refuses a second reply on the same thread and escalates instead', async () => {
    await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });
    escalations = [];
    const out = await runCycle(
      makePorts([bccCopy, studentReply({ providerMessageId: 'g-3', messageIdHeader: '<student-2@yahoo.com>' })]),
      { stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW },
    );
    expect(out.sent).toBe(0);
    expect(escalations).toHaveLength(1);
    expect(escalations[0].reason).toBe('cap_per_thread');
  });
});

/**
 * This block used to be 'a fix that did not land is not claimed', and it proved
 * the watcher escalated rather than telling a student a link was live when the
 * re-read disagreed. That scenario cannot arise now -- no link is minted, so
 * there is no repair whose landing could be misreported.
 *
 * The risk it was guarding did not go away though, it just moved: the reply
 * still has to avoid implying a repair it did not perform. So the assertions
 * point at the words on the wire instead of at the verification step.
 */
describe('the login_link reply claims nothing it did not do', () => {
  it('points at the login page, mints nothing, and asserts no repair', async () => {
    const out = await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });

    expect(out.sent).toBe(1);
    expect(mutations).toEqual([]);

    const body = sent[0].body;
    expect(body).toContain('https://enterprise.colaberry.ai/portal/login');
    // The phrasings a student would read as "it is done". The claim gate
    // refuses these unless a verified fix claim backs them, and this reply
    // carries only 'checked' claims.
    expect(body).not.toMatch(/is now (?:working|fixed|active|resolved)/i);
    expect(body).not.toMatch(/has been (?:fixed|resolved|corrected|restored)/i);
    expect(body).not.toMatch(/should work now/i);
    expect(body).not.toMatch(/I have just sent you a fresh sign in link/i);

    const attempt = readLog().find((e: any) => e.type === 'reply_attempt');
    expect(attempt.claims).toHaveLength(1);
  });

  /**
   * The Million Meshesha guard, which survives the repair being withdrawn.
   * Two active rows means the watcher cannot tell which seat the student is
   * asking about, so it reports on none of them.
   */
  it('escalates rather than answering when the address is not singular', async () => {
    const ports: any = makePorts([bccCopy, studentReply()]);
    ports.data.loadStudentFacts = async () => facts({ activeEnrollmentCount: 2 });

    const out = await runCycle(ports, {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });

    expect(out.sent).toBe(0);
    expect(sent).toEqual([]);
    expect(escalations).toHaveLength(1);
    expect(escalations[0].reason).toBe('diagnosis_login_link');
  });
});

describe('escalate-only when the watcher cannot identify its own mail', () => {
  it('sends nothing and escalates when the send ledger is missing', async () => {
    fs.rmSync(sendLedgerPath(dir));
    const out = await runCycle(makePorts([studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });
    expect(out.escalateOnly).toBe(true);
    expect(out.sent).toBe(0);
    expect(escalations).toHaveLength(1);
    expect(escalations[0].reason).toBe('send_ledger_missing');
  });
});

describe('the window and the kill switch stop the cycle before anything is read', () => {
  it('does nothing once the 30 hours are up', async () => {
    const out = await runCycle(makePorts([studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS,
      now: new Date('2026-08-18T08:00:00.000Z'),
    });
    expect(out.status).toBe('expired');
    expect(out.reason).toBe('window_elapsed');
    expect(out.seen).toBe(0);
    expect(sent).toEqual([]);
  });

  it('logs the expiry once, so the elapsed window costs one line and not one per tick', async () => {
    const expiredOpts = {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS,
      now: new Date('2026-08-18T08:00:00.000Z'),
    };
    await runCycle(makePorts([studentReply()]), expiredOpts);

    await runCycle(makePorts([studentReply()]), {
      ...expiredOpts, now: new Date('2026-08-18T08:05:00.000Z'),
    });

    // Two expired ticks, one `window_expired` record. The leftover cron entry
    // fired 288 times a day and appended one of these on every single one.
    expect(readLog().filter((e) => e.type === 'window_expired')).toHaveLength(1);
  });

  it('still reports expired on the tick it stays quiet for', async () => {
    const expiredOpts = {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS,
      now: new Date('2026-08-18T08:00:00.000Z'),
    };
    await runCycle(makePorts([studentReply()]), expiredOpts);

    const second = await runCycle(makePorts([studentReply()]), {
      ...expiredOpts, now: new Date('2026-08-18T08:05:00.000Z'),
    });

    expect(second.status).toBe('expired');
  });

  it('does nothing when the kill file is present, without even reading the mailbox', async () => {
    fs.writeFileSync(path.join(dir, 'WATCHER-HALT'), '');
    const ports = makePorts([studentReply()]);
    let fetched = 0;
    const counting = { ...ports, fetchRecentInbound: async () => { fetched++; return [studentReply()]; } };
    const out = await runCycle(counting, {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });
    expect(out.status).toBe('halted');
    expect(out.reason).toBe('watcher_halt_file');
    expect(sent).toEqual([]);
    // The top-of-cycle check is what makes this true. Reaching the mailbox at
    // all would mean the kill only lands at the per-message check below.
    expect(fetched).toBe(0);
  });

  it('stops between composing and sending when the kill lands mid-cycle', async () => {
    // The halt appears after the cycle started: the last-look check before the
    // wire is the only thing that can catch this one.
    const ports = makePorts([bccCopy, studentReply()]);
    const racing = {
      ...ports,
      fetchRecentInbound: async () => {
        fs.writeFileSync(path.join(dir, 'WATCHER-HALT'), '');
        return [bccCopy, studentReply()];
      },
    };
    const out = await runCycle(racing, {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });
    expect(out.status).toBe('halted');
    expect(sent).toEqual([]);
    const halted = readLog().find((e) => e.type === 'halted');
    expect(halted.detail).toBe('Halted between composing and sending. Nothing was sent.');
  });

  it("stops when the send harness's own HALT file is present", async () => {
    fs.writeFileSync(path.join(dir, 'HALT'), '');
    const out = await runCycle(makePorts([studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });
    expect(out.status).toBe('halted');
    expect(out.reason).toBe('campaign_halt_file');
  });
});

describe('escalations reach Ali rather than becoming silence', () => {
  it('escalates a refund request without replying to it', async () => {
    const out = await runCycle(
      makePorts([bccCopy, studentReply({ bodyText: 'My link expired. Actually I want a refund.' })]),
      { stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW },
    );
    expect(out.sent).toBe(0);
    expect(escalations).toHaveLength(1);
    expect(escalations[0].reason).toBe('refund_withdraw_cancel');
  });

  it('escalates an unclassifiable message', async () => {
    const out = await runCycle(
      makePorts([bccCopy, studentReply({ bodyText: 'Thanks Ali, appreciate the update.' })]),
      { stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW },
    );
    expect(out.sent).toBe(0);
    expect(escalations[0].reason).toBe('unclassifiable');
  });
});

/**
 * ── THE DEFECT THIS TEST EXISTS FOR ─────────────────────────────────────────
 *
 * `runCycle` resolves a clock (`opts.now ?? new Date()`) and threads it
 * everywhere -- except that it used to hand `diagnose()` a fresh `new Date()`,
 * and `diagnose` then read the wall clock AGAIN for the one comparison that
 * decided whether the repair had landed. The injected clock was dead at the
 * only point it decided anything.
 *
 * What that cost: the suite pinned `now` to 2026-08-17 and minted a token
 * expiring 2026-08-18T04:00:05Z. It passed until real time crossed that
 * instant, and then every live run read its own freshly-minted token as already
 * expired and escalated instead of replying. main went red mid-morning on
 * 2026-08-18 with nobody having touched the watcher. A test that fails by
 * calendar tells you nothing about the code on the day it breaks.
 *
 * The `landed` comparison is gone with the repair, so the original
 * discriminator (a token live on the cycle clock and expired on the wall clock)
 * has nothing left to discriminate. The clock is still threaded through
 * `diagnose()` and still decides something visible: every piece of evidence is
 * stamped with it. Asserting on that keeps a real guard here rather than
 * deleting the file's memory of why the seam matters.
 */
describe('the cycle honours its injected clock', () => {
  it('stamps the reply evidence with the cycle clock, not the wall clock', async () => {
    const out = await runCycle(makePorts([bccCopy, studentReply()]), {
      stateDir: dir, runId: RUN_ID, dryRun: false, caps: CAPS, now: NOW,
    });

    expect(out.sent).toBe(1);
    const attempt = readLog().find((e: any) => e.type === 'reply_attempt');
    expect(attempt.evidence).not.toHaveLength(0);
    for (const item of attempt.evidence) {
      expect(item.at).toBe(NOW.toISOString());
    }

    // The pinned instant is far behind real time, so an implementation that
    // reached for `new Date()` would stamp something else and fail here. That
    // gap widens with age rather than rotting.
    expect(NOW.getTime()).toBeLessThan(Date.now());
    expect(sent[0].to).toBe('Liza Ayele <bfglz@yahoo.com>');
  });
});

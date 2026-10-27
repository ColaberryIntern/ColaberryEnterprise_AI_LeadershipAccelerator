/**
 * agentNudgeSend - the seam between a measured state and a builder's inbox.
 *
 * The composer and the state loader have their own suites and need no database. This file covers
 * the three things only the seam can get wrong:
 *
 *   1. the manual button and the weekday run DISAGREE about `decideNudge`, on purpose;
 *   2. nothing leaves without `send: true`, and the kill switch beats even a preview;
 *   3. one builder's failure does not cost the other six their nudge.
 *
 * ## What is mocked, and what is deliberately real
 *
 * `loadAgentNudgeStates` is mocked so a state can be handed in directly; its SQL and its date
 * arithmetic are covered in `agentNudgeState.test.ts`. `assertAgentBuilder` and `agentNudgeEventId`
 * are the REAL implementations, because they are the guard and the idempotency key and a stub of
 * either would make this file prove nothing.
 *
 * `sendOnce` is replaced with a faithful stand-in that actually invokes the provider callback, so
 * the assertions about what reaches the transport (recipient, BCC, subject) are assertions about
 * real arguments. Its ledger arbitration is enforced by a UNIQUE index and is covered by
 * `email/__tests__` against a real database; what is asserted here is the identity handed to it,
 * because a stable business event is the half of idempotency this module owns.
 */

import type { AgentNudgeState } from '../agentNudgeComposer';

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

const mockGuardedSendMail = jest.fn();
jest.mock('../../emailService', () => ({
  guardedSendMail: (...a: unknown[]) => mockGuardedSendMail(...a),
}));

const mockKillSwitch = jest.fn();
jest.mock('../../launchSafety', () => ({
  isKillSwitchActive: () => mockKillSwitch(),
}));

/** Faithful stand-in: claim, call the provider, report its outcome. */
const mockSendOnce = jest.fn(async (_id: any, send: () => Promise<any>) => {
  const r = await send();
  return r.ok
    ? { outcome: 'sent', ledgerId: 'L1', idempotencyKey: 'K1', messageId: r.messageId }
    : { outcome: 'failed', ledgerId: 'L1', idempotencyKey: 'K1', errorClass: r.errorClass, error: r.error };
});
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: (...a: any[]) => (mockSendOnce as any)(...a),
}));

const mockLoad = jest.fn();
jest.mock('../agentNudgeState', () => {
  const actual = jest.requireActual('../agentNudgeState');
  return { ...actual, loadAgentNudgeStates: (...a: unknown[]) => mockLoad(...a) };
});

import { previewAgentNudges, sendAllNudges, sendOneNudge } from '../agentNudgeSend';

/** A quiet builder: nothing committed for days, nobody owed a reply. The weekday run sends. */
function stateFor(overrides: Partial<AgentNudgeState> = {}): AgentNudgeState {
  return {
    domain: 'hr',
    agent: 'Dara',
    firstName: 'Robin',
    email: 'robin@example.test',
    band: 'red',
    daysSinceCommit: 8,
    verified: 1,
    stories: 12,
    overdue: 3,
    gradeableStories: 12,
    nextStory: { storyId: 'HR.004', title: 'Wire the intake form', dueOn: '2026-10-20', gradeable: true },
    lastVerifiedStoryId: 'HR.003',
    recentCommitSubjects: [],
    daysSinceTheyWrote: 9,
    awaitingOurReply: false,
    peersDoneWithNextStory: 2,
    priorNudgeCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([{ now: '2026-10-26T14:00:00.000Z' }]);
  mockKillSwitch.mockResolvedValue(false);
  mockGuardedSendMail.mockResolvedValue({ messageId: 'mid-1' });
  mockLoad.mockResolvedValue([stateFor()]);
  mockSendOnce.mockImplementation(async (_id: any, send: () => Promise<any>) => {
    const r = await send();
    return r.ok
      ? { outcome: 'sent', ledgerId: 'L1', idempotencyKey: 'K1', messageId: r.messageId }
      : { outcome: 'failed', ledgerId: 'L1', idempotencyKey: 'K1', errorClass: r.errorClass, error: r.error };
  });
});

// ─────────────────────────── nothing leaves without being asked ───────────────────────────

describe('a send has to be asked for', () => {
  it('defaults to a dry run on the single path', async () => {
    const r = await sendOneNudge('hr');
    expect(r.outcome).toBe('dry_run');
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });

  it('defaults to a dry run on the bulk path', async () => {
    const r = await sendAllNudges();
    expect(r.sent).toBe(0);
    expect(r.outcomes.map((o) => o.outcome)).toEqual(['dry_run']);
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });

  it('sends only when dryRun is explicitly false', async () => {
    const r = await sendOneNudge('hr', { dryRun: false });
    expect(r.outcome).toBe('sent');
    expect(mockGuardedSendMail).toHaveBeenCalledTimes(1);
  });

  /**
   * MUTATION PROOF. Move the kill-switch check below the dry-run branch and this dies: the preview
   * returns `dry_run` while the system would in fact refuse to send. A preview that renders a
   * message the system has stopped is worse than no preview, because it reads as approval.
   */
  it('the kill switch beats even a preview', async () => {
    mockKillSwitch.mockResolvedValue(true);
    const dry = await sendOneNudge('hr');
    const live = await sendOneNudge('hr', { dryRun: false });
    expect(dry).toMatchObject({ outcome: 'skipped', reason: 'kill_switch_active' });
    expect(live).toMatchObject({ outcome: 'skipped', reason: 'kill_switch_active' });
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });
});

// ─────────────────────────── the two callers disagree on purpose ───────────────────────────

describe('the manual button overrides the automatic verdict; the bulk run honors it', () => {
  const movedToday = stateFor({
    daysSinceCommit: 0, band: 'green', recentCommitSubjects: ['wire the intake form'],
  });

  it('bulk SKIPS someone who moved today, and says why', async () => {
    mockLoad.mockResolvedValue([movedToday]);
    const r = await sendAllNudges({ dryRun: false });
    expect(r.outcomes[0]).toMatchObject({ outcome: 'skipped', reason: 'moved_recently' });
    expect(r.attempted).toBe(0);
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });

  it('bulk SKIPS someone we owe a reply to', async () => {
    mockLoad.mockResolvedValue([stateFor({ awaitingOurReply: true })]);
    const r = await sendAllNudges({ dryRun: false });
    expect(r.outcomes[0]).toMatchObject({ outcome: 'skipped', reason: 'awaiting_our_reply' });
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });

  /**
   * MUTATION PROOF. Add `if (!decideNudge(state).send) return skipped` to `sendOneNudge` and this
   * dies. A manager clicking send on a builder who just committed wants the congratulations, and a
   * button that silently refuses with the preview on screen is a button that lies.
   */
  it('the single path SENDS to someone the bulk run would skip', async () => {
    mockLoad.mockResolvedValue([movedToday]);
    const r = await sendOneNudge('hr', { dryRun: false });
    expect(r.outcome).toBe('sent');
    expect(mockGuardedSendMail).toHaveBeenCalledTimes(1);
  });

  it('and REPORTS the verdict it overrode, rather than discarding it', async () => {
    mockLoad.mockResolvedValue([movedToday]);
    const r = await sendOneNudge('hr', { dryRun: false });
    // Without this the console could not say "sent, though the run would have held this one".
    expect(r.decision).toEqual({ send: false, reason: 'moved_recently' });
  });
});

// ─────────────────────────── only the builders, and only from the roster ───────────────────────────

describe('who can be reached', () => {
  it('refuses a domain that is not on the roster', async () => {
    await expect(sendOneNudge('finance', { dryRun: false }))
      .rejects.toThrow(/refusing to nudge domain finance/);
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });

  it('refuses an empty domain rather than defaulting to the first builder', async () => {
    await expect(sendOneNudge('', { dryRun: false })).rejects.toThrow(/refusing to nudge/);
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });

  it('matches a domain case-insensitively, so a URL cannot miss by capitalization', async () => {
    const r = await sendOneNudge('HR', { dryRun: false });
    expect(r.outcome).toBe('sent');
  });

  /**
   * The recipient is read out of the roster row. There is no parameter for an address, so this
   * asserts the property rather than a filter: the only email that can be mailed is the one the
   * measuring query returned.
   */
  it('mails the roster address, and BCCs Ali as the standing rule requires', async () => {
    await sendOneNudge('hr', { dryRun: false });
    expect(mockGuardedSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'robin@example.test',
      bcc: 'ali@colaberry.com',
    }));
  });

  it('sends both a text and an HTML body, so no client gets an empty message', async () => {
    await sendOneNudge('hr', { dryRun: false });
    const arg = mockGuardedSendMail.mock.calls[0][0] as any;
    expect(arg.text.length).toBeGreaterThan(40);
    expect(arg.html).toContain('<p>');
    expect(arg.subject).toBeTruthy();
  });
});

// ─────────────────────────── idempotency identity ───────────────────────────

describe('the business event is one nudge per builder per day', () => {
  it('is stable across two calls on the same day', async () => {
    await sendOneNudge('hr', { dryRun: false });
    await sendOneNudge('hr', { dryRun: false });
    const [a, b] = mockSendOnce.mock.calls.map((c) => (c[0] as any).businessEventId);
    expect(a).toBe(b);
    expect(a).toBe('agent-nudge-hr-2026-10-26');
  });

  it('differs the next day, so tomorrow is genuinely a different nudge', async () => {
    await sendOneNudge('hr', { dryRun: false });
    mockQuery.mockResolvedValue([{ now: '2026-10-27T14:00:00.000Z' }]);
    await sendOneNudge('hr', { dryRun: false });
    const [a, b] = mockSendOnce.mock.calls.map((c) => (c[0] as any).businessEventId);
    expect(a).not.toBe(b);
  });

  it('the subject handed to the ledger is the subject that is mailed', async () => {
    // A key derived from a different subject than the one sent is the one failure the hash index
    // cannot catch; `sendOnce` throws on that mismatch, so these two must agree at the call site.
    await sendOneNudge('hr', { dryRun: false });
    const identity = mockSendOnce.mock.calls[0][0] as any;
    const mail = mockGuardedSendMail.mock.calls[0][0] as any;
    expect(identity.subject).toBe(mail.subject);
    expect(identity.recipient).toBe(mail.to);
  });

  it('takes the day from POSTGRES, not from the process clock', async () => {
    // The measuring query uses `current_date` for overdue stories. A day taken from anywhere else
    // would let "this story is overdue" and "they have been quiet N days" disagree.
    mockQuery.mockResolvedValue([{ now: '2026-01-02T03:00:00.000Z' }]);
    await sendOneNudge('hr', { dryRun: false });
    expect((mockSendOnce.mock.calls[0][0] as any).businessEventId).toBe('agent-nudge-hr-2026-01-02');
  });
});

// ─────────────────────────── one failure is not seven ───────────────────────────

describe('the bulk run accounts for every builder', () => {
  const three = [
    stateFor({ domain: 'hr', email: 'a@example.test' }),
    stateFor({ domain: 'curriculum', email: 'b@example.test' }),
    stateFor({ domain: 'placement', email: 'c@example.test' }),
  ];

  it('a transport failure on one does not stop the others', async () => {
    mockLoad.mockResolvedValue(three);
    mockGuardedSendMail
      .mockRejectedValueOnce(new Error('smtp exploded'))
      .mockResolvedValue({ messageId: 'mid-ok' });

    const r = await sendAllNudges({ dryRun: false });
    expect(r.outcomes).toHaveLength(3);
    expect(r.outcomes[0].outcome).toBe('failed');
    expect(r.outcomes.slice(1).map((o) => o.outcome)).toEqual(['sent', 'sent']);
    expect(r.sent).toBe(2);
  });

  it('a thrown error inside one builder is caught and reported, not propagated', async () => {
    mockLoad.mockResolvedValue(three);
    // Not a provider failure: `sendOnce` itself throwing, e.g. the ledger insert blowing up.
    mockSendOnce.mockRejectedValueOnce(new Error('ledger unavailable'));
    const r = await sendAllNudges({ dryRun: false });
    expect(r.outcomes[0]).toMatchObject({ outcome: 'failed', domain: 'hr' });
    expect(r.outcomes.slice(1).map((o) => o.outcome)).toEqual(['sent', 'sent']);
  });

  it('every builder appears in the result, skipped ones included', async () => {
    // "It ran and sent two" is not a report unless the other five are accounted for.
    mockLoad.mockResolvedValue([
      three[0],
      stateFor({ domain: 'curriculum', email: 'b@example.test', awaitingOurReply: true }),
      stateFor({ domain: 'placement', email: 'c@example.test', daysSinceCommit: 0, recentCommitSubjects: ['x'] }),
    ]);
    const r = await sendAllNudges({ dryRun: false });
    expect(r.outcomes.map((o) => o.domain)).toEqual(['hr', 'curriculum', 'placement']);
    expect(r.outcomes.map((o) => o.outcome)).toEqual(['sent', 'skipped', 'skipped']);
    expect(r).toMatchObject({ attempted: 1, sent: 1 });
  });

  it('an empty roster is a clean no-op, not a crash', async () => {
    mockLoad.mockResolvedValue([]);
    await expect(sendAllNudges({ dryRun: false })).resolves.toEqual({ attempted: 0, sent: 0, outcomes: [] });
  });
});

// ─────────────────────────── the preview ───────────────────────────

describe('previewAgentNudges', () => {
  it('returns the words that would be sent, not just a subject', async () => {
    const [p] = await previewAgentNudges();
    expect(p.nudge.subject).toBeTruthy();
    expect(p.nudge.text.length).toBeGreaterThan(40);
    expect(p.decision).toEqual({ send: true, reason: 'quiet_and_silent' });
  });

  it('composes a message even for a builder the run would skip, so the button has something to show', async () => {
    mockLoad.mockResolvedValue([stateFor({ awaitingOurReply: true })]);
    const [p] = await previewAgentNudges();
    expect(p.decision.send).toBe(false);
    expect(p.nudge.subject).toBeTruthy();
  });

  it('sends nothing', async () => {
    await previewAgentNudges();
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
    expect(mockSendOnce).not.toHaveBeenCalled();
  });

  it('carries the state a manager needs to judge the send', async () => {
    const [p] = await previewAgentNudges();
    expect(p).toMatchObject({
      domain: 'hr', agent: 'Dara', firstName: 'Robin', email: 'robin@example.test',
      band: 'red', verified: 1, stories: 12, overdue: 3,
    });
    expect(p.nextStory?.storyId).toBe('HR.004');
  });
});

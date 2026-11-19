/**
 * The digest's BEHAVIOUR, driven rather than grepped.
 *
 * ## Why this file exists
 *
 * `approvalQueueDigestWiring.test.ts` checks the shape of things: that the wrapper runs the right
 * script, that the registry was left alone, that the claim precedes the send in the source. Its
 * verifier's point was exact: **criteria 4 and 5 were asserted by grepping the implementation's
 * own source**, which is the same class of test that missed the `docker exec` environment defect
 * in the wrapper. A grep cannot tell a claim that gates a send from a claim that merely sits
 * above one.
 *
 * So this calls `sendApprovalQueueDigests` for real, with a fixed clock and stubbed boundaries,
 * and asserts what it DID.
 */

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

const mockSend = jest.fn();
const mockResolveAddr = jest.fn();
jest.mock('../../emailService', () => ({
  guardedSendMail: (...a: unknown[]) => mockSend(...a),
  resolveDeliveryAddress: (...a: unknown[]) => mockResolveAddr(...a),
}));

const mockClaim = jest.fn();
jest.mock('../../executiveBriefingService', () => ({
  claimBriefingSlot: (...a: unknown[]) => mockClaim(...a),
}));

jest.mock('../../agentDomain/managerReachResolver', () => ({
  resolveManagerReach: jest.fn().mockResolvedValue(new Map()),
  // `reachFor` is a SECOND export the sender calls, and leaving it out of this factory made
  // every behavioural test die on `reachFor is not a function` rather than on anything the suite
  // is about. Reach is read for its BLOCKER only, never for the verdict, so an empty verdict is
  // the right stub.
  reachFor: jest.fn().mockReturnValue({ blocker: null }),
}));

import { sendApprovalQueueDigests } from '../approvalQueueDigestSender';

/** A frozen clock. Nothing in these tests may depend on when they run. */
const ASOF = new Date('2026-11-19T13:30:00.000Z');

/** One open request with a decider who can actually decide. */
function openRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'req-1',
    domain_key: 'admissions',
    title: 'A tool request waiting on a decision',
    kind: 'tool',
    status: 'submitted',
    requested_by_identity: 'builder@example.test',
    requested_at: '2026-11-17T09:00:00.000Z',
    // THESE ARE THE FIELD NAMES THE SQL RETURNS, and the first draft invented its own.
    // `manager_email` comes from `agent_domain_projects.manager_identity_id` joined to
    // `org_members.email`, which is the string the auth gate matches a token against;
    // `manager_admin_role` comes from `admin_users.role` and must be in DECIDING_ROLES or the
    // sender records `owner_cannot_decide` and mails nobody. Guessing these names made five
    // tests fail for the wrong reason.
    manager_email: 'decider@example.test',
    manager_admin_role: 'admin',
    ...over,
  };
}

let warn: jest.SpyInstance;
let info: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([]);
  mockResolveAddr.mockImplementation(async (to: string) => to);
  mockClaim.mockResolvedValue(true);
  mockSend.mockResolvedValue({ messageId: 'm1' });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  info = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); info.mockRestore(); });

describe('the environment gate actually gates', () => {
  it('sends nothing and says why when the gate is closed', async () => {
    mockQuery.mockResolvedValue([openRow()]);
    const summary = await sendApprovalQueueDigests({ asOf: ASOF, enabled: false });
    expect(summary.status).toBe('skipped');
    expect(summary.reason).toBe('AGENT_APPROVAL_DIGEST_SEND_off');
    expect(mockSend).not.toHaveBeenCalled();
    // It does not even read the queue, so a closed gate costs nothing.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('reads the env var when `enabled` is not passed', async () => {
    const prev = process.env.AGENT_APPROVAL_DIGEST_SEND;
    delete process.env.AGENT_APPROVAL_DIGEST_SEND;
    try {
      const summary = await sendApprovalQueueDigests({ asOf: ASOF });
      expect(summary.status).toBe('skipped');
      expect(mockSend).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.AGENT_APPROVAL_DIGEST_SEND;
      else process.env.AGENT_APPROVAL_DIGEST_SEND = prev;
    }
  });
});

describe('an empty queue sends nothing and records why', () => {
  it('returns ran with zero open and never reaches the mailer', async () => {
    mockQuery.mockResolvedValue([]);
    const summary = await sendApprovalQueueDigests({ asOf: ASOF, enabled: true });
    expect(summary.status).toBe('ran');
    expect(summary.open).toBe(0);
    expect(summary.sent).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
    // And it is RECORDED, which is the half of the criterion a grep cannot check.
    const logged = info.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('approval_digest_nothing_open');
  });

  it('an empty queue is NOT the same answer as a closed gate', async () => {
    // The wiring test conflated these two by asserting the gate's reason string under an
    // "empty queue" heading. They are different conditions and only one is about the queue.
    mockQuery.mockResolvedValue([]);
    const empty = await sendApprovalQueueDigests({ asOf: ASOF, enabled: true });
    const closed = await sendApprovalQueueDigests({ asOf: ASOF, enabled: false });
    expect(empty.status).toBe('ran');
    expect(closed.status).toBe('skipped');
    expect(empty.reason).toBeUndefined();
    expect(closed.reason).toBe('AGENT_APPROVAL_DIGEST_SEND_off');
  });
});

describe('the send is idempotent per day, with the clock injected', () => {
  it('sends once, then claims nothing and sends nothing on a second run', async () => {
    mockQuery.mockResolvedValue([openRow()]);

    // First run: the slot is free.
    mockClaim.mockResolvedValue(true);
    const first = await sendApprovalQueueDigests({ asOf: ASOF, enabled: true });
    expect(first.sent).toBe(1);
    expect(first.already_sent).toBe(0);
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Second run, SAME clock: the slot is taken, which is what the ledger does for real.
    mockClaim.mockResolvedValue(false);
    const second = await sendApprovalQueueDigests({ asOf: ASOF, enabled: true });
    expect(second.sent).toBe(0);
    expect(second.already_sent).toBe(1);
    // Still one mail in total across both runs.
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('the claim is what stops the second send, not an accident of ordering', async () => {
    mockQuery.mockResolvedValue([openRow()]);
    mockClaim.mockResolvedValue(false);
    const summary = await sendApprovalQueueDigests({ asOf: ASOF, enabled: true });
    expect(summary.already_sent).toBe(1);
    expect(mockSend).not.toHaveBeenCalled();
    // The claim is keyed per mailbox and per slot, both passed through.
    expect(mockClaim).toHaveBeenCalledWith(
      'agent_domain_approval_digest',
      'decider@example.test',
    );
  });

  it('a DRY RUN claims no slot, so it cannot swallow the real send later the same day', async () => {
    mockQuery.mockResolvedValue([openRow()]);
    const summary = await sendApprovalQueueDigests({ asOf: ASOF, enabled: true, dryRun: true });
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  it('two runs with the SAME injected clock behave identically, so the clock is not read twice', async () => {
    mockQuery.mockResolvedValue([openRow()]);
    mockClaim.mockResolvedValue(true);
    const a = await sendApprovalQueueDigests({ asOf: ASOF, enabled: true, dryRun: true });
    const b = await sendApprovalQueueDigests({ asOf: ASOF, enabled: true, dryRun: true });
    expect(a).toEqual(b);
  });
});

describe('what it actually mails', () => {
  it('sends to the decider, from the governance sender, with a real subject and body', async () => {
    mockQuery.mockResolvedValue([openRow()]);
    await sendApprovalQueueDigests({ asOf: ASOF, enabled: true });
    const mail = mockSend.mock.calls[0][0] as Record<string, string>;
    expect(mail.to).toBe('decider@example.test');
    expect(String(mail.subject).length).toBeGreaterThan(10);
    expect(String(mail.text).length).toBeGreaterThan(50);
    expect(String(mail.from)).toMatch(/</);
  });

  it('sets NO replyTo today, because a change request carries no reply token', async () => {
    // An address with a blank segment looks like a working reply path, accepts a reply and drops
    // it. The shared builder returns null when either part is missing, and the spread form means
    // the header is absent rather than present-and-empty.
    mockQuery.mockResolvedValue([openRow()]);
    await sendApprovalQueueDigests({ asOf: ASOF, enabled: true });
    const mail = mockSend.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(mail, 'replyTo')).toBe(false);
  });

  it('one mailbox failing does not stop the next one', async () => {
    mockQuery.mockResolvedValue([
      openRow({ id: 'a', manager_email: 'one@example.test' }),
      openRow({ id: 'b', domain_key: 'curriculum', manager_email: 'two@example.test' }),
    ]);
    mockSend.mockRejectedValueOnce(new Error('smtp down')).mockResolvedValue({ messageId: 'm' });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await sendApprovalQueueDigests({ asOf: ASOF, enabled: true });
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(1);
    err.mockRestore();
  });
});

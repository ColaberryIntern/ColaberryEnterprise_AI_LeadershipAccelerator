/**
 * The composed reply-or-not decision.
 *
 * Self-address env is fixed before the module loads, exactly as
 * coraLoopGuards.test.ts does, so the inherited SELF_ADDRESSES list is
 * deterministic regardless of the ambient environment.
 */

process.env.CORA_SUPPORT_ADDRESS = 'support@colaberry.com';
process.env.CORA_MAILBOX_ADDRESS = 'ali@colaberry.com';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { watcherSkipReason, isStudentAuthored, threadKeyFor } = require('../watcherGuards');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OUTBOUND_COPY_HEADER } = require('../outboundIdentity');

const BUSINESS_EVENT = 'story000-unblock-2026-08-17';

const availableLedger = (ids: string[]) => ({
  available: true,
  messageIds: new Set(ids),
  businessEventIds: new Set([BUSINESS_EVENT]),
  sentCount: ids.length,
});

const campaignCopy = {
  messageIdHeader: '<campaign-1@colaberry.com>',
  fromAddress: '"Ali Muwwakkil" <ali@colaberry.com>',
  headers: { [OUTBOUND_COPY_HEADER]: BUSINESS_EVENT },
};

const studentReply = {
  messageIdHeader: '<student-1@yahoo.com>',
  fromAddress: 'Liza Ayele <bfglz@yahoo.com>',
  headers: { 'In-Reply-To': '<campaign-1@colaberry.com>' },
};

const watcherReply = {
  messageIdHeader: '<watcher-reply-1@colaberry.com>',
  fromAddress: 'ali@colaberry.com',
  headers: {},
};

describe('our own outbound is never answered', () => {
  it("skips Ali's BCC copy of the campaign, naming the ledger as the reason", () => {
    const ledger = availableLedger(['campaign-1@colaberry.com']);
    const verdict = watcherSkipReason({
      candidate: campaignCopy,
      threadMessages: [campaignCopy],
      ledger,
      ownReplyIds: new Set(),
    });
    expect(verdict.skip).toBe('our_own_outbound_ledger');
  });

  it('skips a reply the watcher itself sent, which is the self-reply loop shape', () => {
    const ledger = availableLedger(['campaign-1@colaberry.com']);
    const verdict = watcherSkipReason({
      candidate: watcherReply,
      threadMessages: [campaignCopy, studentReply, watcherReply],
      ledger,
      ownReplyIds: new Set(['watcher-reply-1@colaberry.com']),
    });
    expect(verdict.skip).toBe('our_own_reply');
  });

  it('skips a reply of ours even if it is no longer in the own-reply set, via the inherited self-address guard', () => {
    const ledger = availableLedger(['campaign-1@colaberry.com']);
    const verdict = watcherSkipReason({
      candidate: watcherReply,
      threadMessages: [campaignCopy, studentReply, watcherReply],
      ledger,
      ownReplyIds: new Set(),
    });
    expect(verdict.skip).toBe('self_address');
  });
});

describe('the guards pinned by the 2026-07-14 storm are inherited, not reimplemented', () => {
  const ledger = availableLedger([]);
  const withThread = (candidate: any) => ({
    candidate,
    threadMessages: [studentReply, candidate],
    ledger,
    ownReplyIds: new Set<string>(),
  });

  it('skips a mailer-daemon bounce', () => {
    expect(watcherSkipReason(withThread({
      messageIdHeader: '<b@x>', fromAddress: 'mailer-daemon@googlemail.com', headers: {},
    })).skip).toBe('automated_sender');
  });

  it('skips a no-reply sender', () => {
    expect(watcherSkipReason(withThread({
      messageIdHeader: '<b@x>', fromAddress: 'no-reply@acme.com', headers: {},
    })).skip).toBe('automated_sender');
  });

  it('skips an out-of-office auto-reply by RFC 3834 header', () => {
    expect(watcherSkipReason(withThread({
      messageIdHeader: '<b@x>', fromAddress: 'bfglz@yahoo.com', headers: { 'Auto-Submitted': 'auto-replied' },
    })).skip).toBe('auto_submitted');
  });

  it('skips bulk mail by Precedence', () => {
    expect(watcherSkipReason(withThread({
      messageIdHeader: '<b@x>', fromAddress: 'bfglz@yahoo.com', headers: { Precedence: 'bulk' },
    })).skip).toBe('bulk_precedence');
  });

  it('skips a message with no sender', () => {
    expect(watcherSkipReason(withThread({
      messageIdHeader: '<b@x>', fromAddress: '', headers: {},
    })).skip).toBe('no_sender');
  });
});

describe('no proactive nudges', () => {
  // The thread as stored is what decides this, not the candidate. A candidate
  // that is itself a student message will normally be present in its own
  // thread; these cases are the ones where it is not, which is exactly when a
  // reply would be an unsolicited nudge rather than an answer.
  const ledger = availableLedger(['campaign-1@colaberry.com']);

  it('refuses a thread holding only our campaign email, however overdue the student is', () => {
    const verdict = watcherSkipReason({
      candidate: { messageIdHeader: '<probe@x>', fromAddress: 'bfglz@yahoo.com', headers: {} },
      threadMessages: [campaignCopy],
      ledger,
      ownReplyIds: new Set(),
    });
    expect(verdict.skip).toBe('no_student_reply');
  });

  it('refuses when the thread holds only our outbound and an automated bounce', () => {
    const bounce = { messageIdHeader: '<bounce-1@x>', fromAddress: 'postmaster@yahoo.com', headers: {} };
    const verdict = watcherSkipReason({
      candidate: { messageIdHeader: '<probe@x>', fromAddress: 'bfglz@yahoo.com', headers: {} },
      threadMessages: [campaignCopy, bounce],
      ledger,
      ownReplyIds: new Set(),
    });
    expect(verdict.skip).toBe('no_student_reply');
  });

  it('allows it once the student has actually written on that thread', () => {
    const verdict = watcherSkipReason({
      candidate: { messageIdHeader: '<probe@x>', fromAddress: 'bfglz@yahoo.com', headers: {} },
      threadMessages: [campaignCopy, studentReply],
      ledger,
      ownReplyIds: new Set(),
    });
    expect(verdict.skip).toBeNull();
  });
});

describe('a genuine student reply passes every guard', () => {
  it('returns no skip reason', () => {
    const ledger = availableLedger(['campaign-1@colaberry.com']);
    const verdict = watcherSkipReason({
      candidate: studentReply,
      threadMessages: [campaignCopy, studentReply],
      ledger,
      ownReplyIds: new Set(),
    });
    expect(verdict.skip).toBeNull();
    expect(verdict.seamDisagreement).toBe(false);
  });
});

describe('isStudentAuthored', () => {
  const ledger = availableLedger(['campaign-1@colaberry.com']);
  it('is false for our campaign copy', () => {
    expect(isStudentAuthored(campaignCopy, ledger, new Set())).toBe(false);
  });
  it('is false for a bounce', () => {
    expect(isStudentAuthored(
      { messageIdHeader: '<b@x>', fromAddress: 'mailer-daemon@googlemail.com', headers: {} },
      ledger, new Set(),
    )).toBe(false);
  });
  it('is true for a student', () => {
    expect(isStudentAuthored(studentReply, ledger, new Set())).toBe(true);
  });
});

describe('threadKeyFor', () => {
  it('prefers the provider thread id', () => {
    expect(threadKeyFor('thread-abc', 'msg-1')).toBe('thread-abc');
  });
  it('falls back to the message id for a single-message thread', () => {
    expect(threadKeyFor(null, 'msg-1')).toBe('msg-1');
    expect(threadKeyFor('   ', 'msg-1')).toBe('msg-1');
  });
});

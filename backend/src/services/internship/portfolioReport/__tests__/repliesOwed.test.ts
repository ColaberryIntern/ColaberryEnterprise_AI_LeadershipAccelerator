import { emailView } from '../compose';
import { answeredInThread, newestReplyByThread, threadKey } from '../threadReply';
import type { OurReply } from '../types';

/**
 * "Only a real reply clears their question." (Ali, 2026-11-11)
 *
 * ## What was wrong
 *
 * `awaitingReply` asked whether we had sent them ANYTHING since their last message. A nudge is
 * something. So the nudge run of 10 Nov answered every outstanding question in the data without
 * answering one of them in fact, and by 11 Nov no intern was `blocked_waiting_on_ali`, nobody
 * reached the `answer_owed` focus, and the report's "Replies you owe" tile read lower than the
 * truth. The system was marking its own homework: we asked them for something, and that counted
 * as us having replied to them.
 *
 * ## The rule now
 *
 * A message is answered only when we wrote back IN THAT THREAD after it. A nudge carries its own
 * subject, so it cannot clear anything. There is no flag in the mail store that says "this was a
 * nudge" - sends are only logged to stdout - so the thread is the available evidence, and it is
 * also the right evidence: answering someone means replying to what they said.
 *
 * ## Reading these tests
 *
 * The cases marked CONTROL failed before the change and pass after. The ones marked UNCHANGED
 * passed both before and after, and they are what makes the controls mean anything: they show the
 * rule got narrower in one specific way rather than simply turning `awaitingReply` on.
 */

const NOW = new Date('2026-11-11T18:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const THEM = 'quincy@example.com';
const THEIR_QUESTION = { email: THEM, subject: 'Where the six capabilities stand', snippet: 'Which two should I drop?', received_at: daysAgo(2) };

const view = (replies: OurReply[], emails = [THEIR_QUESTION], lastWeWrote: string | null = daysAgo(1)) =>
  emailView(THEM, emails, [{ email: THEM, last_we_wrote: lastWeWrote }], NOW.getTime(), replies);

describe('a nudge is not an answer', () => {
  /**
   * CONTROL. The production case on 2026-11-11: Quincy asked something on the 9th, our nudge went
   * out on the 10th under a subject of its own, and the question was recorded as answered.
   */
  it('still owes a reply when the only thing we sent since was a nudge under another subject', () => {
    const nudge: OurReply[] = [{ email: THEM, subject: 'Two days to your case study package', received_at: daysAgo(1) }];
    expect(view(nudge).awaitingReply).toBe(true);
  });

  it('names their subject as the one owed, not the nudge we sent', () => {
    const nudge: OurReply[] = [{ email: THEM, subject: 'Two days to your case study package', received_at: daysAgo(1) }];
    expect(view(nudge).awaitingSubject).toBe('Where the six capabilities stand');
  });

  /** CONTROL. Several nudges do not add up to an answer either. */
  it('still owes a reply after three nudges on three days', () => {
    const nudges: OurReply[] = [
      { email: THEM, subject: 'Your case study package', received_at: daysAgo(3) },
      { email: THEM, subject: 'Two days to your case study package', received_at: daysAgo(1) },
      { email: THEM, subject: 'One day left', received_at: daysAgo(0) },
    ];
    expect(view(nudges).awaitingReply).toBe(true);
  });
});

describe('a real reply does clear it', () => {
  it('owes nothing once we answered in their thread', () => {
    const reply: OurReply[] = [{ email: THEM, subject: 'Re: Where the six capabilities stand', received_at: daysAgo(1) }];
    expect(view(reply).awaitingReply).toBe(false);
  });

  it('treats Re: and Fwd: as the same thread, however deeply stacked', () => {
    const reply: OurReply[] = [{ email: THEM, subject: 'Re: Fwd: RE: Where the six capabilities stand', received_at: daysAgo(1) }];
    expect(view(reply).awaitingReply).toBe(false);
  });

  it('ignores a reply in that thread that predates their message, since it cannot answer it', () => {
    const earlier: OurReply[] = [{ email: THEM, subject: 'Re: Where the six capabilities stand', received_at: daysAgo(5) }];
    expect(view(earlier).awaitingReply).toBe(true);
  });
});

describe('what did not change', () => {
  it('UNCHANGED: owes nothing when they have never written', () => {
    expect(view([], []).awaitingReply).toBe(false);
  });

  /** A months-old miss is fixed by writing to them, not by being flagged forever. */
  it('UNCHANGED: stops owing once their message is older than the 7 day window', () => {
    const old = [{ ...THEIR_QUESTION, received_at: daysAgo(9) }];
    expect(view([], old).awaitingReply).toBe(false);
  });

  it('UNCHANGED: still collapses Re:/Fwd: threads into one subject each', () => {
    const v = view([], [
      { email: THEM, subject: 'Re: Access', snippet: '', received_at: daysAgo(1) },
      { email: THEM, subject: 'Access', snippet: '', received_at: daysAgo(2) },
    ]);
    expect(v.threads.map((t) => t.subject)).toEqual(['Access']);
    expect(v.count).toBe(2);
  });

  /**
   * `lastWeWrote` keeps its plain meaning - the last time we sent them anything at all. It is a
   * fact about us, it is rendered as one, and a nudge genuinely is us writing to them. Only the
   * ANSWERED question moved to the thread rule.
   */
  it('UNCHANGED: lastWeWrote still counts a nudge, because it reports what we sent', () => {
    const nudge: OurReply[] = [{ email: THEM, subject: 'Two days', received_at: daysAgo(1) }];
    expect(view(nudge).lastWeWrote).toBe(new Date(daysAgo(1)).toISOString());
  });
});

describe('the thread helper itself', () => {
  it('keys a thread on its subject with the reply prefixes stripped and case folded', () => {
    expect(threadKey('Re: Fwd: Where The Six Stand')).toBe(threadKey('where the six stand'));
  });

  it('gives a missing subject a stable key rather than throwing', () => {
    expect(threadKey(null)).toBe(threadKey(undefined));
  });

  it('keeps only the newest of several replies in one thread', () => {
    const map = newestReplyByThread([
      { email: THEM, subject: 'Access', received_at: daysAgo(5) },
      { email: THEM, subject: 'Re: Access', received_at: daysAgo(1) },
    ]);
    expect(map.size).toBe(1);
    expect(map.get(threadKey('Access'))).toBe(Date.parse(daysAgo(1)));
  });

  it('skips an unparseable timestamp instead of poisoning the thread with NaN', () => {
    const map = newestReplyByThread([
      { email: THEM, subject: 'Access', received_at: 'not a date' },
      { email: THEM, subject: 'Access', received_at: daysAgo(2) },
    ]);
    expect(map.get(threadKey('Access'))).toBe(Date.parse(daysAgo(2)));
  });

  it('reports a thread with no reply at all as unanswered', () => {
    expect(answeredInThread('Access', Date.parse(daysAgo(2)), new Map())).toBe(false);
  });
});

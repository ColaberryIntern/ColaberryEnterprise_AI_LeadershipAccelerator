/**
 * threadReply - PURE. Did we answer THAT message, in THAT thread?
 *
 * ## Why this is its own module
 *
 * Two places need the same answer and must not drift: `emailView` in compose.ts, which decides
 * whether a reply is owed, and `openQuestions` in sidecar/build.ts, which decides which of their
 * questions are still outstanding. Both used to ask a weaker question - "have we sent them
 * anything since?" - and both got the same wrong answer for the same reason.
 *
 * ## The weaker question, and what it cost
 *
 * A nudge is something. So the nudge run of 10 Nov 2026 marked every outstanding question as
 * answered without answering one of them, and by the 11th no intern was `blocked_waiting_on_ali`,
 * nothing reached the `answer_owed` focus, and "Replies you owe" on the daily report read lower
 * than the truth. The system was marking its own homework: we asked them for something, and that
 * counted as having replied to them.
 *
 * ## Why the thread is the evidence
 *
 * Nothing in the mail store flags a message as a nudge - `nudgeBrief/send.ts` logs
 * `intern_brief_sent` to stdout and persists no row - so there is no marker to filter on. The
 * thread is what we have, and it is also the right test rather than a convenient one: answering
 * someone means replying to the thing they said. A nudge carries a subject of its own, so it
 * cannot clear a question, which is exactly the intended behaviour.
 *
 * Known limit, stated rather than hidden: if we answer their question in a NEW thread with a fresh
 * subject, this still reports the question as owed. That errs toward telling a manager they owe a
 * reply they have already sent, which is the safe direction - the opposite error hides real
 * unanswered mail, and that is the bug this module exists to fix.
 */
import type { OurReply } from './types';

/** A subject with the reply prefixes stripped. Display form: keeps its original casing. */
export function cleanSubject(s: unknown): string {
  return String(s || '(no subject)').replace(/^((re|fwd?|fw)\s*:\s*)+/i, '').trim() || '(no subject)';
}

/**
 * Thread identity: the cleaned subject, case-folded.
 *
 * Case-folded because people reply with "RE:" and mail clients rewrite capitalisation, and a
 * thread that splits in two on casing would report an answered question as owed.
 */
export function threadKey(subject: unknown): string {
  return cleanSubject(subject).toLowerCase();
}

/**
 * The newest moment we wrote in each thread, keyed by `threadKey`.
 *
 * Unparseable timestamps are skipped rather than stored: a NaN in here compares false against
 * everything, which would silently turn "answered" into "not answered" for that whole thread.
 */
export function newestReplyByThread(replies: ReadonlyArray<OurReply> | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of replies ?? []) {
    const at = Date.parse(String(r.received_at));
    if (Number.isNaN(at)) continue;
    const key = threadKey(r.subject);
    const prev = out.get(key);
    if (prev === undefined || at > prev) out.set(key, at);
  }
  return out;
}

/**
 * Did we write in this thread AFTER the given moment?
 *
 * Strictly after: a reply stamped at the same instant as their message cannot be a response to it.
 */
export function answeredInThread(subject: unknown, atMs: number, byThread: Map<string, number>): boolean {
  if (!Number.isFinite(atMs)) return false;
  const at = byThread.get(threadKey(subject));
  return at !== undefined && at > atMs;
}

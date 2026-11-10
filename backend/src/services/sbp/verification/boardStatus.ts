/**
 * `boardStatusFor` -- the board status a story's verification state implies.
 *
 * ## Why this exists
 *
 * `buildVerificationService` already knew which stories were in progress: its
 * `summary.rollup` counts them on every single run. That knowledge stopped at
 * the response body. Nothing ever wrote it to `student_tasks.status`, so the
 * only two values that existed in production were `not_started` (the
 * materializer's default) and `complete` (stamped by
 * `markTaskVerifiedComplete`).
 *
 * Measured against the production table on 2026-11-10, before this module
 * existed: **2235 `not_started`, 537 `complete`, and ZERO `in_progress`** --
 * across every project, every builder, for the life of the system. The column
 * is a Postgres enum that has always accepted the value, and
 * `projectWriteService.CLIENT_SETTABLE_STATUSES` has always allowed a client to
 * set it. Nothing ever did.
 *
 * The consequence is not cosmetic. A builder with thirty seven stories in
 * flight and fifteen commits in four days rendered identically to an untouched
 * repository, because the board had nowhere to put "started but not finished".
 * That is the zero Victoria Spencer-Auber was asked to account for on
 * 10 Nov 2026, and it was never hers to account for.
 *
 * ## `complete` is deliberately unreachable from here
 *
 * The return type excludes it, and a test asserts that no input produces it.
 * `projectWriteService` holds the rule that only `markTaskVerifiedComplete` may
 * award completion, after a *verified* verdict with a commit behind it. This
 * function must never become a second route to that, because a story could
 * otherwise reach `complete` off a `.colaberry/progress.json` the student
 * edited by hand -- the exact hole the client allowlist was built to close
 * after students were found PATCHing their own stories to `complete`.
 *
 * So `verified` returns `null`, meaning "not mine to set" rather than "no
 * status". The caller distinguishes the two.
 *
 * ## Why `submitted` maps to `in_progress` rather than to its own value
 *
 * `StudentTaskStatus` has four values and `submitted` is not one of them.
 * Adding a fifth would mean a database enum migration, which is an escalated
 * decision, and it would buy very little: from the board's point of view,
 * awaiting verification is still work in flight. The precise state stays
 * visible in `verification_json.state`, which is where a caller that cares
 * about the difference should read it.
 *
 * PURE. No I/O, no clock, no models. The import is type-only and is erased at
 * compile time, so this module pulls nothing into a test that imports it.
 *
 * The state type comes from `verificationLatch`, which is where it is declared,
 * rather than through `StoryVerdict['state']` in `verifyDecision`. Same four
 * values either way; taking it from the declaration means a change to the
 * verdict interface's shape cannot silently change what this function accepts.
 */
import type { StoryVerificationState } from './verificationLatch';

/**
 * The status to write, or `null` when this function has no opinion.
 *
 * `null` is returned ONLY for `verified`, and means the task's status belongs
 * to `markTaskVerifiedComplete`. It never means "leave the task alone because
 * nothing is known" -- every other state has an answer.
 */
export type BoardStatus = 'not_started' | 'in_progress';

export function boardStatusFor(state: StoryVerificationState): BoardStatus | null {
  switch (state) {
    case 'in_progress':
    case 'submitted':
      return 'in_progress';
    case 'not_started':
      return 'not_started';
    default:
      // 'verified' -- owned by markTaskVerifiedComplete, never written here.
      return null;
  }
}

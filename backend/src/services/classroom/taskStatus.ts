import { StudentTaskStatus } from '../../models/StudentTask';

/**
 * Which project task states mean "still to do".
 *
 * THIS EXISTS BECAUSE THE FIRST VERSION GUESSED. `classroomProjection` and the
 * project rail each carried `['todo','pending','in_progress','blocked','open']`
 * -- five plausible words, four of which the model has never produced. The real
 * enum is `not_started | in_progress | complete | blocked`, so the one status
 * that almost every unstarted story actually has, `not_started`, was missing
 * from both. Every student with an untouched project read as "Nothing open
 * right now" while their Projects page showed twenty-two tasks.
 *
 * Nothing failed. The projection returned a confident, wrong answer, and it had
 * been doing so since Phase 2. Typing the set against `StudentTaskStatus` is
 * what stops the next guess: a word the model cannot produce no longer compiles.
 */
export const OPEN_TASK_STATUSES: ReadonlySet<StudentTaskStatus> =
  new Set<StudentTaskStatus>(['not_started', 'in_progress', 'blocked']);

/** Complete is the only closed state. Anything unrecognised counts as open. */
export function isTaskOpen(status: string | null | undefined): boolean {
  return String(status ?? '') !== 'complete';
}

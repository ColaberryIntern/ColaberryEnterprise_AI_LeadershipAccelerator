/**
 * Who may read a piece of feedback, and who may grade.
 *
 * TWO RULES, BOTH FROM THE BUILD SPEC, BOTH EASY TO LOSE IN A JOIN.
 *
 * 1. PRIVATE PRACTICE SCORES STAY PRIVATE. A student rehearses badly on purpose —
 *    that is what rehearsal is for. If a classmate or a future employer-facing
 *    showcase can read the coach's score from attempt two, the student learns to stop
 *    rehearsing honestly, and the most useful part of the Studio dies quietly. A
 *    private row is readable by its OWNER and by staff. Nobody else, ever, including
 *    peers on the same team.
 *
 * 2. FINAL GRADING STAYS HUMAN-CONTROLLED. An AI review is `evaluator_role = 'ai'`
 *    and is never the grade. It can inform an instructor; it cannot BE one. This
 *    module refuses to treat an ai row as official, so a later surface cannot read
 *    one and render it as a mark.
 *
 * Pure predicates, no database: the same rules are asserted in a test and applied at
 * every read, and there is one place to look when the question is "who can see this".
 */

export type EvaluatorRole = 'ai' | 'peer' | 'instructor' | 'self';
export type Visibility = 'private' | 'shared_with_instructor' | 'cohort' | 'public';

export interface FeedbackRow {
  attemptId: string;
  evaluatorRole: EvaluatorRole;
  /** Who wrote it. For 'self' this is the owner. */
  evaluatorId?: string | null;
  visibility: Visibility;
  reviewState?: 'draft' | 'published' | string;
}

export interface Viewer {
  /** The enrollment reading it. */
  enrollmentId: string;
  /** True for instructors and admins. */
  isStaff?: boolean;
  /** Enrollments on the same team, if this is a team presentation. */
  teammateOf?: string[];
}

export interface AttemptOwner {
  /** The enrollment whose attempt this feedback is about. */
  enrollmentId: string;
}

/**
 * Can this viewer read this feedback?
 *
 * Written as an ALLOW-list with an explicit default of `false`: a visibility value
 * nobody has thought about yet must not be readable by accident. That is the
 * direction a mistake should fail in.
 */
export function canRead(row: FeedbackRow, owner: AttemptOwner, viewer: Viewer): boolean {
  const isOwner = viewer.enrollmentId === owner.enrollmentId;

  // The owner reads everything about their own attempt, including an unpublished
  // draft — it is their rehearsal.
  if (isOwner) return true;

  // Staff read everything. They are the ones who have to help.
  if (viewer.isStaff) return true;

  // A draft is not readable by anyone else, whatever its visibility says. Visibility
  // describes the INTENT; review_state says whether it is finished.
  if (row.reviewState === 'draft') return false;

  switch (row.visibility) {
    case 'private':
      // THE RULE. A private practice score never leaves the student and staff, and a
      // teammate is not an exception — being on the same team does not make someone
      // entitled to another person's rehearsal score.
      return false;
    case 'shared_with_instructor':
      return false; // staff already returned true above; nobody else qualifies
    case 'cohort':
      return true;
    case 'public':
      return true;
    default:
      return false;
  }
}

/**
 * Is this row allowed to count as the official assessment?
 *
 * Never for an AI review, and never for a draft. An instructor's published review is
 * the only thing that grades.
 */
export function isOfficialGrade(row: FeedbackRow): boolean {
  if (row.evaluatorRole !== 'instructor') return false;
  return row.reviewState === 'published';
}

/** The rows a viewer may see, filtered rather than fetched-then-hoped. */
export function visibleTo(rows: FeedbackRow[], owner: AttemptOwner, viewer: Viewer): FeedbackRow[] {
  return rows.filter((r) => canRead(r, owner, viewer));
}

/**
 * What a peer is allowed to WRITE. A peer may leave a note; they may not set a score,
 * and they may not publish into anyone else's record as an instructor would.
 */
export function canWriteFeedback(role: EvaluatorRole, viewer: Viewer, owner: AttemptOwner): boolean {
  if (role === 'self') return viewer.enrollmentId === owner.enrollmentId;
  if (role === 'instructor') return Boolean(viewer.isStaff);
  if (role === 'peer') return viewer.enrollmentId !== owner.enrollmentId;
  // 'ai' is written by the server, never by a request carrying a viewer.
  return false;
}

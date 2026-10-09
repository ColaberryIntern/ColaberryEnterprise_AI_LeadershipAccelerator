/**
 * Who may see a showcase, and on WHICH surface.
 *
 * ONE PREDICATE, EVERY SURFACE. The failure this is shaped against is not a missing
 * check on the gallery page — it is the gallery being locked and the THUMBNAIL still
 * being served, or the transcript, or the search index, or the download. A student
 * chooses "private" and finds their rehearsal in a public search result because one
 * endpoint resolved the row by id and returned it. Every surface named in
 * `ShowcaseSurface` calls `canView` with the same row, and the suite enumerates them,
 * so a new endpoint that forgets is a visible gap rather than an invisible one.
 *
 * APPROVAL IS BOUND TO THE CONTENT IT APPROVED. `content_hash` is frozen when the
 * author and staff approve. If the take is replaced, the hash changes, and the
 * approval no longer applies — the student would otherwise swap in a different
 * recording behind an approval somebody else gave to something they never saw. This is
 * the single most dangerous thing a publication flow can get wrong, so `approvalState`
 * returns `stale` rather than quietly keeping the old answer.
 *
 * PUBLISHED IS NOT THE SAME AS VISIBLE, and withdrawal is immediate. A withdrawn
 * showcase is invisible to everyone but its owner and staff from the moment it is
 * withdrawn, whatever a cache elsewhere still holds.
 *
 * Pure. No database and no request object, so the rules can be enumerated in a test
 * and there is exactly one place to look when the question is "who can see this".
 */

export type Audience = 'private' | 'cohort' | 'community' | 'public';

/**
 * Every way a showcase can leak. Named so the test can iterate them — a surface that
 * exists but is not in this list is the bug this type is here to prevent.
 */
export const SHOWCASE_SURFACES = [
  'metadata',
  'media',
  'thumbnail',
  'transcript',
  'feedback',
  'search',
  'download',
] as const;
export type ShowcaseSurface = (typeof SHOWCASE_SURFACES)[number];

export interface ShowcaseRow {
  id: string;
  /** The enrollment whose attempt this showcases. */
  ownerEnrollmentId: string;
  cohortId?: string | null;
  audience: Audience;
  /** Hash of the content the approvals were given for. */
  contentHash?: string | null;
  /** Hash of the content as it stands NOW. */
  currentContentHash?: string | null;
  authorApprovedAt?: Date | string | null;
  staffApprovedAt?: Date | string | null;
  publishedAt?: Date | string | null;
  withdrawnAt?: Date | string | null;
}

export interface ShowcaseViewer {
  enrollmentId?: string | null;
  isStaff?: boolean;
  cohortId?: string | null;
}

export type ApprovalState = 'not_approved' | 'author_only' | 'approved' | 'stale';

/**
 * Where this showcase stands, including whether its approval still applies to the
 * content it is attached to.
 *
 * `stale` is deliberately NOT folded into `not_approved`: a student who replaced their
 * take needs to be told their approval lapsed, not that they never had one.
 */
export function approvalState(row: ShowcaseRow): ApprovalState {
  const authored = Boolean(row.authorApprovedAt);
  const staffed = Boolean(row.staffApprovedAt);
  if (!authored) return 'not_approved';

  // The hash the approvals were given for, versus what is there now. Only compared
  // when BOTH are known — an unknown hash is not evidence of a swap.
  const approvedFor = (row.contentHash || '').trim();
  const now = (row.currentContentHash || '').trim();
  if (approvedFor && now && approvedFor !== now) return 'stale';

  if (!staffed) return 'author_only';
  return 'approved';
}

/** Is this live to anyone beyond its owner and staff? */
export function isLive(row: ShowcaseRow): boolean {
  if (row.withdrawnAt) return false;
  if (!row.publishedAt) return false;
  return approvalState(row) === 'approved';
}

/**
 * Can this viewer see this showcase on this surface?
 *
 * An ALLOW-list with a default of `false`. An audience value nobody has thought about
 * yet, or a surface added without thought, must fail closed — that is the direction a
 * mistake here has to fail in.
 */
export function canView(row: ShowcaseRow, viewer: ShowcaseViewer, _surface: ShowcaseSurface): boolean {
  // The owner always sees their own work, on every surface, at every stage.
  if (viewer.enrollmentId && viewer.enrollmentId === row.ownerEnrollmentId) return true;

  // Staff see everything: they approve it and they answer for it.
  if (viewer.isStaff) return true;

  // From here, nobody sees anything that is not live. Withdrawal is immediate and a
  // stale approval is not an approval.
  if (!isLive(row)) return false;

  switch (row.audience) {
    case 'private':
      // THE RULE. Private means the owner and staff. There is no third case, and
      // there is no surface on which that changes.
      return false;
    case 'cohort':
      return Boolean(viewer.cohortId) && viewer.cohortId === row.cohortId;
    case 'community':
      // Any signed-in learner.
      return Boolean(viewer.enrollmentId);
    case 'public':
      return true;
    default:
      return false;
  }
}

/** The rows a viewer may see, filtered rather than fetched-and-hoped. */
export function filterViewable<T extends ShowcaseRow>(
  rows: T[], viewer: ShowcaseViewer, surface: ShowcaseSurface,
): T[] {
  return rows.filter((r) => canView(r, viewer, surface));
}

/**
 * May this be published?
 *
 * Both approvals, a known content hash, and not already withdrawn. Publishing
 * something whose approval went stale is the exact swap this module exists to stop.
 */
export function canPublish(row: ShowcaseRow): { ok: true } | { ok: false; reason: string } {
  if (row.withdrawnAt) return { ok: false, reason: 'This showcase was withdrawn.' };
  const state = approvalState(row);
  if (state === 'stale') {
    return { ok: false, reason: 'The recording changed after it was approved. It needs approving again before it can be published.' };
  }
  if (state !== 'approved') {
    return { ok: false, reason: 'It needs both the author\'s and a staff approval before it can be published.' };
  }
  if (!(row.contentHash || '').trim()) {
    return { ok: false, reason: 'There is no content hash on this showcase, so an approval cannot be tied to anything.' };
  }
  return { ok: true };
}

/** What a student is told when their approval lapsed. */
export const STALE_APPROVAL_NOTICE =
  'You replaced the recording after this was approved, so the approval no longer applies. Ask for approval again before publishing.';

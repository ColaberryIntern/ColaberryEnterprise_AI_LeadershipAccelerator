/**
 * What an instructor is told about a cohort, and the three facts that must never be
 * conflated.
 *
 *   INTENT      — someone pressed "join". That is a click.
 *   ATTENDANCE  — someone was in the room. That is a session.
 *   PRESENTED   — someone actually gave their demo. That is a verified task.
 *
 * These were already conflated once in this build: the admin health view counted
 * clicks as attendance, and PREP-6 is staff-verified precisely because nobody can
 * vouch for their own presentation. An instructor reading "18 presented" and finding
 * six of them never spoke does not just lose a number — they lose the dashboard.
 *
 * So every count here names its SOURCE, and a count is only ever derived from
 * persisted evidence: a row somebody can open. Nothing on this surface is inferred
 * from a page view.
 *
 * Pure. The SQL lives with the caller; this decides what the rows MEAN.
 */

export interface CohortRow {
  enrollmentId: string;
  /** Pressed join at least once. Intent, nothing more. */
  joinedAt?: Date | string | null;
  /** Was present in the room — a session the provider recorded. */
  attendedSeconds?: number | null;
  /** Rehearsal attempts with a recording that arrived. */
  rehearsalsWithRecording?: number | null;
  /** A booked presenter slot on demo day. */
  hasSlot?: boolean | null;
  /** PREP-6 verified by staff. The only thing that means "presented". */
  presentedVerifiedAt?: Date | string | null;
  /** A recording was expected for a booked attempt and never arrived. */
  missingRecordings?: number | null;
  /** Showcase approvals waiting on staff. */
  awaitingApproval?: number | null;
}

export interface CohortMetrics {
  total: number;
  /** Pressed join. NOT attendance. */
  intent: number;
  /** Actually in the room for a meaningful length of time. */
  attended: number;
  /** Staff-verified presentations. The only count that may be called "presented". */
  presented: number;
  rehearsed: number;
  withSlot: number;
  missingRecordings: number;
  awaitingApproval: number;
  /** Stated next to every count, so nobody has to guess what it came from. */
  sources: Record<string, string>;
}

/**
 * Below this, "attended" is someone who opened the room and left. A join that lasted
 * eleven seconds is intent with extra steps.
 */
export const MIN_ATTENDANCE_SECONDS = 120;

export function cohortMetrics(rows: CohortRow[]): CohortMetrics {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return {
    total: rows.length,
    intent: rows.filter((r) => Boolean(r.joinedAt)).length,
    attended: rows.filter((r) => n(r.attendedSeconds) >= MIN_ATTENDANCE_SECONDS).length,
    // ONLY the staff-verified task. Not a join, not a slot, not a recording.
    presented: rows.filter((r) => Boolean(r.presentedVerifiedAt)).length,
    rehearsed: rows.filter((r) => n(r.rehearsalsWithRecording) > 0).length,
    withSlot: rows.filter((r) => r.hasSlot === true).length,
    missingRecordings: rows.reduce((s, r) => s + n(r.missingRecordings), 0),
    awaitingApproval: rows.reduce((s, r) => s + n(r.awaitingApproval), 0),
    sources: {
      intent: 'Pressed join at least once. This is a click, not attendance.',
      attended: `In the room for at least ${MIN_ATTENDANCE_SECONDS / 60} minutes, from the session record.`,
      presented: 'PREP-6 verified by a member of staff. Nobody can mark their own.',
      rehearsed: 'Has at least one rehearsal recording that actually arrived.',
      withSlot: 'Holds a booked presenter slot.',
      missingRecordings: 'A recording was expected for a booked attempt and never arrived.',
      awaitingApproval: 'Showcase approvals waiting on staff.',
    },
  };
}

/**
 * Who needs chasing, and why — in the order an instructor should act.
 *
 * Deliberately returns a REASON per learner rather than a score. "Ranked 7th on
 * readiness" tells an instructor nothing they can act on; "booked, never rehearsed"
 * tells them what to say.
 */
export interface Concern {
  enrollmentId: string;
  reason: string;
  severity: 'high' | 'medium';
}

export function concerns(rows: CohortRow[]): Concern[] {
  const out: Concern[] = [];
  for (const r of rows) {
    const rehearsed = Number(r.rehearsalsWithRecording || 0) > 0;
    if (r.hasSlot && !rehearsed) {
      out.push({ enrollmentId: r.enrollmentId, reason: 'Has a demo-day slot but has never rehearsed.', severity: 'high' });
    }
    if (Number(r.missingRecordings || 0) > 0) {
      out.push({ enrollmentId: r.enrollmentId, reason: 'A rehearsal recording never arrived — they may think it was captured.', severity: 'high' });
    }
    if (!r.hasSlot && rehearsed) {
      out.push({ enrollmentId: r.enrollmentId, reason: 'Rehearsing but has not booked a demo-day slot.', severity: 'medium' });
    }
  }
  // High first; otherwise stable, so the list does not reshuffle between refreshes.
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}

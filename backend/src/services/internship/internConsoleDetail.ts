import { getConsoleRoster, ConsoleRosterRow } from './internConsoleRoster';
import { certAttempts, CertAttemptSeries, internCertification, InternCertification } from './internshipCertification';
import { getStudentSectionBreakdown, StudentSectionRow } from '../curriculumCompletionService';
import { getPersonTimeline, TimelineEvent } from '../adminOs/personTimelineService';

/**
 * internConsoleDetail — everything about ONE intern, for the console's focus panel.
 *
 * ── THE ROW IS THE ROSTER'S ROW, NOT A SECOND VERSION OF IT ─────────────────────────────
 *
 * The headline block reuses `getConsoleRoster` scoped to this one enrollment rather than
 * assembling its own. That costs the same six queries the roster costs, for one person, and it buys
 * the thing worth buying: the detail page cannot say "red" while the roster says "orange" about the
 * same intern on the same day. Both numbers look authoritative to a manager, and a disagreement
 * between them is harder to notice and harder to explain than either being wrong alone.
 *
 * It also means the 404 is honest. "Not an active intern" is decided by the same predicate the
 * roster uses — active `cohort_memberships`, `membership_type='internship'`, cohort
 * `cohort_type='ai_internship'` — so a student who is not an intern cannot be reached through this
 * endpoint by guessing an enrollment id, and an intern the roster omits cannot be opened either.
 *
 * ── WHAT THE DETAIL ADDS ────────────────────────────────────────────────────────────────
 *
 * Three things the roster deliberately does not carry, because they are per-intern depth rather
 * than per-row summary:
 *
 *   - the per-SECTION training breakdown (seven buckets per week, not just a week percentage)
 *   - the cert attempt series, each point carrying its own item count, plus the readiness/claim pair
 *   - the activity FEED, which is the timeline's own job — the roster carries day counts instead
 *
 * And, as everywhere in this console, **no attendance**: 7 join rows existed across 2 interns and no
 * denominator exists anywhere, so the stat is off rather than degraded.
 */

export interface InternConsoleDetail {
  readonly intern: ConsoleRosterRow;
  /** Per-week, per-bucket completion. Null when the intern is in no cohort to compare against. */
  readonly training_sections: StudentSectionRow[] | null;
  readonly scheduled_week: number | null;
  readonly cert: {
    readonly series: CertAttemptSeries;
    /** Practice readiness and the official claim, as two separate facts. They do not join. */
    readonly standing: InternCertification;
  };
  readonly feed: TimelineEvent[];
}

/** How many feed entries the focus panel asks for. The timeline caps at 500 regardless. */
export const FEED_LIMIT = 50;

/** Fail-soft per source: a broken cert query must not cost the panel the training breakdown. */
async function soft<T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err: any) {
    console.warn(`[InternConsoleDetail] ${what} unavailable:`, err?.message);
    return fallback;
  }
}

/**
 * One intern's detail, or null when that enrollment is not an active intern.
 *
 * Null rather than an empty shell: an empty detail page renders as "this intern has done nothing",
 * which is a claim about a real person. Null lets the route answer 404, which is the truth.
 */
export async function getInternConsoleDetail(
  enrollmentId: string,
  opts: { now?: Date } = {},
): Promise<InternConsoleDetail | null> {
  if (!enrollmentId) return null;

  const [intern] = await getConsoleRoster({ now: opts.now, enrollmentIds: [enrollmentId] });
  if (!intern) return null;

  const [sections, series, standing, feed] = await Promise.all([
    intern.cohort.id
      ? soft('section breakdown', () => getStudentSectionBreakdown(intern.cohort.id!, enrollmentId), null)
      : Promise.resolve(null),
    soft('cert series', () => certAttempts(enrollmentId), { attempts: [], passing_scaled_score: 0 }),
    soft('cert standing', () => internCertification(enrollmentId), null as unknown as InternCertification),
    soft('activity feed', () => getPersonTimeline({
      leadIds: [],
      enrollmentIds: [enrollmentId],
      // The same two domains the activity signal reads. Acquisition and commerce describe how this
      // person was sold to, which is not what they have been doing.
      domains: ['learning', 'community'],
      limit: FEED_LIMIT,
    }), [] as TimelineEvent[]),
  ]);

  return {
    intern,
    training_sections: sections ? sections.rows : null,
    scheduled_week: sections ? sections.scheduledWeek : null,
    cert: { series, standing },
    feed,
  };
}

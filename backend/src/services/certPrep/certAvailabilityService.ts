import Enrollment from '../../models/Enrollment';
import Cohort from '../../models/Cohort';
import { sequelize } from '../../config/database';

/**
 * certAvailabilityService — the server-side Week 7 fence for Cert Prep.
 *
 * WHY THIS EXISTS AT ALL. Everywhere else in the portal the program week is a URL
 * parameter (`/portal/classroom/week/:weekNum`) and the backend accepts it as
 * input. That is fine for navigating a curriculum, and completely unusable as a
 * gate: a student who types `/portal/cert-prep?week=9` in Week 3 would let
 * themselves in. Cert Prep availability is therefore derived here, on the server,
 * from the enrollment's own cohort start date, and no caller may pass a week in.
 *
 * FAIL CLOSED — and note that this is the OPPOSITE of `useEntitlement` (frontend)
 * and `timelineGatingService` (backend), which both deliberately fail OPEN so a
 * transient error never traps a paying student behind a buggy rule. The trade is
 * different here. Failing open on a content-reveal fence means a Week 3 student
 * sees certification pressure the program has explicitly decided they must not see
 * yet; failing closed means a Week 9 student briefly cannot start a drill and
 * retries. The first is a product violation, the second is an inconvenience. If
 * you ever "fix" this to fail open, you have broken the Week 1-6 guarantee.
 *
 * WEEK NUMBERING. Week 1 is the seven days beginning on `cohort.start_date`, so
 * day 0-6 is week 1 and day 7-13 is week 2. Arithmetic is whole-days in UTC, which
 * keeps a daylight-saving transition from silently shifting a cohort a week early
 * (`start_date` is a DATE string, not a timestamp — there is no wall-clock time to
 * preserve, so parsing it as UTC midnight is exact rather than an approximation).
 * A cohort that has not started yet is week 0, which is before every start week and
 * therefore closed.
 */

/** Why Cert Prep is or is not open, for both the API response and the UI copy. */
export type CertAvailabilityReason =
  | 'available'
  | 'before_start_week'
  | 'not_started'
  | 'no_cohort_start'
  | 'no_active_track'
  | 'error';

export interface CertAvailability {
  available: boolean;
  /** Derived server-side; null when it could not be established. */
  programWeek: number | null;
  /** The track's configured `availability_start_week` (7 by default). */
  startWeek: number | null;
  trackId: string | null;
  reason: CertAvailabilityReason;
}

const MS_PER_DAY = 86_400_000;

/**
 * Pure week derivation — exported so the boundary cases are unit-testable without
 * a database. Returns 0 for a cohort that has not started, and null when the date
 * is missing or unparseable (the caller must then fail closed, not assume week 1).
 */
export function deriveProgramWeek(startDate: string | null | undefined, now: Date): number | null {
  if (!startDate) return null;

  // Accept 'YYYY-MM-DD' and full ISO timestamps; anchor both to UTC midnight so
  // the comparison is a whole number of days regardless of the server's zone.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(startDate));
  if (!match) return null;
  const startUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(startUtc)) return null;

  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((nowUtc - startUtc) / MS_PER_DAY);
  if (days < 0) return 0; // cohort has not started

  return Math.floor(days / 7) + 1;
}

/** True when `week` has reached the track's configured start week. */
export function isWeekAtOrAfter(week: number | null, startWeek: number | null): boolean {
  if (week == null || startWeek == null) return false;
  return week >= startWeek;
}

/**
 * Resolve the current track's availability_start_week. Reads the single current
 * row for the track; returns null when no active/current track is configured,
 * which closes the fence (there is nothing to be ready for yet).
 */
async function loadCurrentTrack(
  trackId?: string,
): Promise<{ track_id: string; availability_start_week: number } | null> {
  const where = trackId ? 'AND track_id = :trackId' : '';
  const [rows] = await sequelize.query(
    `SELECT track_id, availability_start_week
       FROM cert_tracks
      WHERE is_current AND is_active ${where}
      ORDER BY updated_at DESC
      LIMIT 1`,
    { replacements: trackId ? { trackId } : {} },
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  return {
    track_id: String(row.track_id),
    availability_start_week: Number(row.availability_start_week),
  };
}

/**
 * The single authority on whether this enrollment may touch Cert Prep activity.
 * Every Cert Prep route — student and API alike — goes through this; none of them
 * accept a week from the caller.
 */
export async function getCertAvailability(
  enrollmentId: string,
  now: Date = new Date(),
  trackId?: string,
): Promise<CertAvailability> {
  const closed = (reason: CertAvailabilityReason, extra: Partial<CertAvailability> = {}): CertAvailability => ({
    available: false,
    programWeek: null,
    startWeek: null,
    trackId: null,
    reason,
    ...extra,
  });

  try {
    const track = await loadCurrentTrack(trackId);
    if (!track) return closed('no_active_track');

    const enrollment = await Enrollment.findByPk(enrollmentId, {
      attributes: ['id', 'cohort_id'],
    });
    if (!enrollment || !enrollment.cohort_id) {
      return closed('no_cohort_start', { trackId: track.track_id, startWeek: track.availability_start_week });
    }

    const cohort = await Cohort.findByPk(enrollment.cohort_id, { attributes: ['id', 'start_date'] });
    const programWeek = deriveProgramWeek(cohort?.start_date, now);

    if (programWeek == null) {
      return closed('no_cohort_start', { trackId: track.track_id, startWeek: track.availability_start_week });
    }

    const base = {
      programWeek,
      startWeek: track.availability_start_week,
      trackId: track.track_id,
    };

    if (programWeek === 0) return { ...base, available: false, reason: 'not_started' };
    if (!isWeekAtOrAfter(programWeek, track.availability_start_week)) {
      return { ...base, available: false, reason: 'before_start_week' };
    }
    return { ...base, available: true, reason: 'available' };
  } catch (err: any) {
    // Fail closed — see the header. Logged so a persistent fault is visible rather
    // than quietly locking a whole cohort out of a feature they have paid for.
    console.warn('[certPrep] availability check failed, closing fence:', err?.message);
    return closed('error');
  }
}

/**
 * Route-guard form. Throws a 403-shaped error when the fence is closed so a
 * controller can `await assertCertAvailable(...)` without restating the policy.
 */
export async function assertCertAvailable(enrollmentId: string, now: Date = new Date()): Promise<CertAvailability> {
  const availability = await getCertAvailability(enrollmentId, now);
  if (!availability.available) {
    const err: any = new Error('Cert Prep is not available for this enrollment yet');
    err.status = 403;
    err.code = 'CERT_PREP_NOT_AVAILABLE';
    err.availability = availability;
    throw err;
  }
  return availability;
}

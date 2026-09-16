import Cohort from '../../models/Cohort';

/**
 * The AI Internship cohort.
 *
 * ── ONE COHORT, NOT ONE PER INTAKE ─────────────────────────────────────────
 *
 * AI_INTERNSHIP_SPEC.md decision 4: "The internship is a CLASS you enroll in.
 * There is ONE class that all interns are enrolled in." And the programme has
 * rolling weekly starts with no end date, so a dated cohort per intake would mean
 * a new row every Monday, none of which describes anything real.
 *
 * So there is a single row with `cohort_type = 'ai_internship'`, found by that
 * type rather than by name — a rename must not orphan every intern's membership.
 *
 * ── NO SCHEMA CHANGE ───────────────────────────────────────────────────────
 *
 * `Cohort` already has `cohort_type` and `settings_json`, which is why the
 * discovery report said this needs none. Everything the contract asks a cohort to
 * configure — minimum hours, meeting schedule, max projects, curriculum version,
 * attendance expectations, manager-review frequency — fits `settings_json`.
 *
 * ── CAPACITY IS DELIBERATELY UNLIMITED ─────────────────────────────────────
 *
 * The contract lists "Application capacity" as a setting. Ali's decision 3 was
 * explicit that there is **no real capacity cap** — "space is limited" is urgency
 * copy. So `application_capacity` is null and `max_seats` is set high enough to be
 * inert rather than becoming a seat-counting gate nobody asked for.
 */

export const INTERNSHIP_COHORT_TYPE = 'ai_internship';
export const INTERNSHIP_COHORT_NAME = 'AI Internship';

/**
 * One standing weekly meeting an intern is expected at.
 *
 * `day`/`kind` are the original two fields; the rest were added when the meetings
 * moved off Discord into Zoom-in-Rooms. `audience` separates the interns-only
 * standup from the three public community sessions (which also take Eventbrite
 * registration). `join_url` is the room's persistent Zoom link and `room_slug`
 * deep-links into /portal/rooms so a join can be attendance-tracked; both are
 * filled once the room exists, so they stay optional and null-safe.
 */
export interface RequiredMeeting {
  day: string;
  kind: string;
  /** Local start time, e.g. "9:00 AM". */
  time?: string;
  /** Short timezone label shown next to the time, e.g. "CT". */
  timezone?: string;
  audience?: 'interns_only' | 'public';
  /** Display title, e.g. "AI Friday Trends". Falls back to kind when absent. */
  title?: string;
  /** The room's persistent Zoom join link. Null until the room is provisioned. */
  join_url?: string | null;
  /** Slug of the /portal/rooms room, so a join routes through attendance capture. */
  room_slug?: string | null;
  /** Eventbrite series URL for the public sessions; null for the interns-only call. */
  registration_url?: string | null;
}

export interface InternshipCohortSettings {
  /** Contract: "Minimum weekly hours: 25". */
  minimum_weekly_hours: number;
  /** Contract: "Required meeting schedule". Interns-only standup Mon; public AI
   *  community sessions Tue/Wed/Fri; project work fills the rest of the week. */
  required_meetings: readonly RequiredMeeting[];
  /** Contract: "Maximum active projects: 2". */
  max_active_projects: number;
  curriculum_version: string;
  /** Contract: "Attendance expectations". */
  attendance: { notify_before_absence: boolean; expected_meeting_attendance: 'all_required' };
  /** Contract: "Manager-review frequency". */
  manager_review_every_days: number;
  /**
   * Whether an intern must hold the membership. TRUE per Ali 2026-09-09.
   * Flipping this to false is the ONLY thing needed to make the internship free,
   * and it is a deliberate act rather than a side effect.
   */
  requires_subscription: boolean;
  /**
   * Null on purpose — see the header. Present so nobody adds it back believing it
   * was simply forgotten.
   */
  application_capacity: number | null;
  /** Open-ended: the internship runs until the intern lands a full-time AI role. */
  open_ended: true;
}

export const DEFAULT_INTERNSHIP_SETTINGS: InternshipCohortSettings = {
  minimum_weekly_hours: 25,
  // The interns-only standup plus the three public AI community sessions, at their
  // real times. join_url / room_slug are filled when the Zoom-in-Rooms rooms are
  // provisioned; the public sessions also take Eventbrite registration.
  required_meetings: [
    { day: 'Monday', kind: 'standup', time: '9:00 AM', timezone: 'CT', audience: 'interns_only', title: 'Intern standup' },
    { day: 'Tuesday', kind: 'session', time: '10:00 AM', timezone: 'CT', audience: 'public', title: 'AI Internship Presentation' },
    { day: 'Wednesday', kind: 'session', time: '10:00 AM', timezone: 'CT', audience: 'public', title: 'AI Strategy & Collaboration' },
    { day: 'Friday', kind: 'session', time: '9:00 AM', timezone: 'CT', audience: 'public', title: 'AI Friday Trends' },
  ],
  max_active_projects: 2,
  curriculum_version: 'v1',
  attendance: { notify_before_absence: true, expected_meeting_attendance: 'all_required' },
  manager_review_every_days: 14,
  requires_subscription: true,
  application_capacity: null,
  open_ended: true,
};

/** The internship cohort, or null when it has not been created yet. */
export async function findInternshipCohort(): Promise<Cohort | null> {
  return Cohort.findOne({
    where: { cohort_type: INTERNSHIP_COHORT_TYPE },
    order: [['created_at', 'ASC']],
  });
}

/**
 * Find or create it. Idempotent — a second call returns the first row.
 *
 * `startMs` is injected so a test does not depend on the clock. The date is the
 * cohort's own creation date and is NOT an intake date: an intern's real start is
 * the Monday after they are activated, computed per person.
 */
export async function ensureInternshipCohort(params?: {
  startMs?: number;
}): Promise<{ cohort: Cohort; created: boolean }> {
  const existing = await findInternshipCohort();
  if (existing) {
    // Backfill settings on a cohort created before this service existed (or by
    // hand in the admin UI) rather than leaving it half-configured. Existing keys
    // win, so an operator's deliberate override is never overwritten.
    const current = (existing.settings_json ?? {}) as Partial<InternshipCohortSettings>;
    const merged = { ...DEFAULT_INTERNSHIP_SETTINGS, ...current };
    if (JSON.stringify(merged) !== JSON.stringify(current)) {
      await existing.update({ settings_json: merged });
    }
    return { cohort: existing, created: false };
  }

  const startMs = params?.startMs ?? Date.now();

  const cohort = await Cohort.create({
    name: INTERNSHIP_COHORT_NAME,
    description:
      'The standing AI Internship. Rolling weekly starts, open-ended: an intern '
      + 'runs until they land a full-time AI role. Not a dated class.',
    start_date: new Date(startMs).toISOString().slice(0, 10),
    // Monday scrum is the anchor meeting, so it is the core day.
    core_day: 'Monday',
    core_time: '10:00 AM',
    optional_lab_day: null,
    // High enough to be inert. See the header: there is no capacity gate.
    max_seats: 9999,
    seats_taken: 0,
    status: 'open',
    cohort_type: INTERNSHIP_COHORT_TYPE,
    curriculum_version: DEFAULT_INTERNSHIP_SETTINGS.curriculum_version,
    settings_json: DEFAULT_INTERNSHIP_SETTINGS,
  } as any);

  return { cohort, created: true };
}

/** Settings for a cohort row, with defaults filled in for anything absent. */
export function internshipSettings(cohort: Cohort | null): InternshipCohortSettings {
  const raw = (cohort?.settings_json ?? {}) as Partial<InternshipCohortSettings>;
  return { ...DEFAULT_INTERNSHIP_SETTINGS, ...raw };
}

/**
 * Does the internship require the membership right now?
 *
 * Read through this function rather than off the row, so the default is applied
 * consistently. A cohort that does not exist yet still answers `true` — failing
 * toward "payment required" is the safe direction, because the opposite silently
 * gives away the paid programme.
 */
export async function internshipRequiresSubscription(): Promise<boolean> {
  const cohort = await findInternshipCohort();
  return internshipSettings(cohort).requires_subscription;
}

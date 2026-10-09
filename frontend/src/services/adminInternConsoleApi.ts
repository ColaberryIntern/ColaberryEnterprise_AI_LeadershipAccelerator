import api from '../utils/api';

/**
 * Admin client for the Intern Console.
 *
 * The types here mirror the backend's response exactly, including its absences. **There is no
 * attendance field and no aggregate cert score**, and that is deliberate rather than unfinished:
 *
 *   - Attendance: the whole `internship_meeting_attendance` table held 7 join rows across 2 interns,
 *     and no denominator exists anywhere. Switched off by product decision.
 *   - Cert score: practice sittings are scored on sets of 1, 10, 15 and 60 items, so a 1-item
 *     sitting scoring 1000 sits in the same series as a 60-item mock scoring 895. Every point
 *     carries its own `items`, and nothing averages them.
 *
 * If either reappears as a field here, it reappeared on a screen. The console's component tests
 * assert their absence for that reason.
 */

/** The six bands, in the order they degrade. `unknown` means never active, not "very stale". */
export type ActivityLevel = 'green' | 'yellow' | 'orange' | 'red' | 'black' | 'unknown';
export type PaceBand = 'gold' | 'green' | 'yellow' | 'red';

/** The four tracks, plus `other` for a source the server does not recognise. */
export type ActivityCategory = 'training' | 'project' | 'certification' | 'community' | 'other';

// TRACK_ORDER and TRACK_LABEL deliberately live in `consoleFormat`, not here. A component that
// imports a runtime CONSTANT from this module gets `undefined` in any test that mocks the client —
// which is every component test — and throws on first render. Types are safe because they erase;
// values are not. This cost two debugging rounds before it was moved.

export interface ActivityDay {
  date: string;
  events: number;
  /** The same total split by track. Always all five keys, computed server-side. */
  by_category: Record<ActivityCategory, number>;
}

export interface ActivitySignal {
  last_activity_at: string | null;
  last_activity_source: string | null;
  days_since: number | null;
  level: ActivityLevel;
  /** 28 entries, oldest first, zeros included — the heatmap needs the quiet days present. */
  days: ActivityDay[];
  /** True when the band was capped by the new-intern grace rule rather than measured. */
  graced: boolean;
}

export interface WeekRow {
  week: number | null;
  publishedCardCount: number;
  completed: number;
  completedPct: number;
  weekDone: boolean;
}

export interface SectionRow extends WeekRow {
  sections: Array<{ bucket: string; published: number; completed: number; completedPct: number }>;
}

export interface Pace {
  weeks_completed: number;
  scheduled_week: number;
  delta: number;
  band: PaceBand;
}

export interface Training {
  weeks: WeekRow[];
  weeks_completed: number;
  weeks_1_3_clear: boolean;
  /** Null when there is nothing to pace against — the reason is in `pace_unavailable`. */
  pace: Pace | null;
  pace_unavailable: 'no_cohort' | 'cohort_has_no_sessions' | null;
}

export interface Cert {
  sittings: number;
  completed: number;
  last_sitting_at: string | null;
  /** False when cert prep is switched off, so the panel says so instead of showing zeros. */
  available: boolean;
}

export interface ConsoleProject {
  project_id: string;
  name: string | null;
  stage: string;
  tasks_total: number;
  tasks_complete: number;
  tasks_pct: number;
  has_repo: boolean;
  command_center_url: string | null;
}

export interface InternRow {
  enrollment_id: string;
  name: string;
  email: string | null;
  application_state: string | null;
  /** The latest application's id, or null when they hold none. Opens them in Applications. */
  application_id: string | null;
  joined_at: string | null;
  day: number | null;
  cohort: { id: string | null; name: string | null; type: string | null };
  activity: ActivitySignal;
  training: Training;
  cert: Cert;
  /** Null is the common case — most interns have no project yet. */
  project: ConsoleProject | null;
}

export interface ConsoleCounts {
  interns: number;
  weeks_1_3_clear: number;
  no_project: number;
  quiet_4_plus: number;
  dark_10_plus: number;
  never_active: number;
  cert_started: number;
  paused: number;
  pace_unavailable: number;
}

export interface ConsoleRoster {
  interns: InternRow[];
  counts: ConsoleCounts;
  /**
   * The project stages, in order, from the backend's own `PROJECT_STAGES`.
   *
   * Served rather than duplicated here: a client holding its own copy silently loses a column the
   * day a stage is added, and every project sitting in that stage disappears from the pipeline.
   */
  stages: string[];
}

export interface TimelineEntry {
  occurredAt: string;
  domain: string;
  source: string;
  type: string;
  summary: string | null;
  occurrences: number;
}

export interface InternDetail {
  intern: InternRow;
  training_sections: SectionRow[] | null;
  scheduled_week: number | null;
  cert: {
    series: {
      attempts: Array<{
        completed_at: string; mode: string; scaled_score: number;
        /** The denominator. Null when the row does not record it — never 0. */
        items: number | null; correct: number | null;
      }>;
      passing_scaled_score: number;
    };
    standing: unknown;
  };
  feed: TimelineEntry[];
}

export async function fetchConsoleRoster(): Promise<ConsoleRoster> {
  const { data } = await api.get<ConsoleRoster>('/api/admin/internship/console');
  return data;
}

export async function fetchInternDetail(enrollmentId: string): Promise<InternDetail> {
  const { data } = await api.get<InternDetail>(
    `/api/admin/internship/console/${encodeURIComponent(enrollmentId)}`,
  );
  return data;
}

/**
 * The five status actions the console offers.
 *
 * `pause` and `resume` are reversible — the state machine has edges both ways. `complete`,
 * `withdraw` and `remove` are **terminal**: there is no edge out of them, and reapplying opens a NEW
 * application rather than reviving the old record. The server requires `confirm` to equal the action
 * name for those three, and this client never fills it in automatically — the whole point is that a
 * human typed it.
 */
export type InternAction = 'pause' | 'resume' | 'complete' | 'withdraw' | 'remove';

export const ONE_WAY_ACTIONS: readonly InternAction[] = ['complete', 'withdraw', 'remove'];

export interface TransitionResult {
  application_id: string;
  state: string;
  action: InternAction;
}

export async function transitionIntern(
  applicationId: string,
  action: InternAction,
  opts: { reason?: string; confirm?: string } = {},
): Promise<TransitionResult> {
  const { data } = await api.post<TransitionResult>(
    `/api/admin/internship/applications/${encodeURIComponent(applicationId)}/transition`,
    { action, ...(opts.reason ? { reason: opts.reason } : {}), ...(opts.confirm ? { confirm: opts.confirm } : {}) },
  );
  return data;
}

/** The fixed server-side template list. The client never supplies the words. */
export type NudgeTemplate = 'quiet_check_in' | 'weeks_1_3_reminder' | 'project_start';

export interface NudgeResult { outcome: string; subject?: string; to?: string; reason?: string; }

/**
 * Send, or preview, one nudge.
 *
 * `send` defaults to false on the server too — a request without it previews. The console asks for
 * the preview first and only sends on a second, explicit click, so the manager sees the subject and
 * recipient before anything leaves.
 */
export async function nudgeIntern(
  applicationId: string,
  template: NudgeTemplate,
  opts: { note?: string; send?: boolean } = {},
): Promise<NudgeResult> {
  const { data } = await api.post<NudgeResult>(
    `/api/admin/internship/applications/${encodeURIComponent(applicationId)}/nudge`,
    { template, ...(opts.note ? { note: opts.note } : {}), ...(opts.send ? { send: true } : {}) },
  );
  return data;
}

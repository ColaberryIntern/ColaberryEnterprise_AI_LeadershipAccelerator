/**
 * The JSON sidecar contract: internship-report-<YYYY-MM-DD>.json, attached to the same email as the
 * HTML so an agent can read the report without parsing HTML.
 *
 * Rules (from the spec, 10 Nov 2026):
 *   - every value comes from the computation that feeds the HTML; nothing is recomputed a second way
 *   - missing data is null, never 0 and never a guess
 *   - UTF-8, no inline images, no base64
 *
 * Bump SIDECAR_VERSION on any breaking change (a renamed or removed field, a changed meaning).
 * Adding a field is not breaking.
 */
export const SIDECAR_VERSION = 1;

import type { Communication } from './communications';
import type { Highlight } from './highlights';
export type { Communication, Highlight };

export type TriageTier =
  | 'no_project_at_day_N'
  | 'never_started_building'
  | 'blocked_waiting_on_ali'
  | 'overdue_backlog'
  | 'quiet'
  | 'on_track';

export type ArtifactClassification = 'project_artifact' | 'training_upload' | 'studio_artifact' | 'test_or_scratch';

export interface SidecarCounts {
  interns: number;
  on_track: number;
  need_attention: number;
  stalled: number;
  weeks_1_3_cleared: number | null;
  no_project: number | null;
  replies_owed: number;
}

export interface SidecarArtifact {
  id: string;
  kind: string;
  kind_label: string;
  title: string;
  published_at: string;
  url: string;
  source: 'repo' | 'upload' | 'link';
  provenance: string;
  file_type: string;
  wrong_format: boolean;
  classification: ArtifactClassification;
}

export interface SidecarAsk { key: string; name: string; why: string; prompt: string; nudge: string }

export interface SidecarTimelineRow {
  date: string;
  date_end: string;
  kind: string;
  text: string;
  href: string | null;
}

export interface SidecarNext { kind: string; label: string; detail: string }

export interface SidecarIntern {
  name: string;
  first_name: string;
  enrollment_id: string;
  track: string;
  track_label: string;
  link: string | null;
  day: number | null;
  status: { key: string; label: string };
  chips: string[];
  narrative: string;
  narrative_from_model: boolean;
  story: string;
  project: {
    name: string;
    id: string | null;
    kind: string;
    repo_url: string | null;
    command_center_url: string | null;
    stage: string | null;
  } | null;
  stories_verified: number | null;
  stories_total: number | null;
  percent_built: number | null;
  overdue_tasks: number | null;
  training: { weeks_completed: number; weeks_total: number; gate_cleared: boolean; gate_done: number; gate_of: 3 };
  days_since_build_work: number | null;
  build_work_in_window: boolean | null;
  counts: { verified: number | null; commits: number | null; asks: number; blockers: number; replies_from_ali: number; stuck_events: number; training_days: number };
  most_urgent: SidecarNext | null;
  most_urgent_overflow: SidecarNext[];
  timeline: SidecarTimelineRow[];
  asking_you: string[];
  asking_you_from_model: boolean;
  open_questions: Array<{ received_at: string; subject: string; text: string; kind: 'question' | 'stuck' }>;
  nudge: string;
  artifacts: SidecarArtifact[];
  artifacts_raw_count: number;
  artifacts_real_count: number;
  asks: SidecarAsk[];
  triage: { tier: TriageTier; reason: string };
  pacing: {
    day: number | null;
    program_day_total: number | null;
    program_day_total_basis: string | null;
    expected_training_week: number | null;
    expected_basis: 'cohort_schedule' | 'day_count' | null;
    actual_training_week: number;
    weeks_behind: number | null;
  };
  last_ask: { sent_at: string; from: string; subject: string | null; body_text: string | null; body_truncated: boolean; satisfied: boolean | null; satisfied_by: string | null } | null;
  /** This intern's most insightful messages (both directions), best first, at most 10 (communications.ts). */
  communications: Communication[];
  delta: {
    previous_report_date: string;
    verified_since_last: number | null;
    commits_since_last: number | null;
    artifacts_since_last: number | null;
    days_quiet_change: number | null;
    tier_changed_from: TriageTier | null;
  } | null;
}

export interface Sidecar {
  sidecar_version: number;
  generated_at: string;
  report_date: string;
  window_days: number;
  previous_report_date: string | null;
  counts: SidecarCounts;
  your_move: string[];
  operators_excluded: string[];
  /** The 10 most impactful things in this report, in tour order (highlights.ts), at most 2 per intern. */
  highlights: Highlight[];
  interns: SidecarIntern[];
}

/** Every key each interns[] entry must carry (asserted by tests and by the script before sending). */
export const REQUIRED_INTERN_KEYS: ReadonlyArray<keyof SidecarIntern> = [
  'name', 'first_name', 'enrollment_id', 'track', 'track_label', 'link', 'day', 'status', 'chips', 'narrative', 'narrative_from_model',
  'story', 'project', 'stories_verified', 'stories_total', 'percent_built', 'overdue_tasks', 'training', 'days_since_build_work',
  'build_work_in_window', 'counts', 'most_urgent', 'most_urgent_overflow', 'timeline', 'asking_you', 'asking_you_from_model',
  'open_questions', 'nudge', 'artifacts', 'artifacts_raw_count', 'artifacts_real_count', 'asks', 'triage', 'pacing', 'last_ask', 'communications', 'delta',
];

/** What the previous run persisted, per intern: the minimum needed to compute `delta`. */
export interface SnapshotIntern {
  enrollment_id: string;
  stories_verified: number | null;
  days_since_build_work: number | null;
  artifacts_raw_count: number;
  triage_tier: TriageTier;
}
export interface PreviousSnapshot { report_date: string; generated_at: string; interns: SnapshotIntern[] }

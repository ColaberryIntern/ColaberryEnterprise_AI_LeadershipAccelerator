import api from '../utils/api';

/**
 * Per-intern nudge briefs: the long message, generated from live data when a row is opened.
 *
 * Distinct from `agentNudgeApi`, which is keyed on an agent domain and covers the seven agent
 * builders only. These are keyed on an enrollment and cover everybody on the console roster.
 */

export type TriageTier =
  | 'no_project_at_day_N' | 'never_started_building' | 'blocked_waiting_on_ali'
  | 'overdue_backlog' | 'quiet' | 'on_track';

export const TIER_LABEL: Record<TriageTier, string> = {
  blocked_waiting_on_ali: 'Waiting on you',
  no_project_at_day_N: 'No project',
  never_started_building: 'Never started',
  overdue_backlog: 'Overdue backlog',
  quiet: 'Gone quiet',
  on_track: 'On track',
};

/** Row order: the order the day should be worked, most urgent first. */
export const TIER_RANK: Record<TriageTier, number> = {
  blocked_waiting_on_ali: 0,
  no_project_at_day_N: 1,
  never_started_building: 2,
  overdue_backlog: 3,
  quiet: 4,
  on_track: 5,
};

export const TIER_TONE: Record<TriageTier, string> = {
  blocked_waiting_on_ali: 'alert',
  no_project_at_day_N: 'alert',
  never_started_building: 'alert',
  overdue_backlog: 'warn',
  quiet: 'warn',
  on_track: 'ok',
};

export interface BriefDeadline {
  what: string;
  dueOn: string;
  daysLeft: number;
  outstanding: string[];
}

export interface BriefPromise {
  sentAt: string;
  subject: string | null;
  quote: string;
}

export interface NudgeBrief {
  enrollmentId: string;
  name: string;
  firstName: string;
  email: string | null;
  tier: TriageTier;
  tierReason: string;
  trackLabel: string;
  projectName: string | null;
  deadline: BriefDeadline | null;
  promises: BriefPromise[];
  subject: string;
  body: string;
  attachment: { filename: string; prompt: string } | null;
  warnings: string[];
  generatedAt: string;
}

export type BriefSendOutcome =
  | { enrollmentId: string; email: string; outcome: 'dry_run'; subject: string; businessEventId: string }
  | { enrollmentId: string; email: string; outcome: 'skipped'; reason: string }
  | { enrollmentId: string; email: string; outcome: 'sent'; subject: string; messageId?: string }
  | { enrollmentId: string; email: string; outcome: 'failed'; errorClass: string; error: string };

/** Generated at call time, never cached: that is the point of opening the row. */
export async function fetchBrief(enrollmentId: string): Promise<NudgeBrief> {
  const { data } = await api.get(`/api/admin/intern-nudges/${encodeURIComponent(enrollmentId)}`);
  return data.brief as NudgeBrief;
}

/**
 * Sends the text that was on screen, including any edit the manager made to it, so what was
 * approved is what is delivered. `generatedAt` is the one the brief came back with, so the server
 * can refuse a message composed too long ago to still describe the person.
 */
export async function sendBriefMessage(
  enrollmentId: string,
  input: { body: string; subject: string; generatedAt: string; send: boolean },
): Promise<BriefSendOutcome> {
  const { data } = await api.post(`/api/admin/intern-nudges/${encodeURIComponent(enrollmentId)}`, input);
  return data as BriefSendOutcome;
}

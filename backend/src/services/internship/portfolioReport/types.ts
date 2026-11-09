/**
 * Contracts for the Internship Portfolio Report.
 *
 * Inputs reuse the types of the services the admin page renders from (ConsoleRosterRow,
 * AgentNudgeState, GovPipelineCard, ProjectReadinessRow), so a change to any of those that
 * affects this report fails `tsc` here instead of silently blanking a column in Ali's inbox.
 */
import type { ConsoleRosterRow, ConsoleCounts } from '../internConsoleRoster';
import type { AgentNudgeState } from '../agentNudgeComposer';
import type { ProjectReadinessRow } from '../internshipProjectReadiness';
import type { GovPipelineCard } from '../../factory/govPipeline';

export interface FeedItem {
  occurredAt: string;
  domain: string;
  source: string;
  type: string;
  summary: string;
  occurrences?: number;
}

export interface CommitSummary { sha?: string; date?: string; author?: string; message?: string }

/** One row of PROJECT_SQL (collect.ts). */
export interface ProjectFacts {
  project_id: string;
  repo_url: string | null;
  last_sync_at: string | null;
  commits: CommitSummary[] | null;
  recently_verified: Array<{ story_id: string | null; title: string; verified_at: string }> | null;
  next_tasks: Array<{ story_id: string | null; title: string; due_on: string | null; status: string | null }> | null;
  overdue: number;
}

export interface InternEmail { email: string; subject: string | null; snippet: string | null; received_at: string }
export interface WeWrote { email: string; last_we_wrote: string | null }

export interface ReportSubscription { cadence: string; scope: string[] | null; hour: number; enabled: boolean; by: string | null }

/** One row of AGENT_SQL (collect.ts): an agent tab with its assigned builder. */
export interface AgentTab {
  domain_key: string;
  agent_id: string | null;
  student_project_id: string | null;
  intended_builder: string | null;
  project_name: string | null;
  email: string | null;
  subscriptions: ReportSubscription[] | null;
}

export interface CollectedPortfolio {
  generatedAt: string;
  lookbackDays: number;
  emailLookbackDays: number;
  counts: ConsoleCounts | Record<string, number>;
  roster: ConsoleRosterRow[];
  feeds: Record<string, FeedItem[]>;
  readiness: ProjectReadinessRow[];
  agentStates: AgentNudgeState[];
  agentTabs: AgentTab[];
  govPursuits: GovPipelineCard[];
  projects: ProjectFacts[];
  emails: InternEmail[];
  weWrote: WeWrote[];
}

export type Track = 'agent' | 'gov' | 'other' | 'none';
export type StatusKey = 'on_track' | 'attention' | 'stalled';

export interface ActivityTotals { training: number; project: number; certification: number; community: number; other: number; activeDays: number }

export interface TrainingView {
  weeksCompleted: number;
  weeksTotal: number;
  gateClear: boolean;
  gateDone: number;
  strip: Array<{ week: number; pct: number; done: boolean }>;
  nextWeek: { week: number; pct: number; cards: number } | null;
  pace: { band: string } | null;
}

export interface EmailView {
  threads: Array<{ subject: string; date: string; snippet: string }>;
  count: number;
  lastTheyWrote: string | null;
  lastWeWrote: string | null;
  awaitingReply: boolean;
  awaitingSubject: string | null;
}

export interface FeedView { cards: number; certPractice: number; artifacts: number; community: number; mentorAsks: number; absences: number }

export interface ProjectView {
  name: string;
  stage: string | null;
  tasksTotal: number | null;
  tasksDone: number | null;
  pct: number | null;
  repoUrl: string | null;
  overdue: number;
  commitsRecent: Array<{ sha?: string; date: string; message: string }>;
  lastCommitDays: number | null;
  lastVerifiedDays: number | null;
  verifiedRecent: Array<{ storyId: string | null; title: string; at: string }>;
  next: { title: string; dueOn: string | null } | null;
}

export interface InternCard {
  enrollmentId: string;
  name: string;
  firstName: string;
  email: string;
  day: number | null;
  track: Track;
  trackLabel: string;
  agentTabUrl: string | null;
  govUrl: string | null;
  gov: { title: string; stage: string; decision: string; pct: number; verified: number; total: number } | null;
  activity: {
    level: string;
    daysSince: number | null;
    lastSource: string | null;
    days: Array<{ date: string; events: number; by_category: Record<string, number> }>;
    last7: ActivityTotals;
    last28: ActivityTotals;
  };
  training: TrainingView;
  sessions: number | null;
  cert: { sittings: number; completed: number; available: boolean } | null;
  project: ProjectView | null;
  feed: FeedView;
  emails: EmailView;
  subscriptions: ReportSubscription[];
  status: { key: StatusKey; label: string; reasons: string[] };
  lately: string[];
  nextSteps: string[];
  nudge: string;
  aliMoves: string[];
  /** Filled by narrate.ts; empty when the model is unavailable. */
  asks: string[];
  asksFromModel: boolean;
}

export interface PortfolioReport {
  generatedAt: string;
  lookbackDays: number;
  emailLookbackDays: number;
  counts: Record<string, number>;
  totals: { interns: number; onTrack: number; attention: number; stalled: number; repliesOwed: number };
  aliMoves: string[];
  groups: Array<{ key: Track; title: string; interns: InternCard[] }>;
  operatorsExcluded: string[];
}

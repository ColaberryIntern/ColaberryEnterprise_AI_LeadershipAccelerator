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
import type { PresentationDue } from './presentations';

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
  overdue_tasks?: Array<{ story_id: string | null; title: string; due_on: string }> | null;
  command_center_url?: string | null;
}

export interface InternEmail { email: string; subject: string | null; snippet: string | null; received_at: string }
export interface WeWrote { email: string; last_we_wrote: string | null }
export interface OurReply { email: string; subject: string | null; received_at: string }

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
  /** Optional so older saved collections still render. */
  replies?: OurReply[];
  /** Optional so older saved collections still render. */
  artifacts?: PublishedArtifact[];
  /** The latest message sent TO each intern (sidecar `last_ask` only). Optional for older saved collections. */
  lastOutbound?: LastOutbound[];
  /** Both sides of every conversation in the email window (sidecar `communications` only). */
  conversations?: Conversation[];
  /** Demo videos recorded in the Presentation Studio. Optional for older saved collections. */
  videos?: RecordedVideo[];
  /** PREP-1..6 presentation tasks with their due dates. Optional for older saved collections. */
  prepTasks?: PrepTask[];
}

/** One row of VIDEOS_SQL: an ingested Presentation Studio recording. */
export interface RecordedVideo {
  recording_id: string; enrollment_id: string; story_id: string | null; presentation_type: string | null; template_slug: string | null;
  duration_seconds: number | null; created_at: string; attempt_no: number | null; mode: string | null; is_final_take: boolean | null;
  has_audio: boolean | null; has_shared_screen: boolean | null;
}
/** One row of PREP_SQL. */
export interface PrepTask { enrollment_id: string; story_id: string; title: string; status: string; due_on: string | null; verified_at: string | null }

/** One row of COMMS_SQL. */
export interface Conversation { from_address: string; to_text: string | null; subject: string | null; body: string | null; received_at: string }

/** One row of LAST_ASK_SQL. */
export interface LastOutbound { email: string; sent_at: string; subject: string | null; body_text: string | null; body_truncated: boolean | null; from_address: string }

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
  pace: { band: string; scheduledWeek?: number } | null;
  /** Why `pace` is null: the roster's honest refusal ('no_cohort' | 'cohort_has_no_sessions'). */
  paceUnavailable?: string | null;
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
  overdueTasks: Array<{ title: string; due_on: string }>;
  /** The published Command Center (GitHub Pages), when the project has one. */
  commandCenterUrl: string | null;
  /** The platform project id, and which tab it is reported from (sidecar only). */
  id?: string;
  kind?: 'agent' | 'gov' | 'console';
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
  timeline: Timeline;
  /** 2-3 sentences: where they are and what part they are building (summary.ts). */
  summary: string;
  summaryFromModel: boolean;
  /** Artifacts they actually published (each with a working link), and what to ask them to produce. */
  artifacts: ArtifactsView;
  /** The presentation (demo video) they should be recording now, or null when none is due yet. */
  presentation?: PresentationDue | null;
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

export type EventKind = 'commit' | 'verified' | 'artifact' | 'question' | 'stuck' | 'update' | 'reply' | 'unstuck' | 'late' | 'training';
/** `href`: where the chip opens (a published artifact). */
export interface TimelineEvent { kind: EventKind; day: string; at: string; label: string; detail?: string; meta?: string; slow?: boolean; href?: string }
/** One row: a single day, or (when `routine`) a span of routine days from `day` to `dayEnd`. */
export interface TimelineRow { day: string; dayEnd: string; routine: boolean; mode: 'build' | 'talk' | 'story'; gapBefore: number; gapStuck: boolean; onlyTraining: boolean; events: TimelineEvent[] }
export interface TimelineNext { kind: 'owed' | 'late' | 'stuck' | 'next' | 'training' | 'noproject' | 'artifact'; label: string; detail: string }
export interface Timeline {
  windowDays: number;
  start: string;
  today: string;
  rows: TimelineRow[];
  /** Days from the last row to today. */
  sinceLastRow: number;
  next: TimelineNext[];
  story: string;
  strip: Array<{ day: string; kinds: EventKind[] }>;
  stuckSpells: number;
  lateBeforeWindow: Array<{ title: string; due: string }>;
  /** Days since the last build work; null = none in the window (or no project). */
  quietNow: number | null;
  /** The numbers behind `story`, computed once (timeline.ts) and read by both the HTML and the sidecar. */
  counts: TimelineCounts;
}

/** Last-21-day counts. `verified` / `commits` are null for an intern with no project (not 0). */
export interface TimelineCounts {
  verified: number | null;
  commits: number | null;
  asks: number;
  blockers: number;
  replies: number;
  stuckSpells: number;
  trainingDays: number;
}

/**
 * One row of ARTIFACTS_SQL: an artifact the intern themselves made (content stays in the DB).
 * The three provenance fields are what prove it is theirs - see `artifactSource` in artifacts.ts.
 */
export interface PublishedArtifact {
  id: string;
  enrollment_id: string;
  card_id: string | null;
  kind: string;
  title: string;
  created_at: string;
  /** A page the artifact already lives at, which the intern submitted (claude.ai). */
  external_url: string | null;
  /** Path of the file inside their repository, when it came from the repo. */
  repo_path: string | null;
  /** The commit that put that file there. Repo provenance needs BOTH this and `repo_path`. */
  commit_sha: string | null;
  /** The file's name, set only when the intern uploaded a file themselves. */
  upload_name: string | null;
}

/** Where an artifact came from. There is no fourth value: anything else is not the intern's work. */
export type ArtifactSource = 'repo' | 'upload' | 'link' | 'recording';
/** What the artifact IS, so Ali can tell a PDF from a spreadsheet from a claude.ai page at a glance. */
export type ArtifactFileType = 'video' | 'pdf' | 'spreadsheet' | 'word' | 'slides' | 'html' | 'image' | 'claude' | 'link' | 'markdown' | 'text' | 'file';

/** A project artifact worth asking for, with the Claude Code prompt and the nudge that asks for it. */
export interface ArtifactAsk {
  key: string;
  name: string;
  /** What Ali learns from it. */
  why: string;
  /** Paste-ready prompt for Claude Code in their repo. */
  prompt: string;
  /** The message to send them, asking for it. */
  nudge: string;
}

export interface ArtifactsView {
  /**
   * Repo files first, then uploads, then submitted links; newest first within each. ONLY artifacts
   * the intern themselves made: no curriculum placeholders and nothing the platform generated
   * about them (Ali, 9 Nov: "only artifacts that have actually been produced and are able to be
   * connected to", then "The data should come from the user ONLY").
   *
   * `provenance` is the short phrase naming the file, commit or site it came from, so the claim
   * can be checked from the email without opening anything.
   */
  published: Array<{ id: string; kind: string; title: string; at: string; url: string; source: ArtifactSource; provenance: string; fileType: ArtifactFileType; repoPath?: string | null; uploadName?: string | null }>;
  asks: ArtifactAsk[];
}

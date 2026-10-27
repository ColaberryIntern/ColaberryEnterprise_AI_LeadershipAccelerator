import api from '../utils/api';

/**
 * Client for the agent-builder nudge routes.
 *
 * Its own file rather than another section of `adminInternConsoleApi`, because these three routes
 * answer a different question from the console roster and are gated on a different thing: the
 * roster is the whole intern cohort, this is the seven people building agent domains.
 *
 * ## Nothing here sends unless `send` is passed
 *
 * Every POST previews by default, on the server as well as here, and the server's schema is
 * `.strict()` so a mistyped flag is a 400 rather than a silently ignored instruction. The console
 * asks for the preview, shows the words, and sends only on a second explicit click.
 */

export type NudgeBand = 'green' | 'yellow' | 'orange' | 'red' | 'black' | 'unknown';

export interface AgentNudgeStory {
  storyId: string;
  title: string;
  dueOn: string | null;
  gradeable: boolean;
}

export interface AgentNudgeDecision {
  send: boolean;
  reason:
  | 'quiet_and_silent'
  | 'never_started'
  | 'awaiting_our_reply'
  | 'moved_recently'
  | 'no_recipient'
  | 'not_a_builder';
}

export interface AgentNudgeComposed {
  variant: string;
  subject: string;
  text: string;
  html: string;
}

export interface AgentNudgePreview {
  domain: string;
  agent: string | null;
  firstName: string;
  email: string;
  band: NudgeBand;
  daysSinceCommit: number | null;
  verified: number;
  stories: number;
  overdue: number;
  gradeableStories: number;
  awaitingOurReply: boolean;
  priorNudgeCount: number;
  nextStory: AgentNudgeStory | null;
  decision: AgentNudgeDecision;
  nudge: AgentNudgeComposed;
}

export interface AgentNudgeOutcome {
  domain: string;
  email: string;
  outcome: 'dry_run' | 'skipped' | 'sent' | 'failed';
  subject?: string;
  variant?: string;
  reason?: string;
  errorClass?: string;
  error?: string;
  messageId?: string;
  decision: AgentNudgeDecision;
}

export interface AgentNudgeBulkResult {
  attempted: number;
  sent: number;
  outcomes: AgentNudgeOutcome[];
}

/** Every builder, today's composed message, and whether the weekday run would send it. */
export async function fetchAgentNudges(): Promise<{
  builders: AgentNudgePreview[];
  disclosure: string;
}> {
  const { data } = await api.get<{ builders: AgentNudgePreview[]; disclosure: string }>(
    '/api/admin/agent-nudges',
  );
  return data;
}

/**
 * Nudge one builder, overriding the automatic verdict.
 *
 * The response carries the verdict that was overridden, so the console can say "sent, though the
 * run would have held this one" rather than quietly disagreeing with the row it is sitting next to.
 */
export async function nudgeOneBuilder(
  domain: string,
  opts: { send?: boolean } = {},
): Promise<AgentNudgeOutcome> {
  const { data } = await api.post<AgentNudgeOutcome>(
    `/api/admin/agent-nudges/${encodeURIComponent(domain)}`,
    opts.send ? { send: true } : {},
  );
  return data;
}

/** The bulk run: everyone the automatic verdict says to nudge. The same path cron takes. */
export async function nudgeAllBuilders(
  opts: { send?: boolean } = {},
): Promise<AgentNudgeBulkResult> {
  const { data } = await api.post<AgentNudgeBulkResult>(
    '/api/admin/agent-nudges',
    opts.send ? { send: true } : {},
  );
  return data;
}

/** The reason, in words a manager reads, rather than the enum. */
export const DECISION_LABEL: Record<AgentNudgeDecision['reason'], string> = {
  quiet_and_silent: 'Quiet, and has not written in',
  never_started: 'Has never started',
  awaiting_our_reply: 'We owe them a reply',
  moved_recently: 'Committed since yesterday',
  no_recipient: 'No email address on file',
  not_a_builder: 'Not an assigned builder',
};

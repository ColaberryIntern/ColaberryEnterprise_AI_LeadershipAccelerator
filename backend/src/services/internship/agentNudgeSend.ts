import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { guardedSendMail } from '../emailService';
import { sendOnce, type SendOnceResult } from '../email/idempotentSend';
import { isKillSwitchActive } from '../launchSafety';
import {
  composeNudge, decideNudge,
  type AgentNudgeState, type ComposedNudge, type NudgeDecision,
} from './agentNudgeComposer';
import { agentNudgeEventId, assertAgentBuilder, loadAgentNudgeStates } from './agentNudgeState';

/**
 * agentNudgeSend - the only path from a measured state to a builder's inbox.
 *
 * `agentNudgeComposer` decides what to say and `agentNudgeState` measures who to say it to.
 * Neither of them can send. This module is the seam, and it is a separate file so that the two
 * halves above stay testable without a database and without a mail transport.
 *
 * ── THE MANUAL BUTTON AND THE WEEKDAY RUN DISAGREE ON PURPOSE ───────────────────────────
 *
 * `decideNudge` answers "should an automatic run mail this person", and the answer is often no:
 * they committed an hour ago, or they are owed a reply. A manager clicking send on one builder has
 * already decided, with the preview in front of them, and overriding that would make the button
 * lie. So:
 *
 *   - `sendOneNudge` does NOT consult `decideNudge`. It reports the decision it is overriding, so
 *     the refusal is visible in the response rather than silently discarded.
 *   - `sendAllNudges` DOES, and skips everyone it says no to. It is the same code path the cron
 *     runs, which is the only way the button and the schedule can be trusted to behave alike.
 *
 * ── WHAT CANNOT BE OVERRIDDEN ───────────────────────────────────────────────────────────
 *
 * Being one of the seven. `assertAgentBuilder` throws for anybody else, and it is re-checked here
 * against the freshly loaded roster immediately before the send rather than trusted from the
 * request. No address a caller supplies is ever used as a recipient: the recipient is read out of
 * the roster row, so a caller cannot reach a student by passing an address.
 *
 * ── TIME COMES FROM POSTGRES ────────────────────────────────────────────────────────────
 *
 * One `select now()`, handed to the loader and used for the idempotency day. The measuring query
 * uses `current_date` for overdue stories, so taking the clock from anywhere else would let "this
 * story is overdue" and "they have been quiet two days" be computed against two different days.
 */

/** One builder's row as the console renders it: the state, the verdict, and the actual words. */
export interface AgentNudgePreview {
  domain: string;
  agent: string | null;
  firstName: string;
  email: string;
  band: AgentNudgeState['band'];
  daysSinceCommit: number | null;
  verified: number;
  stories: number;
  overdue: number;
  gradeableStories: number;
  awaitingOurReply: boolean;
  priorNudgeCount: number;
  nextStory: AgentNudgeState['nextStory'];
  decision: NudgeDecision;
  /** What would go out if sent right now. Present even when the decision is not to send. */
  nudge: ComposedNudge;
}

export type AgentNudgeOutcome =
  | { domain: string; email: string; outcome: 'dry_run'; subject: string; variant: string; businessEventId: string; decision: NudgeDecision }
  | { domain: string; email: string; outcome: 'skipped'; reason: string; decision: NudgeDecision }
  | { domain: string; email: string; outcome: 'sent'; subject: string; variant: string; messageId?: string; decision: NudgeDecision }
  | { domain: string; email: string; outcome: 'failed'; errorClass: string; error: string; decision: NudgeDecision };

/** Server time plus the roster, read together so the two cannot describe different days. */
async function loadRoster(): Promise<{ states: AgentNudgeState[]; now: Date }> {
  const [clock] = await sequelize.query('SELECT now() AS now', { type: QueryTypes.SELECT }) as Array<{ now: any }>;
  const nowIso = new Date(clock?.now ?? Date.now()).toISOString();
  const states = await loadAgentNudgeStates({
    query: (sql: string) => sequelize.query(sql, { type: QueryTypes.SELECT }) as Promise<any[]>,
    now: nowIso,
  });
  return { states, now: new Date(nowIso) };
}

function toPreview(state: AgentNudgeState): AgentNudgePreview {
  return {
    domain: state.domain,
    agent: state.agent,
    firstName: state.firstName,
    email: state.email,
    band: state.band,
    daysSinceCommit: state.daysSinceCommit,
    verified: state.verified,
    stories: state.stories,
    overdue: state.overdue,
    gradeableStories: state.gradeableStories,
    awaitingOurReply: state.awaitingOurReply,
    priorNudgeCount: state.priorNudgeCount,
    nextStory: state.nextStory,
    decision: decideNudge(state),
    nudge: composeNudge(state),
  };
}

/**
 * Every builder, what today's nudge would say, and whether the weekday run would send it.
 *
 * Read-only and side-effect free, so the console can poll it. The composed words are included
 * rather than summarised: a preview that shows a subject but not the body would let a manager
 * approve text nobody had read.
 */
export async function previewAgentNudges(): Promise<AgentNudgePreview[]> {
  const { states } = await loadRoster();
  return states.map(toPreview);
}

/** Structured log for one send attempt. Mirrors the repo's observability shape. */
function logNudge(event: string, outcome: 'success' | 'failure', context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'backend',
    event,
    outcome,
    context,
  }));
}

/**
 * Send one composed nudge through the ledger.
 *
 * The business event is one per builder per day, so a double-clicked button, a retried request and
 * the cron arriving later are all the same nudge. The kill switch is checked before the dry-run
 * branch, because a preview that cheerfully renders a message the system would refuse to send is
 * worse than no preview.
 */
async function deliver(
  state: AgentNudgeState,
  now: Date,
  dryRun: boolean,
  decision: NudgeDecision,
): Promise<AgentNudgeOutcome> {
  const nudge = composeNudge(state);
  const businessEventId = agentNudgeEventId(state.domain, now);
  const base = { domain: state.domain, email: state.email, decision };

  if (await isKillSwitchActive()) {
    return { ...base, outcome: 'skipped', reason: 'kill_switch_active' };
  }

  if (dryRun) {
    return { ...base, outcome: 'dry_run', subject: nudge.subject, variant: nudge.variant, businessEventId };
  }

  const result: SendOnceResult = await sendOnce(
    { recipient: state.email, subject: nudge.subject, businessEventId },
    async () => {
      try {
        const info = await guardedSendMail({
          to: state.email,
          subject: nudge.subject,
          html: nudge.html,
          text: nudge.text,
          // Ali gets a copy of everything that goes out, per the standing rule. It is also what
          // makes "have we answered them" answerable later: the BCC is ingested and becomes the
          // `last_we_wrote` the measuring query reads.
          bcc: 'ali@colaberry.com',
        } as any);
        return { ok: true, messageId: (info as any)?.messageId };
      } catch (err: any) {
        return {
          ok: false,
          error: String(err?.message ?? err),
          errorClass: err?.name || 'MailTransportError',
        };
      }
    },
  );

  if (result.outcome === 'sent') {
    logNudge('agent_nudge_sent', 'success', {
      domain: state.domain, variant: nudge.variant, business_event_id: businessEventId,
    });
    return { ...base, outcome: 'sent', subject: nudge.subject, variant: nudge.variant, messageId: result.messageId };
  }
  if (result.outcome === 'skipped') {
    return { ...base, outcome: 'skipped', reason: result.reason };
  }
  logNudge('agent_nudge_failed', 'failure', {
    domain: state.domain, error_class: result.errorClass, business_event_id: businessEventId,
  });
  return { ...base, outcome: 'failed', errorClass: result.errorClass, error: result.error };
}

/**
 * Nudge one builder, named by domain, on a manager's explicit instruction.
 *
 * The automatic verdict is computed and returned but NOT enforced: see the header. A domain that
 * is not one of the seven throws, which is the one refusal a caller cannot talk its way past.
 */
export async function sendOneNudge(
  domain: string,
  opts: { dryRun?: boolean } = {},
): Promise<AgentNudgeOutcome> {
  const { states, now } = await loadRoster();
  const wanted = String(domain ?? '').trim().toLowerCase();
  const state = states.find((s) => s.domain.toLowerCase() === wanted);
  if (!state) {
    throw new Error(`refusing to nudge domain ${wanted || '(empty)'}: not an agent domain with a builder`);
  }
  // Belt and braces: the recipient came from the roster, and this re-asserts it against the same
  // roster rather than trusting that the lookup above stays the only way in.
  assertAgentBuilder(state.email, states);
  return deliver(state, now, opts.dryRun !== false, decideNudge(state));
}

/**
 * The weekday run, and the console's "nudge everyone who needs it" button.
 *
 * Sequential rather than concurrent, and each builder wrapped on its own: one transport failure
 * must not cost the other six their nudge. Every builder appears in the result, including the ones
 * skipped and why, because "it ran and sent two" is not a report unless the other five are
 * accounted for.
 */
export async function sendAllNudges(
  opts: { dryRun?: boolean } = {},
): Promise<{ attempted: number; sent: number; outcomes: AgentNudgeOutcome[] }> {
  const { states, now } = await loadRoster();
  const dryRun = opts.dryRun !== false;
  const outcomes: AgentNudgeOutcome[] = [];

  for (const state of states) {
    const decision = decideNudge(state);
    if (!decision.send) {
      outcomes.push({ domain: state.domain, email: state.email, outcome: 'skipped', reason: decision.reason, decision });
      continue;
    }
    try {
      outcomes.push(await deliver(state, now, dryRun, decision));
    } catch (err: any) {
      logNudge('agent_nudge_failed', 'failure', {
        domain: state.domain, error_class: err?.constructor?.name ?? 'Error',
      });
      outcomes.push({
        domain: state.domain,
        email: state.email,
        outcome: 'failed',
        errorClass: err?.constructor?.name ?? 'Error',
        error: String(err?.message ?? err),
        decision,
      });
    }
  }

  return {
    attempted: outcomes.filter((o) => o.outcome !== 'skipped').length,
    sent: outcomes.filter((o) => o.outcome === 'sent').length,
    outcomes,
  };
}

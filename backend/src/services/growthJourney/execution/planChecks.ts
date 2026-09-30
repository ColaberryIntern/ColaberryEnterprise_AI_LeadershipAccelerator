import { evaluateContact } from '../../explorerGrowth/governor/contactPolicy';
import type { JourneySubjectContext } from '../governor/types';
import type { ExecutionChannel } from './resolveExecutionMode';

/**
 * The planner's pure checks (Phase 5 T508): which candidate a decision
 * selected, whether the decision is stale, whether the channel is open NOW,
 * and whether an in-app nudge has content a person could be shown. Pure, so
 * each refusal is pinned without a database; `planExecution.ts` sequences them.
 */

/** The decision row as the planner reads it. A VIEW: no model is imported, and no address is on it. */
export interface ExecutionDecisionView {
  id: string;
  tenant_id: string;
  brand_id: string;
  program_id: string | null;
  subject_ref: string;
  lead_id: number | null;
  enrollment_id: string | null;
  mode: string;
  selected_action: string | null;
  selected_channel: string | null;
  selected_content: Record<string, unknown> | null;
  candidates: unknown[];
  suppressed: unknown[];
  /** Never read by the planner: a deferral is what the strategy WOULD do, and is never executed. */
  deferred_actions: unknown[];
  reason: string;
  created_at: Date;
}

export interface SelectedCandidate {
  action_type: string;
  campaign_key: string | null;
}

type CandidateLike = { action_type?: unknown; campaign_key?: unknown };
const asCandidate = (v: unknown): SelectedCandidate | null => {
  const c = v as CandidateLike | null;
  return c && typeof c.action_type === 'string' ? { action_type: c.action_type, campaign_key: typeof c.campaign_key === 'string' ? c.campaign_key : null } : null;
};
const identity = (c: SelectedCandidate): string => `${c.action_type}|${c.campaign_key ?? ''}`;

/**
 * The winner. The row stores every generated candidate and every suppressed
 * one (outranked or blocked, each with its reason) but does not name the
 * winner; it is the ONE generated candidate not in `suppressed`. Two
 * candidates that share an action and a key cannot be told apart, and a
 * planner that guessed between them could execute the wrong one - so that is
 * a refusal, never a pick.
 */
export function selectedCandidateOf(decision: Pick<ExecutionDecisionView, 'selected_action' | 'candidates' | 'suppressed'>): { ok: true; candidate: SelectedCandidate } | { ok: false; reason: 'no_selected_candidate' | 'selected_candidate_ambiguous' } {
  if (!decision.selected_action) return { ok: false, reason: 'no_selected_candidate' };
  const suppressed = new Map<string, number>();
  for (const s of decision.suppressed.map(asCandidate)) if (s) suppressed.set(identity(s), (suppressed.get(identity(s)) ?? 0) + 1);
  const remaining: SelectedCandidate[] = [];
  for (const c of decision.candidates.map(asCandidate)) {
    if (!c) continue;
    const left = suppressed.get(identity(c)) ?? 0;
    if (left > 0) suppressed.set(identity(c), left - 1);
    else remaining.push(c);
  }
  if (remaining.length !== 1) return { ok: false, reason: remaining.length === 0 ? 'no_selected_candidate' : 'selected_candidate_ambiguous' };
  if (remaining[0].action_type !== decision.selected_action) return { ok: false, reason: 'selected_candidate_ambiguous' };
  return { ok: true, candidate: remaining[0] };
}

/** A decision older than this is not acted on: the world it was decided in has moved. */
export const MAX_DECISION_AGE_HOURS = 36;

export type Staleness = 'stale_decision_reply_newer' | 'stale_decision_age';

/** The reply check comes first: a person who wrote back after we decided is the stronger reason to stop. */
export function stalenessOf(decision: Pick<ExecutionDecisionView, 'created_at'>, newestInboundAt: Date | null, asOf: Date): Staleness | null {
  if (newestInboundAt && newestInboundAt.getTime() > decision.created_at.getTime()) return 'stale_decision_reply_newer';
  if (asOf.getTime() - decision.created_at.getTime() > MAX_DECISION_AGE_HOURS * 3_600_000) return 'stale_decision_age';
  return null;
}

/**
 * Is the channel open NOW? The same evidence the decision read, re-read at
 * planning time, judged by the same policy - plus the two things the policy
 * does not see: a human in the thread, and a consent verdict that was never
 * actually checked (`consent_check_error` is the consent gate failing OPEN;
 * the planner does not treat it as consent).
 */
export function channelOpenness(channel: ExecutionChannel, evidence: JourneySubjectContext['contact']): { open: true } | { open: false; reason: string } {
  if (evidence.failed_closed) return { open: false, reason: 'contact_evidence_unavailable' };
  if (evidence.human_conversation === 'yes') return { open: false, reason: 'human_in_conversation' };
  // Ali outreach is an email in Ali's own voice: the address's gates are the email gates.
  const policyChannel = channel === 'ali_outreach' ? 'email' : channel;
  const ch = evidence.channels[policyChannel];
  if (ch.evaluator === 'consent' && ch.reason === 'consent_check_error') return { open: false, reason: 'consent_unverified' };
  const verdict = evaluateContact({ channel: policyChannel }, {
    channelEligible: ch.eligible === true,
    channelReason: ch.reason,
    consent: { verdict: ch.eligible === true ? 'allow' : 'block', reason: ch.reason, hasRecord: ch.evaluator === 'consent' },
    recentContactCount: evidence.recent_contact_count,
    hoursSinceLastContact: evidence.hours_since_last_contact,
  });
  return verdict.allowed ? { open: true } : { open: false, reason: verdict.reason };
}

/** An in-app nudge needs something to show: the first approved asset's title and url. */
export function inAppContentOf(selectedContent: Record<string, unknown> | null): { ok: true; title: string; url: string } | { ok: false } {
  const assets = selectedContent?.assets;
  const first = Array.isArray(assets) ? (assets[0] as { title?: unknown; url?: unknown } | undefined) : undefined;
  if (first && typeof first.title === 'string' && first.title.length > 0 && typeof first.url === 'string' && first.url.length > 0) {
    return { ok: true, title: first.title, url: first.url };
  }
  return { ok: false };
}

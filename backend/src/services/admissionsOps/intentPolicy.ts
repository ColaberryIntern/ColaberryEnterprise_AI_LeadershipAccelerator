/**
 * The agent control surface's server-side rules (AO2.3, kit AGENT_CONTROL_SURFACE.md sections 2.3, 4 and 5). Pure.
 *
 * Hard rules, enforced here for every request, whoever sends it:
 *   1. An agent-originated level-5 request ALWAYS becomes an Approvals item and NEVER executes. Checked before
 *      availability, so it holds for every level-5 action, including ones not built yet.
 *   2. The agent cannot approve or decline anything (decideAllowed). No action in the manifest decides.
 *   3. In Answer mode (the only mode in Releases 1 to 3) the agent changes nothing on the screen: its navigate and
 *      annotate requests are refused and logged. A person's own navigation is recorded as done.
 *
 * How the agent is recognised: the agent acts through the signed-in staff session (M0 Q7 default), so the server
 * cannot tell it apart by token. Every agent client must send `X-Ops-Actor: agent` (docs/admissions-ops/
 * AGENT_INTEGRATION.md). The intents endpoint is the agent's only door, and the rules above also bind a person, so the
 * marker only ever narrows what a caller may do. A company-managed machine identity, which would make the marker
 * unnecessary, is an M4 decision.
 */
import type { ManifestAction } from './agentManifest';

export type ActorKind = 'agent' | 'person';
export type Mode = 'answer' | 'guide' | 'operate';
export type IntentType = 'navigate' | 'invoke' | 'annotate';
export type Outcome = 'done' | 'drafted' | 'sent_to_approval' | 'refused';

export interface IntentInput { type: IntentType; actor: ActorKind; mode: Mode; action: ManifestAction | null }
export interface Decision { outcome: Outcome; reason: string | null; createApproval: boolean }

const refuse = (reason: string): Decision => ({ outcome: 'refused', reason, createApproval: false });

export function decideIntent(i: IntentInput): Decision {
  if (i.type === 'navigate' || i.type === 'annotate') {
    if (i.actor === 'agent' && i.mode === 'answer') return refuse('answer_mode_changes_nothing_on_screen');
    if (i.action && i.action.kind !== 'navigate' && i.type === 'navigate') return refuse('not_a_navigate_action');
    return { outcome: 'done', reason: null, createApproval: false };
  }
  // invoke
  if (!i.action) return refuse('unknown_action');
  if (i.action.level === 5) return { outcome: 'sent_to_approval', reason: 'level_5_needs_a_person', createApproval: true };
  if (!i.action.available) return refuse('not_available_yet');
  if (i.action.level === 3) return { outcome: 'sent_to_approval', reason: 'level_3_prepared_for_a_person', createApproval: true };
  // Level 4: no routine action is authorized on day one (M0 Q8 default), so it is prepared like a level 3.
  if (i.action.level === 4) return { outcome: 'sent_to_approval', reason: 'level_4_not_authorized_yet', createApproval: true };
  return { outcome: 'done', reason: null, createApproval: false };
}

/** Who may decide an approval: never the agent; a level-5 item only the owner (M0 Q9 default: Ali). */
export function decideAllowed(actor: ActorKind, mgmtRole: string | undefined, level: number): { ok: true } | { ok: false; reason: string } {
  if (actor === 'agent') return { ok: false, reason: 'the_agent_cannot_decide' };
  if (level === 5 && mgmtRole !== 'owner') return { ok: false, reason: 'level_5_needs_a_leadership_approver' };
  return { ok: true };
}

const SENSITIVE = /(body|message|note|email|phone|card|account|ssn|password|token|secret|routing)/i;

/** Params as they go into the audit log: sensitive keys replaced, long values cut, nothing nested kept. */
export function redactParams(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) out[k] = SENSITIVE.test(k) ? '[redacted]' : String(v).slice(0, 200);
  return out;
}

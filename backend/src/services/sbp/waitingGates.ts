/**
 * waitingGates — an agent that waits for a person says what it waits for.
 *
 * ShiftFill v6 (2026-11-22, project 8e3adf6d): Shift Offer Sender was scoped as
 * "prepares, then waits for a human to release it" with no approval gate. Its
 * own escalation rule said "Overtime approval required", but the overtime gate
 * (REQ-008) sat on Hygienist Ranker, because Ranker owns the "Approve overtime"
 * story. The agent that actually SENDS the offer, which is where overtime
 * happens, had nothing to wait on, so the Command Center showed it as an open
 * question.
 *
 * Repair: an agent at `acts_with_approval` with no approval gate takes the
 * approval-type SAFE requirement its own escalation rules describe, by shared
 * content words. Names and the word "approve" are ignored, since every gate
 * shares them. One requirement, the best match, ties to requirement order. No
 * match, no change: the Command Center keeps showing the honest open question.
 *
 * It only adds a gate to an agent that already waits for a person, so autonomy
 * never changes. PURE, idempotent, and an unchanged agent is the same object.
 */
import { PlanAgent, PlanRequirement } from './planContract';
import { guardrailGate } from './planPeople';
import { words } from './storyOwners';

const GENERIC = /^approv|^require|^permission|^sign/;

function meaningful(text: string, roles: readonly string[]): Set<string> {
  const names = new Set(roles.flatMap((r) => [...words(r)]));
  return new Set([...words(text)].filter((w) => !GENERIC.test(w) && !names.has(w)));
}

export function gateWaitingAgents(
  agents: readonly PlanAgent[], requirements: readonly PlanRequirement[], roles: readonly string[],
): PlanAgent[] {
  const approvals = requirements.filter((r) => r.kind === 'SAFE' && guardrailGate(r.statement, roles).kind === 'approval');
  return agents.map((a) => {
    if (a.autonomy_level !== 'acts_with_approval' || (a.approval_gates ?? []).length) return a;
    const said = meaningful((a.escalation_rules ?? []).join(' '), roles);
    if (!said.size) return a;
    let best: PlanRequirement | null = null;
    let bestScore = 0;
    for (const r of approvals) {
      const shared = [...meaningful(r.statement, roles)].filter((w) => said.has(w)).length;
      if (shared > bestScore) { best = r; bestScore = shared; }
    }
    return best ? { ...a, approval_gates: [`${best.id} — ${best.statement}`] } : a;
  });
}

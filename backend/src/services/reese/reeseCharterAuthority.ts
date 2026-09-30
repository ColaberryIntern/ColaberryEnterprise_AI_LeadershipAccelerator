import AiAgent from '../../models/AiAgent';
import { getRoleCharter } from '../agentRoleCharterService';
import { listAgentTools } from '../agents/tools/agentToolRegistry';
import { REESE_BEHAVIOURS } from '../../scripts/lib/reeseBehaviourInventory';

/**
 * Reese Product Phase 1, R5 — the charter's authority lists are checked by
 * code, not decorative. Every real tool Reese holds (her `tools_granted`
 * array plus `agentToolRegistry.ts`'s own grant, currently `read_attachments`
 * -- the two registries can and do disagree, per `TOOL_INVENTORY.md`'s named
 * gap) and every real behaviour in `BEHAVIOUR_INVENTORY.md` must be named
 * somewhere in the charter's authority text (autonomous, approval-required,
 * or forbidden -- being named at all is what "the charter accounts for
 * this" means; which of the three lists it's in is a Phase-2-enforcement
 * question, not this check's job).
 *
 * A mismatch means Reese holds a real tool or runs a real behaviour her own
 * charter never mentions -- exactly the "declared vs real" drift this whole
 * phase exists to close. Reese-only: reads only Reese's own tools_granted,
 * registry grants, and charter; touches no other agent.
 */
export interface CharterAuthorityMismatch {
  kind: 'tool' | 'behaviour';
  name: string;
}

export interface CharterAuthorityCheckResult {
  ok: boolean;
  mismatches: CharterAuthorityMismatch[];
}

export interface CharterAuthorityLists {
  authorityAutonomous: string[] | null;
  authorityApprovalRequired: string[] | null;
  authorityForbidden: string[] | null;
}

/** Pure, no I/O -- unit-testable without a DB. `combinedText` is a simple
 * substring match against the joined authority lists; the charter content
 * (`reeseCharterV2Content.ts`) deliberately names every real tool and
 * behaviour literally so this never depends on fuzzy text matching. */
export function checkAuthorityCoverage(
  toolsGranted: string[],
  registryTools: string[],
  behaviourNames: string[],
  charter: CharterAuthorityLists | null,
): CharterAuthorityCheckResult {
  const combinedText = [
    ...(charter?.authorityAutonomous ?? []),
    ...(charter?.authorityApprovalRequired ?? []),
    ...(charter?.authorityForbidden ?? []),
  ].join('\n');

  const mismatches: CharterAuthorityMismatch[] = [];
  const allTools = Array.from(new Set([...toolsGranted, ...registryTools]));
  for (const tool of allTools) {
    if (!combinedText.includes(tool)) mismatches.push({ kind: 'tool', name: tool });
  }
  for (const behaviour of behaviourNames) {
    if (!combinedText.includes(behaviour)) mismatches.push({ kind: 'behaviour', name: behaviour });
  }

  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Live wrapper -- reads Reese's real `tools_granted`, `agentToolRegistry.ts`
 * grant, `BEHAVIOUR_INVENTORY.md`'s 7 behaviours, and her live charter, then
 * runs the same pure check above. Called explicitly by
 * `applyReeseCharterV2.ts`'s last step (prints the result) and again by R8's
 * post-apply production verification -- never at boot, never on any other
 * agent.
 */
export async function checkReeseAuthorityLive(): Promise<CharterAuthorityCheckResult> {
  const agent = await AiAgent.findOne({ where: { agent_name: 'Reese' }, attributes: ['id', 'tools_granted'] });
  if (!agent) return { ok: false, mismatches: [{ kind: 'tool', name: '(no ai_agents row for Reese)' }] };

  const registryTools = listAgentTools('reese');
  const behaviourNames = REESE_BEHAVIOURS.map((b) => b.name);
  const charterView = await getRoleCharter(agent.id);

  return checkAuthorityCoverage(agent.tools_granted || [], registryTools, behaviourNames, charterView?.charter ?? null);
}

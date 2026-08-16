/**
 * agentToolRegistry — which agents hold which tool grants.
 *
 * Deliberately a typed code constant rather than a DB table: the grant set is
 * small, changes with a deploy (not at runtime), and being a constant means a
 * grant is covered by `tsc` and a unit test instead of by whatever happens to
 * be in a table on a given environment. Promote to a table the day a
 * non-engineer needs to flip a grant.
 *
 * AGENT_TOOLS_DISABLED is a kill switch, not a feature flag: it exists so a
 * vision-cost or provider incident can be stopped without a code deploy. With
 * it set, every call site degrades to text-only rather than failing.
 */
import type { AgentKey, AgentToolName } from './types';

const GRANTS: Record<AgentKey, readonly AgentToolName[]> = {
  // Cory reads what a student drags into the mentor rail — a screenshot of a
  // broken terminal, an error page, a diagram they sketched.
  cory: ['read_attachments'],
  // Reese reads what a student attaches to a DM, so an outreach conversation
  // can be about the thing they actually sent.
  reese: ['read_attachments'],
};

/** Tools disabled globally by the env kill switch (comma-separated names). */
function disabledTools(): Set<string> {
  const raw = process.env.AGENT_TOOLS_DISABLED || '';
  return new Set(
    raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

/** True when `agent` may use `tool` right now. */
export function agentHasTool(agent: AgentKey, tool: AgentToolName): boolean {
  if (disabledTools().has(tool)) return false;
  return (GRANTS[agent] || []).includes(tool);
}

/** Every tool currently available to `agent` (kill switch applied). */
export function listAgentTools(agent: AgentKey): AgentToolName[] {
  const off = disabledTools();
  return (GRANTS[agent] || []).filter((t) => !off.has(t));
}

/** Every agent holding `tool` (kill switch applied). Used by audits/tests. */
export function agentsWithTool(tool: AgentToolName): AgentKey[] {
  if (disabledTools().has(tool)) return [];
  return (Object.keys(GRANTS) as AgentKey[]).filter((a) => GRANTS[a].includes(tool));
}

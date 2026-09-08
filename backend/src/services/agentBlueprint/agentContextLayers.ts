import { getRoleCharter } from '../agentRoleCharterService';
import { getActiveReliabilityIssues } from '../metricReliabilityService';

/**
 * agentContextLayers — Reese Agentic AI Employee mission, Capability 8's
 * "role charter and authority" (layer 2) and "current metric reliability/
 * quarantine state" (layer 5) runtime context layers, shared by both the
 * student-facing (agentSystemPrompt.ts) and manager-facing
 * (agentManagerConversationPrompt.ts) prompt builders — one real
 * implementation of each layer, not two drifting copies.
 */

/** `''` for an agent with no charter written yet — the same honest "not
 * set" state getRoleCharter() itself returns, never a fabricated title or
 * mission. `''` also for a nonexistent agent id (getRoleCharter() returns
 * null) — callers already know their own agent exists by the time they
 * reach this point, so this degrades silently rather than throwing. */
export async function buildRoleCharterBlock(agentId: string): Promise<string> {
  const view = await getRoleCharter(agentId);
  if (!view?.charter) return '';

  const { roleTitle, mission, responsibilities, kpis } = view.charter;
  const responsibilityLines = responsibilities.length
    ? '\nResponsibilities:\n' + responsibilities.map((r) => `- ${r}`).join('\n')
    : '';
  const kpiLines = kpis.length ? '\nKPIs you are measured on:\n' + kpis.map((k) => `- ${k}`).join('\n') : '';

  return `ROLE CHARTER: You are the ${roleTitle}. ${mission}${responsibilityLines}${kpiLines}`;
}

/**
 * Always present (never silent), unlike softer highlight blocks elsewhere
 * in this codebase — reliability state directly affects whether other
 * evidence in the prompt should be trusted, so the model is told
 * explicitly when nothing is flagged, not left to infer "all clear" from
 * the block's absence.
 */
export async function buildReliabilityStateBlock(): Promise<string> {
  const issues = await getActiveReliabilityIssues();
  if (issues.length === 0) {
    return 'DATA RELIABILITY STATE: No data sources are currently flagged unreliable — all known sources are healthy.';
  }

  const lines = issues.map((i) => `- ${i.sourceSystem} (${i.metricKey}): ${i.status}${i.reason ? ` — ${i.reason}` : ''}`).join('\n');
  return `DATA RELIABILITY STATE (do not trust or cite these sources until restored):\n${lines}`;
}

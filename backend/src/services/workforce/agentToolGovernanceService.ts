/**
 * agentToolGovernanceService — for one agent, the honest answer to "which tools does this agent
 * hold, who said it could, and which capability does each tool serve".
 *
 * ## Why this is a new module rather than an addition to agentEffectiveAccessService
 *
 * That file is 468 lines against this repo's 500-line hard ceiling, and CLAUDE.md requires the
 * next change to an oversize file to split before it adds. It also answers a different question:
 * it reconciles what the RUNTIME would do (registered, usable, abac mode). This answers what the
 * GOVERNANCE says (granted by whom, for which capability). The two are deliberately separate
 * because today they disagree, and collapsing them would hide exactly the disagreement an
 * operator needs to see.
 *
 * ## The three sources, and why none of them alone is the answer
 *
 *   1. `ai_agents.tools_granted`      what the runtime reads. A JSONB string array.
 *   2. `agent_domain_tool_grants`     who approved it and for which capability. The record.
 *   3. the capability records' `required_tools`   what the capability says it needs.
 *
 * A tool in (1) with no row in (2) is held without anyone having granted it. A row in (2) absent
 * from (1) is an approval that never reached the runtime. A grant in (2) whose `tool_name` does
 * not appear in its own capability's `required_tools` is a grant for a purpose the capability
 * never claimed. All three are reported, never silently reconciled.
 *
 * ## What this measured on the day it was written, 2026-11-11
 *
 * `agent_domain_tool_grants` held **0 rows**, while 31 agents held 136 entries in
 * `tools_granted`. So every holding in production today is ungoverned, and this report exists to
 * make that visible rather than to imply otherwise. Maya holds 12, Dara 6.
 *
 * ## What this does NOT do
 *
 * It is READ-ONLY and never writes, never grants, and never changes any authorization decision.
 * It also does not enforce the capability tie: the refusal rule belongs in
 * `agentToolGrantContract.ts` and is a later phase. This only reports the mismatch it would
 * refuse, so the backfill has a worklist before the rule starts failing people.
 */
import AiAgent from '../../models/AiAgent';
import AgentDomainToolGrant from '../../models/AgentDomainToolGrant';
import { allCapabilities } from '../agentDomain/capabilityRecord';
import type { CapabilityRecord } from '../agentDomain/capabilityRecord';

/** One tool, seen from all three sources at once. */
export interface ToolGovernanceRow {
  toolName: string;
  /** Present in `ai_agents.tools_granted`, which is what the runtime reads. */
  held: boolean;
  /** A row exists in `agent_domain_tool_grants`. This is the approval record. */
  granted: boolean;
  capabilityId: string | null;
  capabilityName: string | null;
  capabilityDomain: string | null;
  /**
   * Whether the capability this grant cites actually lists this tool in its `required_tools`.
   * `null` when there is no grant or the cited capability cannot be found, which is a different
   * thing from `false` and must not be collapsed into it.
   */
  capabilityRequiresThisTool: boolean | null;
  approvedByIdentity: string | null;
  approvedAt: string | null;
  /** Plain-English problems with this row. Empty means this tool is fully accounted for. */
  findings: string[];
}

export interface ToolGovernanceSummary {
  held: number;
  granted: number;
  /** Held by the runtime with nobody on record as having granted it. */
  heldWithoutGrant: number;
  /** Granted on paper but absent from what the runtime reads. */
  grantedWithoutHolding: number;
  /** Granted against a capability that does not list this tool. */
  capabilityMismatch: number;
  /** Granted citing a capability id that no capability record matches. */
  capabilityUnknown: number;
  /** Rows with no findings at all. */
  clean: number;
}

export interface AgentToolGovernanceReport {
  agentId: string;
  agentName: string;
  generatedAt: string;
  rows: ToolGovernanceRow[];
  summary: ToolGovernanceSummary;
  /**
   * One sentence an operator can read without knowing the schema. Written from the numbers
   * rather than asserted, so it cannot drift from what the rows actually say.
   */
  posture: string;
}

/** Index capability records by id once per call. 443 records, so this stays cheap. */
function capabilityIndex(): Map<string, CapabilityRecord> {
  const index = new Map<string, CapabilityRecord>();
  for (const c of allCapabilities()) index.set(c.capability_id, c);
  return index;
}

function heldToolNames(agent: InstanceType<typeof AiAgent>): string[] {
  const raw = (agent as unknown as { tools_granted?: unknown }).tools_granted;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

/**
 * Builds the report for one agent.
 *
 * Returns null when the agent does not exist, rather than throwing, so a caller rendering a
 * dashboard tab can show "no such agent" instead of a 500.
 */
export async function buildAgentToolGovernance(
  agentId: string
): Promise<AgentToolGovernanceReport | null> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) return null;

  const held = heldToolNames(agent);
  const grants = await AgentDomainToolGrant.findAll({
    where: { agent_id: agentId },
    order: [['tool_name', 'ASC']],
  });

  const capabilities = capabilityIndex();
  const grantByTool = new Map<string, InstanceType<typeof AgentDomainToolGrant>>();
  for (const g of grants) {
    const name = (g as unknown as { tool_name?: string }).tool_name;
    if (name) grantByTool.set(name, g);
  }

  // The union, so a grant with no holding is as visible as a holding with no grant.
  const everyToolName = Array.from(new Set([...held, ...grantByTool.keys()])).sort();

  const rows: ToolGovernanceRow[] = everyToolName.map((toolName) => {
    const grant = grantByTool.get(toolName) ?? null;
    const isHeld = held.includes(toolName);
    const g = grant as unknown as {
      capability_id?: string | null;
      approved_by_identity?: string | null;
      approved_at?: Date | string | null;
    } | null;

    const capabilityId = g?.capability_id ?? null;
    const capability = capabilityId ? capabilities.get(capabilityId) ?? null : null;

    let capabilityRequiresThisTool: boolean | null = null;
    if (capability) {
      capabilityRequiresThisTool = (capability.required_tools || []).includes(toolName);
    }

    const findings: string[] = [];
    if (isHeld && !grant) {
      findings.push(
        'The runtime holds this tool, but nothing records who granted it or which capability it serves.'
      );
    }
    if (grant && !isHeld) {
      findings.push(
        'This tool was granted on the record but is absent from what the runtime reads, so the approval never took effect.'
      );
    }
    if (grant && capabilityId && !capability) {
      findings.push(
        `The grant cites capability "${capabilityId}", which matches no capability record.`
      );
    }
    if (capability && capabilityRequiresThisTool === false) {
      findings.push(
        `The grant cites "${capabilityId}", which does not list this tool among the tools it requires.`
      );
    }
    if (grant && !capabilityId) {
      findings.push('The grant names no capability, so this tool serves no stated purpose.');
    }

    return {
      toolName,
      held: isHeld,
      granted: Boolean(grant),
      capabilityId,
      capabilityName: capability?.name ?? null,
      capabilityDomain: capability ? capabilityId!.split('.')[0] ?? null : null,
      capabilityRequiresThisTool,
      approvedByIdentity: g?.approved_by_identity ?? null,
      approvedAt: g?.approved_at ? new Date(g.approved_at).toISOString() : null,
      findings,
    };
  });

  const summary: ToolGovernanceSummary = {
    held: rows.filter((r) => r.held).length,
    granted: rows.filter((r) => r.granted).length,
    heldWithoutGrant: rows.filter((r) => r.held && !r.granted).length,
    grantedWithoutHolding: rows.filter((r) => r.granted && !r.held).length,
    capabilityMismatch: rows.filter((r) => r.capabilityRequiresThisTool === false).length,
    capabilityUnknown: rows.filter((r) => r.granted && r.capabilityId && !r.capabilityName).length,
    clean: rows.filter((r) => r.findings.length === 0).length,
  };

  return {
    agentId,
    agentName: (agent as unknown as { agent_name: string }).agent_name,
    generatedAt: new Date().toISOString(),
    rows,
    summary,
    posture: describePosture(summary),
  };
}

/**
 * The one-sentence read, derived from the counts rather than asserted.
 *
 * Deliberately refuses to say "governed" when the grant count is zero, because the whole failure
 * this report exists to surface is a system that looks governed and is not.
 */
export function describePosture(s: ToolGovernanceSummary): string {
  if (s.held === 0 && s.granted === 0) {
    return 'This agent holds no tools, so there is nothing to govern yet.';
  }
  if (s.granted === 0) {
    return `All ${s.held} of this agent's tools are held without a grant record. Nothing here has been approved through the tool request process, so the runtime is the only thing deciding what it may call.`;
  }
  if (s.heldWithoutGrant === 0 && s.grantedWithoutHolding === 0 && s.capabilityMismatch === 0) {
    return `All ${s.held} of this agent's tools are granted on the record and tied to a capability.`;
  }
  const parts: string[] = [];
  if (s.heldWithoutGrant > 0) parts.push(`${s.heldWithoutGrant} held without a grant`);
  if (s.grantedWithoutHolding > 0) parts.push(`${s.grantedWithoutHolding} granted but not in effect`);
  if (s.capabilityMismatch > 0) parts.push(`${s.capabilityMismatch} tied to a capability that does not require them`);
  return `${s.granted} of ${s.held} tools carry a grant record. Needs attention: ${parts.join(', ')}.`;
}

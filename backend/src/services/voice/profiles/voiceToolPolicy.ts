/**
 * Voice tool policy (VS3.1), pure. Decides, ONCE at call start, which tools a voice call may use.
 * Nothing said on the call is an input here, which is the structural defence against prompt
 * injection: caller speech and retrieved text reach the model, but the model can only call tools the
 * broker was built with, and the broker is built from this function's `allowed` list alone.
 *
 * Grants are NOT a voice-only table. They come from the repo's agent tool registry
 * (agents/tools/agentToolRegistry.ts, `listAgentTools`), which also applies the shared
 * AGENT_TOOLS_DISABLED kill switch. A voice profile's agent_key IS the registry's AgentKey.
 *
 * A tool is allowed only if ALL of these hold (each failure is reported with a stable reason):
 *   1. the registry grants it to the agent, and the kill switch has not switched it off,
 *   2. it is listed in the published version's tool_permissions,
 *   3. it is registered with the broker (a real implementation exists),
 *   4. it is read-only. A tool that changes the world needs a human approval step, which voice calls
 *      do not have, so it is refused here rather than trusted to the prompt,
 *   5. it is allowed for the profile's brand (the admissions knowledge base is Colaberry's; it is not
 *      tenant-scoped in the database, so the scope is enforced here).
 * Every call is then recorded through agents/tools/toolInvocationRecorder.ts by the broker.
 */
import { ToolBroker, type RegisteredTool } from '../engines/toolBroker';
import { agentHasTool, listAgentTools } from '../../agents/tools/agentToolRegistry';
import type { AgentKey } from '../../agents/tools/types';

/** Brands each brand-sensitive tool may serve. Tools not listed here are brand-neutral. */
export const TOOL_BRANDS: Readonly<Record<string, readonly string[]>> = {
  admissions_knowledge: ['colaberry'],
};

export type ToolDenial = 'not_granted_or_switched_off' | 'not_in_version' | 'not_registered' | 'requires_human_approval' | 'caller_not_verified' | 'brand_not_allowed';

export interface ToolPolicyInput {
  agentKey: string;
  brandSlug: string;
  versionPermissions: readonly string[];
  registered: readonly RegisteredTool[];
  /**
   * Was the caller verified by a real check? Defaults to false. Caller ID never counts: it is trivially
   * spoofed. No verification method exists yet, so sensitive tools are refused on every call.
   */
  callerVerified?: boolean;
}

export interface ToolPolicyResult {
  allowed: RegisteredTool[];
  denied: Array<{ name: string; reason: ToolDenial }>;
  /** What the registry says the agent holds right now (kill switch applied), for the recorder. */
  held: string[];
}

export function effectiveVoiceTools(p: ToolPolicyInput): ToolPolicyResult {
  // An agent key the registry does not know holds nothing (listAgentTools returns []).
  const held = listAgentTools(p.agentKey as AgentKey) as string[];
  const grants = new Set(held);
  const inVersion = new Set(p.versionPermissions);
  const byName = new Map(p.registered.map((t) => [t.def.name, t]));
  const names = [...new Set([...grants, ...inVersion, ...byName.keys()])].sort();
  const allowed: RegisteredTool[] = [];
  const denied: ToolPolicyResult['denied'] = [];
  for (const name of names) {
    const tool = byName.get(name);
    const brands = TOOL_BRANDS[name];
    let reason: ToolDenial | null = null;
    if (!grants.has(name)) reason = 'not_granted_or_switched_off';
    else if (!inVersion.has(name)) reason = 'not_in_version';
    else if (!tool) reason = 'not_registered';
    else if (!tool.readOnly) reason = 'requires_human_approval';
    else if (tool.sensitive && p.callerVerified !== true) reason = 'caller_not_verified';
    else if (brands && !brands.includes(p.brandSlug)) reason = 'brand_not_allowed';
    if (reason) denied.push({ name, reason });
    else allowed.push(tool as RegisteredTool);
  }
  return { allowed, denied, held };
}

/**
 * Until live calls run a published version (VS4.5), the engines build their own short, read-only tool
 * list. It still answers to the shared grants and AGENT_TOOLS_DISABLED kill switch, and drops any tool that writes.
 */
export function toolsNotSwitchedOff(tools: readonly RegisteredTool[], agentKey: AgentKey = 'edu-cory-outbound'): RegisteredTool[] {
  return tools.filter((t) => t.readOnly && agentHasTool(agentKey, t.def.name as Parameters<typeof agentHasTool>[1]));
}

/** The one way a voice call gets its broker: policy-filtered tools, recorded under the agent's key. */
export function buildVoiceBroker(p: ToolPolicyInput, timeoutMs?: number): { broker: ToolBroker; denied: ToolPolicyResult['denied'] } {
  const r = effectiveVoiceTools(p);
  return { broker: new ToolBroker(r.allowed, timeoutMs, { agentName: p.agentKey, surface: 'voice_call', held: r.held }, p.callerVerified === true), denied: r.denied };
}

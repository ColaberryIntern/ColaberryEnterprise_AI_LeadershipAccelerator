/**
 * Voice tool policy (VS3.1), pure. Decides, ONCE at call start, which tools a voice call may use.
 * Nothing said on the call is an input here, which is the structural defence against prompt
 * injection: caller speech and retrieved text reach the model, but the model can only call tools the
 * broker was built with, and the broker is built from this function's `allowed` list alone.
 *
 * A tool is allowed only if ALL of these hold (each failure is reported with a stable reason):
 *   1. granted to the agent this profile is a channel for (VOICE_TOOL_GRANTS, a typed constant in the
 *      same style as agents/tools/agentToolRegistry.ts: a grant changes with a deploy and is covered
 *      by tsc and a test, not by whatever is in a table),
 *   2. listed in the published version's tool_permissions,
 *   3. registered with the broker (a real implementation exists),
 *   4. not switched off by AGENT_TOOLS_DISABLED (the same kill switch the agent tool registry reads),
 *   5. read-only. A tool that changes the world needs a human approval step, which voice calls do
 *      not have, so it is refused here rather than trusted to the prompt,
 *   6. allowed for the profile's brand (the admissions knowledge base is Colaberry's; it is not
 *      tenant-scoped in the database, so the scope is enforced here).
 */
import type { RegisteredTool } from '../engines/toolBroker';

export const VOICE_TOOL_GRANTS: Readonly<Record<string, readonly string[]>> = {
  /** "Edu: Cory - Outbound", the first migration target (MIGRATION_MATRIX.md). */
  'edu-cory-outbound': ['next_open_strategy_slots', 'admissions_knowledge'],
  /** The Phase 2 Test Lab profile. */
  'test-relay': ['next_open_strategy_slots'],
};

/** Brands each brand-sensitive tool may serve. Tools not listed here are brand-neutral. */
export const TOOL_BRANDS: Readonly<Record<string, readonly string[]>> = {
  admissions_knowledge: ['colaberry'],
};

export type ToolDenial = 'not_granted_to_agent' | 'not_in_version' | 'not_registered' | 'kill_switch' | 'requires_human_approval' | 'brand_not_allowed';

export interface ToolPolicyInput {
  agentKey: string;
  brandSlug: string;
  versionPermissions: readonly string[];
  registered: readonly RegisteredTool[];
  env?: Record<string, string | undefined>;
}

export interface ToolPolicyResult {
  allowed: RegisteredTool[];
  denied: Array<{ name: string; reason: ToolDenial }>;
}

function killSwitched(env: Record<string, string | undefined>): Set<string> {
  return new Set((env.AGENT_TOOLS_DISABLED ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function effectiveVoiceTools(p: ToolPolicyInput): ToolPolicyResult {
  const grants = new Set(VOICE_TOOL_GRANTS[p.agentKey] ?? []);
  const inVersion = new Set(p.versionPermissions);
  const off = killSwitched(p.env ?? process.env);
  const byName = new Map(p.registered.map((t) => [t.def.name, t]));
  const names = [...new Set([...grants, ...inVersion, ...byName.keys()])].sort();
  const allowed: RegisteredTool[] = [];
  const denied: ToolPolicyResult['denied'] = [];
  for (const name of names) {
    const tool = byName.get(name);
    const brands = TOOL_BRANDS[name];
    let reason: ToolDenial | null = null;
    if (!grants.has(name)) reason = 'not_granted_to_agent';
    else if (!inVersion.has(name)) reason = 'not_in_version';
    else if (!tool) reason = 'not_registered';
    else if (off.has(name)) reason = 'kill_switch';
    else if (!tool.readOnly) reason = 'requires_human_approval';
    else if (brands && !brands.includes(p.brandSlug)) reason = 'brand_not_allowed';
    if (reason) denied.push({ name, reason });
    else allowed.push(tool as RegisteredTool);
  }
  return { allowed, denied };
}

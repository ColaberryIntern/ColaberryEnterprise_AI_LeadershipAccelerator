import type { AiAgentCategory, AiAgentTriggerType, AiAgentType } from '../../models/AiAgent';

/**
 * The registry's entry shape, moved verbatim out of agentRegistrySeed.ts (Phase 5 T509) so a
 * module can declare entries without importing the 3,000-line seed - and the seed can spread
 * them without importing the module's dependants. Nothing here imports back.
 */
export interface AgentSeedEntry {
  agent_name: string;
  agent_type: AiAgentType;
  module: string;
  source_file: string;
  trigger_type: AiAgentTriggerType;
  schedule: string;
  category: AiAgentCategory;
  description: string;
  config?: Record<string, any>;
  // Only honored on first creation (see the findOrCreate loop below) — lets a
  // seed entry ship disabled by default without resetting it on every restart.
  enabled?: boolean;
  // Reese Phase 1 — agent-transparency fields (additive columns, see
  // ensureAiAgentIdentitySchema.ts). Optional so every other registry entry is
  // unaffected.
  system_prompt?: string;
  tools_granted?: string[];
  persona_version?: string;
}

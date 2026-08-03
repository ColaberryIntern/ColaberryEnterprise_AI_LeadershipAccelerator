// ─── Capability Registry ──────────────────────────────────────────────────────
// ProofDesk Work Graph (Milestone 3). Seed data for the Capability Router,
// replacing ticketAgentDispatcher.ts's old hard-coded AGENT_MAPPINGS array.
//
// BACKWARD COMPATIBILITY (required by this milestone's scope): every entry below
// ports one of the 5 original AGENT_MAPPINGS entries verbatim — same `match`
// function, same `agent_name`, same `execute` call — so existing ticket routing
// behavior is provably unchanged. See
// backend/src/__tests__/services/workGraph/capabilityRegistry.test.ts for the
// byte-for-byte regression check against the original array (preserved as a
// comment there for future auditing) and
// backend/src/__tests__/services/workGraph/capabilityRouter.test.ts for the
// end-to-end "same ticket still resolves to the same agent" proof.
//
// `specificity` exists to preserve the OLD array's first-match-wins tie-break
// semantics under the NEW scored router: the original array listed
// action-specific mappings (design_module/generate_artifact/qa_check) before the
// generic `type === 'curriculum'` catch-all, so a ticket matching both used to
// resolve to the specific one. specificity: 1.0 = action-level match, 0.5 =
// type-only catch-all — capabilityRouter.ts weights this into the 30% "capability
// fit" score, which alone is enough to break the tie deterministically (the other
// 6 scoring factors are identical, neutral defaults for two never-run agents).

import { Ticket } from '../../models';
import type { AgentExecutionResult } from '../agents/types';
import { runCurriculumArchitectAgent } from '../agents/curriculumArchitectAgent';
import { runArtifactGenerationAgent } from '../agents/artifactGenerationAgent';
import { runCurriculumQAAgent } from '../agents/curriculumQAAgent';
import { runPlatformFixAgent } from '../agents/platformFixAgent';

export interface CapabilityEntry {
  /** Stable id for this capability entry, independent of agent_name (an agent could
   * one day expose more than one capability). */
  capabilityId: string;
  /** Hard eligibility gate — must return true for this entry to be scored at all. */
  match: (ticket: any) => boolean;
  agent_name: string;
  execute: (ticket: any) => Promise<AgentExecutionResult>;
  /** 1.0 = action-level specific match, 0.5 = broad type-only catch-all. */
  specificity: number;
  /** Highest risk_tier this agent is permitted to handle. 'R4' = unrestricted,
   * preserving the old AGENT_MAPPINGS' unrestricted behavior for every seed entry. */
  maxRiskTier: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  /** Glob-style resource scope this agent is permitted to touch. '*' = unrestricted. */
  resourceScopePattern: string;
  /** Relative cost weight, lower = cheaper. Default 1 (no cost data exists yet for
   * any of these agents — this is deliberately neutral, not a real cost model). */
  costTier: number;
  enabled: boolean;
}

export const CAPABILITY_REGISTRY: CapabilityEntry[] = [
  {
    capabilityId: 'curriculum.design_module',
    match: (t) => t.type === 'curriculum' && t.metadata?.action === 'design_module',
    agent_name: 'CurriculumArchitectAgent',
    execute: async (ticket) => runCurriculumArchitectAgent(ticket.id, ticket.metadata || {}),
    specificity: 1.0,
    maxRiskTier: 'R4',
    resourceScopePattern: '*',
    costTier: 1,
    enabled: true,
  },
  {
    capabilityId: 'curriculum.generate_artifact',
    match: (t) => t.type === 'curriculum' && t.metadata?.action === 'generate_artifact',
    agent_name: 'ArtifactGenerationAgent',
    execute: async (ticket) => runArtifactGenerationAgent(ticket.id, ticket.metadata || {}),
    specificity: 1.0,
    maxRiskTier: 'R4',
    resourceScopePattern: '*',
    costTier: 1,
    enabled: true,
  },
  {
    capabilityId: 'curriculum.qa_check',
    match: (t) => t.type === 'curriculum' && t.metadata?.action === 'qa_check',
    agent_name: 'CurriculumQAAgent',
    execute: async () => runCurriculumQAAgent(),
    specificity: 1.0,
    maxRiskTier: 'R4',
    resourceScopePattern: '*',
    costTier: 1,
    enabled: true,
  },
  {
    capabilityId: 'bug.platform_fix',
    match: (t) => t.type === 'bug',
    agent_name: 'PlatformFixAgent',
    execute: async (ticket) =>
      runPlatformFixAgent(ticket.id, {
        title: ticket.title,
        description: ticket.description,
        ...ticket.metadata,
      }),
    specificity: 1.0,
    maxRiskTier: 'R4',
    resourceScopePattern: '*',
    costTier: 1,
    enabled: true,
  },
  {
    // The old catch-all: any curriculum ticket not matched by a more specific
    // mapping above. Lower specificity is what keeps this from winning over
    // design_module/generate_artifact/qa_check when a ticket matches more than
    // one entry's `match()` — exactly replicating the old array's ordering.
    capabilityId: 'curriculum.generic_fallback',
    match: (t) => t.type === 'curriculum',
    agent_name: 'CurriculumArchitectAgent',
    execute: async (ticket) => runCurriculumArchitectAgent(ticket.id, ticket.metadata || {}),
    specificity: 0.5,
    maxRiskTier: 'R4',
    resourceScopePattern: '*',
    costTier: 1,
    enabled: true,
  },
];

// Re-exported so ticketAgentDispatcher.ts and tests can reference the ticket-model
// type without importing it separately.
export type { Ticket };

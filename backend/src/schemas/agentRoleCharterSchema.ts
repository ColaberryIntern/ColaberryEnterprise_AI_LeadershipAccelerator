import { z } from 'zod';

// Runtime validation for AgentRoleCharter writes (AI Workforce Management,
// Checkpoint B). A manager-authored business-facing job description for an
// agent — see models/AgentRoleCharter.ts for why this is separate from
// AiAgent.system_prompt.

// Reese Product Phase 1, R4 — the versioning/authority fields are optional so
// the existing PUT payload shape (roleTitle/mission/responsibilities/kpis)
// keeps validating unchanged; a request that omits them leaves the stored
// values untouched (agentRoleCharterService.ts's upsert only sets columns
// actually present in the input). The route layer, not this schema, enforces
// that only a platform admin may set them (agentRoleCharterController.ts).
export const agentRoleCharterInputSchema = z.object({
  roleTitle: z.string().trim().min(1).max(255),
  mission: z.string().trim().min(1).max(2000),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(20),
  kpis: z.array(z.string().trim().min(1).max(200)).max(20),
  version: z.number().int().positive().optional(),
  effectiveAt: z.string().datetime().optional(),
  boundaries: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  authorityAutonomous: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  authorityApprovalRequired: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  authorityForbidden: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  escalationPolicy: z.string().trim().max(2000).optional(),
});

export type AgentRoleCharterInput = z.infer<typeof agentRoleCharterInputSchema>;

/** Field names that only a platform admin may set — checked at the route
 * layer (agentRoleCharterController.ts), not here. */
export const ADMIN_ONLY_CHARTER_FIELDS: ReadonlyArray<keyof AgentRoleCharterInput> = [
  'version', 'effectiveAt', 'boundaries',
  'authorityAutonomous', 'authorityApprovalRequired', 'authorityForbidden', 'escalationPolicy',
];

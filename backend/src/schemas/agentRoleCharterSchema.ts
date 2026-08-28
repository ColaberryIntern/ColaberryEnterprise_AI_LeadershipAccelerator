import { z } from 'zod';

// Runtime validation for AgentRoleCharter writes (AI Workforce Management,
// Checkpoint B). A manager-authored business-facing job description for an
// agent — see models/AgentRoleCharter.ts for why this is separate from
// AiAgent.system_prompt.

export const agentRoleCharterInputSchema = z.object({
  roleTitle: z.string().trim().min(1).max(255),
  mission: z.string().trim().min(1).max(2000),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(20),
  kpis: z.array(z.string().trim().min(1).max(200)).max(20),
});

export type AgentRoleCharterInput = z.infer<typeof agentRoleCharterInputSchema>;

import { z } from 'zod';

// Runtime validation for a checklist bypass request — shape only. The real
// business rule (a minimum-length, evaluable reason) lives in
// checklistGate.ts's decideChecklistBypass(), same layering
// agentGoalSchema.ts already uses (schema validates shape, service
// validates business rules).
export const checklistBypassInputSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});
export type ChecklistBypassInput = z.infer<typeof checklistBypassInputSchema>;

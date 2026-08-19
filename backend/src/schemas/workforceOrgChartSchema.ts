import { z } from 'zod';

/**
 * Contract for GET /api/admin/workforce/org-chart (org-chart hierarchy build,
 * 2026-08-19). Validated against the real response in dev (fail loud); logged
 * and continued in production — same pattern as capeSchema.ts's
 * skillProfileResponseSchema (see capePortalController.ts::handleGetSkillProfile()).
 */
const orgChartTaskSchema = z.object({
  id: z.string(),
  ticket_number: z.number().nullable(),
  title: z.string(),
  status: z.string(),
  priority: z.string(),
  type: z.string(),
  created_at: z.string().nullable(),
});

const orgChartHumanSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  team: z.string().nullable(),
  role: z.enum(['manager', 'member']),
  leadership_agent_ids: z.array(z.string()),
  staff_count: z.number().int().nonnegative(),
  task: orgChartTaskSchema.nullable(),
});

const orgChartLeadershipAgentSchema = z.object({
  id: z.string(),
  agent_name: z.string(),
  display_name: z.string(),
  reports_to_human_id: z.string(),
  staff_ids: z.array(z.string()),
  open_ticket_count: z.number().int().nonnegative(),
});

const orgChartStaffAgentSchema = z.object({
  id: z.string(),
  agent_name: z.string(),
  display_name: z.string(),
  reports_to_agent_id: z.string(),
  open_ticket_count: z.number().int().nonnegative(),
});

const orgChartUnresolvedAgentSchema = z.object({
  id: z.string(),
  agent_name: z.string(),
  reason: z.string(),
});

export const workforceOrgChartResponseSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string() }),
  humans: z.array(orgChartHumanSchema),
  leadership: z.array(orgChartLeadershipAgentSchema),
  staff: z.array(orgChartStaffAgentSchema),
  unresolved: z.array(orgChartUnresolvedAgentSchema),
  generated_at: z.string(),
});
export type WorkforceOrgChartResponse = z.infer<typeof workforceOrgChartResponseSchema>;

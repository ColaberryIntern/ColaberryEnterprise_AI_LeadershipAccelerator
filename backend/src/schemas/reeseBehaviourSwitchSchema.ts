import { z } from 'zod';

// Reese Product Phase 1 follow-up (2026-09-18) — the real switch keys. SEVEN at first;
// an eighth (`ticket_follow_up`) was added 2026-10-09 after the Agent Factory sweep found
// `ReeseTicketFollowUpSweep` live, enabled and DMing students with no manager kill switch.
// agentDetailEmployeeFacts.ts's ReeseBehaviourKey type names, kept in sync by
// hand (a literal union, same convention as agentRoleCharterSchema.ts) since
// this is the one place an HTTP body needs runtime validation of that type.
export const REESE_BEHAVIOUR_KEYS = [
  'reactive_dm_reply',
  'autonomous_outreach_sweep',
  'outreach_follow_ups',
  'welcome_dms',
  'student_support_supersession_resolver',
  'presence_heartbeat',
  'health_assessment',
  'ticket_follow_up',
] as const;

export const reeseBehaviourSwitchKeySchema = z.enum(REESE_BEHAVIOUR_KEYS);

export const reeseBehaviourSwitchInputSchema = z.object({
  enabled: z.boolean(),
});

export type ReeseBehaviourSwitchInput = z.infer<typeof reeseBehaviourSwitchInputSchema>;

import { z } from 'zod';

// Runtime validation for ProofDesk Milestone 2 decision records (spec section 10 —
// the human comment / decision model). A decision record is a durable, typed note on
// a ticket, distinct from the free-text TicketActivity comment stream.

const uuid = z.string().uuid();

export const decisionTypeSchema = z.enum(['approve', 'reject', 'override', 'note']);

export const decisionRecordInputSchema = z.object({
  ticketId: uuid,
  decisionType: decisionTypeSchema,
  // 'ai_staff' added for Reese Phase 1 — decision records attributed to a real AI
  // staff-mentor identity (distinct from generic autonomous 'agent'). 'org_member'
  // added for the auto-decision-record writer (2026-08-23, ticketService.ts's
  // updateTicketStatus()) — the Agent Ticket Standard's real, resolved human
  // (org_members row) actor type was missing here even though it's a valid
  // TicketActorType, which would have silently rejected a decision record for
  // any org_member-attributed status transition. Now the full TicketActorType
  // union (models/Ticket.ts) is represented.
  actorType: z.enum(['human', 'cory', 'agent', 'ai_staff', 'org_member']),
  actorId: z.string().trim().min(1).max(255),
  rationale: z.string().max(5000).nullable().optional(),
  linkedEvidenceIds: z.array(uuid).optional(),
});

export type DecisionRecordInput = z.infer<typeof decisionRecordInputSchema>;

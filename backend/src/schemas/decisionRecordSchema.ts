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
  // staff-mentor identity (distinct from generic autonomous 'agent'), matching
  // Ticket.ts's TicketActorType union.
  actorType: z.enum(['human', 'cory', 'agent', 'ai_staff']),
  actorId: z.string().trim().min(1).max(255),
  rationale: z.string().max(5000).nullable().optional(),
  linkedEvidenceIds: z.array(uuid).optional(),
});

export type DecisionRecordInput = z.infer<typeof decisionRecordInputSchema>;

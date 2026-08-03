import { z } from 'zod';

// Runtime validation for ProofDesk Milestone 2 decision records (spec section 10 —
// the human comment / decision model). A decision record is a durable, typed note on
// a ticket, distinct from the free-text TicketActivity comment stream.

const uuid = z.string().uuid();

export const decisionTypeSchema = z.enum(['approve', 'reject', 'override', 'note']);

export const decisionRecordInputSchema = z.object({
  ticketId: uuid,
  decisionType: decisionTypeSchema,
  actorType: z.enum(['human', 'cory', 'agent']),
  actorId: z.string().trim().min(1).max(255),
  rationale: z.string().max(5000).nullable().optional(),
  linkedEvidenceIds: z.array(uuid).optional(),
});

export type DecisionRecordInput = z.infer<typeof decisionRecordInputSchema>;

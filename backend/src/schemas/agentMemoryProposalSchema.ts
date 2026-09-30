import { z } from 'zod';

// Runtime validation for AgentMemoryProposal writes (AI Workforce
// Management, Checkpoint E).

export const createMemoryProposalInputSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().min(1).max(4000).optional(),
});
export type CreateMemoryProposalInput = z.infer<typeof createMemoryProposalInputSchema>;

export const reviewMemoryProposalInputSchema = z.object({
  reviewNotes: z.string().trim().min(1).max(2000).optional(),
});
export type ReviewMemoryProposalInput = z.infer<typeof reviewMemoryProposalInputSchema>;

import { z } from 'zod';

// Runtime validation for the ProofDesk Work Ledger event envelope (spec section
// 9.1). workLedgerService.emitEvent() parses every call through this before
// writing to work_ledger_events, per root CLAUDE.md > Contract Enforcement Layer.
// A malformed envelope is a caller bug - emitEvent() rejects it (see
// WorkLedgerValidationError) rather than silently coercing bad data into an
// append-only, audit-relevant table.

const uuid = z.string().uuid();

export const workLedgerEventInputSchema = z.object({
  workContextId: uuid.nullable().optional(),
  ticketId: uuid.nullable().optional(),
  relatedTicketIds: z.array(uuid).optional(),
  workUnitId: uuid.nullable().optional(),
  runId: uuid.nullable().optional(),
  traceId: uuid,
  parentEventId: uuid.nullable().optional(),
  actorType: z.string().trim().min(1).max(20),
  actorId: z.string().trim().min(1).max(255),
  agentVersion: z.string().max(50).nullable().optional(),
  intent: z.string().trim().min(1).max(100),
  domain: z.string().trim().min(1).max(50),
  actionClass: z.string().trim().min(1).max(50),
  targetType: z.string().trim().min(1).max(50),
  targetId: z.string().max(255).nullable().optional(),
  environment: z.string().max(20).optional(),
  riskTier: z.enum(['R0', 'R1', 'R2', 'R3', 'R4']).optional(),
  authorizationDecisionId: uuid.nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(255),
  beforeStateRef: z.string().max(255).nullable().optional(),
  afterStateRef: z.string().max(255).nullable().optional(),
  result: z.enum(['success', 'failure', 'skipped', 'pending']),
  reasonCode: z.string().max(100).nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  costUsd: z.number().nonnegative().nullable().optional(),
  sourceRecordType: z.string().max(50).nullable().optional(),
  sourceRecordId: z.string().max(255).nullable().optional(),
  occurredAt: z.date().optional(),
});

export type WorkLedgerEventInput = z.infer<typeof workLedgerEventInputSchema>;

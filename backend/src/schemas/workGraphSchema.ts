import { z } from 'zod';

// Runtime validation for ProofDesk Work Graph (Milestone 3) inputs — work-unit
// creation, dependency-edge creation, and lease-acquire payloads. Matches
// workLedgerEventSchema.ts's pattern (trimmed strings, explicit enums, uuid
// validation, explicit optional/nullable), per root CLAUDE.md > Contract
// Enforcement Layer: every inbound HTTP route validates with Zod before business
// logic sees it.

const uuid = z.string().uuid();

export const WORK_UNIT_STATUSES = [
  'pending',
  'ready',
  'in_progress',
  'blocked',
  'done',
  'failed',
  'cancelled',
] as const;

export const RISK_TIERS = ['R0', 'R1', 'R2', 'R3', 'R4'] as const;

export const createWorkUnitInputSchema = z.object({
  workContextId: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  requiredCapability: z.string().trim().min(1).max(100),
  targetResourceScope: z.string().max(255).nullable().optional(),
  acceptanceCriteria: z.string().max(10000).nullable().optional(),
  status: z.enum(WORK_UNIT_STATUSES).optional(),
  riskTier: z.enum(RISK_TIERS).optional(),
  approvalPolicy: z.string().max(20).optional(),
  verificationContract: z.string().max(10000).nullable().optional(),
  eligibleParallelism: z.number().int().positive().optional(),
  expectedOutputRefs: z.array(z.any()).optional(),
});

export type CreateWorkUnitInput = z.infer<typeof createWorkUnitInputSchema>;

export const createWorkUnitDependencySchema = z
  .object({
    dependsOnWorkUnitId: uuid,
    dependencyType: z.string().max(20).optional(),
  })
  .strict();

export type CreateWorkUnitDependencyInput = z.infer<typeof createWorkUnitDependencySchema>;

export const acquireLeaseInputSchema = z.object({
  resourceKey: z.string().trim().min(1).max(255),
  workUnitId: uuid.nullable().optional(),
  runId: uuid.nullable().optional(),
  leaseOwner: z.string().trim().min(1).max(255),
  idempotencyKey: z.string().trim().min(1).max(255),
  ttlMs: z.number().int().positive().max(24 * 60 * 60 * 1000).optional(), // cap 24h
  beforeStateVersion: z.string().max(100).nullable().optional(),
});

export type AcquireLeaseInput = z.infer<typeof acquireLeaseInputSchema>;

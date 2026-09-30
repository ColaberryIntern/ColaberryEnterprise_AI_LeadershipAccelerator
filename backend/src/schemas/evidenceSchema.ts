import { z } from 'zod';

// Runtime validation for ProofDesk Milestone 2 evidence writes. evidenceService's
// recordEvidenceArtifact() parses every call through this before writing to
// evidence_artifacts/evidence_links, per root CLAUDE.md > Contract Enforcement Layer.
// At least one reference field must be present — an evidence artifact that points at
// nothing is not evidence.

const uuid = z.string().uuid();

export const evidenceArtifactTypeSchema = z.enum(['screenshot', 'log', 'diff', 'receipt', 'other']);
export const evidenceLinkRoleSchema = z.enum(['primary', 'related']);

export const evidenceArtifactInputSchema = z
  .object({
    ticketId: uuid,
    artifactType: evidenceArtifactTypeSchema,
    storageRef: z.string().trim().min(1).max(512).nullable().optional(),
    domSnapshotId: uuid.nullable().optional(),
    visualReviewSessionId: uuid.nullable().optional(),
    sourceEventId: uuid.nullable().optional(),
    title: z.string().max(255).nullable().optional(),
    capturedAt: z.date().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    linkRole: evidenceLinkRoleSchema.optional(),
  })
  .refine(
    (v) => Boolean(v.storageRef || v.domSnapshotId || v.visualReviewSessionId || v.sourceEventId),
    { message: 'At least one of storageRef, domSnapshotId, visualReviewSessionId, sourceEventId is required — evidence must reference something.' },
  );

export type EvidenceArtifactInput = z.infer<typeof evidenceArtifactInputSchema>;

import { Op } from 'sequelize';
import { EvidenceArtifact, EvidenceLink } from '../../models';
import { evidenceArtifactInputSchema, EvidenceArtifactInput } from '../../schemas/evidenceSchema';

// ProofDesk Milestone 2 (Proof & Ticket Experience). recordEvidenceArtifact() is the
// single writer for evidence_artifacts + evidence_links. Idempotent per root
// CLAUDE.md > Idempotency & Replayability: a duplicate call (same ticket +
// storageRef, or same ticket + sourceEventId when no storageRef is given) is a no-op
// that returns the existing artifact, not a duplicate row or an error.
//
// Failure-First Design:
// 1. What happens if this fails? Malformed input is rejected before any write
//    (EvidenceValidationError). A DB failure propagates to the caller — unlike
//    workLedgerService's emitEvent(), evidence recording is not (yet) wrapped by a
//    silent-catch bridge at its call sites, because Milestone 2 callers (route
//    handlers) are expected to surface a 400/500 to the admin UI rather than silently
//    swallow a lost evidence write.
// 2. Retry? None automatic inside this function. The idempotency check is what makes
//    an upstream retry of the whole calling operation safe to replay.
// 3. Recovery if exhausted? A failed write simply never lands; no dead-letter queue in
//    this milestone (matches Milestone 1's evidence-recording maturity level).
// 4. Explicit failure modes handled: malformed envelope (validation error), duplicate
//    (ticketId, storageRef) or (ticketId, sourceEventId) (no-op). Not handled: DB fully
//    unavailable — propagates as a generic error to the caller.

export class EvidenceValidationError extends Error {
  error_class = 'EvidenceValidationError';
  issues?: unknown;

  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'EvidenceValidationError';
    this.issues = issues;
  }
}

function isUniqueConstraintError(err: any): boolean {
  return err?.name === 'SequelizeUniqueConstraintError';
}

async function ensureLink(evidenceId: string, ticketId: string, role: 'primary' | 'related'): Promise<void> {
  await EvidenceLink.findOrCreate({
    where: { evidence_id: evidenceId, ticket_id: ticketId },
    defaults: { evidence_id: evidenceId, ticket_id: ticketId, link_role: role } as any,
  });
}

/**
 * Record one evidence artifact for a ticket, linking it via evidence_links. Duplicate
 * calls (same ticketId + storageRef, or same ticketId + sourceEventId when no
 * storageRef given) are a no-op that returns the existing artifact.
 *
 * Throws `EvidenceValidationError` for a malformed or referenceless input.
 */
export async function recordEvidenceArtifact(input: EvidenceArtifactInput): Promise<EvidenceArtifact> {
  const parsed = evidenceArtifactInputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new EvidenceValidationError(`Malformed evidence artifact input: ${detail}`, parsed.error.issues);
  }
  const data = parsed.data;

  const dedupWhere: Record<string, any> = { ticket_id: data.ticketId };
  if (data.storageRef) {
    dedupWhere.storage_ref = data.storageRef;
  } else if (data.sourceEventId) {
    dedupWhere.source_event_id = data.sourceEventId;
  }

  const existing = await EvidenceArtifact.findOne({ where: dedupWhere });
  if (existing) {
    await ensureLink(existing.id, data.ticketId, data.linkRole ?? 'primary');
    return existing;
  }

  let created: EvidenceArtifact;
  try {
    created = await EvidenceArtifact.create({
      ticket_id: data.ticketId,
      artifact_type: data.artifactType,
      storage_ref: data.storageRef ?? null,
      dom_snapshot_id: data.domSnapshotId ?? null,
      visual_review_session_id: data.visualReviewSessionId ?? null,
      source_event_id: data.sourceEventId ?? null,
      title: data.title ?? null,
      captured_at: data.capturedAt ?? new Date(),
      metadata: data.metadata ?? {},
    } as any);
  } catch (err: any) {
    if (isUniqueConstraintError(err)) {
      const winner = await EvidenceArtifact.findOne({ where: dedupWhere });
      if (winner) {
        await ensureLink(winner.id, data.ticketId, data.linkRole ?? 'primary');
        return winner;
      }
    }
    throw err;
  }

  await ensureLink(created.id, data.ticketId, data.linkRole ?? 'primary');
  return created;
}

/** Read-only: all evidence linked to a ticket, most recent first. */
export async function getEvidenceForTicket(ticketId: string): Promise<EvidenceArtifact[]> {
  const links = await EvidenceLink.findAll({ where: { ticket_id: ticketId } });
  if (links.length === 0) return [];
  const evidenceIds = links.map((l) => l.evidence_id);
  return EvidenceArtifact.findAll({
    where: { id: { [Op.in]: evidenceIds } },
    order: [['created_at', 'DESC']],
  });
}

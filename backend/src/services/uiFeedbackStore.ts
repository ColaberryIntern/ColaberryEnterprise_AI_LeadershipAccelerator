/**
 * UI Element Feedback Store
 *
 * Persistent storage for element-level UI feedback with hash-based dedup.
 * Same issue on same element never regenerates.
 */
import crypto from 'crypto';
import UIElementFeedback from '../models/UIElementFeedback';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Hash generation for dedup
// ---------------------------------------------------------------------------

export function feedbackHash(elementId: string, issueType: string, description: string): string {
  const input = `${elementId}|${issueType}|${description.substring(0, 100).toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 64);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreateFeedbackInput {
  capabilityId: string;
  projectId: string;
  elementId: string;
  elementType?: string;
  elementSelector?: string;
  elementText?: string;
  pageRoute?: string;
  issueType: string;
  title: string;
  description: string;
  suggestion?: string;
  severity?: string;
  prompt?: string;
  source?: string;
  confidence?: number;
  sourceStep?: string;
}

/**
 * Create feedback if not already exists (dedup by hash).
 * Returns the feedback item (existing or new).
 *
 * Phase 10.5: classify the row into a UX cluster (cluster_signature +
 * cluster_type) at create time so the regression detector + reranker
 * group by stable identity. Also detects reappearance of a previously-
 * resolved hash and stamps last_regressed_at + carries first_seen_at
 * forward, even though we deliberately leave the resolved row in place
 * (count of resolved rows with the same hash IS the regression count).
 */
export async function createFeedback(input: CreateFeedbackInput): Promise<{ item: UIElementFeedback; isNew: boolean }> {
  const hash = feedbackHash(input.elementId, input.issueType, input.description);

  // Check for existing open/in_progress feedback with same hash
  const existing = await UIElementFeedback.findOne({
    where: {
      capability_id: input.capabilityId,
      feedback_hash: hash,
      status: { [Op.in]: ['open', 'in_progress'] },
    },
  });

  if (existing) return { item: existing, isNew: false };

  // Reappearance check — find the most recent RESOLVED row with the same
  // hash. If one exists, this is a regression: the user fixed it, and now
  // it's back. Carry first_seen_at forward, stamp last_regressed_at on
  // the new row.
  const lastResolved = await UIElementFeedback.findOne({
    where: {
      capability_id: input.capabilityId,
      feedback_hash: hash,
      status: 'resolved',
    },
    order: [['resolved_at', 'DESC']],
  });

  // Phase 10.5 cluster classification — best-effort. If the classifier
  // can't infer a type (and source_step + issue_type don't fall through
  // to a fallback), cluster_signature stays null and the row is treated
  // as untagged by the cluster engine.
  let cluster_signature: string | undefined;
  let cluster_type: string | undefined;
  try {
    const { classifyRow } = await import('../intelligence/systemStateEngine/remediation/issueClusterEngine');
    const cls = classifyRow(
      {
        issue_type: input.issueType,
        title: input.title,
        description: input.description,
        suggestion: input.suggestion ?? null,
        source_step: input.sourceStep ?? null,
        element_type: input.elementType ?? null,
        element_text: input.elementText ?? null,
      },
      input.capabilityId,
      input.pageRoute || '/',
    );
    if (cls) {
      cluster_signature = cls.cluster_signature;
      cluster_type = cls.cluster_type;
    }
  } catch (err: any) {
    console.warn('[uiFeedbackStore] cluster classification failed:', err?.message);
  }

  const now = new Date();
  const item = await UIElementFeedback.create({
    capability_id: input.capabilityId,
    project_id: input.projectId,
    element_id: input.elementId,
    element_type: input.elementType,
    element_selector: input.elementSelector,
    element_text: input.elementText,
    page_route: input.pageRoute,
    issue_type: input.issueType,
    title: input.title,
    description: input.description,
    suggestion: input.suggestion,
    severity: input.severity || 'medium',
    feedback_hash: hash,
    prompt: input.prompt,
    source: input.source || 'rule',
    confidence: input.confidence ?? 1.0,
    source_step: input.sourceStep,
    cluster_signature,
    cluster_type,
    first_seen_at: (lastResolved && (lastResolved as any).first_seen_at) || now,
    last_regressed_at: lastResolved ? now : undefined,
  });

  return { item, isNew: true };
}

/**
 * Phase 10.5 — derived regression count for a feedback hash. We deliberately
 * do not store this as a column (the dedup+create flow makes it brittle).
 * Returns count of resolved rows with the same hash on the same capability.
 */
export async function getRegressionCount(capabilityId: string, hash: string): Promise<number> {
  return UIElementFeedback.count({
    where: { capability_id: capabilityId, feedback_hash: hash, status: 'resolved' },
  });
}

/**
 * Bulk-resolve every UIElementFeedback row that's currently in_progress for
 * a capability. Used by the validate-build flow: when the user pastes a
 * successful Claude Code response, anything they were actively fixing
 * graduates to resolved. Returns the resolved IDs grouped by source_step
 * so the caller can stamp ui_element_map.steps[*].last_resolved_at.
 */
export async function bulkResolveInProgress(
  capabilityId: string,
  resolvedBy?: string,
): Promise<{ resolved: number; bySourceStep: Record<string, number> }> {
  const items = await UIElementFeedback.findAll({
    where: { capability_id: capabilityId, status: 'in_progress' },
  });
  if (items.length === 0) return { resolved: 0, bySourceStep: {} };
  const now = new Date();
  const bySourceStep: Record<string, number> = {};
  await Promise.all(items.map(async (it: any) => {
    it.status = 'resolved';
    it.resolved_at = now;
    if (resolvedBy) it.resolved_by = resolvedBy;
    await it.save();
    const step = it.source_step || 'untagged';
    bySourceStep[step] = (bySourceStep[step] || 0) + 1;
  }));
  return { resolved: items.length, bySourceStep };
}

/**
 * Get all feedback for a capability, optionally filtered.
 */
export async function getFeedback(capabilityId: string, options?: {
  elementId?: string;
  status?: string;
  issueType?: string;
}): Promise<UIElementFeedback[]> {
  const where: any = { capability_id: capabilityId };
  if (options?.elementId) where.element_id = options.elementId;
  if (options?.status) where.status = options.status;
  if (options?.issueType) where.issue_type = options.issueType;

  return UIElementFeedback.findAll({
    where,
    order: [
      ['severity', 'ASC'], // high first (alphabetical: high < low < medium)
      ['created_at', 'DESC'],
    ],
  });
}

/**
 * Get feedback summary counts for a capability.
 */
export async function getFeedbackSummary(capabilityId: string): Promise<{
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  by_severity: Record<string, number>;
  by_element: Record<string, number>;
}> {
  const all = await UIElementFeedback.findAll({
    where: { capability_id: capabilityId },
    attributes: ['status', 'severity', 'element_id'],
  });

  const bySeverity: Record<string, number> = {};
  const byElement: Record<string, number> = {};

  for (const f of all) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    if (f.status !== 'resolved') {
      byElement[f.element_id] = (byElement[f.element_id] || 0) + 1;
    }
  }

  return {
    total: all.length,
    open: all.filter(f => f.status === 'open').length,
    in_progress: all.filter(f => f.status === 'in_progress').length,
    resolved: all.filter(f => f.status === 'resolved').length,
    by_severity: bySeverity,
    by_element: byElement,
  };
}

/**
 * Update feedback status.
 */
export async function updateFeedbackStatus(
  feedbackId: string,
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed',
  resolvedBy?: string,
): Promise<UIElementFeedback | null> {
  const item = await UIElementFeedback.findByPk(feedbackId);
  if (!item) return null;

  item.status = status;
  if (status === 'resolved' || status === 'dismissed') {
    item.resolved_at = new Date();
    item.resolved_by = resolvedBy || 'manual';
  }
  await item.save();
  return item;
}

/**
 * Resolve all feedback for elements that no longer exist.
 */
export async function resolveRemovedElements(
  capabilityId: string,
  currentElementIds: string[],
): Promise<number> {
  if (currentElementIds.length === 0) return 0;

  const [affectedCount] = await UIElementFeedback.update(
    { status: 'resolved', resolved_by: 'element_removed', resolved_at: new Date() } as any,
    {
      where: {
        capability_id: capabilityId,
        status: { [Op.in]: ['open', 'in_progress'] },
        element_id: { [Op.notIn]: currentElementIds },
      },
    },
  );
  return affectedCount;
}

/**
 * visualReviewSessionService — CRUD for VisualReviewSession + critique items
 * + AI suggestions + decisions.
 *
 * Wraps Sequelize so the endpoints stay thin.
 *
 * Phase 5 §1.
 */

export interface OpenSessionInput {
  readonly project_id: string;
  readonly bp_id?: string | null;
  readonly page_route: string;
  readonly participant_sub: string;
  readonly primary_screenshot_path?: string | null;
  readonly notes?: string | null;
}

export async function openSession(input: OpenSessionInput): Promise<{ id: string; opened_at: string; status: string; }> {
  const { default: VisualReviewSession } = await import('../../../models/VisualReviewSession');
  const row = await VisualReviewSession.create({
    project_id: input.project_id,
    bp_id: input.bp_id ?? null,
    page_route: input.page_route,
    participant_sub: input.participant_sub,
    status: 'critiquing',
    opened_at: new Date(),
    closed_at: null,
    primary_screenshot_path: input.primary_screenshot_path ?? null,
    dom_snapshot: null,
    generated_prompt: null,
    resulting_manifest_id: null,
    ux_score_before: null,
    ux_score_after: null,
    notes: input.notes ?? null,
  } as any);
  const r = row as any;
  return { id: r.id, opened_at: new Date(r.opened_at).toISOString(), status: r.status };
}

export async function addCritique(input: {
  session_id: string;
  project_id: string;
  kind: string;
  severity: string;
  description: string;
  region?: { x: number; y: number; width: number; height: number } | null;
  target_selector?: string | null;
  workflow_id?: string | null;
  expected_outcome?: string | null;
  created_by: string;
}): Promise<{ id: string }> {
  const { default: VisualCritiqueItem } = await import('../../../models/VisualCritiqueItem');
  const row = await VisualCritiqueItem.create({
    session_id: input.session_id,
    project_id: input.project_id,
    kind: input.kind as any,
    severity: input.severity as any,
    description: input.description,
    region: input.region ?? null,
    target_selector: input.target_selector ?? null,
    workflow_id: input.workflow_id ?? null,
    expected_outcome: input.expected_outcome ?? null,
    created_by: input.created_by,
  } as any);
  return { id: (row as any).id };
}

export async function listCritiques(sessionId: string): Promise<any[]> {
  const { default: VisualCritiqueItem } = await import('../../../models/VisualCritiqueItem');
  const rows = await VisualCritiqueItem.findAll({ where: { session_id: sessionId }, order: [['created_at', 'ASC']] });
  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    severity: r.severity,
    description: r.description,
    region: r.region,
    target_selector: r.target_selector,
    workflow_id: r.workflow_id,
    expected_outcome: r.expected_outcome,
    created_by: r.created_by,
    created_at: new Date(r.created_at).toISOString(),
    // 2026-05-21 Visual Scan + lifecycle additions.
    scope: r.scope || 'page',
    lifecycle_stage: r.lifecycle_stage || 'suggested',
    title: r.title,
    rationale: r.rationale,
    related_routes: r.related_routes || [],
  }));
}

export async function recordSuggestion(input: {
  session_id: string;
  critique_id: string | null;
  project_id: string;
  kind: string;
  title: string;
  body: string;
  rationale?: string | null;
  confidence: number;
  expected_ux_impact: number;
  source: 'rule_based' | 'llm';
  source_metadata?: any;
}): Promise<{ id: string }> {
  const { default: VisualAISuggestion } = await import('../../../models/VisualAISuggestion');
  const row = await VisualAISuggestion.create({
    session_id: input.session_id,
    critique_id: input.critique_id,
    project_id: input.project_id,
    kind: input.kind as any,
    title: input.title,
    body: input.body,
    rationale: input.rationale ?? null,
    confidence: input.confidence,
    expected_ux_impact: input.expected_ux_impact,
    source: input.source,
    source_metadata: input.source_metadata ?? {},
  } as any);
  return { id: (row as any).id };
}

export async function listSuggestions(sessionId: string): Promise<any[]> {
  const { default: VisualAISuggestion } = await import('../../../models/VisualAISuggestion');
  const rows = await VisualAISuggestion.findAll({ where: { session_id: sessionId }, order: [['expected_ux_impact', 'DESC']] });
  return rows.map((r: any) => ({
    id: r.id,
    critique_id: r.critique_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    rationale: r.rationale,
    confidence: r.confidence,
    expected_ux_impact: r.expected_ux_impact,
    source: r.source,
    created_at: new Date(r.created_at).toISOString(),
  }));
}

export async function recordDecision(input: {
  session_id: string;
  project_id: string;
  suggestion_id?: string | null;
  critique_id?: string | null;
  verdict: 'accepted' | 'rejected' | 'deferred';
  rationale?: string | null;
  decided_by: string;
}): Promise<{ id: string }> {
  if (!input.suggestion_id && !input.critique_id) {
    throw new Error('recordDecision requires either suggestion_id or critique_id');
  }
  const { default: VisualChangeDecision } = await import('../../../models/VisualChangeDecision');
  const row = await VisualChangeDecision.create({
    session_id: input.session_id,
    project_id: input.project_id,
    suggestion_id: input.suggestion_id ?? null,
    critique_id: input.critique_id ?? null,
    verdict: input.verdict,
    rationale: input.rationale ?? null,
    decided_by: input.decided_by,
    decided_at: new Date(),
    resulting_manifest_id: null,
  } as any);
  return { id: (row as any).id };
}

export async function listDecisions(sessionId: string): Promise<any[]> {
  const { default: VisualChangeDecision } = await import('../../../models/VisualChangeDecision');
  const rows = await VisualChangeDecision.findAll({ where: { session_id: sessionId }, order: [['decided_at', 'ASC']] });
  return rows.map((r: any) => ({
    id: r.id,
    suggestion_id: r.suggestion_id,
    critique_id: r.critique_id,
    verdict: r.verdict,
    rationale: r.rationale,
    decided_by: r.decided_by,
    decided_at: new Date(r.decided_at).toISOString(),
  }));
}

export async function listProjectSessions(projectId: string, opts: { limit?: number } = {}): Promise<any[]> {
  const { default: VisualReviewSession } = await import('../../../models/VisualReviewSession');
  const rows = await VisualReviewSession.findAll({
    where: { project_id: projectId },
    order: [['opened_at', 'DESC']],
    limit: opts.limit ?? 50,
  });
  return rows.map((r: any) => ({
    id: r.id,
    bp_id: r.bp_id,
    page_route: r.page_route,
    status: r.status,
    opened_at: new Date(r.opened_at).toISOString(),
    closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    ux_score_before: r.ux_score_before,
    ux_score_after: r.ux_score_after,
  }));
}

export async function getSession(sessionId: string): Promise<any | null> {
  const { default: VisualReviewSession } = await import('../../../models/VisualReviewSession');
  const row = await VisualReviewSession.findByPk(sessionId);
  if (!row) return null;
  const r = row as any;
  return {
    id: r.id,
    project_id: r.project_id,
    bp_id: r.bp_id,
    page_route: r.page_route,
    status: r.status,
    opened_at: new Date(r.opened_at).toISOString(),
    closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    primary_screenshot_path: r.primary_screenshot_path,
    generated_prompt: r.generated_prompt,
    resulting_manifest_id: r.resulting_manifest_id,
    ux_score_before: r.ux_score_before,
    ux_score_after: r.ux_score_after,
    notes: r.notes,
  };
}

export async function persistGeneratedPrompt(sessionId: string, prompt: string): Promise<void> {
  const { default: VisualReviewSession } = await import('../../../models/VisualReviewSession');
  await VisualReviewSession.update(
    { generated_prompt: prompt, status: 'prompt_generated' as any } as any,
    { where: { id: sessionId } },
  );
}

// Phase A (2026-05-20): cap-level free-form note. Operator types in the
// sidebar textarea; persists on blur. Stored on the existing
// VisualReviewSession.notes column.
export async function updateNotes(sessionId: string, notes: string | null): Promise<void> {
  const { default: VisualReviewSession } = await import('../../../models/VisualReviewSession');
  await VisualReviewSession.update(
    { notes: (notes ?? '').slice(0, 8000) || null } as any,
    { where: { id: sessionId } },
  );
}

// Returns prior sessions for a given cap (bp_id), surfaced in the sidebar as
// "earlier notes for this cap." Only includes sessions whose notes are
// non-empty, ordered newest-first.
export async function listCapNotes(
  projectId: string,
  bpId: string,
  opts: { excludeSessionId?: string; limit?: number } = {},
): Promise<Array<{ session_id: string; page_route: string; opened_at: string; notes: string }>> {
  const { default: VisualReviewSession } = await import('../../../models/VisualReviewSession');
  const { Op } = await import('sequelize');
  const where: any = {
    project_id: projectId,
    bp_id: bpId,
    notes: { [Op.ne]: null },
  };
  if (opts.excludeSessionId) where.id = { [Op.ne]: opts.excludeSessionId };
  const rows = await VisualReviewSession.findAll({
    where,
    order: [['opened_at', 'DESC']],
    limit: opts.limit ?? 20,
  });
  return rows
    .map((r: any) => ({
      session_id: r.id,
      page_route: r.page_route,
      opened_at: new Date(r.opened_at).toISOString(),
      notes: (r.notes || '').trim(),
    }))
    .filter(r => r.notes.length > 0);
}

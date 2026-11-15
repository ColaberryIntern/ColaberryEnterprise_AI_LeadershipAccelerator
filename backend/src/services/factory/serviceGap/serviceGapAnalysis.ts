/**
 * serviceGapAnalysis - analyze ONE case study, idempotently, and store the advisory result.
 *
 * Flow: retrieval (pure) -> thin-evidence abstain (no model call) -> model assessment -> deterministic validation ->
 * one row in service_gap_analyses keyed on (tenant, case study, case fingerprint, catalog fingerprint, prompt version).
 *
 * Idempotency: a stored non-failed row for the same key is returned as-is (no model call, no cost). `force` re-runs
 * and overwrites the result for that key but KEEPS the human review columns. A failed row is always retried.
 * Two calls for the same key at once share one in-flight promise (this process), and the database key decides
 * between processes (INSERT ... ON CONFLICT DO UPDATE).
 *
 * Failure-first: (1) a model failure is stored as status `failed` with an error class, so the card shows "could not
 * analyze" and manual matching is untouched; (2) retry: one at the client, then the next click or batch; (3) recovery:
 * "Reanalyze"; (4) not handled: a wrong judgment by the model - that is why every result is a recommendation a person
 * reviews, and why nothing is created from it.
 */
import { sequelize } from '../../../config/database';
import { assessCaseStudy, type AssessResult } from './serviceGapAssessor';
import { caseStudyFingerprint, catalogFingerprint, evidenceText, retrieveCandidates, thinEvidence } from './serviceGapRetrieval';
import { finalizeRecommendation, GapMalformedOutput, insufficientRecommendation } from './serviceGapValidate';
import {
  GAP_PROMPT_VERSION, type CaseStudyEvidence, type CatalogService, type GapAnalysisView, type GapDecision, type GapRecommendation,
} from './serviceGapTypes';

export type Assess = typeof assessCaseStudy;
const inflight = new Map<string, Promise<GapAnalysisView>>();

interface Row {
  id: string; case_study_id: string; case_study_fingerprint: string; catalog_fingerprint: string; prompt_version: string;
  model_version: string; status: 'ok' | 'insufficient' | 'failed'; decision: string | null; result: unknown;
  error_class: string | null; error_message: string | null; analyzed_at: Date | string; review_state: 'open' | 'accepted' | 'dismissed';
  review_note: string | null; reviewed_by: string | null; reviewed_at: Date | string | null;
}
const iso = (d: Date | string | null): string | null => (d ? new Date(d).toISOString() : null);

export function toView(r: Row, current?: { caseFp: string; catalogFp: string }): GapAnalysisView {
  return {
    id: r.id, caseStudyId: r.case_study_id, status: r.status, decision: (r.decision as GapDecision | null) ?? null,
    recommendation: (r.result as GapRecommendation | null) ?? null, error: r.error_message, errorClass: r.error_class,
    stale: current ? r.case_study_fingerprint !== current.caseFp || r.catalog_fingerprint !== current.catalogFp || r.prompt_version !== GAP_PROMPT_VERSION : false,
    promptVersion: r.prompt_version, modelVersion: r.model_version, analyzedAt: iso(r.analyzed_at) as string,
    reviewState: r.review_state, reviewNote: r.review_note, reviewedBy: r.reviewed_by, reviewedAt: iso(r.reviewed_at),
  };
}

async function findByKey(tenantId: string, caseStudyId: string, caseFp: string, catalogFp: string): Promise<Row | null> {
  const { default: M } = await import('../../../models/ServiceGapAnalysis');
  const row = await M.findOne({ where: { tenant_id: tenantId, case_study_id: caseStudyId, case_study_fingerprint: caseFp, catalog_fingerprint: catalogFp, prompt_version: GAP_PROMPT_VERSION } });
  return row ? (row.get({ plain: true }) as unknown as Row) : null;
}

async function upsert(v: {
  tenantId: string; caseStudyId: string; caseFp: string; catalogFp: string; model: string; status: Row['status'];
  decision: string | null; result: GapRecommendation | null; errorClass: string | null; error: string | null; actor: string;
}): Promise<void> {
  // Review columns are deliberately absent from the UPDATE: re-analysis never erases a human's call.
  await sequelize.query(
    `INSERT INTO service_gap_analyses (tenant_id, case_study_id, case_study_fingerprint, catalog_fingerprint, prompt_version,
       model_version, status, decision, result, error_class, error_message, analyzed_by, analyzed_at)
     VALUES (:tenantId, :caseStudyId, :caseFp, :catalogFp, :pv, :model, :status, :decision, CAST(:result AS JSONB), :errorClass, :error, :actor, now())
     ON CONFLICT (tenant_id, case_study_id, case_study_fingerprint, catalog_fingerprint, prompt_version)
     DO UPDATE SET model_version = EXCLUDED.model_version, status = EXCLUDED.status, decision = EXCLUDED.decision,
       result = EXCLUDED.result, error_class = EXCLUDED.error_class, error_message = EXCLUDED.error_message,
       analyzed_by = EXCLUDED.analyzed_by, analyzed_at = now()`,
    { replacements: { ...v, pv: GAP_PROMPT_VERSION, result: v.result ? JSON.stringify(v.result) : null } },
  );
}

/** PURE core: what to store for one case study, given the model's answer (or no model call at all). */
export async function computeRecommendation(evidence: CaseStudyEvidence, catalog: CatalogService[], assess: Assess):
  Promise<{ status: Row['status']; recommendation: GapRecommendation | null; errorClass: string | null; error: string | null; model: string }> {
  const thin = thinEvidence(evidence);
  if (thin) return { status: 'insufficient', recommendation: insufficientRecommendation(evidence, thin.reasonCode, thin.missing), errorClass: null, error: null, model: 'none' };
  const candidates = retrieveCandidates(evidence, catalog);
  if (!candidates.length) {
    return { status: 'insufficient', recommendation: insufficientRecommendation(evidence, 'empty_catalog', ['The catalog has no active or growth services to compare against.']), errorClass: null, error: null, model: 'none' };
  }
  const refs = new Map(candidates.map((c, i) => [`S${i + 1}`, c] as const));
  const res: AssessResult = await assess({ caseStudyId: evidence.id, evidenceText: evidenceText(evidence), refs });
  if (!res.raw) return { status: 'failed', recommendation: null, errorClass: res.errorClass, error: res.error, model: res.model };
  try {
    const rec = finalizeRecommendation(res.raw, { refs, catalog, evidence });
    return { status: rec.decision === 'INSUFFICIENT_EVIDENCE' ? 'insufficient' : 'ok', recommendation: rec, errorClass: null, error: null, model: res.model };
  } catch (err) {
    if (err instanceof GapMalformedOutput) return { status: 'failed', recommendation: null, errorClass: 'MalformedOutput', error: 'The AI analysis returned an unusable answer.', model: res.model };
    throw err;
  }
}

export interface AnalyzeInput {
  tenantId: string; evidence: CaseStudyEvidence; catalog: CatalogService[]; actor: string; force?: boolean; assess?: Assess;
}

/** Analyze (or reuse) one case study. `reused` is true when a stored result was returned without a model call. */
export async function analyzeCaseStudy(input: AnalyzeInput): Promise<{ view: GapAnalysisView; reused: boolean }> {
  const caseFp = caseStudyFingerprint(input.evidence);
  const catalogFp = catalogFingerprint(input.catalog);
  const current = { caseFp, catalogFp };
  const existing = await findByKey(input.tenantId, input.evidence.id, caseFp, catalogFp);
  if (existing && existing.status !== 'failed' && !input.force) return { view: toView(existing, current), reused: true };

  const key = [input.tenantId, input.evidence.id, caseFp, catalogFp].join(':');
  const pending = inflight.get(key);
  if (pending) return { view: await pending, reused: true };
  const work = (async () => {
    const r = await computeRecommendation(input.evidence, input.catalog, input.assess ?? assessCaseStudy);
    await upsert({
      tenantId: input.tenantId, caseStudyId: input.evidence.id, caseFp, catalogFp, model: r.model, status: r.status,
      decision: r.recommendation?.decision ?? null, result: r.recommendation, errorClass: r.errorClass, error: r.error, actor: input.actor,
    });
    const stored = await findByKey(input.tenantId, input.evidence.id, caseFp, catalogFp);
    if (!stored) throw new Error('service gap analysis row missing after upsert');
    return toView(stored, current);
  })();
  inflight.set(key, work);
  try { return { view: await work, reused: false }; } finally { inflight.delete(key); }
}

/** Latest analysis per case study for this tenant, stale-flagged against the current fingerprints. */
export async function latestAnalyses(tenantId: string, current: Map<string, { caseFp: string; catalogFp: string }>): Promise<Map<string, GapAnalysisView>> {
  const ids = Array.from(current.keys());
  const out = new Map<string, GapAnalysisView>();
  if (!ids.length) return out;
  const [rows] = await sequelize.query(
    `SELECT DISTINCT ON (case_study_id) * FROM service_gap_analyses
      WHERE tenant_id = :tenantId AND case_study_id IN (:ids)
      ORDER BY case_study_id, analyzed_at DESC`,
    { replacements: { tenantId, ids } },
  );
  for (const r of rows as Row[]) out.set(r.case_study_id, toView(r, current.get(r.case_study_id)));
  return out;
}

export class GapReviewNotFound extends Error { constructor() { super('That analysis was not found.'); this.name = 'GapReviewNotFound'; } }

/** Record a human's call on a recommendation. Idempotent: the same state twice leaves the same end state. */
export async function reviewAnalysis(input: { tenantId: string; id: string; state: 'accepted' | 'dismissed'; note: string | null; actor: string }): Promise<GapAnalysisView> {
  const { default: M } = await import('../../../models/ServiceGapAnalysis');
  const row = await M.findOne({ where: { id: input.id, tenant_id: input.tenantId } });
  if (!row) throw new GapReviewNotFound();
  await row.update({ review_state: input.state, review_note: input.note, reviewed_by: input.actor, reviewed_at: new Date() });
  return toView(row.get({ plain: true }) as unknown as Row);
}

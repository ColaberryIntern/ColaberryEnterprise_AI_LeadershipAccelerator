import { RequirementsMap, VerificationLog } from '../../models';
import { getProjectByEnrollment } from '../projectService';
import { analyzeCode, CodeAnalysis } from './codeAnalysisService';
import { verifyRequirement } from './requirementVerificationService';
import { computeConfidence } from './completionConfidenceService';
import { verifySemantic } from './semanticVerificationService';
import { mergeVerificationResults } from './semanticVerificationAdapter';
import { readCandidateFiles, hasDeepVerifyBudget } from './smartCodeReader';

export interface VerificationSummary {
  verified_complete: number;
  verified_partial: number;
  not_verified: number;
  total: number;
}

export interface VerificationDetail {
  requirement_id: string;
  requirement_key: string;
  requirement_text: string;
  verification_status: string;
  verification_confidence: number;
  verification_notes: string;
  matched_files: string[];
  missing_elements: string[];
  last_verified_at: string;
  semantic_status: string | null;
  semantic_confidence: number;
  semantic_reasoning: string | null;
}

// Rule-confidence below this triggers deep verification (LLM with sampled
// code excerpts). At/above this we trust path-only verification.
const DEEP_VERIFY_RULE_THRESHOLD = 0.6;

// Status-promotion thresholds — confidence below which we don't touch
// the operator-facing `status` column even if verification_status improved.
const PROMOTE_TO_VERIFIED_MIN = 0.75;
const PROMOTE_TO_MATCHED_MIN = 0.7;

// Statuses we must NOT regress (manual artifact links, prior strong matches).
const PROTECTED_STATUSES = new Set(['verified', 'matched']);

export async function verifyProject(enrollmentId: string): Promise<VerificationSummary> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const analysis = await analyzeCode(enrollmentId);

  const requirements = await RequirementsMap.findAll({
    where: { project_id: project.id },
    order: [['requirement_key', 'ASC']],
  });

  if (requirements.length === 0) {
    console.log('[Verification] No requirements to verify');
    return { verified_complete: 0, verified_partial: 0, not_verified: 0, total: 0 };
  }

  let verified_complete = 0;
  let verified_partial = 0;
  let not_verified = 0;

  for (const req of requirements) {
    const outcome = await verifySingleRequirement(enrollmentId, project.id, req, analysis);
    if (outcome.verification_status === 'verified_complete') verified_complete++;
    else if (outcome.verification_status === 'verified_partial') verified_partial++;
    else not_verified++;
  }

  console.log(
    `[Verification] Complete: ${verified_complete} verified, ${verified_partial} partial, ${not_verified} not verified (total: ${requirements.length})`
  );

  return {
    verified_complete,
    verified_partial,
    not_verified,
    total: requirements.length,
  };
}

/**
 * Verify a single requirement. Exposed so the backfill script + future
 * per-requirement endpoint can reuse the exact same pipeline as the
 * project-wide verifier.
 */
export async function verifySingleRequirement(
  enrollmentId: string,
  projectId: string,
  req: InstanceType<typeof RequirementsMap>,
  analysis: CodeAnalysis
): Promise<{ verification_status: string; promoted_status: string | null }> {
  // Step 1: Rule-based verification (path/keyword match)
  const ruleResult = verifyRequirement(req.requirement_text, analysis);

  // Step 2: Decide whether to escalate to deep verification (read file
  // contents and pass them to the LLM). Only escalate when rule confidence
  // is low — the path-only LLM call is sufficient for high-confidence cases
  // and saves the GitHub fetch + larger LLM prompt cost.
  let codeExcerpts: { path: string; content: string; total_lines: number; truncated: boolean; char_count: number }[] = [];
  const ruleNeedsHelp = ruleResult.confidence_score < DEEP_VERIFY_RULE_THRESHOLD;

  if (ruleNeedsHelp && ruleResult.matched_files.length > 0) {
    const budget = await hasDeepVerifyBudget(projectId);
    if (budget.allowed) {
      codeExcerpts = await readCandidateFiles(enrollmentId, ruleResult.matched_files);
      if (codeExcerpts.length > 0) {
        console.log(
          `[Verification:Deep] ${req.requirement_key}: read ${codeExcerpts.length} files (budget ${budget.used + 1}/${budget.budget})`
        );
      }
    } else {
      console.warn(
        `[Verification:Deep] ${req.requirement_key}: SKIPPED — daily budget exhausted (${budget.used}/${budget.budget})`
      );
    }
  }

  // Step 3: Semantic verification (LLM)
  const semanticResult = await verifySemantic(enrollmentId, req.requirement_text, analysis, codeExcerpts);

  // Step 4: Merge rule + semantic into final verification verdict
  const merged = mergeVerificationResults(ruleResult, semanticResult);

  const hasArtifact = !!req.source_artifact_id;
  const confidence = computeConfidence(
    { ...ruleResult, status: merged.status, confidence_score: merged.confidence_score },
    analysis,
    hasArtifact
  );
  const finalConfidence = Math.max(merged.confidence_score, confidence.confidence_score);

  let verification_status: string;
  if (merged.status === 'complete') verification_status = 'verified_complete';
  else if (merged.status === 'partial') verification_status = 'verified_partial';
  else verification_status = 'not_verified';

  // Step 5: Status promotion. Bridges verifier findings to the operator-facing
  // `status` column that the coverage tile + scorer + action generator read.
  // Guard against regressing manually-promoted statuses ('matched'/'verified').
  const promotedStatus = decidePromotedStatus(
    req.status,
    verification_status,
    semanticResult.semantic_confidence
  );

  const notes = [
    merged.reasoning,
    merged.missing_elements.length > 0 ? `Gaps: ${merged.missing_elements.join('; ')}` : null,
    `Merge: ${merged.merge_case}`,
    `Factors: code=${confidence.factors.code_presence}, structure=${confidence.factors.structural_alignment}, coverage=${confidence.factors.requirement_coverage}`,
    semanticResult.evidence_kind === 'code_sampled'
      ? `DeepVerify: read ${semanticResult.files_read.length} file(s)`
      : null,
    promotedStatus && promotedStatus !== req.status
      ? `Status promoted: ${req.status} -> ${promotedStatus}`
      : null,
  ].filter(Boolean).join(' | ');

  req.verification_status = verification_status;
  req.verification_confidence = finalConfidence;
  req.verification_notes = notes;
  req.last_verified_at = new Date();
  req.semantic_status = semanticResult.semantic_status;
  req.semantic_confidence = semanticResult.semantic_confidence;
  req.semantic_reasoning = semanticResult.semantic_reasoning;
  req.semantic_last_checked = new Date();

  if (promotedStatus && promotedStatus !== req.status) {
    req.status = promotedStatus;
  }

  await req.save();

  await VerificationLog.create({
    project_id: projectId,
    requirement_id: req.id,
    status: verification_status,
    confidence: finalConfidence,
    notes,
    evidence: {
      matched_files: ruleResult.matched_files,
      missing_elements: merged.missing_elements,
      factors: confidence.factors,
      detected_features: analysis.detected_features,
      merge_case: merged.merge_case,
      evidence_kind: semanticResult.evidence_kind,
      files_read: semanticResult.files_read,
      semantic: {
        status: semanticResult.semantic_status,
        confidence: semanticResult.semantic_confidence,
        reasoning: semanticResult.semantic_reasoning,
        missing_elements: semanticResult.missing_elements,
      },
      promoted_status_from: promotedStatus && promotedStatus !== req.status ? req.status : null,
      promoted_status_to: promotedStatus && promotedStatus !== req.status ? promotedStatus : null,
    },
  });

  console.log(
    `[Verification] ${req.requirement_key}: ${verification_status} (confidence: ${finalConfidence}, evidence: ${semanticResult.evidence_kind}, merge: ${merged.merge_case})`
  );

  return { verification_status, promoted_status: promotedStatus };
}

/**
 * Status-promotion gate. Pure function for testability.
 *
 * Promotes:
 *   verification_status='verified_complete' + semantic_confidence>=0.75 → 'verified'
 *   verification_status='verified_partial' + semantic_confidence>=0.70  → 'matched'
 *
 * Never downgrades. If the current status is 'verified' or 'matched' (likely
 * set manually via artifact linkage), we leave it alone unless the verifier
 * verdict would also promote to the same or higher tier.
 */
export function decidePromotedStatus(
  currentStatus: string,
  verificationStatus: string,
  semanticConfidence: number
): string | null {
  let candidate: string | null = null;

  if (verificationStatus === 'verified_complete' && semanticConfidence >= PROMOTE_TO_VERIFIED_MIN) {
    candidate = 'verified';
  } else if (verificationStatus === 'verified_partial' && semanticConfidence >= PROMOTE_TO_MATCHED_MIN) {
    candidate = 'matched';
  }

  // Downgrade guard: never regress a protected status.
  if (PROTECTED_STATUSES.has(currentStatus)) {
    if (!candidate) return currentStatus;
    if (currentStatus === 'verified' && candidate !== 'verified') return currentStatus;
  }

  return candidate;
}

// ---------------------------------------------------------------------------
// 2. Get verification status for all requirements
// ---------------------------------------------------------------------------

export async function getVerificationStatus(projectId: string): Promise<VerificationDetail[]> {
  const requirements = await RequirementsMap.findAll({
    where: { project_id: projectId },
    order: [['requirement_key', 'ASC']],
  });

  return requirements.map((req) => ({
    requirement_id: req.id,
    requirement_key: req.requirement_key,
    requirement_text: req.requirement_text,
    verification_status: req.verification_status || 'not_verified',
    verification_confidence: req.verification_confidence || 0,
    verification_notes: req.verification_notes || '',
    matched_files: req.github_file_paths || [],
    missing_elements: [],
    last_verified_at: req.last_verified_at?.toISOString() || '',
    semantic_status: req.semantic_status || null,
    semantic_confidence: req.semantic_confidence || 0,
    semantic_reasoning: req.semantic_reasoning || null,
  }));
}

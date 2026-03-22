import { RequirementsMap, VerificationLog } from '../../models';
import { getProjectByEnrollment } from '../projectService';
import { analyzeCode, CodeAnalysis } from './codeAnalysisService';
import { verifyRequirement } from './requirementVerificationService';
import { computeConfidence } from './completionConfidenceService';
import { verifySemantic } from './semanticVerificationService';
import { mergeVerificationResults } from './semanticVerificationAdapter';

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

// ---------------------------------------------------------------------------
// 1. Verify entire project
// ---------------------------------------------------------------------------

export async function verifyProject(enrollmentId: string): Promise<VerificationSummary> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  // Run code analysis once for all requirements
  const analysis = await analyzeCode(enrollmentId);

  // Get all requirements
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
    // Step 1: Rule-based verification (V1)
    const ruleResult = verifyRequirement(req.requirement_text, analysis);

    // Step 2: Semantic verification (V2) — LLM-assisted
    const semanticResult = await verifySemantic(enrollmentId, req.requirement_text, analysis);

    // Step 3: Merge results
    const merged = mergeVerificationResults(ruleResult, semanticResult);

    // Step 4: Compute confidence (uses merged result)
    const hasArtifact = !!req.source_artifact_id;
    const confidence = computeConfidence(
      { ...ruleResult, status: merged.status, confidence_score: merged.confidence_score },
      analysis,
      hasArtifact
    );

    // Use higher of merged confidence and factor-based confidence
    const finalConfidence = Math.max(merged.confidence_score, confidence.confidence_score);

    // Map status
    let verification_status: string;
    if (merged.status === 'complete') {
      verification_status = 'verified_complete';
      verified_complete++;
    } else if (merged.status === 'partial') {
      verification_status = 'verified_partial';
      verified_partial++;
    } else {
      verification_status = 'not_verified';
      not_verified++;
    }

    // Build notes
    const notes = [
      merged.reasoning,
      merged.missing_elements.length > 0
        ? `Gaps: ${merged.missing_elements.join('; ')}`
        : null,
      `Merge: ${merged.merge_case}`,
      `Factors: code=${confidence.factors.code_presence}, structure=${confidence.factors.structural_alignment}, coverage=${confidence.factors.requirement_coverage}`,
    ].filter(Boolean).join(' | ');

    // Update RequirementsMap — both V1 and V2 fields
    req.verification_status = verification_status;
    req.verification_confidence = finalConfidence;
    req.verification_notes = notes;
    req.last_verified_at = new Date();
    req.semantic_status = semanticResult.semantic_status;
    req.semantic_confidence = semanticResult.semantic_confidence;
    req.semantic_reasoning = semanticResult.semantic_reasoning;
    req.semantic_last_checked = new Date();
    await req.save();

    // Insert verification log with semantic evidence
    await VerificationLog.create({
      project_id: project.id,
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
        semantic: {
          status: semanticResult.semantic_status,
          confidence: semanticResult.semantic_confidence,
          reasoning: semanticResult.semantic_reasoning,
          missing_elements: semanticResult.missing_elements,
        },
      },
    });

    console.log(
      `[Verification] ${req.requirement_key}: ${verification_status} (confidence: ${finalConfidence}, merge: ${merged.merge_case})`
    );
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

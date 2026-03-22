import { RequirementsMap, VerificationLog } from '../../models';
import { getProjectByEnrollment } from '../projectService';
import { analyzeCode, CodeAnalysis } from './codeAnalysisService';
import { verifyRequirement } from './requirementVerificationService';
import { computeConfidence } from './completionConfidenceService';

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
    // Verify this requirement
    const result = verifyRequirement(req.requirement_text, analysis);

    // Compute confidence
    const hasArtifact = !!req.source_artifact_id;
    const confidence = computeConfidence(result, analysis, hasArtifact);

    // Map status
    let verification_status: string;
    if (result.status === 'complete') {
      verification_status = 'verified_complete';
      verified_complete++;
    } else if (result.status === 'partial') {
      verification_status = 'verified_partial';
      verified_partial++;
    } else {
      verification_status = 'not_verified';
      not_verified++;
    }

    // Build notes
    const notes = [
      result.reasoning,
      result.missing_elements.length > 0
        ? `Gaps: ${result.missing_elements.join('; ')}`
        : null,
      `Factors: code=${confidence.factors.code_presence}, structure=${confidence.factors.structural_alignment}, coverage=${confidence.factors.requirement_coverage}`,
    ].filter(Boolean).join(' | ');

    // Update RequirementsMap
    req.verification_status = verification_status;
    req.verification_confidence = confidence.confidence_score;
    req.verification_notes = notes;
    req.last_verified_at = new Date();
    await req.save();

    // Insert verification log
    await VerificationLog.create({
      project_id: project.id,
      requirement_id: req.id,
      status: verification_status,
      confidence: confidence.confidence_score,
      notes,
      evidence: {
        matched_files: result.matched_files,
        missing_elements: result.missing_elements,
        factors: confidence.factors,
        detected_features: analysis.detected_features,
      },
    });

    console.log(
      `[Verification] ${req.requirement_key}: ${verification_status} (confidence: ${confidence.confidence_score})`
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
  }));
}

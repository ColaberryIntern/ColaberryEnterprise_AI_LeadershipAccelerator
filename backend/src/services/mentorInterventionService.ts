/**
 * Mentor Intervention Service
 *
 * Deterministic detection engine that identifies project issues
 * and creates structured intervention records.
 *
 * This service is READ-ONLY with respect to project state:
 * - Never modifies artifacts, scores, or workflow state
 * - Only creates/resolves MentorIntervention records
 * - Idempotent: running multiple times does not create duplicates
 */
import Project from '../models/Project';
import MentorIntervention from '../models/MentorIntervention';
import { AssignmentSubmission, ArtifactDefinition } from '../models';
import ProjectArtifact from '../models/ProjectArtifact';
import { Op } from 'sequelize';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DetectionResult {
  project_id: string;
  created: number;
  resolved: number;
  active_count: number;
}

interface PendingIntervention {
  type: string;
  severity: string;
  message: string;
  recommended_action: string;
  artifact_submission_id?: string | null;
}

// ─── Duplicate Prevention ───────────────────────────────────────────────────

async function findExistingActive(
  projectId: string,
  type: string,
  artifactSubmissionId: string | null
): Promise<MentorIntervention | null> {
  const where: any = {
    project_id: projectId,
    type,
    status: 'active',
  };
  if (artifactSubmissionId) {
    where.artifact_submission_id = artifactSubmissionId;
  } else {
    where.artifact_submission_id = { [Op.is]: null as any };
  }
  return MentorIntervention.findOne({ where });
}

async function createIfNotExists(
  projectId: string,
  intervention: PendingIntervention
): Promise<boolean> {
  const existing = await findExistingActive(
    projectId,
    intervention.type,
    intervention.artifact_submission_id || null
  );
  if (existing) return false;

  await MentorIntervention.create({
    project_id: projectId,
    artifact_submission_id: intervention.artifact_submission_id || null,
    type: intervention.type,
    severity: intervention.severity,
    message: intervention.message,
    recommended_action: intervention.recommended_action,
    status: 'active',
  } as any);
  return true;
}

// ─── Detection Rules ────────────────────────────────────────────────────────

/**
 * Rule 1: Low Artifact Score
 * Flag artifact submissions with score < 70.
 */
async function detectLowScores(
  projectId: string,
  projectArtifacts: any[]
): Promise<PendingIntervention[]> {
  const interventions: PendingIntervention[] = [];

  for (const pa of projectArtifacts) {
    const submission = pa.submission;
    if (!submission || submission.score == null || submission.score >= 70) continue;

    const artifactName = pa.artifactDefinition?.name || 'Unknown Artifact';
    interventions.push({
      type: 'artifact_revision',
      severity: 'medium',
      message: `The artifact '${artifactName}' received a score of ${submission.score}, below the recommended threshold of 70.`,
      recommended_action: 'Revise this artifact to improve clarity and completeness. Focus on the reviewer notes for specific guidance.',
      artifact_submission_id: submission.id,
    });
  }

  return interventions;
}

/**
 * Rule 2: Missing Governance
 * Architecture artifacts exist but no governance framework defined.
 */
function detectMissingGovernance(
  portfolioCache: any
): PendingIntervention[] {
  const ps = portfolioCache?.portfolio_structure;
  if (!ps) return [];

  const govCount = ps.governance?.length || 0;
  const archCount = ps.architecture?.length || 0;

  if (archCount > 0 && govCount === 0) {
    return [{
      type: 'missing_category',
      severity: 'high',
      message: 'Architecture artifacts exist but no governance framework has been defined.',
      recommended_action: 'Add governance controls before implementation begins. Define risk assessment, compliance requirements, and ethical guidelines.',
    }];
  }

  return [];
}

/**
 * Rule 3: Missing Data Sources
 * No data sources defined for the AI system.
 */
function detectMissingDataSources(
  project: Project
): PendingIntervention[] {
  const dataSources = project.data_sources;
  const isEmpty = !dataSources ||
    (Array.isArray(dataSources) && dataSources.length === 0) ||
    (typeof dataSources === 'object' && Object.keys(dataSources).length === 0);

  if (isEmpty) {
    return [{
      type: 'data_definition_gap',
      severity: 'high',
      message: 'No data sources have been defined for the AI system.',
      recommended_action: 'Define all datasets required for model training and system operation. Include data formats, sources, quality expectations, and access methods.',
    }];
  }

  return [];
}

/**
 * Rule 4: Implementation Gap
 * High maturity but no implementation artifacts.
 */
function detectImplementationGap(
  project: Project,
  portfolioCache: any
): PendingIntervention[] {
  const ps = portfolioCache?.portfolio_structure;
  if (!ps) return [];

  const maturity = project.maturity_score;
  const implCount = ps.implementation?.length || 0;

  if (maturity != null && maturity > 70 && implCount === 0) {
    return [{
      type: 'portfolio_gap',
      severity: 'medium',
      message: 'Project maturity suggests readiness for implementation but no implementation artifacts exist.',
      recommended_action: 'Begin creating implementation artifacts such as technical specifications, deployment plans, or proof-of-concept documentation.',
    }];
  }

  return [];
}

/**
 * Rule 5: Workflow Block
 * Project stage unchanged for >14 days.
 */
function detectWorkflowBlock(
  project: Project
): PendingIntervention[] {
  const updatedAt = project.updated_at;
  if (!updatedAt) return [];

  const daysSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceUpdate > 14) {
    return [{
      type: 'workflow_block',
      severity: 'medium',
      message: `Project progress appears stalled in the '${project.project_stage}' stage for over ${Math.floor(daysSinceUpdate)} days.`,
      recommended_action: 'Review your current phase tasks and consider consulting the AI mentor for guidance on next steps.',
    }];
  }

  return [];
}

// ─── Auto-Resolution ────────────────────────────────────────────────────────

/**
 * Resolve interventions whose conditions are no longer true.
 */
async function resolveFixedInterventions(
  projectId: string,
  projectArtifacts: any[],
  portfolioCache: any,
  project: Project
): Promise<number> {
  let resolved = 0;
  const now = new Date();

  const activeInterventions = await MentorIntervention.findAll({
    where: { project_id: projectId, status: 'active' },
  });

  for (const intervention of activeInterventions) {
    let shouldResolve = false;

    if (intervention.type === 'artifact_revision' && intervention.artifact_submission_id) {
      // Check if the submission now scores >= 70
      const sub = await AssignmentSubmission.findByPk(intervention.artifact_submission_id);
      if (sub && sub.score != null && sub.score >= 70) {
        shouldResolve = true;
      }
      // Also resolve if a newer version exists (the old submission is no longer latest)
      if (sub && !sub.is_latest) {
        shouldResolve = true;
      }
    }

    if (intervention.type === 'missing_category') {
      const ps = portfolioCache?.portfolio_structure;
      const govCount = ps?.governance?.length || 0;
      if (govCount > 0) shouldResolve = true;
    }

    if (intervention.type === 'data_definition_gap') {
      const ds = project.data_sources;
      const hasData = ds && (
        (Array.isArray(ds) && ds.length > 0) ||
        (typeof ds === 'object' && Object.keys(ds).length > 0)
      );
      if (hasData) shouldResolve = true;
    }

    if (intervention.type === 'portfolio_gap') {
      const ps = portfolioCache?.portfolio_structure;
      const implCount = ps?.implementation?.length || 0;
      if (implCount > 0) shouldResolve = true;
    }

    if (intervention.type === 'workflow_block') {
      const daysSince = (Date.now() - new Date(project.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince <= 14) shouldResolve = true;
    }

    if (shouldResolve) {
      await intervention.update({ status: 'resolved', resolved_at: now });
      resolved++;
    }
  }

  return resolved;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Detect project issues and create/resolve mentor interventions.
 * Idempotent — safe to call multiple times.
 */
export async function detectProjectInterventions(projectId: string): Promise<DetectionResult> {
  const project = await Project.findByPk(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Load project artifacts with submissions and definitions
  const projectArtifacts = await ProjectArtifact.findAll({
    where: { project_id: projectId },
    include: [
      { model: AssignmentSubmission, as: 'submission' },
      { model: ArtifactDefinition, as: 'artifactDefinition' },
    ],
  });

  const portfolioCache = project.portfolio_cache;

  // Run all detection rules
  const pending: PendingIntervention[] = [
    ...(await detectLowScores(projectId, projectArtifacts)),
    ...detectMissingGovernance(portfolioCache),
    ...detectMissingDataSources(project),
    ...detectImplementationGap(project, portfolioCache),
    ...detectWorkflowBlock(project),
  ];

  // Create interventions (with duplicate prevention)
  let created = 0;
  for (const intervention of pending) {
    const wasCreated = await createIfNotExists(projectId, intervention);
    if (wasCreated) created++;
  }

  // Auto-resolve fixed issues
  const resolved = await resolveFixedInterventions(
    projectId, projectArtifacts, portfolioCache, project
  );

  // Count remaining active
  const activeCount = await MentorIntervention.count({
    where: { project_id: projectId, status: 'active' },
  });

  return {
    project_id: projectId,
    created,
    resolved,
    active_count: activeCount,
  };
}

/**
 * Get all active interventions for a project, ordered by severity.
 */
export async function getActiveInterventions(projectId: string): Promise<MentorIntervention[]> {
  const severityOrder = ['high', 'medium', 'low'];

  const interventions = await MentorIntervention.findAll({
    where: { project_id: projectId, status: 'active' },
    order: [['created_at', 'DESC']],
  });

  // Sort by severity priority
  interventions.sort((a, b) => {
    return severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
  });

  return interventions;
}

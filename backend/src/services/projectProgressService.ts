import { Project, ArtifactDefinition, AssignmentSubmission, ProjectArtifact, RequirementsMap } from '../models';
import { getProjectByEnrollment } from './projectService';
import { getConnection } from './githubService';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Progress & Readiness Engine
// ---------------------------------------------------------------------------

export interface ProgressBreakdown {
  artifactCompletion: { score: number; submitted: number; required: number };
  requirementsCoverage: { score: number; matched: number; total: number };
  githubHealth: { score: number; hasRepo: boolean; hasRecentCommits: boolean; fileCount: number };
  portfolioQuality: { score: number; avgScore: number; scoredCount: number };
  workflowProgress: { score: number; stage: string; stageIndex: number; totalStages: number };
}

export interface ProjectProgress {
  requirementsCompletionPct: number;
  productionReadinessScore: number;
  breakdown: ProgressBreakdown;
  computedAt: string;
}

const STAGE_ORDER = ['discovery', 'architecture', 'implementation', 'portfolio', 'complete'];

export async function calculateProgress(enrollmentId: string): Promise<ProjectProgress> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found for this enrollment');

  const breakdown = await computeBreakdown(project, enrollmentId);

  // Requirements completion %
  const requirementsCompletionPct = breakdown.requirementsCoverage.total > 0
    ? Math.round((breakdown.requirementsCoverage.matched / breakdown.requirementsCoverage.total) * 100)
    : 0;

  // Production readiness score (weighted composite)
  const productionReadinessScore = Math.round(
    breakdown.artifactCompletion.score * 25 +
    breakdown.requirementsCoverage.score * 25 +
    breakdown.githubHealth.score * 20 +
    breakdown.portfolioQuality.score * 20 +
    breakdown.workflowProgress.score * 10
  );

  // Cache on project
  project.requirements_completion_pct = requirementsCompletionPct;
  project.readiness_score_breakdown = breakdown;
  project.progress_computed_at = new Date();
  await project.save();

  return {
    requirementsCompletionPct,
    productionReadinessScore,
    breakdown,
    computedAt: new Date().toISOString(),
  };
}

export async function getReadinessScore(enrollmentId: string): Promise<number> {
  const progress = await calculateProgress(enrollmentId);
  return progress.productionReadinessScore;
}

export async function getProgressBreakdown(enrollmentId: string): Promise<ProgressBreakdown> {
  const progress = await calculateProgress(enrollmentId);
  return progress.breakdown;
}

// ---------------------------------------------------------------------------
// Requirements-Only Progress (for Project Execution Dashboard)
// ---------------------------------------------------------------------------

export interface RequirementsProgress {
  completion_percentage: number;
  current_phase: string;
  sections: Array<{ name: string; total: number; completed: number; in_progress: number; pct: number }>;
  requirements: Array<{ key: string; text: string; status: string; files: string[]; section: string }>;
  next_action: string | null;
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
}

export async function calculateRequirementsProgress(enrollmentId: string): Promise<RequirementsProgress> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  // Get all requirements from RequirementsMap
  const reqMaps = await RequirementsMap.findAll({
    where: { project_id: project.id },
    order: [['requirement_key', 'ASC']],
  });

  const requirements = reqMaps.map(r => ({
    key: r.requirement_key,
    text: r.requirement_text,
    status: (r.status === 'verified' || r.status === 'matched') ? 'completed'
      : r.status === 'partial' ? 'in_progress' : 'not_started',
    files: r.github_file_paths || [],
    section: (r as any).section || 'General',
  }));

  const completed = requirements.filter(r => r.status === 'completed').length;
  const inProgress = requirements.filter(r => r.status === 'in_progress').length;
  const notStarted = requirements.filter(r => r.status === 'not_started').length;
  const total = requirements.length;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Group by section
  const sectionMap = new Map<string, { total: number; completed: number; in_progress: number }>();
  for (const req of requirements) {
    const s = sectionMap.get(req.section) || { total: 0, completed: 0, in_progress: 0 };
    s.total++;
    if (req.status === 'completed') s.completed++;
    if (req.status === 'in_progress') s.in_progress++;
    sectionMap.set(req.section, s);
  }

  const sections = Array.from(sectionMap.entries()).map(([name, s]) => ({
    name,
    total: s.total,
    completed: s.completed,
    in_progress: s.in_progress,
    pct: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
  }));

  // Derive current phase from section with most in-progress work
  let currentPhase = 'Not Started';
  if (completionPct >= 100) currentPhase = 'Complete';
  else if (completionPct >= 75) currentPhase = 'Finalization';
  else if (completionPct >= 50) currentPhase = 'Build';
  else if (completionPct >= 25) currentPhase = 'Foundation';
  else if (completionPct > 0) currentPhase = 'Initial Build';

  // Next action: first incomplete requirement
  const nextReq = requirements.find(r => r.status === 'not_started') || requirements.find(r => r.status === 'in_progress');
  const nextAction = nextReq ? `${nextReq.key}: ${nextReq.text}` : null;

  return {
    completion_percentage: completionPct,
    current_phase: currentPhase,
    sections,
    requirements,
    next_action: nextAction,
    total,
    completed,
    in_progress: inProgress,
    not_started: notStarted,
  };
}

// ---------------------------------------------------------------------------
// Internal Computation
// ---------------------------------------------------------------------------

async function computeBreakdown(project: Project, enrollmentId: string): Promise<ProgressBreakdown> {
  // 1. Artifact completion
  const allArtifacts = await ArtifactDefinition.findAll();
  const requiredArtifacts = allArtifacts.filter((a: any) =>
    a.required_for_session || a.required_for_build_unlock || a.required_for_presentation_unlock
  );
  const submissions = await AssignmentSubmission.findAll({
    where: { enrollment_id: enrollmentId, is_latest: true, status: { [Op.in]: ['submitted', 'reviewed'] } },
  });
  const submittedArtifactIds = new Set(submissions.map((s) => s.artifact_definition_id).filter(Boolean));
  const submitted = requiredArtifacts.filter((a) => submittedArtifactIds.has(a.id)).length;
  const required = requiredArtifacts.length;
  const artifactScore = required > 0 ? submitted / required : 0;

  // 2. Requirements coverage
  const reqMaps = await RequirementsMap.findAll({ where: { project_id: project.id } });
  const matchedReqs = reqMaps.filter((r) => r.status === 'matched' || r.status === 'verified').length;
  const totalReqs = reqMaps.length;
  const reqScore = totalReqs > 0 ? matchedReqs / totalReqs : 0;

  // 3. GitHub health
  const connection = await getConnection(enrollmentId);
  const hasRepo = !!(connection?.repo_url);
  const recentCommits = (connection?.commit_summary_json || []).filter((c: any) => {
    const date = new Date(c.date);
    return date > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  });
  const hasRecentCommits = recentCommits.length > 0;
  const fileCount = connection?.file_count || 0;
  let githubScore = 0;
  if (hasRepo) githubScore += 0.4;
  if (hasRecentCommits) githubScore += 0.4;
  if (fileCount > 5) githubScore += 0.2;

  // 4. Portfolio quality (average submission score)
  const scoredSubmissions = submissions.filter((s) => s.score != null && s.score > 0);
  const avgScore = scoredSubmissions.length > 0
    ? scoredSubmissions.reduce((sum, s) => sum + (s.score || 0), 0) / scoredSubmissions.length
    : 0;
  const portfolioScore = Math.min(1.0, avgScore / 100);

  // 5. Workflow progress
  const stageIndex = STAGE_ORDER.indexOf(project.project_stage);
  const workflowScore = stageIndex >= 0 ? (stageIndex + 1) / STAGE_ORDER.length : 0;

  return {
    artifactCompletion: { score: artifactScore, submitted, required },
    requirementsCoverage: { score: reqScore, matched: matchedReqs, total: totalReqs },
    githubHealth: { score: githubScore, hasRepo, hasRecentCommits, fileCount },
    portfolioQuality: { score: portfolioScore, avgScore, scoredCount: scoredSubmissions.length },
    workflowProgress: { score: workflowScore, stage: project.project_stage, stageIndex, totalStages: STAGE_ORDER.length },
  };
}

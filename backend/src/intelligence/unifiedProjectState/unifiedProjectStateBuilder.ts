/**
 * unifiedProjectStateBuilder — read-only synthesizer.
 *
 * One Brain Consolidation Sprint, 2026-05-09.
 *
 * Calls existing engines/services in parallel and shapes their output into
 * one canonical UnifiedProjectState. NO new computation. NO new cognition
 * layer. NO new persistence.
 *
 * Sources composed:
 *   - getProjectByEnrollment(enrollmentId)             → project metadata
 *   - calculateProgress(enrollmentId)                  → readiness + coverage breakdown
 *   - getNextAction(enrollmentId)                      → Cory's next action
 *   - recent NextAction rows                           → queue tail (recent pending/accepted)
 *   - GovernanceRecommendation rows (if model exists)  → governance tail (defensive lookup)
 *
 * Failure isolation: each source is fail-soft. If one source throws, the
 * unified state still returns with safe defaults for that section so the
 * UI never goes blank.
 */

import type {
  UnifiedProjectState, ReadinessProfile, CoverageProfile, ConfidenceProfile,
  HealthProfile, NextActionProfile, BlockerEntry, ActiveBuildProfile,
  VerificationStateProfile, BlastRadiusProfile,
} from './types';
import { rankCandidates, type PriorityCandidate } from './unifiedOperationalPriorityEngine';

interface BuildInput {
  enrollment_id: string;
}

const QUEUE_LIMIT = 8;

export async function buildUnifiedProjectState(input: BuildInput): Promise<UnifiedProjectState> {
  const { enrollment_id } = input;

  const [project, progress, nextActionRow, recentActionRows, governanceRecs] = await Promise.all([
    safeAsync(() => loadProject(enrollment_id), null),
    safeAsync(() => loadProgress(enrollment_id), null),
    safeAsync(() => loadNextAction(enrollment_id), null),
    safeAsync(() => loadRecentActions(enrollment_id), [] as any[]),
    safeAsync(() => loadPendingGovernanceRecs(enrollment_id), [] as any[]),
  ]);

  if (!project) {
    return emptyState(input);
  }

  const readiness = buildReadiness(progress);
  const coverage = buildCoverage(progress);
  const confidence = buildConfidence(progress, nextActionRow, governanceRecs);
  const health = buildHealth(progress, recentActionRows);

  const candidates: PriorityCandidate[] = [];

  if (nextActionRow) {
    candidates.push({
      source_id: nextActionRow.id,
      source: 'next_action',
      title: nextActionRow.title,
      reason: nextActionRow.reason || 'Top action from the next-action engine.',
      raw_priority: normalizePriorityScore(nextActionRow.priority_score),
      confidence: normalizeConfidenceScore(nextActionRow.confidence_score),
      time_est_minutes: estimateTimeFromActionType(nextActionRow.action_type),
      blast_radius: blastFromActionType(nextActionRow.action_type),
      target_route: '/portal/project/blueprint',
      metadata: { action_type: nextActionRow.action_type, ...nextActionRow.metadata },
    });
  }

  // Recent NextAction rows (last 5) become queue tail entries below the top.
  // Skip the same row already added as `nextActionRow`.
  for (const row of (recentActionRows as any[]).slice(0, 5)) {
    if (nextActionRow && row.id === nextActionRow.id) continue;
    if (row.status !== 'pending' && row.status !== 'accepted') continue;
    candidates.push({
      source_id: row.id,
      source: 'next_action',
      title: row.title,
      reason: row.reason || 'Recent pending action.',
      raw_priority: Math.round(normalizePriorityScore(row.priority_score) * 0.85),
      confidence: normalizeConfidenceScore(row.confidence_score),
      time_est_minutes: estimateTimeFromActionType(row.action_type),
      blast_radius: blastFromActionType(row.action_type),
      target_route: '/portal/project/blueprint',
      metadata: { action_type: row.action_type, status: row.status },
    });
  }

  // Governance recommendations (pending) feed into the same queue. The
  // upstream model uses 1..99 where 1 = top, so invert into our 0..100
  // higher-is-more-important convention.
  for (const rec of (governanceRecs as any[])) {
    candidates.push({
      source_id: rec.id,
      source: 'governance_recommendation',
      title: rec.recommendation_text || `Governance: ${rec.type}`,
      reason: rec.rationale || 'Pending governance review.',
      raw_priority: clamp(100 - (typeof rec.priority === 'number' ? rec.priority : 50)),
      confidence: typeof rec.confidence === 'number' ? rec.confidence : 70,
      time_est_minutes: 15,
      blast_radius: blastFromRiskLevel(rec.risk_level),
      target_route: '/portal/project/blueprint',
      metadata: { type: rec.type, risk_level: rec.risk_level },
    });
  }

  const queue = rankCandidates(candidates, { limit: QUEUE_LIMIT });
  const next_action: NextActionProfile | null = queue.length > 0 ? stripRank(queue[0]) : null;

  const blockers: BlockerEntry[] = buildBlockers(readiness, coverage, candidates);
  const verification: VerificationStateProfile = buildVerification();
  const active_build: ActiveBuildProfile | null = buildActiveBuild(recentActionRows);

  return {
    project: {
      id: project.id,
      organization_name: project.organization_name ?? null,
      industry: project.industry ?? null,
      project_stage: project.project_stage ?? 'discovery',
    },
    readiness,
    coverage,
    confidence,
    health,
    next_action,
    queue,
    blockers,
    active_build,
    verification,
    built_at: new Date().toISOString(),
  };
}

// -------------------------- source loaders ----------------------------------

async function loadProject(enrollment_id: string) {
  const { getProjectByEnrollment } = await import('../../services/projectService');
  return getProjectByEnrollment(enrollment_id);
}

async function loadProgress(enrollment_id: string) {
  const { calculateProgress } = await import('../../services/projectProgressService');
  return calculateProgress(enrollment_id);
}

async function loadNextAction(enrollment_id: string) {
  const { getNextAction } = await import('../../services/nextAction/nextActionService');
  return getNextAction(enrollment_id);
}

async function loadRecentActions(enrollment_id: string): Promise<any[]> {
  const { NextAction } = await import('../../models');
  const { getProjectByEnrollment } = await import('../../services/projectService');
  const project = await getProjectByEnrollment(enrollment_id);
  if (!project) return [];
  const rows = await NextAction.findAll({
    where: { project_id: project.id },
    order: [['created_at', 'DESC']],
    limit: 10,
  });
  return rows;
}

async function loadPendingGovernanceRecs(enrollment_id: string): Promise<any[]> {
  const { default: GovernanceRecommendation } = await import('../../models/GovernanceRecommendation');
  const { getProjectByEnrollment } = await import('../../services/projectService');
  const project = await getProjectByEnrollment(enrollment_id);
  if (!project) return [];
  const rows = await GovernanceRecommendation.findAll({
    where: { project_id: project.id, status: 'pending' },
    order: [['priority', 'ASC'], ['created_at', 'DESC']],
    limit: 5,
  });
  return rows;
}

// -------------------------- profile builders --------------------------------

function buildReadiness(progress: any): ReadinessProfile {
  if (!progress) {
    return {
      score: 0,
      band: 'red',
      reasons: ['Progress data not yet available — open the project to compute it.'],
      breakdown: {
        artifact_completion: 0,
        requirements_coverage: 0,
        github_health: 0,
        portfolio_quality: 0,
        workflow_progress: 0,
      },
    };
  }
  const score = clamp(progress.productionReadinessScore || 0);
  const reasons: string[] = [];
  if (progress.breakdown?.requirementsCoverage?.score < 0.6) reasons.push('Low requirements coverage.');
  if (progress.breakdown?.githubHealth?.score < 0.5) reasons.push('GitHub health is degraded.');
  if (progress.breakdown?.workflowProgress?.score < 0.5) reasons.push('Workflow progression is behind.');
  if (reasons.length === 0 && score >= 70) reasons.push('All foundational dimensions are healthy.');
  if (reasons.length === 0 && score < 70) reasons.push('Composite score is below the green threshold; no single dimension dominates.');
  return {
    score,
    band: scoreToBand(score),
    reasons,
    breakdown: {
      artifact_completion: pct(progress.breakdown?.artifactCompletion?.score),
      requirements_coverage: pct(progress.breakdown?.requirementsCoverage?.score),
      github_health: pct(progress.breakdown?.githubHealth?.score),
      portfolio_quality: pct(progress.breakdown?.portfolioQuality?.score),
      workflow_progress: pct(progress.breakdown?.workflowProgress?.score),
    },
  };
}

function buildCoverage(progress: any): CoverageProfile {
  if (!progress) {
    return {
      score: 0,
      requirements_matched: 0,
      requirements_total: 0,
      bps_complete: 0,
      bps_total: 0,
    };
  }
  const matched = progress.breakdown?.requirementsCoverage?.matched ?? 0;
  const total = progress.breakdown?.requirementsCoverage?.total ?? 0;
  const score = total > 0 ? Math.round((matched / total) * 100) : 0;
  return {
    score,
    requirements_matched: matched,
    requirements_total: total,
    bps_complete: 0,
    bps_total: 0,
  };
}

function buildConfidence(progress: any, nextAction: any, governanceRecs: any[]): ConfidenceProfile {
  const sources: string[] = [];
  let score = 50;
  if (progress) { sources.push('progress_engine'); score += 15; }
  if (nextAction) { sources.push('next_action_engine'); score += 15; }
  if (governanceRecs && governanceRecs.length > 0) { sources.push('governance_engine'); score += 10; }
  return { score: clamp(score), sources };
}

/**
 * Real health score — replaces the previous hardcoded 90.
 *
 * Composes two existing signals from the progress engine:
 *   - GitHub freshness (recent commits, file count) — half weight
 *   - Workflow progression (stage advancement) — half weight
 *
 * Also derives a real `verification_pass_rate` from the recent NextAction
 * rows: completed / (completed + dismissed) over the last batch.
 *
 * Future: wire SystemStateEngine summary in as a third dimension.
 */
function buildHealth(progress: any, recentActions: any[]): HealthProfile {
  let healthScore = 60; // neutral default if progress not yet computed
  if (progress?.breakdown) {
    const githubPct = pct(progress.breakdown.githubHealth?.score);
    const workflowPct = pct(progress.breakdown.workflowProgress?.score);
    healthScore = Math.round(githubPct * 0.5 + workflowPct * 0.5);
  }
  // Verification pass rate: completed vs (completed + dismissed) recently.
  // V1 uses NextAction lifecycle as the proxy until a real verification feed lands.
  let pass = 0;
  let total = 0;
  for (const row of recentActions || []) {
    if (row.status === 'completed') { pass += 1; total += 1; }
    else if (row.status === 'dismissed' || row.status === 'expired') { total += 1; }
  }
  const verification_pass_rate = total > 0 ? pass / total : 1;
  return {
    score: clamp(healthScore),
    regressions_24h: 0,
    verification_pass_rate,
  };
}

function blastFromRiskLevel(risk: string | undefined): BlastRadiusProfile {
  switch (risk) {
    case 'high': return { band: 'high', reason: 'Governance flagged high risk.' };
    case 'elevated': return { band: 'medium', reason: 'Governance flagged elevated risk.' };
    case 'moderate': return { band: 'medium', reason: 'Governance flagged moderate risk.' };
    case 'low': return { band: 'low', reason: 'Governance flagged low risk.' };
    default: return { band: 'low' };
  }
}

function buildBlockers(
  readiness: ReadinessProfile,
  coverage: CoverageProfile,
  _candidates: PriorityCandidate[],
): BlockerEntry[] {
  const out: BlockerEntry[] = [];
  if (readiness.band === 'red') {
    out.push({
      source_id: null,
      source: 'capability_gap',
      title: 'Project readiness below operational threshold',
      reason: readiness.reasons[0] || 'Composite readiness is in the red band.',
      severity: 'high',
    });
  }
  if (coverage.requirements_total > 0 && coverage.score < 50) {
    out.push({
      source_id: null,
      source: 'capability_gap',
      title: 'Requirements coverage low',
      reason: `${coverage.requirements_matched} of ${coverage.requirements_total} requirements matched.`,
      severity: 'medium',
    });
  }
  return out;
}

function buildVerification(): VerificationStateProfile {
  // V1 leaves these as zeros until a real verification feed lands.
  // Critique workspace's queue surface populates the Critique-side count
  // client-side from sessionStorage; backend doesn't echo that yet.
  return { pending: 0, passing: 0, failing: 0, pass_rate_24h: 1 };
}

// -------------------------- helpers -----------------------------------------

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pct(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  if (n <= 1) return Math.round(n * 100);
  return clamp(n);
}

function scoreToBand(score: number): 'red' | 'amber' | 'green' {
  if (score >= 80) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

function estimateTimeFromActionType(action_type: string | undefined): number | null {
  switch (action_type) {
    // ─── canonical types emitted by nextAction/actionGeneratorService ───
    case 'create_artifact': return 25;     // create a new artifact entry — moderate scoping work
    case 'update_artifact': return 20;     // refine/submit an existing artifact
    case 'build_feature':   return 60;     // implement code for a documented requirement
    case 'fix_issue':       return 30;     // patch partial implementation
    // ─── future-compat types (legacy / other engines) ───
    case 'build_capability': return 45;
    case 'wire_integration': return 30;
    case 'add_validation':   return 20;
    case 'fix_bug':          return 25;
    case 'verify':           return 10;
    case 'review':           return 15;
    default: return null;
  }
}

function blastFromActionType(action_type: string | undefined): BlastRadiusProfile {
  switch (action_type) {
    // ─── canonical types ───
    case 'create_artifact': return { band: 'low', reason: 'New artifact definition — low blast.' };
    case 'update_artifact': return { band: 'low', reason: 'Artifact submission/refinement — low blast.' };
    case 'build_feature':   return { band: 'medium', reason: 'New feature code may affect users.' };
    case 'fix_issue':       return { band: 'medium', reason: 'Patches existing implementation.' };
    // ─── future-compat ───
    case 'build_capability': return { band: 'medium', reason: 'New capability surface affects users.' };
    case 'wire_integration': return { band: 'medium', reason: 'External integration may have side effects.' };
    case 'fix_bug':          return { band: 'low', reason: 'Localized fix.' };
    case 'add_validation':   return { band: 'low', reason: 'Defensive only.' };
    case 'verify':           return { band: 'low', reason: 'Read-only verification.' };
    default: return { band: 'low' };
  }
}

/**
 * Convert the next-action engine's `confidence_score` into a 0..100 display
 * value. The engine emits confidence as a 0..1 fraction (e.g. 0.9 = "90%
 * confident"); historic clamping treated it as already-percentage and turned
 * 0.9 into 1%. Detection: any value ≤ 1 is treated as a fraction.
 */
function normalizeConfidenceScore(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 60;
  return raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
}

/**
 * Convert the next-action engine's `priority_score` into a 0..100 display
 * value. The engine emits priority as `statusWeight × dependencyWeight ×
 * systemRuleWeight` — typically integers in the 2..14 range. Historic
 * clamping showed `3` as `3%`, which underrepresents importance.
 *
 * Strategy: any value already > 14 (or already a fraction ≤ 1, in which
 * case it's a different upstream emitter) is normalized differently.
 *   - 0..1 fraction → multiply by 100
 *   - 2..14 raw → scale linearly to ~14..98 with a multiplier of 7
 *   - > 14 → clamp directly
 */
function normalizePriorityScore(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 50;
  if (raw <= 1) return Math.round(raw * 100);
  if (raw <= 14) return Math.round(raw * 7);
  return Math.round(raw);
}

/**
 * Wire active_build from the most recent NextAction row that is accepted
 * but not yet completed. This is the canonical "in flight" signal:
 *   - operator clicked "Mark accepted" on a Cory action
 *   - operator has not yet clicked "Complete" or had it auto-completed
 *
 * No new persistence — uses the existing NextAction lifecycle.
 */
function buildActiveBuild(recentActions: any[]): ActiveBuildProfile | null {
  if (!recentActions || recentActions.length === 0) return null;
  // Find the most recent accepted-but-not-completed action.
  const inFlight = recentActions.find(r => r.status === 'accepted');
  if (!inFlight) return null;
  const reqKey = inFlight.metadata?.requirement_key;
  return {
    source: 'next_action',
    title: inFlight.title,
    started_at: (inFlight.updated_at || inFlight.created_at || new Date()).toISOString
      ? (inFlight.updated_at || inFlight.created_at || new Date()).toISOString()
      : new Date().toISOString(),
    target_ref: reqKey || inFlight.action_type || 'unknown',
  };
}

function stripRank(entry: any): NextActionProfile {
  const { rank: _rank, ...rest } = entry;
  return rest as NextActionProfile;
}

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function emptyState(input: BuildInput): UnifiedProjectState {
  return {
    project: {
      id: '',
      organization_name: null,
      industry: null,
      project_stage: 'discovery',
    },
    readiness: {
      score: 0,
      band: 'red',
      reasons: ['No project found for this enrollment.'],
      breakdown: {
        artifact_completion: 0, requirements_coverage: 0,
        github_health: 0, portfolio_quality: 0, workflow_progress: 0,
      },
    },
    coverage: {
      score: 0, requirements_matched: 0, requirements_total: 0,
      bps_complete: 0, bps_total: 0,
    },
    confidence: { score: 0, sources: [] },
    health: { score: 0, regressions_24h: 0, verification_pass_rate: 0 },
    next_action: null,
    queue: [],
    blockers: [],
    active_build: null,
    verification: { pending: 0, passing: 0, failing: 0, pass_rate_24h: 0 },
    built_at: new Date().toISOString(),
  };
}

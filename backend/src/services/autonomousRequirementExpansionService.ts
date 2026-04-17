/**
 * Autonomous Requirement Expansion Service — Orchestrator
 *
 * Ties together gap detection, requirement generation, and feedback
 * tracking. Called by the scheduler every 15 minutes. Only runs for
 * projects and BPs in autonomous mode.
 *
 * Flow:
 *   1. Find autonomous-mode projects
 *   2. For each BP in autonomous mode:
 *      a. Run gap detection on enriched BP data
 *      b. Generate requirements from detected gaps
 *      c. Update feedback on past-generated requirements
 *   3. Log cycle results
 */

import { Op } from 'sequelize';
import { Project, Capability, RequirementsMap, Feature } from '../models';
import { detectGaps } from '../intelligence/requirements/gapDetectionEngine';
import { generateFromGaps } from '../intelligence/requirements/requirementGenerationEngine';

export interface ExpansionCycleResult {
  projectsScanned: number;
  bpsScanned: number;
  bpsSkippedMode: number;
  totalGapsDetected: number;
  totalRequirementsCreated: number;
  totalReportingInsights: number;
  totalSkippedDedup: number;
  totalSkippedLimit: number;
  feedbackUpdated: number;
}

const lastCycleByProject = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000; // 10 min

export async function runExpansionCycle(): Promise<ExpansionCycleResult> {
  const result: ExpansionCycleResult = {
    projectsScanned: 0, bpsScanned: 0, bpsSkippedMode: 0,
    totalGapsDetected: 0, totalRequirementsCreated: 0, totalReportingInsights: 0,
    totalSkippedDedup: 0, totalSkippedLimit: 0, feedbackUpdated: 0,
  };

  const cycleId = `cycle-${new Date().toISOString().replace(/[:.]/g, '-')}`;

  // 1. Find projects with target_mode = 'autonomous'
  const projects = await Project.findAll({
    where: { target_mode: 'autonomous' },
    attributes: ['id', 'enrollment_id', 'target_mode'],
  });

  if (projects.length === 0) return result;
  result.projectsScanned = projects.length;

  for (const project of projects) {
    const projectId = (project as any).id;

    // Cooldown check
    const lastRun = lastCycleByProject.get(projectId) || 0;
    if (Date.now() - lastRun < COOLDOWN_MS) continue;
    lastCycleByProject.set(projectId, Date.now());

    // Get capabilities + hierarchy for this project
    const { getCapabilityHierarchy } = await import('./projectScopeService');
    const hierarchy = await getCapabilityHierarchy(projectId);

    // Get repo file tree
    let repoFileTree: string[] = [];
    try {
      const { getConnection } = await import('./githubService');
      const conn = await getConnection((project as any).enrollment_id);
      if (conn?.file_tree_json?.tree) {
        repoFileTree = conn.file_tree_json.tree
          .filter((t: any) => t.type === 'blob')
          .map((t: any) => t.path);
      }
    } catch {}

    // Load mode resolver
    const { resolveMode } = await import('../intelligence/profiles/modeResolver');

    // Load campaign modes
    let campaignModeMap = new Map<string, string>();
    try {
      const { Campaign } = await import('../models');
      const linkedCampaigns = await Campaign.findAll({
        where: { capability_id: { [Op.ne]: null as any }, status: 'active' },
        attributes: ['capability_id', 'mode_override'],
      });
      for (const c of linkedCampaigns) {
        if ((c as any).mode_override && (c as any).capability_id) {
          campaignModeMap.set((c as any).capability_id, (c as any).mode_override);
        }
      }
    } catch {}

    // Get existing AUTO requirement keys for dedup
    const existingAutoReqs = await RequirementsMap.findAll({
      where: { project_id: projectId, verified_by: 'AUTONOMOUS_ENGINE' },
      attributes: ['requirement_key'],
    });
    const existingAutoKeys = new Set(existingAutoReqs.map((r: any) => r.requirement_key));

    // Load capability model data for mode_override
    const capModels = await Capability.findAll({
      where: { project_id: projectId },
      attributes: ['id', 'mode_override'],
    });
    const capModeMap = new Map(capModels.map((c: any) => [c.id, c.mode_override]));

    for (const cap of hierarchy) {
      result.bpsScanned++;

      // Mode guard: only process autonomous BPs
      const capModeOverride = capModeMap.get(cap.id);
      const campaignMode = campaignModeMap.get(cap.id);
      const effectiveMode = resolveMode(
        (project as any).target_mode || 'production',
        capModeOverride,
        campaignMode,
      );

      if (effectiveMode !== 'autonomous') {
        result.bpsSkippedMode++;
        continue;
      }

      // Enrich the capability to get quality scores + metrics
      // We build a minimal enriched object from hierarchy data
      const features = cap.features || [];
      const allReqs = features.flatMap((f: any) => f.requirements || []);
      const totalR = allReqs.length;
      const matchedR = allReqs.filter((r: any) =>
        r.status === 'matched' || r.status === 'verified' || r.status === 'auto_verified'
      ).length;
      const reqCoverage = totalR > 0 ? Math.round((matchedR / totalR) * 100) : 0;

      // Build minimal quality object from repo detection
      const hasBackend = repoFileTree.some(f => /\/(service|route|controller|handler)\b/i.test(f));
      const hasFrontend = repoFileTree.some(f => /\/(component|page|view)\b/i.test(f) && /\.(tsx|jsx)$/.test(f));
      const hasAgents = repoFileTree.some(f => /agent/i.test(f) && /\.(ts|py)$/.test(f));

      const enrichedBP = {
        id: cap.id,
        name: cap.name,
        quality: {
          determinism: hasBackend ? 6 : 0,
          reliability: 2,
          observability: 0,
          ux_exposure: hasFrontend ? 6 : 0,
          automation: hasAgents ? 6 : 0,
          production_readiness: (hasBackend ? 3 : 0) + (hasFrontend ? 3 : 0) + (hasAgents ? 2 : 0),
        },
        metrics: { requirements_coverage: reqCoverage },
        maturity: { level: reqCoverage > 85 ? 4 : reqCoverage > 70 ? 3 : reqCoverage > 50 ? 2 : 1 },
        linked_agents: [],
        total_requirements: totalR,
        matched_requirements: matchedR,
        features,
      };

      // Detect gaps
      const gaps = detectGaps(enrichedBP, repoFileTree, existingAutoKeys);
      result.totalGapsDetected += gaps.length;

      if (gaps.length === 0) continue;

      // Get or create a feature to attach requirements to
      let featureId: string | null = null;
      if (features.length > 0) {
        featureId = features[0].id;
      } else {
        try {
          const newFeature = await Feature.create({
            capability_id: cap.id,
            name: 'Autonomous Enhancements',
            description: 'System-generated requirements for autonomous operation',
            status: 'active',
            priority: 'medium',
          } as any);
          featureId = (newFeature as any).id;
        } catch {}
      }

      // Generate requirements
      const genResult = await generateFromGaps(
        gaps, projectId, cap.id, featureId, cycleId,
        { reqCoverage, qualityScore: 0, readiness: 0 },
      );

      result.totalRequirementsCreated += genResult.created;
      result.totalReportingInsights += genResult.reporting_insights_created;
      result.totalSkippedDedup += genResult.skipped_dedup;
      result.totalSkippedLimit += genResult.skipped_limit;

      // Add newly created keys to the dedup set for this cycle
      if (genResult.created > 0) {
        const newKeys = await RequirementsMap.findAll({
          where: {
            project_id: projectId,
            capability_id: cap.id,
            verified_by: 'AUTONOMOUS_ENGINE',
          },
          attributes: ['requirement_key'],
        });
        for (const r of newKeys) existingAutoKeys.add((r as any).requirement_key);
      }
    }

    // Feedback loop: update outcomes for past AUTO requirements
    result.feedbackUpdated += await updateFeedback(projectId);
  }

  if (result.totalRequirementsCreated > 0 || result.totalReportingInsights > 0) {
    console.log(`[AutoReqExpansion] Cycle ${cycleId}: ${result.projectsScanned} projects, ${result.bpsScanned} BPs (${result.bpsSkippedMode} skipped), ${result.totalGapsDetected} gaps, ${result.totalRequirementsCreated} reqs created, ${result.totalReportingInsights} insights, ${result.totalSkippedDedup} dedup, ${result.feedbackUpdated} feedback updates`);
  }

  return result;
}

async function updateFeedback(projectId: string): Promise<number> {
  let updated = 0;

  const autoReqs = await RequirementsMap.findAll({
    where: {
      project_id: projectId,
      verified_by: 'AUTONOMOUS_ENGINE',
      status: { [Op.in]: ['matched', 'verified', 'auto_verified'] },
    },
  });

  for (const req of autoReqs) {
    const meta = (req as any).metadata || {};
    const autoGen = meta.autonomous_generation;
    if (!autoGen || autoGen.outcome?.status === 'completed') continue;

    autoGen.outcome = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      final_status: (req as any).status,
    };

    (req as any).metadata = { ...meta, autonomous_generation: autoGen };
    (req as any).changed('metadata', true);
    await req.save();
    updated++;
  }

  return updated;
}

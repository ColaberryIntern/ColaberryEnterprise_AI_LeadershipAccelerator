/**
 * Build History Service
 *
 * Aggregates the last N validation reports and verified requirements
 * across a project to answer: "what has already been built?"
 *
 * Used by gap detection and execution plan generation to avoid
 * recommending work that was already done in recent updates.
 */

import { Op } from 'sequelize';
import { Capability, RequirementsMap } from '../models';

export interface BuildHistory {
  /** All files reported as created/modified across recent validation reports */
  builtFiles: Set<string>;
  /** All routes reported across recent validation reports */
  builtRoutes: Set<string>;
  /** Keywords extracted from all recently verified requirement texts */
  builtKeywords: Set<string>;
  /** Gap IDs that were already addressed (from autonomous requirements that reached verified/matched) */
  addressedGapIds: Set<string>;
  /** Category of work already done: 'backend', 'frontend', 'agent', etc. */
  builtCategories: Set<string>;
  /** Raw report count */
  reportCount: number;
}

/**
 * Load the last N validation reports + recently verified requirements for a project.
 * Returns a BuildHistory that gap detection and execution plans can check against.
 */
export async function loadBuildHistory(projectId: string, maxReports: number = 10): Promise<BuildHistory> {
  const history: BuildHistory = {
    builtFiles: new Set(),
    builtRoutes: new Set(),
    builtKeywords: new Set(),
    addressedGapIds: new Set(),
    builtCategories: new Set(),
    reportCount: 0,
  };

  // 1. Load capabilities with validation reports in last_execution
  const caps = await Capability.findAll({
    where: { project_id: projectId },
    attributes: ['id', 'last_execution'],
  });

  for (const cap of caps) {
    const lastExec = (cap as any).last_execution;
    if (!lastExec?.validation_report) continue;
    const report = lastExec.validation_report;
    history.reportCount++;

    // Extract files
    for (const f of (report.filesCreated || [])) history.builtFiles.add(f.toLowerCase());
    for (const f of (report.filesModified || [])) history.builtFiles.add(f.toLowerCase());

    // Extract routes
    for (const r of (report.routes || [])) history.builtRoutes.add(r.toLowerCase());

    // Extract database
    for (const d of (report.database || [])) history.builtKeywords.add(d.toLowerCase());

    // Infer categories from files
    for (const f of [...(report.filesCreated || []), ...(report.filesModified || [])]) {
      const fl = f.toLowerCase();
      if (/\/(service|route|controller|handler|gateway|api)\b/i.test(fl)) history.builtCategories.add('backend');
      if (/\/(component|page|view|screen)\b/i.test(fl) || /\.(tsx|jsx|vue)$/.test(fl)) history.builtCategories.add('frontend');
      if (/agent/i.test(fl)) history.builtCategories.add('agent');
      if (/\/(model|schema|entity|migration)\b/i.test(fl)) history.builtCategories.add('data');
      if (/dashboard|report|chart|analytics/i.test(fl)) history.builtCategories.add('reporting');
      if (/track|event|signal|analytics|telemetry/i.test(fl)) history.builtCategories.add('tracking');
      if (/monitor|health|alert|observ/i.test(fl)) history.builtCategories.add('monitoring');
      if (/feedback|loop|score|metric|kpi/i.test(fl)) history.builtCategories.add('optimization');
      if (/recommend|predict|pattern|anomal|simulat|forecast/i.test(fl)) history.builtCategories.add('intelligence');
      if (/audit|decision|log/i.test(fl)) history.builtCategories.add('audit');
    }
  }

  // 2. Load recently verified requirements (last 30 days) — extract keywords
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentVerified = await RequirementsMap.findAll({
    where: {
      project_id: projectId,
      status: { [Op.in]: ['verified', 'auto_verified', 'matched'] },
      updated_at: { [Op.gte]: thirtyDaysAgo },
    },
    attributes: ['requirement_text', 'verified_by', 'metadata'],
    limit: 200,
  });

  for (const req of recentVerified) {
    const text = ((req as any).requirement_text || '').toLowerCase();
    for (const w of text.split(/\W+/)) {
      if (w.length > 4) history.builtKeywords.add(w);
    }

    // Check if this was an autonomous requirement with a gap_id
    const autoGen = (req as any).metadata?.autonomous_generation;
    if (autoGen?.gap_id) {
      history.addressedGapIds.add(autoGen.gap_id);
    }
  }

  // 3. Load recently verified autonomous requirements specifically
  const autoVerified = await RequirementsMap.findAll({
    where: {
      project_id: projectId,
      verified_by: 'AUTONOMOUS_ENGINE',
      status: { [Op.in]: ['verified', 'auto_verified', 'matched'] },
    },
    attributes: ['metadata'],
    limit: 100,
  });

  for (const req of autoVerified) {
    const autoGen = (req as any).metadata?.autonomous_generation;
    if (autoGen?.gap_id) history.addressedGapIds.add(autoGen.gap_id);
    if (autoGen?.category) history.builtCategories.add(autoGen.category);
  }

  return history;
}

/**
 * Check if a gap has already been addressed based on build history.
 */
export function isGapAddressed(gapId: string, gapType: string, history: BuildHistory): boolean {
  // Direct match: gap was already generated as a requirement and verified
  if (history.addressedGapIds.has(gapId)) return true;

  // Category match: the gap's target category was recently built
  const categoryMap: Record<string, string[]> = {
    'BEHAVIOR-USER-TRACKING': ['tracking', 'analytics'],
    'BEHAVIOR-DECISION-LOGGING': ['audit', 'logging'],
    'INTELLIGENCE-RECOMMENDATIONS': ['intelligence', 'agent'],
    'INTELLIGENCE-PATTERN-DETECTION': ['intelligence'],
    'INTELLIGENCE-SIMULATION': ['intelligence'],
    'OPTIMIZATION-FEEDBACK-LOOP': ['optimization', 'feedback'],
    'OPTIMIZATION-PERFORMANCE-SCORING': ['optimization', 'monitoring'],
    'REPORTING-DASHBOARD': ['reporting', 'frontend'],
    'REPORTING-AGENT-VISIBILITY': ['reporting'],
  };

  const requiredCategories = categoryMap[gapId] || [];
  if (requiredCategories.length > 0 && requiredCategories.every(c => history.builtCategories.has(c))) {
    return true;
  }

  return false;
}

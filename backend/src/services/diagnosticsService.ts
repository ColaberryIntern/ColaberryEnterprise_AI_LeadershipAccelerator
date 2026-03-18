/**
 * Diagnostics Service — Control Tower
 *
 * Aggregates variable flow, reconciliation, and section analysis
 * into a single scored health report with classified issues.
 */

import {
  getVariableFlowMap,
  getVariableReconciliation,
  getSectionVariableFlow,
  VariableFlowEntry,
} from './variableFlowService';
import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';

// ─── Debug Logging ──────────────────────────────────────────────────

const DEBUG = process.env.DEBUG_CONTROL_TOWER === 'true';
function debugLog(msg: string, data?: any) {
  if (DEBUG) console.log(`[ControlTower:Diagnostics] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
}

// ─── Types ──────────────────────────────────────────────────────────

export interface DiagnosticIssue {
  type: 'missing_variable' | 'timeline_violation' | 'orphaned_definition' | 'undefined_reference';
  severity: 'critical' | 'warning' | 'info';
  variable_key: string;
  message: string;
  affected_sections: string[];
}

export interface DiagnosticsResult {
  system_health_score: number;
  summary: {
    total_variables: number;
    missing_count: number;
    timeline_violations: number;
    orphaned_count: number;
    undefined_count: number;
  };
  issues: DiagnosticIssue[];
  scanned_at: string;
}

// ─── Scoring Constants ──────────────────────────────────────────────

const PENALTY = {
  missing_variable: 5,
  timeline_violation: 10,
  orphaned_definition: 3,
  undefined_reference: 5,
};

// ─── Public API ─────────────────────────────────────────────────────

export async function runFullDiagnostics(): Promise<DiagnosticsResult> {
  const issues: DiagnosticIssue[] = [];

  // 1. Get full program variable flow map
  const flowMap = await getVariableFlowMap();
  debugLog('Flow map loaded', { count: flowMap.length });

  // 2. Collect timeline violations from flow map
  for (const entry of flowMap) {
    if (entry.timeline_violation) {
      const consumedSections = entry.consumed_in.map(c => c.lesson_title);
      const producedSection = entry.first_set_in?.lesson_title || 'unknown';
      issues.push({
        type: 'timeline_violation',
        severity: 'critical',
        variable_key: entry.variable_key,
        message: `"${entry.variable_key}" consumed before first produced in "${producedSection}"`,
        affected_sections: consumedSections,
      });
    }
  }

  // 3. Get reconciliation data
  const recon = await getVariableReconciliation();

  for (const ref of recon.undefined_refs) {
    issues.push({
      type: 'undefined_reference',
      severity: 'warning',
      variable_key: ref.key,
      message: `"${ref.key}" referenced in prompts but no VariableDefinition exists`,
      affected_sections: ref.used_in_sections,
    });
  }

  for (const orphan of recon.orphaned_defs) {
    issues.push({
      type: 'orphaned_definition',
      severity: 'info',
      variable_key: orphan.key,
      message: `"${orphan.key}" (${orphan.display_name}) is defined but never referenced`,
      affected_sections: [],
    });
  }

  // 4. Collect missing variables across all sections
  const modules = await CurriculumModule.findAll({ order: [['module_number', 'ASC']] });
  const moduleMap = new Map(modules.map(m => [m.id, m.module_number]));
  const lessons = await CurriculumLesson.findAll({ order: [['lesson_number', 'ASC']] });
  const orderedLessons = lessons
    .map(l => ({ id: l.id, title: l.title, order: (moduleMap.get(l.module_id) || 0) * 1000 + l.lesson_number }))
    .sort((a, b) => a.order - b.order);

  const seenMissing = new Set<string>();
  for (const lesson of orderedLessons) {
    const sectionFlow = await getSectionVariableFlow(lesson.id);
    for (const m of sectionFlow.missing) {
      if (!seenMissing.has(m.key)) {
        seenMissing.add(m.key);
        issues.push({
          type: 'missing_variable',
          severity: 'critical',
          variable_key: m.key,
          message: `"${m.key}" required but not available in "${lesson.title}"`,
          affected_sections: [lesson.title],
        });
      } else {
        // Add this section to existing issue
        const existing = issues.find(i => i.type === 'missing_variable' && i.variable_key === m.key);
        if (existing && !existing.affected_sections.includes(lesson.title)) {
          existing.affected_sections.push(lesson.title);
        }
      }
    }
  }

  // 5. Compute score
  let score = 100;
  for (const issue of issues) {
    score -= PENALTY[issue.type];
  }
  score = Math.max(0, score);

  // 6. Build summary
  const missingCount = issues.filter(i => i.type === 'missing_variable').length;
  const timelineCount = issues.filter(i => i.type === 'timeline_violation').length;
  const orphanedCount = issues.filter(i => i.type === 'orphaned_definition').length;
  const undefinedCount = issues.filter(i => i.type === 'undefined_reference').length;

  const result: DiagnosticsResult = {
    system_health_score: score,
    summary: {
      total_variables: flowMap.length,
      missing_count: missingCount,
      timeline_violations: timelineCount,
      orphaned_count: orphanedCount,
      undefined_count: undefinedCount,
    },
    issues,
    scanned_at: new Date().toISOString(),
  };

  debugLog('Diagnostics complete', { score, issueCount: issues.length });
  return result;
}

// ─── Runtime Intelligence Extension ─────────────────────────────────

export interface RuntimeInsights {
  runtime_failure_rate: number;
  avg_quality_score: number | null;
  recent_failures: number;
  runtime_health_penalty: number;
}

/**
 * Additive extension — does NOT modify runFullDiagnostics().
 * Control Tower UI calls both in parallel and merges scores.
 */
export async function getRuntimeInsights(): Promise<RuntimeInsights> {
  try {
    const { getDashboardMetrics } = require('./postExecutionAnalyticsService');
    const dashboard = await getDashboardMetrics();

    let penalty = 0;
    if (dashboard.overall.failure_rate > 10) {
      penalty += Math.floor(dashboard.overall.failure_rate / 10) * 10;
    }
    if (dashboard.overall.avg_quality && dashboard.overall.avg_quality < 70) {
      penalty += Math.floor((70 - dashboard.overall.avg_quality) / 10) * 5;
    }

    return {
      runtime_failure_rate: dashboard.overall.failure_rate,
      avg_quality_score: dashboard.overall.avg_quality,
      recent_failures: dashboard.overall.failed_count,
      runtime_health_penalty: Math.min(penalty, 40),
    };
  } catch {
    return {
      runtime_failure_rate: 0,
      avg_quality_score: null,
      recent_failures: 0,
      runtime_health_penalty: 0,
    };
  }
}

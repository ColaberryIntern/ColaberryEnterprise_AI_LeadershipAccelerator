/**
 * Requirement Generation Engine — Autonomous Requirement Expansion
 *
 * Converts detected gaps into RequirementsMap records. Uses a template
 * catalog (no LLM calls). Each generated requirement is tagged with
 * modes=['autonomous'] and verified_by='AUTONOMOUS_ENGINE' so it's
 * only visible in autonomous mode and clearly separated from user reqs.
 *
 * Safety limits: 5/BP, 20/project, 50/day, max 30 outstanding.
 */

import { Op } from 'sequelize';
import { RequirementsMap, ReportingInsight } from '../../models';
import type { DetectedGap } from './gapDetectionEngine';

interface RequirementTemplate {
  key_suffix: string;
  text: string;
  category: string;
  impact_score: number;
}

const GAP_TEMPLATES: Record<string, RequirementTemplate[]> = {
  'BEHAVIOR-USER-TRACKING': [
    { key_suffix: 'USER-EVENT-TRACKING', text: 'System must capture and store user interaction events (clicks, navigation, form submissions) with timestamps and context for behavioral analysis.', category: 'frontend', impact_score: 7 },
    { key_suffix: 'SESSION-ANALYTICS', text: 'System must track user session duration, flow paths, and drop-off points to identify UX bottlenecks.', category: 'frontend', impact_score: 6 },
  ],
  'BEHAVIOR-DECISION-LOGGING': [
    { key_suffix: 'DECISION-AUDIT-LOG', text: 'All autonomous and semi-autonomous decisions must be logged with context, reasoning, confidence score, and outcome for audit and learning.', category: 'backend', impact_score: 8 },
    { key_suffix: 'ACTION-TRAIL', text: 'System must maintain an immutable action trail linking user actions to system responses and outcomes.', category: 'backend', impact_score: 6 },
  ],
  'INTELLIGENCE-RECOMMENDATIONS': [
    { key_suffix: 'SMART-RECOMMENDATIONS', text: 'System should provide data-driven recommendations based on historical patterns, current context, and predicted outcomes.', category: 'agent', impact_score: 8 },
    { key_suffix: 'RECOMMENDATION-OUTCOMES', text: 'System must track which recommendations were accepted, rejected, or modified, and measure their actual outcomes for feedback learning.', category: 'backend', impact_score: 7 },
  ],
  'INTELLIGENCE-PATTERN-DETECTION': [
    { key_suffix: 'PATTERN-DETECTION', text: 'System should detect recurring behavioral patterns, anomalies, and trends using historical data analysis.', category: 'intelligence', impact_score: 7 },
    { key_suffix: 'ANOMALY-ALERTS', text: 'System must generate alerts when detected patterns deviate significantly from baselines, with severity classification.', category: 'intelligence', impact_score: 6 },
  ],
  'INTELLIGENCE-SIMULATION': [
    { key_suffix: 'SIMULATION-ENGINE', text: 'System should support what-if scenario simulation, allowing users to preview predicted outcomes before committing to actions.', category: 'intelligence', impact_score: 7 },
    { key_suffix: 'FORECAST-MODELS', text: 'System must generate forecasts based on historical trends and current trajectory for key process metrics.', category: 'intelligence', impact_score: 6 },
  ],
  'OPTIMIZATION-FEEDBACK-LOOP': [
    { key_suffix: 'FEEDBACK-LOOP', text: 'System must implement a closed feedback loop: measure outcomes → compare to predictions → adjust future behavior automatically.', category: 'backend', impact_score: 8 },
    { key_suffix: 'CONTINUOUS-IMPROVEMENT', text: 'System should identify recurring failure patterns and automatically suggest or apply corrective measures.', category: 'agent', impact_score: 7 },
  ],
  'OPTIMIZATION-PERFORMANCE-SCORING': [
    { key_suffix: 'PERFORMANCE-SCORING', text: 'System must compute and track performance scores (latency, throughput, error rate, user satisfaction) with historical baselines.', category: 'backend', impact_score: 6 },
    { key_suffix: 'SLA-MONITORING', text: 'System should monitor service level objectives and alert when performance degrades below defined thresholds.', category: 'backend', impact_score: 5 },
  ],
  'REPORTING-DASHBOARD': [
    { key_suffix: 'HEALTH-DASHBOARD', text: 'Build a process health dashboard showing real-time metrics, trend lines, and status indicators for stakeholder visibility.', category: 'frontend', impact_score: 6 },
    { key_suffix: 'EXECUTIVE-SUMMARY', text: 'System must generate periodic executive summaries with key metrics, notable changes, and recommended actions.', category: 'reporting', impact_score: 5 },
  ],
  'REPORTING-AGENT-VISIBILITY': [
    { key_suffix: 'AGENT-PERF-DASHBOARD', text: 'Build an agent performance dashboard showing execution counts, success rates, error rates, and response times per agent.', category: 'frontend', impact_score: 5 },
    { key_suffix: 'INSIGHT-GENERATION', text: 'System should automatically generate insights from agent activity data, highlighting efficiency gains and failure patterns.', category: 'intelligence', impact_score: 5 },
  ],
};

const MAX_PER_BP = 5;
const MAX_PER_PROJECT = 20;
const MAX_OUTSTANDING = 30;

export interface GenerationResult {
  created: number;
  skipped_dedup: number;
  skipped_limit: number;
  reporting_insights_created: number;
}

export async function generateFromGaps(
  gaps: DetectedGap[],
  projectId: string,
  capabilityId: string,
  featureId: string | null,
  cycleId: string,
  currentMetrics: { reqCoverage: number; qualityScore: number; readiness: number },
): Promise<GenerationResult> {
  const result: GenerationResult = { created: 0, skipped_dedup: 0, skipped_limit: 0, reporting_insights_created: 0 };

  // Safety: check outstanding AUTO requirements for this project
  const outstandingCount = await RequirementsMap.count({
    where: {
      project_id: projectId,
      verified_by: 'AUTONOMOUS_ENGINE',
      status: { [Op.in]: ['not_started', 'unmatched'] },
    },
  });
  if (outstandingCount >= MAX_OUTSTANDING) {
    console.log(`[AutoReqGen] Project ${projectId}: ${outstandingCount} outstanding AUTO reqs, skipping generation`);
    result.skipped_limit = gaps.length;
    return result;
  }

  // Count how many we've created for this project today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = await RequirementsMap.count({
    where: {
      project_id: projectId,
      verified_by: 'AUTONOMOUS_ENGINE',
      created_at: { [Op.gte]: today },
    },
  });
  const dailyBudget = Math.max(0, 50 - todayCount);

  let bpCreated = 0;
  let projectCreated = 0;

  for (const gap of gaps) {
    if (bpCreated >= MAX_PER_BP || projectCreated >= MAX_PER_PROJECT || projectCreated >= dailyBudget) {
      result.skipped_limit++;
      continue;
    }

    const templates = GAP_TEMPLATES[gap.gap_id] || [];

    for (const template of templates) {
      if (bpCreated >= MAX_PER_BP || projectCreated >= MAX_PER_PROJECT) break;

      const requirementKey = `AUTO-${slugify(capabilityId.substring(0, 8))}-${template.key_suffix}`;

      // Dedup: skip if already exists
      const existing = await RequirementsMap.findOne({
        where: { project_id: projectId, requirement_key: requirementKey },
      });
      if (existing) {
        result.skipped_dedup++;
        continue;
      }

      if (gap.target === 'REPORTING') {
        // Create ReportingInsight instead of RequirementsMap
        try {
          await ReportingInsight.create({
            insight_type: 'opportunity',
            source_agent: 'AutonomousRequirementExpansion',
            entity_type: 'system',
            entity_id: capabilityId,
            title: `${gap.title}: ${template.text.substring(0, 80)}`,
            narrative: template.text,
            confidence: gap.severity / 10,
            impact: template.impact_score / 10,
            urgency: 0.5,
            data_strength: 0.7,
            final_score: (gap.severity + template.impact_score) / 20,
            evidence: { gap_signals: gap.signals, gap_id: gap.gap_id },
            recommendations: { suggested_action: template.text, category: template.category },
            status: 'new',
            alert_severity: gap.severity >= 7 ? 'warning' : 'insight',
          } as any);
          result.reporting_insights_created++;
        } catch {}
        continue;
      }

      // Create RequirementsMap record for BP target
      try {
        await RequirementsMap.create({
          project_id: projectId,
          capability_id: capabilityId,
          feature_id: featureId,
          requirement_key: requirementKey,
          requirement_text: template.text,
          status: 'not_started',
          confidence_score: 0,
          verified_by: 'AUTONOMOUS_ENGINE',
          modes: ['autonomous'],
          is_active: true,
          metadata: {
            autonomous_generation: {
              gap_type: gap.gap_type,
              gap_id: gap.gap_id,
              impact_score: template.impact_score,
              category: template.category,
              cycle_id: cycleId,
              generated_at: new Date().toISOString(),
              metrics_at_generation: currentMetrics,
              outcome: null,
            },
          },
        } as any);
        bpCreated++;
        projectCreated++;
        result.created++;
      } catch (err: any) {
        // Unique constraint violation = dedup
        if (err?.name === 'SequelizeUniqueConstraintError') {
          result.skipped_dedup++;
        }
      }
    }
  }

  return result;
}

function slugify(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 20);
}

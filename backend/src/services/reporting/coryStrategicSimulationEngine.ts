// ─── Cory Strategic Simulation Engine ────────────────────────────────────────
// Simulates the projected impact of strategic decisions before execution.

import { Lead, Campaign, Enrollment, AiAgent } from '../../models';
import SimulationAccuracy from '../../models/SimulationAccuracy';
import { sequelize } from '../../config/database';
import { QueryTypes, Op } from 'sequelize';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SimulationContext {
  entity_type: string;
  entity_id?: string;
  strategy_type: string;
  parameters?: Record<string, any>;
}

export interface SimulationResult {
  predicted_leads: number;
  predicted_conversions: number;
  predicted_enrollments: number;
  predicted_revenue: number;
  confidence: number;
  risk_score: number;
  assumptions: string[];
  timeline_days: number;
  breakdown: { task: string; agent: string; duration: string; dependencies: string[] }[];
}

interface TaskTemplate {
  task: string;
  agent: string;
  duration: string;
  deps: string[];
}

// ─── Strategy Task Templates ────────────────────────────────────────────────

export const STRATEGY_TASK_TEMPLATES: Record<string, TaskTemplate[]> = {
  increase_campaign_volume: [
    { task: 'Adjust campaign volume parameters', agent: 'CampaignStrategyAgent', duration: '30min', deps: [] },
    { task: 'Update outreach schedule', agent: 'ScheduledActionsProcessor', duration: '15min', deps: ['Adjust campaign volume parameters'] },
    { task: 'Monitor response metrics', agent: 'CampaignHealthScanner', duration: '24h', deps: ['Update outreach schedule'] },
    { task: 'Analyze results and report', agent: 'ReportingIntelligenceAgent', duration: '1h', deps: ['Monitor response metrics'] },
  ],
  adjust_outreach_schedule: [
    { task: 'Analyze optimal send windows', agent: 'ReportingIntelligenceAgent', duration: '1h', deps: [] },
    { task: 'Update schedule configuration', agent: 'ScheduledActionsProcessor', duration: '15min', deps: ['Analyze optimal send windows'] },
    { task: 'Monitor engagement changes', agent: 'CampaignHealthScanner', duration: '48h', deps: ['Update schedule configuration'] },
    { task: 'Report results', agent: 'ReportingIntelligenceAgent', duration: '30min', deps: ['Monitor engagement changes'] },
  ],
  target_new_segment: [
    { task: 'Define segment criteria', agent: 'CampaignStrategyAgent', duration: '1h', deps: [] },
    { task: 'Build lead list for segment', agent: 'LeadScoringAgent', duration: '2h', deps: ['Define segment criteria'] },
    { task: 'Create targeted campaign', agent: 'CampaignStrategyAgent', duration: '1h', deps: ['Build lead list for segment'] },
    { task: 'Launch and monitor', agent: 'CampaignHealthScanner', duration: '72h', deps: ['Create targeted campaign'] },
    { task: 'Evaluate segment performance', agent: 'ReportingIntelligenceAgent', duration: '1h', deps: ['Launch and monitor'] },
  ],
  optimize_funnel: [
    { task: 'Identify funnel bottlenecks', agent: 'ReportingIntelligenceAgent', duration: '1h', deps: [] },
    { task: 'Adjust scoring weights', agent: 'LeadScoringAgent', duration: '30min', deps: ['Identify funnel bottlenecks'] },
    { task: 'Update nurture sequences', agent: 'SequenceProgressionAgent', duration: '1h', deps: ['Adjust scoring weights'] },
    { task: 'Monitor conversion changes', agent: 'CampaignHealthScanner', duration: '48h', deps: ['Update nurture sequences'] },
  ],
  expand_alumni_program: [
    { task: 'Identify eligible alumni', agent: 'LeadScoringAgent', duration: '1h', deps: [] },
    { task: 'Design alumni outreach campaign', agent: 'CampaignStrategyAgent', duration: '2h', deps: ['Identify eligible alumni'] },
    { task: 'Launch alumni engagement', agent: 'ScheduledActionsProcessor', duration: '30min', deps: ['Design alumni outreach campaign'] },
    { task: 'Track alumni responses', agent: 'CampaignHealthScanner', duration: '72h', deps: ['Launch alumni engagement'] },
    { task: 'Measure program ROI', agent: 'ReportingIntelligenceAgent', duration: '1h', deps: ['Track alumni responses'] },
  ],
  launch_experiment: [
    { task: 'Define experiment hypothesis', agent: 'ReportingIntelligenceAgent', duration: '30min', deps: [] },
    { task: 'Set up control and test groups', agent: 'CampaignStrategyAgent', duration: '1h', deps: ['Define experiment hypothesis'] },
    { task: 'Execute experiment', agent: 'ScheduledActionsProcessor', duration: '72h', deps: ['Set up control and test groups'] },
    { task: 'Collect and analyze data', agent: 'ReportingIntelligenceAgent', duration: '2h', deps: ['Execute experiment'] },
    { task: 'Generate findings report', agent: 'ReportingIntelligenceAgent', duration: '1h', deps: ['Collect and analyze data'] },
  ],
};

// ─── Strategy Multipliers ───────────────────────────────────────────────────

const STRATEGY_MULTIPLIERS: Record<string, { leads: number; conversions: number; timeline_days: number }> = {
  increase_campaign_volume: { leads: 1.3, conversions: 1.2, timeline_days: 14 },
  adjust_outreach_schedule: { leads: 1.1, conversions: 1.15, timeline_days: 7 },
  target_new_segment: { leads: 1.5, conversions: 0.8, timeline_days: 30 },
  optimize_funnel: { leads: 1.0, conversions: 1.35, timeline_days: 14 },
  expand_alumni_program: { leads: 1.2, conversions: 1.4, timeline_days: 21 },
  launch_experiment: { leads: 1.0, conversions: 1.1, timeline_days: 30 },
};

// ─── Risk Scores ────────────────────────────────────────────────────────────

const STRATEGY_RISK: Record<string, number> = {
  increase_campaign_volume: 0.3,
  adjust_outreach_schedule: 0.15,
  target_new_segment: 0.6,
  optimize_funnel: 0.2,
  expand_alumni_program: 0.35,
  launch_experiment: 0.5,
};

// ─── Revenue per Enrollment ─────────────────────────────────────────────────

const REVENUE_PER_ENROLLMENT = 2500;

// ─── Main Simulation Function ───────────────────────────────────────────────

export async function simulateStrategy(context: SimulationContext): Promise<SimulationResult> {
  const baselines = await getHistoricalBaselines(context.entity_type, context.entity_id);
  const multipliers = STRATEGY_MULTIPLIERS[context.strategy_type] || { leads: 1.0, conversions: 1.0, timeline_days: 14 };
  const assumptions: string[] = [];

  // Apply strategy multipliers
  const predictedLeads = Math.round(baselines.lead_count * multipliers.leads);
  const baseConversionRate = baselines.conversion_rate || 0.05;
  const predictedConversions = Math.round(predictedLeads * baseConversionRate * multipliers.conversions);
  const predictedEnrollments = Math.round(predictedConversions * 0.6); // 60% of conversions become enrollments
  const predictedRevenue = predictedEnrollments * REVENUE_PER_ENROLLMENT;

  // Build assumptions list
  assumptions.push(`Baseline lead count: ${baselines.lead_count}`);
  assumptions.push(`Baseline conversion rate: ${(baseConversionRate * 100).toFixed(1)}%`);
  assumptions.push(`Lead multiplier: ${multipliers.leads}x`);
  assumptions.push(`Conversion multiplier: ${multipliers.conversions}x`);
  assumptions.push(`Revenue per enrollment: $${REVENUE_PER_ENROLLMENT}`);
  assumptions.push(`Conversion-to-enrollment rate: 60%`);

  if (context.parameters) {
    assumptions.push(`Custom parameters applied: ${JSON.stringify(context.parameters)}`);
  }

  // Compute confidence and risk
  const dataPoints = baselines.lead_count + baselines.campaign_count + baselines.enrollment_count;
  const historicalAccuracy = await getHistoricalAccuracy(context.strategy_type);
  const confidence = computeConfidence(dataPoints, assumptions, historicalAccuracy);
  const riskScore = computeRisk(context.strategy_type, context.parameters);

  // Build task breakdown
  const templates = STRATEGY_TASK_TEMPLATES[context.strategy_type] || [];
  const breakdown = templates.map((t) => ({
    task: t.task,
    agent: t.agent,
    duration: t.duration,
    dependencies: t.deps,
  }));

  return {
    predicted_leads: predictedLeads,
    predicted_conversions: predictedConversions,
    predicted_enrollments: predictedEnrollments,
    predicted_revenue: predictedRevenue,
    confidence,
    risk_score: riskScore,
    assumptions,
    timeline_days: multipliers.timeline_days,
    breakdown,
  };
}

// ─── Historical Baselines ───────────────────────────────────────────────────

export async function getHistoricalBaselines(entityType: string, entityId?: string): Promise<{
  lead_count: number;
  campaign_count: number;
  enrollment_count: number;
  conversion_rate: number;
}> {
  const [leadCount, campaignCount, enrollmentCount] = await Promise.all([
    Lead.count(),
    Campaign.count(),
    Enrollment.count(),
  ]);

  // Compute conversion rate: enrollments / leads (or a minimum floor)
  const conversionRate = leadCount > 0 ? Math.min(enrollmentCount / leadCount, 1.0) : 0.05;

  return {
    lead_count: leadCount,
    campaign_count: campaignCount,
    enrollment_count: enrollmentCount,
    conversion_rate: conversionRate,
  };
}

// ─── Historical Accuracy Lookup ─────────────────────────────────────────────
// Queries completed simulations to see how accurate past predictions were
// for the same strategy type. This feeds back into confidence scoring.

async function getHistoricalAccuracy(strategyType: string): Promise<number | null> {
  try {
    const completed = await SimulationAccuracy.findAll({
      where: {
        status: 'completed',
        accuracy_score: { [Op.ne]: null },
      },
      order: [['created_at', 'DESC']],
      limit: 10,
      raw: true,
    });

    // Filter to same strategy type
    const relevant = completed.filter(
      (s: any) => s.context?.strategy_type === strategyType,
    );

    if (relevant.length === 0) return null;

    const avgAccuracy =
      relevant.reduce((sum: number, s: any) => sum + (s.accuracy_score || 0), 0) / relevant.length;
    return avgAccuracy;
  } catch {
    return null;
  }
}

// ─── Confidence Computation ─────────────────────────────────────────────────

export function computeConfidence(
  dataPoints: number,
  assumptions: string[],
  historicalAccuracy?: number | null,
): number {
  let confidence = 0.5;

  // +0.1 per 10 data points
  confidence += Math.floor(dataPoints / 10) * 0.1;

  // -0.05 per assumption
  confidence -= assumptions.length * 0.05;

  // Adjust based on historical simulation accuracy (learning loop)
  if (historicalAccuracy != null) {
    if (historicalAccuracy >= 0.7) {
      confidence += 0.1; // boost: past predictions were accurate
    } else if (historicalAccuracy < 0.5) {
      confidence -= 0.15; // penalize: past predictions were poor
    }
  }

  // Clamp between 0.1 and 0.95
  return Math.max(0.1, Math.min(0.95, confidence));
}

// ─── Risk Computation ───────────────────────────────────────────────────────

export function computeRisk(strategyType: string, parameters: any): number {
  let risk = STRATEGY_RISK[strategyType] ?? 0.3;

  // Increase risk if custom parameters are provided (more unknowns)
  if (parameters && Object.keys(parameters).length > 0) {
    risk = Math.min(1.0, risk + 0.05 * Object.keys(parameters).length);
  }

  return Math.max(0, Math.min(1.0, risk));
}

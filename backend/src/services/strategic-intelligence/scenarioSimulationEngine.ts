// ─── Scenario Simulation Engine ──────────────────────────────────────────────
// Non-destructive what-if analysis using current metrics as baseline.
// Calculations are deterministic algebra — no LLM, no randomness.

import { getStrategicMetrics, StrategicMetrics } from './metricCollector';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScenarioInput {
  type: 'ad_spend_change' | 'conversion_lift' | 'pricing_change' | 'alignment_day_add' | 'roi_engagement_boost';
  magnitude: number; // percentage change or absolute value
}

export interface ScenarioResult {
  baseline: { revenue: number; enrollments: number; operationalLoad: number };
  projected: { revenue: number; enrollments: number; operationalLoad: number };
  delta: { revenue: number; enrollments: number; operationalLoad: number };
  riskShift: number;
  assumptions: string[];
  confidence: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PRICE_PER_ENROLLMENT = 4500;
const VISITOR_TO_LEAD_RATE = 0.03; // 3% default
const LEAD_TO_ENROLL_RATE = 0.05; // 5% default from conversion rate

// ─── Simulator ──────────────────────────────────────────────────────────────

export async function simulateScenario(scenario: ScenarioInput): Promise<ScenarioResult> {
  const metrics = await getStrategicMetrics();

  const baseline = {
    revenue: metrics.revenue.totalRevenue,
    enrollments: metrics.revenue.totalEnrollments,
    operationalLoad: metrics.operations.totalAgents,
  };

  let projected = { ...baseline };
  let riskShift = 0;
  const assumptions: string[] = [];
  let confidence = 0.7;

  const convRate = (metrics.funnel.conversionRate || 5) / 100;
  const visitorToLead = metrics.funnel.totalLeads > 0 && metrics.visitors.total > 0
    ? metrics.funnel.totalLeads / metrics.visitors.total
    : VISITOR_TO_LEAD_RATE;

  switch (scenario.type) {
    case 'ad_spend_change': {
      // More ad spend → proportional visitor increase → leads → enrollments
      const visitorLift = scenario.magnitude / 100;
      const additionalVisitors = metrics.visitors.total * visitorLift;
      const additionalLeads = additionalVisitors * visitorToLead;
      const additionalEnrollments = additionalLeads * convRate;
      const additionalRevenue = additionalEnrollments * PRICE_PER_ENROLLMENT;

      projected.revenue = baseline.revenue + additionalRevenue;
      projected.enrollments = baseline.enrollments + additionalEnrollments;
      projected.operationalLoad = baseline.operationalLoad + Math.ceil(additionalEnrollments / 10);
      riskShift = scenario.magnitude > 50 ? -5 : scenario.magnitude > 0 ? -2 : 2;

      assumptions.push(`Visitor growth proportional to ad spend change (${scenario.magnitude}%)`);
      assumptions.push(`Current visitor-to-lead rate: ${(visitorToLead * 100).toFixed(1)}%`);
      assumptions.push(`Current lead-to-enrollment rate: ${(convRate * 100).toFixed(1)}%`);
      assumptions.push(`Revenue per enrollment: $${PRICE_PER_ENROLLMENT}`);
      confidence = 0.65;
      break;
    }

    case 'conversion_lift': {
      // Improved conversion rate
      const newConvRate = convRate * (1 + scenario.magnitude / 100);
      const additionalEnrollments = metrics.funnel.totalLeads * (newConvRate - convRate);
      const additionalRevenue = additionalEnrollments * PRICE_PER_ENROLLMENT;

      projected.revenue = baseline.revenue + additionalRevenue;
      projected.enrollments = baseline.enrollments + additionalEnrollments;
      riskShift = -1;

      assumptions.push(`Conversion rate lift: ${convRate * 100}% → ${(newConvRate * 100).toFixed(1)}%`);
      assumptions.push(`Applied to current ${metrics.funnel.totalLeads} leads`);
      confidence = 0.75;
      break;
    }

    case 'pricing_change': {
      // Price change affects revenue per enrollment, may affect conversion
      const newPrice = PRICE_PER_ENROLLMENT * (1 + scenario.magnitude / 100);
      const demandElasticity = scenario.magnitude > 0 ? -0.3 : 0.2; // price up → slight demand drop
      const enrollmentShift = baseline.enrollments * (demandElasticity * scenario.magnitude / 100);

      projected.enrollments = baseline.enrollments + enrollmentShift;
      projected.revenue = projected.enrollments * newPrice;
      riskShift = Math.abs(scenario.magnitude) > 20 ? -8 : -3;

      assumptions.push(`Price change: $${PRICE_PER_ENROLLMENT} → $${newPrice.toFixed(0)}`);
      assumptions.push(`Demand elasticity factor: ${demandElasticity}`);
      confidence = 0.55;
      break;
    }

    case 'alignment_day_add': {
      // Adding alignment/strategy call days → more capacity → more meetings → more enrollments
      const currentCapacity = metrics.campaign.totalMeetings || 1;
      const additionalCapacity = Math.round(currentCapacity * (scenario.magnitude / 100));
      const meetingToEnrollRate = convRate * 2; // meetings convert at 2x lead rate
      const additionalEnrollments = additionalCapacity * meetingToEnrollRate;

      projected.enrollments = baseline.enrollments + additionalEnrollments;
      projected.revenue = projected.enrollments * PRICE_PER_ENROLLMENT;
      projected.operationalLoad = baseline.operationalLoad + Math.ceil(scenario.magnitude / 25);
      riskShift = -1;

      assumptions.push(`Additional meeting capacity: ${additionalCapacity}`);
      assumptions.push(`Meeting-to-enrollment rate: ${(meetingToEnrollRate * 100).toFixed(1)}%`);
      confidence = 0.6;
      break;
    }

    case 'roi_engagement_boost': {
      // Improved ROI page engagement → higher conversion
      const engagementMultiplier = 1 + (scenario.magnitude / 100) * 0.5; // 50% efficiency
      const newConvRate = convRate * engagementMultiplier;
      const additionalEnrollments = metrics.funnel.totalLeads * (newConvRate - convRate);

      projected.revenue = baseline.revenue + additionalEnrollments * PRICE_PER_ENROLLMENT;
      projected.enrollments = baseline.enrollments + additionalEnrollments;
      riskShift = 0;

      assumptions.push(`Engagement boost ${scenario.magnitude}% → conversion improvement at 50% efficiency`);
      assumptions.push(`Conversion: ${(convRate * 100).toFixed(1)}% → ${(newConvRate * 100).toFixed(1)}%`);
      confidence = 0.5;
      break;
    }
  }

  // Round projections
  projected.revenue = Math.round(projected.revenue);
  projected.enrollments = Math.round(projected.enrollments * 100) / 100;

  return {
    baseline,
    projected,
    delta: {
      revenue: projected.revenue - baseline.revenue,
      enrollments: projected.enrollments - baseline.enrollments,
      operationalLoad: projected.operationalLoad - baseline.operationalLoad,
    },
    riskShift,
    assumptions,
    confidence,
  };
}

// ─── Predictive Analytics Service ─────────────────────────────────────────
// Deterministic statistical models for forecasting (no ML framework dependency).

import { Enrollment, Lead, Campaign } from '../../models';
import { sequelize } from '../../config/database';
import { QueryTypes, Op } from 'sequelize';

// ─── Linear Regression Helper ─────────────────────────────────────────────

function linearRegression(data: Array<{ x: number; y: number }>): { slope: number; intercept: number; r2: number } {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const meanY = sumY / n;
  const ssRes = data.reduce((s, d) => s + Math.pow(d.y - (slope * d.x + intercept), 2), 0);
  const ssTot = data.reduce((s, d) => s + Math.pow(d.y - meanY, 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

// ─── Enrollment Forecasting ───────────────────────────────────────────────

export async function forecastEnrollments(horizonDays = 30): Promise<{
  forecast: Array<{ date: string; predicted: number }>;
  confidence: number;
  trend: 'up' | 'down' | 'flat';
}> {
  // Get daily enrollment counts for the last 90 days
  const results = await sequelize.query<any>(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM enrollments
    WHERE created_at >= NOW() - INTERVAL '90 days'
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `, { type: QueryTypes.SELECT });

  if (results.length < 7) {
    return { forecast: [], confidence: 0, trend: 'flat' };
  }

  const data = results.map((r: any, i: number) => ({ x: i, y: Number(r.count) }));
  const { slope, intercept, r2 } = linearRegression(data);

  const forecast: Array<{ date: string; predicted: number }> = [];
  const lastIndex = data.length - 1;

  for (let i = 1; i <= horizonDays; i++) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + i);
    const predicted = Math.max(0, Math.round(slope * (lastIndex + i) + intercept));
    forecast.push({ date: futureDate.toISOString().split('T')[0], predicted });
  }

  const trend = slope > 0.1 ? 'up' : slope < -0.1 ? 'down' : 'flat';

  return { forecast, confidence: Math.max(0, r2), trend };
}

// ─── Campaign ROI Forecasting ─────────────────────────────────────────────

export async function forecastCampaignROI(campaignId: string): Promise<{
  projected_roi: number;
  confidence: number;
  current_metrics: Record<string, number>;
}> {
  const results = await sequelize.query<any>(`
    SELECT
      COUNT(*) FILTER (WHERE outcome = 'sent') as sent,
      COUNT(*) FILTER (WHERE outcome = 'replied') as replied,
      COUNT(*) FILTER (WHERE outcome = 'booked_meeting') as meetings,
      COUNT(*) FILTER (WHERE outcome = 'converted') as conversions
    FROM interaction_outcomes
    WHERE campaign_id = :campaignId
  `, {
    type: QueryTypes.SELECT,
    replacements: { campaignId },
  });

  const metrics = results[0] || { sent: 0, replied: 0, meetings: 0, conversions: 0 };
  const sent = Number(metrics.sent) || 0;
  const replied = Number(metrics.replied) || 0;
  const meetings = Number(metrics.meetings) || 0;
  const conversions = Number(metrics.conversions) || 0;

  const replyRate = sent > 0 ? replied / sent : 0;
  const meetingRate = replied > 0 ? meetings / replied : 0;
  const conversionRate = meetings > 0 ? conversions / meetings : 0;

  const estimatedRevenuePerConversion = 5000;
  const projectedConversions = sent * replyRate * meetingRate * conversionRate;
  const projectedRevenue = projectedConversions * estimatedRevenuePerConversion;

  return {
    projected_roi: projectedRevenue,
    confidence: Math.min(sent / 100, 1),
    current_metrics: { sent, replied, meetings, conversions, reply_rate: replyRate, meeting_rate: meetingRate, conversion_rate: conversionRate },
  };
}

// ─── Student Risk Prediction ──────────────────────────────────────────────

export async function predictStudentRisk(enrollmentId: string): Promise<{
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  factors: string[];
}> {
  const factors: string[] = [];
  let riskScore = 0;

  // Check attendance
  const attendance = await sequelize.query<any>(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'present') as present
    FROM attendance_records
    WHERE enrollment_id = :enrollmentId
  `, { type: QueryTypes.SELECT, replacements: { enrollmentId } });

  if (attendance[0]) {
    const total = Number(attendance[0].total) || 0;
    const present = Number(attendance[0].present) || 0;
    const attendanceRate = total > 0 ? present / total : 1;
    if (attendanceRate < 0.6) { riskScore += 0.4; factors.push('Low attendance'); }
    else if (attendanceRate < 0.8) { riskScore += 0.2; factors.push('Below-average attendance'); }
  }

  // Check assignment completion
  const submissions = await sequelize.query<any>(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'completed') as completed
    FROM assignment_submissions
    WHERE enrollment_id = :enrollmentId
  `, { type: QueryTypes.SELECT, replacements: { enrollmentId } });

  if (submissions[0]) {
    const total = Number(submissions[0].total) || 0;
    const completed = Number(submissions[0].completed) || 0;
    const completionRate = total > 0 ? completed / total : 1;
    if (completionRate < 0.5) { riskScore += 0.4; factors.push('Low assignment completion'); }
    else if (completionRate < 0.7) { riskScore += 0.2; factors.push('Below-average assignment completion'); }
  }

  const riskLevel = riskScore >= 0.6 ? 'high' : riskScore >= 0.3 ? 'medium' : 'low';
  return { risk_score: Math.min(riskScore, 1), risk_level: riskLevel, factors };
}

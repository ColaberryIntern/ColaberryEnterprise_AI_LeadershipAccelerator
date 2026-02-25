import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { ICPInsight, InteractionOutcome } from '../models';

interface InsightFilter {
  dimension_type?: string;
  campaign_type?: string;
  metric_name?: string;
  min_sample_size?: number;
  period_days?: number;
}

interface TargetingRecommendation {
  dimension_type: string;
  dimension_value: string;
  metric_name: string;
  metric_value: number;
  sample_size: number;
  confidence: number;
  rank: number;
}

/**
 * Wilson score interval lower bound — gives a confidence-adjusted rate.
 * High sample sizes with good rates score highest. Low samples get penalized.
 */
function wilsonScore(successes: number, total: number, z: number = 1.96): number {
  if (total === 0) return 0;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return (center - spread) / denominator;
}

/** Compute aggregated ICP insights from InteractionOutcome data */
export async function computeInsights(periodDays: number = 90): Promise<number> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

  // Outcome types that count as "positive"
  const positiveOutcomes: Record<string, string[]> = {
    response_rate: ['replied', 'clicked', 'booked_meeting', 'converted', 'answered'],
    booking_rate: ['booked_meeting', 'converted'],
    open_rate: ['opened', 'clicked', 'replied', 'booked_meeting', 'converted'],
    conversion_rate: ['converted'],
  };

  const dimensions: Array<{ type: string; column: string }> = [
    { type: 'industry', column: 'lead_industry' },
    { type: 'title_category', column: 'lead_title_category' },
    { type: 'company_size', column: 'lead_company_size_bucket' },
    { type: 'source_type', column: 'lead_source_type' },
  ];

  const campaignTypes = ['all', 'cold_outbound', 'warm_nurture'];

  let insightsCreated = 0;

  for (const dim of dimensions) {
    for (const ct of campaignTypes) {
      // Build WHERE clause
      const whereClause = ct === 'all'
        ? `WHERE io.created_at >= :periodStart AND io.created_at <= :periodEnd AND io.${dim.column} IS NOT NULL AND io.${dim.column} != 'unknown'`
        : `WHERE io.created_at >= :periodStart AND io.created_at <= :periodEnd AND io.${dim.column} IS NOT NULL AND io.${dim.column} != 'unknown' AND c.type = :campaignType`;

      const joinClause = ct === 'all'
        ? ''
        : 'LEFT JOIN campaigns c ON io.campaign_id = c.id';

      // Get totals per dimension value
      const totalsQuery = `
        SELECT io.${dim.column} as dim_value, COUNT(*) as total
        FROM interaction_outcomes io
        ${joinClause}
        ${whereClause}
        GROUP BY io.${dim.column}
        HAVING COUNT(*) >= 5
      `;

      const totals: any[] = await sequelize.query(totalsQuery, {
        replacements: { periodStart, periodEnd, campaignType: ct },
        type: QueryTypes.SELECT,
      });

      if (totals.length === 0) continue;

      for (const metricName of Object.keys(positiveOutcomes)) {
        const successOutcomes = positiveOutcomes[metricName];
        const outcomePlaceholders = successOutcomes.map((_, i) => `:outcome${i}`).join(',');
        const outcomeReplacements: Record<string, string> = {};
        successOutcomes.forEach((o, i) => { outcomeReplacements[`outcome${i}`] = o; });

        // Get success counts per dimension value
        const successQuery = `
          SELECT io.${dim.column} as dim_value, COUNT(*) as successes
          FROM interaction_outcomes io
          ${joinClause}
          ${whereClause}
          AND io.outcome IN (${outcomePlaceholders})
          GROUP BY io.${dim.column}
        `;

        const successes: any[] = await sequelize.query(successQuery, {
          replacements: { periodStart, periodEnd, campaignType: ct, ...outcomeReplacements },
          type: QueryTypes.SELECT,
        });

        const successMap: Record<string, number> = {};
        for (const s of successes) {
          successMap[s.dim_value] = parseInt(s.successes, 10);
        }

        for (const t of totals) {
          const dimValue = t.dim_value;
          const total = parseInt(t.total, 10);
          const succ = successMap[dimValue] || 0;
          const rate = total > 0 ? succ / total : 0;
          const confidence = wilsonScore(succ, total);

          // Upsert the insight
          const [insight, created] = await ICPInsight.findOrCreate({
            where: {
              dimension_type: dim.type,
              dimension_value: dimValue,
              campaign_type: ct,
              metric_name: metricName,
              period_start: periodStart,
              period_end: periodEnd,
            },
            defaults: {
              dimension_type: dim.type,
              dimension_value: dimValue,
              campaign_type: ct,
              metric_name: metricName,
              period_start: periodStart,
              period_end: periodEnd,
              metric_value: rate,
              sample_size: total,
              confidence,
              computed_at: new Date(),
              metadata: { successes: succ },
            },
          });

          if (!created) {
            await insight.update({
              metric_value: rate,
              sample_size: total,
              confidence,
              computed_at: new Date(),
              metadata: { successes: succ },
            });
          }

          insightsCreated++;
        }
      }
    }
  }

  // Cross-dimensional: industry × title_category
  for (const ct of campaignTypes) {
    const joinClause = ct === 'all' ? '' : 'LEFT JOIN campaigns c ON io.campaign_id = c.id';
    const whereClause = ct === 'all'
      ? `WHERE io.created_at >= :periodStart AND io.created_at <= :periodEnd AND io.lead_industry IS NOT NULL AND io.lead_industry != 'unknown' AND io.lead_title_category IS NOT NULL AND io.lead_title_category != 'unknown'`
      : `WHERE io.created_at >= :periodStart AND io.created_at <= :periodEnd AND io.lead_industry IS NOT NULL AND io.lead_industry != 'unknown' AND io.lead_title_category IS NOT NULL AND io.lead_title_category != 'unknown' AND c.type = :campaignType`;

    const crossTotals: any[] = await sequelize.query(`
      SELECT io.lead_industry || '::' || io.lead_title_category as dim_value, COUNT(*) as total
      FROM interaction_outcomes io
      ${joinClause}
      ${whereClause}
      GROUP BY io.lead_industry, io.lead_title_category
      HAVING COUNT(*) >= 3
    `, {
      replacements: { periodStart, periodEnd, campaignType: ct },
      type: QueryTypes.SELECT,
    });

    if (crossTotals.length === 0) continue;

    const responseOutcomes = positiveOutcomes.response_rate;
    const outcomePlaceholders = responseOutcomes.map((_, i) => `:outcome${i}`).join(',');
    const outcomeReplacements: Record<string, string> = {};
    responseOutcomes.forEach((o, i) => { outcomeReplacements[`outcome${i}`] = o; });

    const crossSuccesses: any[] = await sequelize.query(`
      SELECT io.lead_industry || '::' || io.lead_title_category as dim_value, COUNT(*) as successes
      FROM interaction_outcomes io
      ${joinClause}
      ${whereClause}
      AND io.outcome IN (${outcomePlaceholders})
      GROUP BY io.lead_industry, io.lead_title_category
    `, {
      replacements: { periodStart, periodEnd, campaignType: ct, ...outcomeReplacements },
      type: QueryTypes.SELECT,
    });

    const successMap: Record<string, number> = {};
    for (const s of crossSuccesses) {
      successMap[s.dim_value] = parseInt(s.successes, 10);
    }

    for (const t of crossTotals) {
      const total = parseInt(t.total, 10);
      const succ = successMap[t.dim_value] || 0;
      const rate = total > 0 ? succ / total : 0;
      const confidence = wilsonScore(succ, total);

      const [insight, created] = await ICPInsight.findOrCreate({
        where: {
          dimension_type: 'industry_x_title',
          dimension_value: t.dim_value,
          campaign_type: ct,
          metric_name: 'response_rate',
          period_start: periodStart,
          period_end: periodEnd,
        },
        defaults: {
          dimension_type: 'industry_x_title',
          dimension_value: t.dim_value,
          campaign_type: ct,
          metric_name: 'response_rate',
          period_start: periodStart,
          period_end: periodEnd,
          metric_value: rate,
          sample_size: total,
          confidence,
          computed_at: new Date(),
          metadata: { successes: succ },
        },
      });

      if (!created) {
        await insight.update({
          metric_value: rate,
          sample_size: total,
          confidence,
          computed_at: new Date(),
          metadata: { successes: succ },
        });
      }

      insightsCreated++;
    }
  }

  console.log(`[ICPInsight] Computed ${insightsCreated} insights for ${periodDays}-day period`);
  return insightsCreated;
}

/** Query insights with optional filters */
export async function getInsights(filters: InsightFilter = {}): Promise<any[]> {
  const where: Record<string, any> = {};

  if (filters.dimension_type) where.dimension_type = filters.dimension_type;
  if (filters.campaign_type) where.campaign_type = filters.campaign_type;
  if (filters.metric_name) where.metric_name = filters.metric_name;
  if (filters.min_sample_size) {
    where.sample_size = { [Op.gte]: filters.min_sample_size };
  }

  // Default to most recent computation
  const insights = await ICPInsight.findAll({
    where,
    order: [['confidence', 'DESC'], ['sample_size', 'DESC']],
    limit: 200,
  });

  return insights;
}

/** Get targeting recommendations ranked by confidence-adjusted performance */
export async function getTargetingRecommendations(
  campaignType: string = 'all',
  metricName: string = 'response_rate',
  minSampleSize: number = 5,
): Promise<TargetingRecommendation[]> {
  const insights = await ICPInsight.findAll({
    where: {
      campaign_type: campaignType,
      metric_name: metricName,
      sample_size: { [Op.gte]: minSampleSize },
    },
    order: [['confidence', 'DESC']],
    limit: 20,
  });

  return insights.map((insight, index) => ({
    dimension_type: insight.dimension_type,
    dimension_value: insight.dimension_value,
    metric_name: insight.metric_name,
    metric_value: parseFloat(String(insight.metric_value)),
    sample_size: insight.sample_size,
    confidence: parseFloat(String(insight.confidence)),
    rank: index + 1,
  }));
}

/** Get a summary of all dimensions with their top-performing values */
export async function getInsightSummary(campaignType: string = 'all'): Promise<Record<string, any>> {
  const dimensions = ['industry', 'title_category', 'company_size', 'source_type', 'industry_x_title'];
  const metrics = ['response_rate', 'booking_rate', 'open_rate', 'conversion_rate'];
  const summary: Record<string, any> = {};

  for (const dim of dimensions) {
    summary[dim] = {};
    for (const metric of metrics) {
      const insights = await ICPInsight.findAll({
        where: {
          dimension_type: dim,
          campaign_type: campaignType,
          metric_name: metric,
          sample_size: { [Op.gte]: 3 },
        },
        order: [['confidence', 'DESC']],
        limit: 5,
      });

      summary[dim][metric] = insights.map((i) => ({
        value: i.dimension_value,
        rate: parseFloat(String(i.metric_value)),
        sample_size: i.sample_size,
        confidence: parseFloat(String(i.confidence)),
      }));
    }
  }

  // Overall stats
  const totalOutcomes = await InteractionOutcome.count();
  const recentOutcomes = await InteractionOutcome.count({
    where: {
      created_at: { [Op.gte]: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
  });

  summary._stats = {
    total_outcomes: totalOutcomes,
    recent_outcomes_90d: recentOutcomes,
    last_computed: await ICPInsight.max('computed_at'),
  };

  return summary;
}

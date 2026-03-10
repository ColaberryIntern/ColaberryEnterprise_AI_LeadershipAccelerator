import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import DatasetRegistry from '../../models/DatasetRegistry';
import SystemProcess from '../../models/SystemProcess';
import { Op } from 'sequelize';

interface QueryResponse {
  question: string;
  intent: string;
  narrative: string;
  data: Record<string, any>;
  visualizations: Array<{
    chart_type: string;
    title: string;
    data: Record<string, any>[];
    config: Record<string, any>;
  }>;
  follow_ups: string[];
  sources: string[];
  execution_path: string;
}

interface TableCount {
  table_name: string;
  count: string;
}

async function safeCount(tableName: string): Promise<number> {
  try {
    const [result] = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM "${tableName}"`,
      { type: QueryTypes.SELECT }
    );
    return Number(result?.count) || 0;
  } catch {
    return 0;
  }
}

async function safeGroupCount(
  tableName: string,
  groupCol: string
): Promise<Record<string, number>> {
  try {
    const rows = await sequelize.query<{ group_val: string; count: string }>(
      `SELECT COALESCE("${groupCol}"::text, 'unknown') as group_val, COUNT(*) as count
       FROM "${tableName}"
       GROUP BY "${groupCol}"
       ORDER BY count DESC
       LIMIT 10`,
      { type: QueryTypes.SELECT }
    );
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.group_val] = Number(row.count) || 0;
    }
    return result;
  } catch {
    return {};
  }
}

export async function generateLocalSummary(): Promise<QueryResponse> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Gather metrics from real business tables
  const [
    leadCount,
    enrollmentCount,
    campaignCount,
    cohortCount,
    datasetCount,
    processCount24h,
    leadsByStage,
    campaignsByStatus,
  ] = await Promise.all([
    safeCount('leads'),
    safeCount('enrollments'),
    safeCount('campaigns'),
    safeCount('cohorts'),
    DatasetRegistry.count(),
    SystemProcess.count({ where: { created_at: { [Op.gte]: oneDayAgo } } }),
    safeGroupCount('leads', 'pipeline_stage'),
    safeGroupCount('campaigns', 'status'),
  ]);

  const activeCampaigns = campaignsByStage?.['active'] || campaignsByStage?.['Active'] || 0;

  // Build narrative
  const parts: string[] = [];
  parts.push(`The system currently manages ${leadCount.toLocaleString()} leads across ${Object.keys(leadsByStage).length} pipeline stages.`);

  if (enrollmentCount > 0) {
    parts.push(`There are ${enrollmentCount.toLocaleString()} enrollments across ${cohortCount} cohorts.`);
  }

  if (campaignCount > 0) {
    parts.push(`${campaignCount} campaigns configured (${activeCampaigns} active).`);
  }

  parts.push(`Intelligence has discovered ${datasetCount} database tables.`);
  parts.push(`${processCount24h} system processes recorded in the last 24 hours.`);

  // Build visualizations
  const visualizations: QueryResponse['visualizations'] = [];

  if (Object.keys(leadsByStage).length > 0) {
    visualizations.push({
      chart_type: 'bar',
      title: 'Leads by Pipeline Stage',
      data: Object.entries(leadsByStage).map(([stage, count]) => ({
        label: stage || 'Unknown',
        value: count,
      })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }

  if (Object.keys(campaignsByStatus).length > 0) {
    visualizations.push({
      chart_type: 'bar',
      title: 'Campaigns by Status',
      data: Object.entries(campaignsByStatus).map(([status, count]) => ({
        label: status || 'Unknown',
        value: count,
      })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }

  return {
    question: 'Executive Summary',
    intent: 'executive_summary',
    narrative: parts.join(' '),
    data: {
      leads: { total: leadCount, by_stage: leadsByStage },
      enrollments: { total: enrollmentCount },
      campaigns: { total: campaignCount, by_status: campaignsByStatus },
      cohorts: { total: cohortCount },
      datasets: { total: datasetCount },
      processes_24h: processCount24h,
    },
    visualizations,
    follow_ups: [
      'Show me lead conversion trends',
      'Which campaigns are performing best?',
      'What are the top anomalies?',
      'Forecast enrollments for next 30 days',
    ],
    sources: ['leads', 'enrollments', 'campaigns', 'cohorts', 'dataset_registry', 'system_processes'],
    execution_path: 'local_aggregate → format',
  };
}

// Alias used by type declarations
const campaignsByStage: Record<string, number> = {};

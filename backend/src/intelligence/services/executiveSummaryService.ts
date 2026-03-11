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

export async function generateLocalSummary(entityType?: string): Promise<QueryResponse> {
  // Entity-specific summaries
  if (entityType && entityType !== 'global') {
    return generateEntitySummary(entityType);
  }

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

  const activeCampaigns = campaignsByStatus?.['active'] || campaignsByStatus?.['Active'] || 0;

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

// ─── Entity-Specific Executive Summaries ─────────────────────────────────────

async function generateEntitySummary(entityType: string): Promise<QueryResponse> {
  switch (entityType) {
    case 'campaigns': return generateCampaignSummary();
    case 'leads': return generateLeadSummary();
    case 'students': return generateStudentSummary();
    case 'agents': return generateAgentSummary();
    default: return generateLocalSummary(); // fallback to global
  }
}

async function generateCampaignSummary(): Promise<QueryResponse> {
  const [
    totalCampaigns,
    campaignsByStatus,
    campaignsByType,
    leadCount,
    errorCount,
  ] = await Promise.all([
    safeCount('campaigns'),
    safeGroupCount('campaigns', 'status'),
    safeGroupCount('campaigns', 'campaign_type'),
    safeCount('leads'),
    safeCount('campaign_errors'),
  ]);

  const active = campaignsByStatus?.['active'] || campaignsByStatus?.['Active'] || 0;
  const parts: string[] = [];
  parts.push(`There are ${totalCampaigns} campaigns (${active} active).`);
  if (leadCount > 0) parts.push(`Campaigns have generated ${leadCount.toLocaleString()} total leads.`);
  if (errorCount > 0) parts.push(`${errorCount} campaign errors recorded.`);
  if (Object.keys(campaignsByType).length > 0) {
    const topType = Object.entries(campaignsByType).sort((a, b) => b[1] - a[1])[0];
    parts.push(`Most common type: ${topType[0]} (${topType[1]} campaigns).`);
  }

  const visualizations: QueryResponse['visualizations'] = [];
  if (Object.keys(campaignsByStatus).length > 0) {
    visualizations.push({
      chart_type: 'bar',
      title: 'Campaigns by Status',
      data: Object.entries(campaignsByStatus).map(([label, value]) => ({ label, value })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }
  if (Object.keys(campaignsByType).length > 0) {
    visualizations.push({
      chart_type: 'bar',
      title: 'Campaigns by Type',
      data: Object.entries(campaignsByType).map(([label, value]) => ({ label, value })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }

  return {
    question: 'Campaign Executive Summary',
    intent: 'executive_summary',
    narrative: parts.join(' '),
    data: { entity: 'campaigns', total: totalCampaigns, by_status: campaignsByStatus, by_type: campaignsByType, leads: leadCount, errors: errorCount },
    visualizations,
    follow_ups: ['Which campaigns have the highest error rate?', 'Show campaign conversion funnel', 'What campaigns are underperforming?'],
    sources: ['campaigns', 'leads', 'campaign_errors'],
    execution_path: 'local_aggregate → campaigns → format',
  };
}

async function generateLeadSummary(): Promise<QueryResponse> {
  const [
    totalLeads,
    leadsByStage,
    leadsBySource,
    leadsByTemperature,
  ] = await Promise.all([
    safeCount('leads'),
    safeGroupCount('leads', 'pipeline_stage'),
    safeGroupCount('leads', 'source'),
    safeGroupCount('leads', 'temperature'),
  ]);

  const parts: string[] = [];
  parts.push(`There are ${totalLeads.toLocaleString()} leads across ${Object.keys(leadsByStage).length} pipeline stages.`);
  if (Object.keys(leadsBySource).length > 0) {
    const topSource = Object.entries(leadsBySource).sort((a, b) => b[1] - a[1])[0];
    parts.push(`Top lead source: ${topSource[0]} (${topSource[1]} leads).`);
  }
  if (Object.keys(leadsByTemperature).length > 0) {
    const hot = leadsByTemperature?.['hot'] || leadsByTemperature?.['Hot'] || 0;
    parts.push(`${hot} hot leads in pipeline.`);
  }

  const visualizations: QueryResponse['visualizations'] = [];
  if (Object.keys(leadsByStage).length > 0) {
    visualizations.push({
      chart_type: 'bar',
      title: 'Leads by Pipeline Stage',
      data: Object.entries(leadsByStage).map(([label, value]) => ({ label, value })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }
  if (Object.keys(leadsBySource).length > 0) {
    visualizations.push({
      chart_type: 'bar',
      title: 'Leads by Source',
      data: Object.entries(leadsBySource).map(([label, value]) => ({ label, value })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }

  return {
    question: 'Lead Pipeline Summary',
    intent: 'executive_summary',
    narrative: parts.join(' '),
    data: { entity: 'leads', total: totalLeads, by_stage: leadsByStage, by_source: leadsBySource, by_temperature: leadsByTemperature },
    visualizations,
    follow_ups: ['Which leads are most likely to convert?', 'Show lead temperature distribution', 'What is the conversion rate by source?'],
    sources: ['leads'],
    execution_path: 'local_aggregate → leads → format',
  };
}

async function generateStudentSummary(): Promise<QueryResponse> {
  const [
    enrollmentCount,
    cohortCount,
    enrollmentsByStatus,
    attendanceCount,
  ] = await Promise.all([
    safeCount('enrollments'),
    safeCount('cohorts'),
    safeGroupCount('enrollments', 'status'),
    safeCount('attendance_records'),
  ]);

  const active = enrollmentsByStatus?.['active'] || enrollmentsByStatus?.['Active'] || 0;
  const parts: string[] = [];
  parts.push(`There are ${enrollmentCount.toLocaleString()} enrollments across ${cohortCount} cohorts.`);
  parts.push(`${active} currently active students.`);
  if (attendanceCount > 0) parts.push(`${attendanceCount.toLocaleString()} attendance records tracked.`);

  const visualizations: QueryResponse['visualizations'] = [];
  if (Object.keys(enrollmentsByStatus).length > 0) {
    visualizations.push({
      chart_type: 'bar',
      title: 'Enrollments by Status',
      data: Object.entries(enrollmentsByStatus).map(([label, value]) => ({ label, value })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }

  return {
    question: 'Student & Enrollment Summary',
    intent: 'executive_summary',
    narrative: parts.join(' '),
    data: { entity: 'students', enrollments: enrollmentCount, cohorts: cohortCount, by_status: enrollmentsByStatus, attendance_records: attendanceCount },
    visualizations,
    follow_ups: ['What is the average completion rate?', 'Which students are at dropout risk?', 'Show cohort distribution'],
    sources: ['enrollments', 'cohorts', 'attendance_records'],
    execution_path: 'local_aggregate → students → format',
  };
}

async function generateAgentSummary(): Promise<QueryResponse> {
  const [
    agentCount,
    agentsByStatus,
    activityCount,
    errorsByAgent,
  ] = await Promise.all([
    safeCount('ai_agents'),
    safeGroupCount('ai_agents', 'status'),
    safeCount('ai_agent_activity_logs'),
    safeGroupCount('ai_agent_activity_logs', 'status'),
  ]);

  const running = agentsByStatus?.['running'] || agentsByStatus?.['Running'] || 0;
  const errored = agentsByStatus?.['error'] || agentsByStatus?.['Error'] || agentsByStatus?.['errored'] || 0;
  const parts: string[] = [];
  parts.push(`There are ${agentCount} AI agents (${running} running, ${errored} errored).`);
  parts.push(`${activityCount.toLocaleString()} total agent activity logs recorded.`);
  if (Object.keys(errorsByAgent).length > 0) {
    const errorRate = errorsByAgent?.['error'] || errorsByAgent?.['Error'] || 0;
    if (errorRate > 0 && activityCount > 0) {
      parts.push(`Error rate: ${((errorRate / activityCount) * 100).toFixed(1)}%.`);
    }
  }

  const visualizations: QueryResponse['visualizations'] = [];
  if (Object.keys(agentsByStatus).length > 0) {
    visualizations.push({
      chart_type: 'bar',
      title: 'Agents by Status',
      data: Object.entries(agentsByStatus).map(([label, value]) => ({ label, value })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }

  return {
    question: 'AI Agent Summary',
    intent: 'executive_summary',
    narrative: parts.join(' '),
    data: { entity: 'agents', total: agentCount, by_status: agentsByStatus, activity_logs: activityCount },
    visualizations,
    follow_ups: ['Which agents have the most errors?', 'Show automation impact metrics', 'What is the agent execution frequency?'],
    sources: ['ai_agents', 'ai_agent_activity_logs'],
    execution_path: 'local_aggregate → agents → format',
  };
}

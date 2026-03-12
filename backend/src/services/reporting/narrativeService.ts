// ─── Narrative Service ────────────────────────────────────────────────────
// Converts data insights into human-readable explanations.
// Powers Cory explain, research, and recommend modes.

import { ReportingInsight, KPISnapshot } from '../../models';
import { getNodeWithRelationships } from './coryKnowledgeGraphService';

// ─── Insight Narrative ────────────────────────────────────────────────────

export async function generateNarrative(insight: any): Promise<string> {
  const parts: string[] = [];

  parts.push(`**${insight.title}**`);
  parts.push('');

  if (insight.narrative) {
    parts.push(insight.narrative);
  } else {
    parts.push(`This ${insight.insight_type} was detected by ${insight.source_agent}.`);
  }

  parts.push('');
  parts.push(`**Confidence:** ${(insight.confidence * 100).toFixed(0)}% | **Impact:** ${(insight.impact * 100).toFixed(0)}% | **Urgency:** ${(insight.urgency * 100).toFixed(0)}%`);

  if (insight.evidence) {
    parts.push('');
    parts.push('**Evidence:**');
    for (const [key, value] of Object.entries(insight.evidence)) {
      parts.push(`- ${key.replace(/_/g, ' ')}: ${value}`);
    }
  }

  if (insight.recommendations) {
    parts.push('');
    parts.push('**Recommendations:**');
    const recs = insight.recommendations;
    if (typeof recs === 'object') {
      for (const [key, value] of Object.entries(recs)) {
        parts.push(`- ${key.replace(/_/g, ' ')}: ${value}`);
      }
    }
  }

  return parts.join('\n');
}

// ─── Executive Summary ────────────────────────────────────────────────────

export async function generateExecutiveSummary(
  insights: any[],
  kpis: Record<string, any>,
): Promise<string> {
  const parts: string[] = [];

  parts.push('# Executive Intelligence Briefing');
  parts.push('');
  parts.push(`Generated: ${new Date().toISOString().split('T')[0]}`);
  parts.push('');

  // KPI Summary
  parts.push('## Department KPIs');
  parts.push('');
  for (const [dept, data] of Object.entries(kpis)) {
    if (!data) continue;
    const metrics = (data as any).metrics || {};
    const metricSummary = Object.entries(metrics)
      .slice(0, 3)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join(', ');
    parts.push(`- **${dept}**: ${metricSummary || 'No data'}`);
  }

  // Top Insights
  if (insights.length > 0) {
    parts.push('');
    parts.push('## Top Insights');
    parts.push('');
    for (const insight of insights.slice(0, 5)) {
      const severity = insight.alert_severity === 'critical' ? '🔴' :
        insight.alert_severity === 'warning' ? '🟡' :
        insight.alert_severity === 'opportunity' ? '🟢' : '🔵';
      parts.push(`${severity} **${insight.title}** (Score: ${(insight.final_score * 100).toFixed(0)}%)`);
    }
  }

  return parts.join('\n');
}

// ─── Department Narrative ─────────────────────────────────────────────────

export async function generateDepartmentNarrative(department: string, snapshot: any): Promise<string> {
  const parts: string[] = [];
  const metrics = snapshot?.metrics || {};
  const deltas = snapshot?.deltas || {};

  parts.push(`## ${department.replace(/_/g, ' ')} Department Report`);
  parts.push('');
  parts.push(`Report Date: ${snapshot?.snapshot_date || new Date().toISOString().split('T')[0]}`);
  parts.push('');

  for (const [key, value] of Object.entries(metrics)) {
    const delta = deltas[key];
    const deltaStr = typeof delta === 'number' && delta !== 0
      ? ` (${delta > 0 ? '+' : ''}${(delta as number).toFixed(1)}%)`
      : '';
    parts.push(`- **${key.replace(/_/g, ' ')}**: ${value}${deltaStr}`);
  }

  return parts.join('\n');
}

// ─── Cory Chart Explanation ───────────────────────────────────────────────

export async function explainChart(chartData: any, chartType: string, title: string): Promise<string> {
  const parts: string[] = [];

  parts.push(`**Chart Analysis: ${title}**`);
  parts.push('');
  parts.push(`Chart Type: ${chartType}`);
  parts.push('');

  if (Array.isArray(chartData) && chartData.length > 0) {
    const keys = Object.keys(chartData[0]).filter(k => typeof chartData[0][k] === 'number');
    for (const key of keys) {
      const values = chartData.map((d: any) => d[key]).filter((v: any) => typeof v === 'number');
      if (values.length > 0) {
        const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        parts.push(`**${key.replace(/_/g, ' ')}**: avg ${avg.toFixed(1)}, range ${min.toFixed(1)}-${max.toFixed(1)}`);
      }
    }
  }

  return parts.join('\n');
}

// ─── Cory Research Mode ───────────────────────────────────────────────────

export async function researchEntity(entityType: string, entityId: string, question?: string): Promise<string> {
  const parts: string[] = [];

  const nodeData = await getNodeWithRelationships(entityType, entityId);
  if (!nodeData) {
    return `No knowledge graph data found for ${entityType} ${entityId}.`;
  }

  parts.push(`**Research: ${nodeData.node.entity_name}**`);
  parts.push('');
  parts.push(`Type: ${entityType} | ID: ${entityId}`);
  parts.push('');

  if (nodeData.related.length > 0) {
    parts.push(`**Connected Entities (${nodeData.related.length}):**`);
    for (const rel of nodeData.related.slice(0, 10)) {
      parts.push(`- ${rel.label} (${rel.metadata?.node_type || 'entity'})`);
    }
  }

  // Get relevant insights
  const insights = await ReportingInsight.findAll({
    where: { entity_type: entityType, entity_id: entityId },
    order: [['final_score', 'DESC']],
    limit: 5,
    raw: true,
  });

  if (insights.length > 0) {
    parts.push('');
    parts.push('**Related Insights:**');
    for (const i of insights) {
      parts.push(`- ${(i as any).title} (Score: ${((i as any).final_score * 100).toFixed(0)}%)`);
    }
  }

  return parts.join('\n');
}

// ─── Cory Recommend Mode ──────────────────────────────────────────────────

export async function recommendActions(insightId: string): Promise<string> {
  const insight = await ReportingInsight.findByPk(insightId, { raw: true });
  if (!insight) return 'Insight not found.';

  const parts: string[] = [];

  parts.push(`**Recommendations for: ${(insight as any).title}**`);
  parts.push('');

  const recs = (insight as any).recommendations;
  if (recs && typeof recs === 'object') {
    for (const [key, value] of Object.entries(recs)) {
      parts.push(`- **${key.replace(/_/g, ' ')}**: ${value}`);
    }
  } else {
    // Generate basic recommendations based on insight type
    switch ((insight as any).insight_type) {
      case 'anomaly':
        parts.push('- Investigate the root cause of this anomaly');
        parts.push('- Review recent changes that may have caused the shift');
        parts.push('- Set up monitoring alerts for this metric');
        break;
      case 'opportunity':
        parts.push('- Prioritize this opportunity for immediate action');
        parts.push('- Assign a team member to validate the opportunity');
        parts.push('- Create an experiment to test the approach');
        break;
      case 'risk':
        parts.push('- Immediately assess the impact scope');
        parts.push('- Create a mitigation plan');
        parts.push('- Escalate to leadership if severity is high');
        break;
      default:
        parts.push('- Review the evidence and validate findings');
        parts.push('- Consider creating an experiment to test improvements');
    }
  }

  return parts.join('\n');
}

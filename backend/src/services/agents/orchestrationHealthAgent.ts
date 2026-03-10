import OrchestrationHealth from '../../models/OrchestrationHealth';
import { generateHealthReport } from '../healthReportService';
import { logAiEvent } from '../aiEventService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'OrchestrationHealthAgent';

// Scoring: start at 100, subtract per finding severity
const SEVERITY_PENALTY: Record<string, number> = {
  critical: 25,
  warning: 10,
  info: 2,
};

// Map finding categories to component keys
const CATEGORY_TO_COMPONENT: Record<string, string> = {
  Curriculum: 'curriculum',
  Prompts: 'prompts',
  Skills: 'prompts',
  Backfill: 'prompts',
  Pipeline: 'students',
  Integrity: 'gating',
};

function computeHealthScore(findings: Array<{ severity: string; category: string; message: string; count?: number }>): {
  score: number;
  componentScores: Record<string, number>;
} {
  const componentPenalties: Record<string, number> = {
    curriculum: 0,
    prompts: 0,
    artifacts: 0,
    students: 0,
    gating: 0,
  };

  let totalPenalty = 0;

  for (const f of findings) {
    const penalty = SEVERITY_PENALTY[f.severity] || 0;
    totalPenalty += penalty;
    const component = CATEGORY_TO_COMPONENT[f.category] || 'gating';
    componentPenalties[component] += penalty;
  }

  const score = Math.max(0, 100 - totalPenalty);
  const componentScores: Record<string, number> = {};
  for (const [key, penalty] of Object.entries(componentPenalties)) {
    componentScores[key] = Math.max(0, 100 - penalty);
  }

  return { score, componentScores };
}

export async function runOrchestrationHealthAgent(
  agentId: string,
  _config: Record<string, any> = {},
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Reuse existing health report generator
    const report = await generateHealthReport();
    const { score, componentScores } = computeHealthScore(report.findings);

    // Store time-series snapshot
    await OrchestrationHealth.create({
      scan_timestamp: new Date(),
      health_score: score,
      status: report.status,
      component_scores: componentScores,
      findings: report.findings,
      agent_id: agentId,
      duration_ms: Date.now() - startTime,
    });

    // Check for status change from previous snapshot
    const previousSnapshot = await OrchestrationHealth.findOne({
      where: { agent_id: agentId },
      order: [['scan_timestamp', 'DESC']],
      offset: 1, // skip the one we just created
    });

    if (previousSnapshot && previousSnapshot.status !== report.status) {
      await logAiEvent(
        'orchestration_health',
        'status_change',
        'orchestration',
        'system',
        {
          previous_status: previousSnapshot.status,
          new_status: report.status,
          health_score: score,
          findings_count: report.findings.length,
        },
      );
    }

    // Record findings as actions for the activity log
    for (const finding of report.findings) {
      actions.push({
        campaign_id: 'orchestration',
        action: `finding_${finding.severity}`,
        reason: `[${finding.category}] ${finding.message}`,
        confidence: 1.0,
        before_state: null,
        after_state: { severity: finding.severity, count: finding.count },
        result: 'success',
      });
    }
  } catch (err: any) {
    errors.push(`${AGENT_NAME} failed: ${err.message}`);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 1,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}

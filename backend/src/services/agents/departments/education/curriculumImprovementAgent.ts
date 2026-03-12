import { Op } from 'sequelize';
import { CurriculumModule, CurriculumLesson, Enrollment } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptCurriculumImprovementAgent';

export async function runDeptCurriculumImprovementAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Analyze curriculum modules for improvement signals
    const modules = await CurriculumModule.findAll({ limit: 100 });
    entitiesProcessed = modules.length;

    const moduleInsights: Array<{ module: string; lessons: number; suggestion: string }> = [];

    for (const mod of modules) {
      const m = mod as any;
      const lessonCount = await CurriculumLesson.count({
        where: { module_id: m.id },
      });

      if (lessonCount === 0) {
        moduleInsights.push({
          module: m.title || m.name || m.id,
          lessons: 0,
          suggestion: 'Module has no lessons — needs content development',
        });
      } else if (lessonCount < 3) {
        moduleInsights.push({
          module: m.title || m.name || m.id,
          lessons: lessonCount,
          suggestion: 'Module has few lessons — consider expanding coverage',
        });
      }
    }

    // Check enrollment trends
    const totalEnrollments = await Enrollment.count();

    const recommendations: string[] = [];
    if (moduleInsights.length > 0) {
      recommendations.push(`${moduleInsights.length} modules need attention`);
    }
    recommendations.push(`Total curriculum modules: ${entitiesProcessed}, Total enrollments: ${totalEnrollments}`);

    actions.push({
      campaign_id: '',
      action: 'curriculum_analysis',
      reason: `Analyzed ${entitiesProcessed} curriculum modules`,
      confidence: 0.80,
      before_state: null,
      after_state: {
        modules_analyzed: entitiesProcessed,
        issues_found: moduleInsights.length,
        module_insights: moduleInsights,
        total_enrollments: totalEnrollments,
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'curriculum_analysis',
      result: 'success',
      details: { modules: entitiesProcessed, issues: moduleInsights.length },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: entitiesProcessed,
  };
}

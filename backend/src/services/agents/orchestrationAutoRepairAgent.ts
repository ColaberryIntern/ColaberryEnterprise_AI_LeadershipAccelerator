import { Op } from 'sequelize';
import { MiniSection, PromptTemplate, ArtifactDefinition, AiSystemEvent } from '../../models';
import { logAgentActivity, logAiEvent } from '../aiEventService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'OrchestrationAutoRepairAgent';

const SAFE_REPAIR_TYPES = new Set([
  'inactive_prompt_reactivation',
  'broken_fk_nullification',
]);

export async function runOrchestrationAutoRepairAgent(
  agentId: string,
  config: Record<string, any> = {},
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxRepairs = config.max_repairs_per_run || 10;
  let repairCount = 0;

  try {
    // Read recent findings from monitoring agents (last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentFindings = await AiSystemEvent.findAll({
      where: {
        source: { [Op.in]: ['orchestration_health', 'student_progress_monitor', 'prompt_monitor'] },
        created_at: { [Op.gte]: tenMinutesAgo },
        event_type: { [Op.in]: [
          'inactive_prompt_referenced',
          'broken_prompt_fk',
          'broken_artifact_prompt_fk',
        ] },
      },
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    for (const finding of recentFindings) {
      if (repairCount >= maxRepairs) break;

      const details = (finding as any).details || {};
      const eventType = (finding as any).event_type;

      // Repair: re-activate inactive prompts
      if (eventType === 'inactive_prompt_referenced' && SAFE_REPAIR_TYPES.has('inactive_prompt_reactivation')) {
        const promptId = details.prompt_id || (finding as any).entity_id;
        if (!promptId) continue;

        const prompt = await PromptTemplate.findByPk(promptId);
        if (!prompt || (prompt as any).is_active) continue;

        const beforeState = { is_active: false, prompt_id: promptId, name: (prompt as any).name };
        await (prompt as any).update({ is_active: true });
        const afterState = { is_active: true, prompt_id: promptId, name: (prompt as any).name };

        await logAgentActivity({
          agent_id: agentId,
          action: 'reactivate_prompt',
          result: 'success',
          reason: `Re-activated prompt "${(prompt as any).name}" still referenced by mini-sections`,
          before_state: beforeState,
          after_state: afterState,
        });

        actions.push({
          campaign_id: 'orchestration',
          action: 'reactivate_prompt',
          reason: `Re-activated prompt "${(prompt as any).name}" (${promptId})`,
          confidence: 0.95,
          before_state: beforeState,
          after_state: afterState,
          result: 'success',
        });

        repairCount++;
      }

      // Repair: null out broken FK references on mini-sections
      if (eventType === 'broken_prompt_fk' && SAFE_REPAIR_TYPES.has('broken_fk_nullification')) {
        const brokenPromptId = details.broken_prompt_id;
        const fkField = details.fk_field;
        if (!brokenPromptId || !fkField) continue;

        // Validate FK field is one we expect
        const allowedFKFields = [
          'concept_prompt_template_id',
          'build_prompt_template_id',
          'mentor_prompt_template_id',
        ];
        if (!allowedFKFields.includes(fkField)) continue;

        const affected = await MiniSection.findAll({
          where: { [fkField]: brokenPromptId },
          attributes: ['id', 'title', fkField],
        });

        for (const ms of affected) {
          if (repairCount >= maxRepairs) break;

          const beforeState = { mini_section_id: (ms as any).id, [fkField]: brokenPromptId };
          await (ms as any).update({ [fkField]: null });
          const afterState = { mini_section_id: (ms as any).id, [fkField]: null };

          await logAgentActivity({
            agent_id: agentId,
            action: 'null_broken_fk',
            result: 'success',
            reason: `Nulled broken ${fkField} on mini-section "${(ms as any).title}"`,
            before_state: beforeState,
            after_state: afterState,
          });

          actions.push({
            campaign_id: 'orchestration',
            action: 'null_broken_fk',
            reason: `Nulled broken ${fkField} on mini-section "${(ms as any).title}"`,
            confidence: 0.9,
            before_state: beforeState,
            after_state: afterState,
            result: 'success',
          });

          repairCount++;
        }
      }

      // Repair: null out broken FK references on artifact definitions
      if (eventType === 'broken_artifact_prompt_fk' && SAFE_REPAIR_TYPES.has('broken_fk_nullification')) {
        const brokenPromptId = details.broken_prompt_id;
        const fkField = details.fk_field;
        if (!brokenPromptId || !fkField) continue;

        const allowedArtifactFKs = ['instruction_prompt_id', 'auto_generate_prompt_id'];
        if (!allowedArtifactFKs.includes(fkField)) continue;

        const affected = await ArtifactDefinition.findAll({
          where: { [fkField]: brokenPromptId },
          attributes: ['id', 'name', fkField],
        });

        for (const artifact of affected) {
          if (repairCount >= maxRepairs) break;

          const beforeState = { artifact_id: (artifact as any).id, [fkField]: brokenPromptId };
          await (artifact as any).update({ [fkField]: null });
          const afterState = { artifact_id: (artifact as any).id, [fkField]: null };

          await logAgentActivity({
            agent_id: agentId,
            action: 'null_broken_artifact_fk',
            result: 'success',
            reason: `Nulled broken ${fkField} on artifact "${(artifact as any).name}"`,
            before_state: beforeState,
            after_state: afterState,
          });

          actions.push({
            campaign_id: 'orchestration',
            action: 'null_broken_artifact_fk',
            reason: `Nulled broken ${fkField} on artifact "${(artifact as any).name}"`,
            confidence: 0.9,
            before_state: beforeState,
            after_state: afterState,
            result: 'success',
          });

          repairCount++;
        }
      }
    }

    if (repairCount > 0) {
      await logAiEvent(
        'orchestration_repair',
        'repairs_completed',
        'system',
        'orchestration',
        { repairs: repairCount, max_per_run: maxRepairs },
      );
    }

    return {
      agent_name: AGENT_NAME,
      campaigns_processed: recentFindings.length,
      actions_taken: actions,
      errors,
      duration_ms: Date.now() - startTime,
    };
  } catch (err: any) {
    errors.push(`${AGENT_NAME} failed: ${err.message}`);
    return {
      agent_name: AGENT_NAME,
      campaigns_processed: 0,
      actions_taken: actions,
      errors,
      duration_ms: Date.now() - startTime,
    };
  }
}

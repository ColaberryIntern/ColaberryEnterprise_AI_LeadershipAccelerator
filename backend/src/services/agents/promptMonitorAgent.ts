import { Op } from 'sequelize';
import { MiniSection, PromptTemplate, ArtifactDefinition, AiSystemEvent } from '../../models';
import { logAiEvent } from '../aiEventService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'PromptMonitorAgent';

export async function runPromptMonitorAgent(
  agentId: string,
  _config: Record<string, any> = {},
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Early exit if no active mini-sections
    const activeMSCount = await MiniSection.count({ where: { is_active: true } });
    if (activeMSCount === 0) {
      return {
        agent_name: AGENT_NAME,
        campaigns_processed: 0,
        actions_taken: [],
        errors: [],
        duration_ms: Date.now() - startTime,
      };
    }

    // 1. Find inactive prompts still referenced by mini-sections
    const promptFKFields = [
      'concept_prompt_template_id',
      'build_prompt_template_id',
      'mentor_prompt_template_id',
    ] as const;

    for (const fkField of promptFKFields) {
      const miniSectionsWithFK = await MiniSection.findAll({
        where: {
          is_active: true,
          [fkField]: { [Op.ne]: null },
        },
        attributes: ['id', 'title', fkField],
      });

      if (miniSectionsWithFK.length === 0) continue;

      const promptIds = [...new Set(miniSectionsWithFK.map((ms: any) => ms[fkField]).filter(Boolean))];
      if (promptIds.length === 0) continue;

      // Check which prompts are inactive
      const inactivePrompts = await PromptTemplate.findAll({
        where: {
          id: { [Op.in]: promptIds },
          is_active: false,
        },
        attributes: ['id', 'name'],
      });

      for (const prompt of inactivePrompts) {
        const affectedMS = miniSectionsWithFK.filter((ms: any) => ms[fkField] === (prompt as any).id);

        await logAiEvent(
          'prompt_monitor',
          'inactive_prompt_referenced',
          'prompt_template',
          (prompt as any).id,
          {
            prompt_name: (prompt as any).name,
            fk_field: fkField,
            affected_mini_sections: affectedMS.length,
            repairable: true,
          },
        );

        actions.push({
          campaign_id: 'orchestration',
          action: 'inactive_prompt_referenced',
          reason: `Prompt "${(prompt as any).name}" is inactive but referenced by ${affectedMS.length} mini-section(s) via ${fkField}`,
          confidence: 1.0,
          before_state: null,
          after_state: { prompt_id: (prompt as any).id, fk_field: fkField },
          result: 'success',
        });
      }

      // Check for broken FK references (pointing to non-existent prompts)
      const existingPromptIds = await PromptTemplate.findAll({
        where: { id: { [Op.in]: promptIds } },
        attributes: ['id'],
      });
      const existingIdSet = new Set(existingPromptIds.map((p: any) => p.id));
      const brokenRefs = promptIds.filter(id => !existingIdSet.has(id));

      for (const brokenId of brokenRefs) {
        const affectedMS = miniSectionsWithFK.filter((ms: any) => ms[fkField] === brokenId);

        await logAiEvent(
          'prompt_monitor',
          'broken_prompt_fk',
          'mini_section',
          affectedMS[0]?.id || 'unknown',
          {
            broken_prompt_id: brokenId,
            fk_field: fkField,
            affected_mini_sections: affectedMS.length,
            repairable: true,
          },
        );

        actions.push({
          campaign_id: 'orchestration',
          action: 'broken_prompt_fk',
          reason: `${affectedMS.length} mini-section(s) reference non-existent prompt ${brokenId} via ${fkField}`,
          confidence: 1.0,
          before_state: null,
          after_state: { broken_id: brokenId, fk_field: fkField },
          result: 'success',
        });
      }
    }

    // 2. Check artifact instruction/auto-generate prompt FKs
    const artifactPromptFields = ['instruction_prompt_id', 'auto_generate_prompt_id'] as const;

    for (const fkField of artifactPromptFields) {
      const artifactsWithFK = await ArtifactDefinition.findAll({
        where: { [fkField]: { [Op.ne]: null } },
        attributes: ['id', 'name', fkField],
      });

      if (artifactsWithFK.length === 0) continue;

      const promptIds = [...new Set(artifactsWithFK.map((a: any) => a[fkField]).filter(Boolean))];
      const existingPrompts = await PromptTemplate.findAll({
        where: { id: { [Op.in]: promptIds } },
        attributes: ['id'],
      });
      const existingIdSet = new Set(existingPrompts.map((p: any) => p.id));
      const brokenRefs = promptIds.filter(id => !existingIdSet.has(id));

      for (const brokenId of brokenRefs) {
        const affected = artifactsWithFK.filter((a: any) => a[fkField] === brokenId);

        await logAiEvent(
          'prompt_monitor',
          'broken_artifact_prompt_fk',
          'artifact_definition',
          affected[0]?.id || 'unknown',
          {
            broken_prompt_id: brokenId,
            fk_field: fkField,
            affected_artifacts: affected.length,
            repairable: true,
          },
        );

        actions.push({
          campaign_id: 'orchestration',
          action: 'broken_artifact_prompt_fk',
          reason: `${affected.length} artifact(s) reference non-existent prompt ${brokenId} via ${fkField}`,
          confidence: 1.0,
          before_state: null,
          after_state: { broken_id: brokenId, fk_field: fkField },
          result: 'success',
        });
      }
    }

    // 3. Check recent prompt error events (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentErrors = await AiSystemEvent.count({
      where: {
        event_type: { [Op.like]: '%prompt%error%' },
        created_at: { [Op.gte]: oneHourAgo },
      },
    });

    if (recentErrors > 0) {
      await logAiEvent(
        'prompt_monitor',
        'recent_prompt_errors',
        'system',
        'prompt_execution',
        { error_count: recentErrors, window_hours: 1 },
      );

      actions.push({
        campaign_id: 'orchestration',
        action: 'recent_prompt_errors',
        reason: `${recentErrors} prompt error event(s) in the last hour`,
        confidence: 0.8,
        before_state: null,
        after_state: { error_count: recentErrors },
        result: 'success',
      });
    }

    return {
      agent_name: AGENT_NAME,
      campaigns_processed: activeMSCount,
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

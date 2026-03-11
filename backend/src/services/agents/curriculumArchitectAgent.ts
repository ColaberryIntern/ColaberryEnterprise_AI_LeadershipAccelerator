// ─── Curriculum Architect Agent ──────────────────────────────────────────────
// On-demand agent. Designs curriculum module structures from ticket metadata.
// Creates modules, lessons, and sub-tickets for artifact generation.

import { chatCompletion } from '../../intelligence/assistant/openaiHelper';
import { CurriculumModule, CurriculumLesson, ProgramBlueprint } from '../../models';
import { createTicket } from '../ticketService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'CurriculumArchitectAgent';

interface DesignInput {
  program_id?: string;
  module_name?: string;
  skill_area?: string;
  target_audience?: string;
  lesson_count?: number;
}

interface LessonDesign {
  title: string;
  description: string;
  order_index: number;
  lesson_type: string;
  skill_focus: string;
  estimated_duration_min: number;
}

export async function runCurriculumArchitectAgent(
  ticketId: string,
  metadata: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  const input: DesignInput = {
    program_id: metadata.program_id,
    module_name: metadata.module_name || metadata.title,
    skill_area: metadata.skill_area,
    target_audience: metadata.target_audience || 'enterprise professionals',
    lesson_count: metadata.lesson_count || 5,
  };

  try {
    // 1. Get program context if available
    let programContext = '';
    if (input.program_id) {
      const program = await ProgramBlueprint.findByPk(input.program_id);
      if (program) {
        programContext = `Program: ${(program as any).name}, Description: ${(program as any).description}`;
      }
    }

    // 2. Generate curriculum structure via LLM
    const systemPrompt = `You are a curriculum architect for the Colaberry Enterprise AI Leadership Accelerator.
Design a structured curriculum module with lessons.

${programContext ? `Context: ${programContext}` : ''}

Return JSON:
{
  "module": { "name": "...", "description": "...", "learning_objectives": ["..."] },
  "lessons": [{ "title": "...", "description": "...", "order_index": N, "lesson_type": "concept|build|practice|assessment", "skill_focus": "...", "estimated_duration_min": N }]
}

Design ${input.lesson_count} lessons. Target audience: ${input.target_audience}.
Each lesson should build on the previous. Include a mix of concept, build, and practice types.`;

    const llmResult = await chatCompletion(
      systemPrompt,
      `Design a curriculum module for: ${input.module_name}${input.skill_area ? ` (skill area: ${input.skill_area})` : ''}`,
      { json: true, maxTokens: 2000, temperature: 0.3 },
    );

    if (!llmResult) throw new Error('No LLM response for curriculum design');
    const design = JSON.parse(llmResult);

    // 3. Create module
    const module = await CurriculumModule.create({
      ...(input.program_id && { program_id: input.program_id }),
      name: design.module.name,
      description: design.module.description,
      order_index: 0,
      status: 'draft',
    } as any);

    actions.push({
      campaign_id: '',
      action: 'created_module',
      reason: `Designed module: ${design.module.name}`,
      confidence: 0.85,
      before_state: null,
      after_state: { module_id: (module as any).id, name: design.module.name },
      result: 'success',
      entity_type: 'system',
      entity_id: (module as any).id,
    });

    // 4. Create lessons
    const lessons: LessonDesign[] = design.lessons || [];
    for (const lesson of lessons) {
      const created = await CurriculumLesson.create({
        module_id: (module as any).id,
        title: lesson.title,
        description: lesson.description,
        order_index: lesson.order_index,
        lesson_type: lesson.lesson_type || 'concept',
        status: 'draft',
      } as any);

      actions.push({
        campaign_id: '',
        action: 'created_lesson',
        reason: `Lesson ${lesson.order_index}: ${lesson.title}`,
        confidence: 0.85,
        before_state: null,
        after_state: { lesson_id: (created as any).id, title: lesson.title },
        result: 'success',
        entity_type: 'system',
        entity_id: (created as any).id,
      });

      // 5. Create artifact generation sub-ticket for each lesson
      await createTicket({
        title: `Generate artifacts for: ${lesson.title}`,
        description: `Generate teaching artifacts (slides, exercises, assessments) for lesson "${lesson.title}" in module "${design.module.name}".`,
        type: 'curriculum',
        priority: 'medium',
        source: `agent:${AGENT_NAME}`,
        created_by_type: 'agent',
        created_by_id: AGENT_NAME,
        entity_type: 'curriculum_lesson',
        entity_id: (created as any).id,
        metadata: {
          action: 'generate_artifact',
          lesson_id: (created as any).id,
          module_id: (module as any).id,
          lesson_type: lesson.lesson_type,
          parent_ticket_id: ticketId,
        },
      });
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    entities_processed: actions.length,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}

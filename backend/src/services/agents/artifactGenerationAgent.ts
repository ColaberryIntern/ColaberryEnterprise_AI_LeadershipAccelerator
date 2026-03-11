// ─── Artifact Generation Agent ───────────────────────────────────────────────
// On-demand agent. Generates teaching artifacts (slides, labs, exercises)
// for curriculum lessons using AI content generation.

import { chatCompletion } from '../../intelligence/assistant/openaiHelper';
import { CurriculumLesson, ArtifactDefinition } from '../../models';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'ArtifactGenerationAgent';

const ARTIFACT_TYPES = ['slides', 'lab_exercise', 'assessment', 'project_brief', 'reference_guide'] as const;

export async function runArtifactGenerationAgent(
  ticketId: string,
  metadata: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  const lessonId = metadata.lesson_id;
  if (!lessonId) {
    return {
      agent_name: AGENT_NAME,
      campaigns_processed: 0,
      actions_taken: [],
      errors: ['No lesson_id in ticket metadata'],
      duration_ms: Date.now() - startTime,
    };
  }

  try {
    const lesson = await CurriculumLesson.findByPk(lessonId);
    if (!lesson) throw new Error(`Lesson ${lessonId} not found`);

    const lessonData = lesson as any;
    const lessonType = metadata.lesson_type || lessonData.lesson_type || 'concept';

    // Determine which artifacts to generate based on lesson type
    const artifactsToGenerate: string[] = [];
    if (lessonType === 'concept') artifactsToGenerate.push('slides', 'reference_guide');
    else if (lessonType === 'build') artifactsToGenerate.push('lab_exercise', 'slides');
    else if (lessonType === 'practice') artifactsToGenerate.push('lab_exercise', 'assessment');
    else if (lessonType === 'assessment') artifactsToGenerate.push('assessment', 'project_brief');
    else artifactsToGenerate.push('slides');

    for (const artifactType of artifactsToGenerate) {
      try {
        // Generate artifact content via LLM
        const systemPrompt = `You are an instructional designer creating ${artifactType} for an enterprise AI training lesson.
Return JSON with the artifact structure:
{
  "title": "...",
  "description": "...",
  "content_outline": ["section1", "section2", ...],
  "estimated_duration_min": N,
  "difficulty_level": "beginner|intermediate|advanced"
}`;

        const result = await chatCompletion(
          systemPrompt,
          `Create a ${artifactType} artifact for lesson: "${lessonData.title}"\nDescription: ${lessonData.description || 'N/A'}`,
          { json: true, maxTokens: 1000, temperature: 0.3 },
        );

        if (!result) throw new Error(`No LLM response for ${artifactType}`);
        const artifactDesign = JSON.parse(result);

        const artifact = await ArtifactDefinition.create({
          lesson_id: lessonId,
          session_id: lessonData.associated_session_id || null,
          name: artifactDesign.title || `${lessonData.title} - ${artifactType}`,
          artifact_type: artifactType,
          description: artifactDesign.description,
          config: {
            content_outline: artifactDesign.content_outline,
            estimated_duration_min: artifactDesign.estimated_duration_min,
            difficulty_level: artifactDesign.difficulty_level,
            generated_by: AGENT_NAME,
            ticket_id: ticketId,
          },
          status: 'draft',
        } as any);

        actions.push({
          campaign_id: '',
          action: 'created_artifact',
          reason: `Generated ${artifactType}: ${artifactDesign.title}`,
          confidence: 0.8,
          before_state: null,
          after_state: { artifact_id: (artifact as any).id, type: artifactType },
          result: 'success',
          entity_type: 'system',
          entity_id: (artifact as any).id,
        });
      } catch (err: any) {
        errors.push(`${artifactType}: ${err.message}`);
      }
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

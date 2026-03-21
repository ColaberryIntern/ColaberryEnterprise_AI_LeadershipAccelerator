import { NextAction, ArtifactDefinition, AssignmentSubmission } from '../../models';
import { buildActionContext, ActionContext } from './actionContextBuilder';
import { generateMiniLesson, MiniLesson } from './miniLessonService';
import { generateCodeExamples, CodeExample } from './codeExampleService';
import { generatePromptPack, Prompt } from './promptPackService';

export interface GuidedExecutionPayload {
  lesson: MiniLesson;
  code_examples: CodeExample[];
  prompts: Prompt[];
  context: {
    tech_stack: string[];
    difficulty_level: string;
    related_artifacts: string[];
    missing_components: string[];
    files_suggested: string[];
  };
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

export async function getGuidedExecution(
  enrollmentId: string,
  actionId: string
): Promise<GuidedExecutionPayload> {
  // 1. Load the action
  const action = await NextAction.findByPk(actionId);
  if (!action) throw new Error(`Action not found: ${actionId}`);

  console.log(`[GuidedExecution] Generating guidance for action: "${action.title}" (${action.action_type})`);

  // 2. Build context
  const context = await buildActionContext(enrollmentId, actionId);

  // 3. Get system doc content for prompt generation
  const systemDocs = await getSystemDocContent(enrollmentId);

  // 4. Generate all components
  const lesson = generateMiniLesson(action, context);
  const code_examples = generateCodeExamples(action, context);
  const prompts = generatePromptPack(action, context, systemDocs);

  console.log(
    `[GuidedExecution] Generated: lesson="${lesson.title}", ${code_examples.length} code examples, ${prompts.length} prompts`
  );

  return {
    lesson,
    code_examples,
    prompts,
    context: {
      tech_stack: context.tech_stack,
      difficulty_level: context.difficulty_level,
      related_artifacts: context.related_artifacts,
      missing_components: context.missing_components,
      files_suggested: context.files_suggested,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSystemDocContent(enrollmentId: string): Promise<string> {
  const systemArtifacts = await ArtifactDefinition.findAll({
    where: { artifact_type: 'system_compiled' },
  });

  if (systemArtifacts.length === 0) return '';

  const docIds = systemArtifacts
    .filter((a) => a.name !== 'compiled_requirements')
    .map((a) => a.id);

  if (docIds.length === 0) return '';

  const submissions = await AssignmentSubmission.findAll({
    where: {
      enrollment_id: enrollmentId,
      artifact_definition_id: docIds,
      is_latest: true,
    },
  });

  return submissions
    .map((s) => s.content_json?.text || '')
    .filter(Boolean)
    .join('\n');
}

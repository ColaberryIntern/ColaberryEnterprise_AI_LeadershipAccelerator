import { NextAction } from '../../models';
import { ActionContext } from './actionContextBuilder';

export interface MiniLesson {
  title: string;
  explanation: string;
  steps: string[];
}

// ---------------------------------------------------------------------------
// Lesson Templates by Action Type
// ---------------------------------------------------------------------------

const LESSON_TEMPLATES: Record<string, {
  titleTemplate: string;
  explanationTemplate: string;
  stepsTemplate: string[];
}> = {
  create_artifact: {
    titleTemplate: 'Creating a New Artifact',
    explanationTemplate:
      'This requirement needs a new artifact to be created. An artifact is a documented deliverable ' +
      'that captures your design decisions, analysis, or implementation plan. Creating artifacts early ' +
      'ensures your project has proper documentation and traceability from requirements to implementation.',
    stepsTemplate: [
      'Review the requirement: "{requirement_text}"',
      'Identify the key deliverables this artifact should contain',
      'Create the artifact using the project template structure',
      'Link the artifact to the requirement in your project tracker',
      'Submit the artifact for review',
    ],
  },
  update_artifact: {
    titleTemplate: 'Updating an Existing Artifact',
    explanationTemplate:
      'An artifact exists for this requirement but needs to be completed or updated. ' +
      'Review the current state of the artifact and identify what\'s missing. ' +
      'Focus on filling gaps rather than rewriting — incremental updates maintain consistency.',
    stepsTemplate: [
      'Open the existing artifact: {related_artifacts}',
      'Review the requirement: "{requirement_text}"',
      'Identify gaps between the artifact content and the requirement',
      'Update the artifact with missing information',
      'Submit the updated version',
    ],
  },
  build_feature: {
    titleTemplate: 'Building a New Feature',
    explanationTemplate:
      'This requirement is documented but has no matching implementation in your repository. ' +
      'You need to write code to fulfill this requirement. Start with the suggested files ' +
      'and follow your project\'s architecture patterns.',
    stepsTemplate: [
      'Review the requirement: "{requirement_text}"',
      'Check suggested files for context: {files_suggested}',
      'Plan the implementation using your project\'s {tech_stack} stack',
      'Write the code following existing patterns in your repository',
      'Test your implementation',
      'Commit and push to your repository',
    ],
  },
  fix_issue: {
    titleTemplate: 'Completing a Partial Implementation',
    explanationTemplate:
      'Some code exists for this requirement but the implementation is incomplete. ' +
      'Review the existing code, identify what\'s missing or broken, and complete the implementation. ' +
      'This is typically a moderate-effort task since the foundation is already in place.',
    stepsTemplate: [
      'Review the requirement: "{requirement_text}"',
      'Examine the existing implementation in: {files_suggested}',
      'Identify what\'s missing or needs fixing',
      'Complete the implementation',
      'Run tests to verify the fix',
      'Commit and push changes',
    ],
  },
};

// ---------------------------------------------------------------------------
// Generate Mini Lesson
// ---------------------------------------------------------------------------

export function generateMiniLesson(
  action: NextAction,
  context: ActionContext
): MiniLesson {
  const template = LESSON_TEMPLATES[action.action_type] || LESSON_TEMPLATES.build_feature;

  const vars: Record<string, string> = {
    requirement_text: truncate(context.requirement_text, 120),
    related_artifacts: context.related_artifacts.join(', ') || 'linked artifacts',
    files_suggested: context.files_suggested.slice(0, 3).join(', ') || 'project files',
    tech_stack: context.tech_stack.join(', ') || 'your stack',
    difficulty: context.difficulty_level,
  };

  const title = interpolate(template.titleTemplate, vars);
  const explanation = interpolate(template.explanationTemplate, vars);
  const steps = template.stepsTemplate.map((s) => interpolate(s, vars));

  return { title, explanation, steps };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || key);
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;
}

export interface LearningInjection {
  lesson_type: 'micro' | 'guided_fix';
  topic: string;
  actions: string[];
  artifact_suggestion: string;
}

// ---------------------------------------------------------------------------
// Generate learning injection for blocked actions
// ---------------------------------------------------------------------------

export function generateLearningInjection(
  actionTitle: string,
  actionType: string,
  missingElements: string[],
  semanticReasoning: string | null
): LearningInjection {
  // Determine lesson type based on action type
  const lesson_type: 'micro' | 'guided_fix' =
    actionType === 'create_artifact' || actionType === 'update_artifact'
      ? 'micro'
      : 'guided_fix';

  // Generate topic from action context
  const topic = missingElements.length > 0
    ? `How to: ${missingElements[0].replace(/^Missing implementation for:\s*/i, '')}`
    : `Completing: ${truncate(actionTitle, 60)}`;

  // Generate actions based on what's missing
  const actions: string[] = [];

  if (missingElements.length > 0) {
    actions.push(`Review the gaps: ${missingElements.slice(0, 3).join(', ')}`);
  }

  if (semanticReasoning) {
    actions.push(`Consider: ${truncate(semanticReasoning, 100)}`);
  }

  switch (actionType) {
    case 'create_artifact':
      actions.push('Create the artifact document using the project template');
      actions.push('Fill in all required sections based on the requirement');
      actions.push('Submit the artifact for review');
      break;
    case 'update_artifact':
      actions.push('Open the existing artifact and review current content');
      actions.push('Identify gaps between current content and requirement');
      actions.push('Update the artifact with missing information');
      break;
    case 'build_feature':
      actions.push('Review the suggested files for implementation context');
      actions.push('Write the feature code following project patterns');
      actions.push('Add tests for the new functionality');
      actions.push('Commit and push to your repository');
      break;
    case 'fix_issue':
      actions.push('Debug the existing implementation');
      actions.push('Fix the identified gaps');
      actions.push('Verify the fix addresses the requirement');
      break;
  }

  // Artifact suggestion
  const artifact_suggestion = actionType === 'create_artifact' || actionType === 'update_artifact'
    ? 'Create or update the relevant artifact document'
    : 'Update the implementation and sync GitHub';

  console.log(`[CurriculumInjection] Generated ${lesson_type} lesson: "${topic}" with ${actions.length} actions`);

  return { lesson_type, topic, actions, artifact_suggestion };
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;
}

import { LearnerProfile, LessonContext, LLMOption } from '../contexts/MentorContext';

export interface ExecutionContextInput {
  filledPrompt: string;
  templateName?: string;
  placeholderValues: Record<string, string>;
  learnerProfile: LearnerProfile | null;
  lessonContext: LessonContext;
  selectedLLM: LLMOption;
  conceptSnapshot?: { title?: string; executive_summary?: string };
  aiStrategy?: { strategy_name?: string; description?: string };
  implementationTask?: {
    title?: string;
    description?: string;
    deliverable?: string;
    requirements?: string[];
    artifacts?: Array<{ name: string; description: string }>;
  };
}

export interface ExecutionContext {
  finalPrompt: string;
  summary: {
    learnerContext: string[];
    lessonTitle: string;
    promptName: string;
    taskTitle: string | null;
    artifactNames: string[];
    llmTarget: string;
  };
  timestamp: string;
  version: number;
}

function buildLearnerContextLines(profile: LearnerProfile | null): string[] {
  if (!profile) return [];
  const ctx: string[] = [];
  if (profile.company_name) ctx.push(`Company: ${profile.company_name}`);
  if (profile.industry) ctx.push(`Industry: ${profile.industry}`);
  if (profile.role) ctx.push(`Role: ${profile.role}`);
  if (profile.goal) ctx.push(`Goal: ${profile.goal}`);
  if (profile.ai_maturity_level) ctx.push(`AI Maturity: ${profile.ai_maturity_level}/5`);
  if (profile.identified_use_case) ctx.push(`Use Case: ${profile.identified_use_case}`);
  if (profile.personalization_context_json) {
    for (const [key, val] of Object.entries(profile.personalization_context_json)) {
      if (val) ctx.push(`${key.replace(/_/g, ' ')}: ${val}`);
    }
  }
  return ctx;
}

export function buildExecutionContext(input: ExecutionContextInput): ExecutionContext {
  const {
    filledPrompt, templateName, placeholderValues, learnerProfile,
    lessonContext, selectedLLM, conceptSnapshot, aiStrategy, implementationTask,
  } = input;

  // Build learner context block
  const learnerLines = buildLearnerContextLines(learnerProfile);
  const contextBlock = learnerLines.length > 0
    ? `[Context about me: ${learnerLines.join(', ')}]\n\n`
    : '';

  // Build appendix sections
  const appendixParts: string[] = [];

  if (conceptSnapshot?.title || conceptSnapshot?.executive_summary) {
    const summary = conceptSnapshot.executive_summary
      ? conceptSnapshot.executive_summary.substring(0, 200)
      : '';
    appendixParts.push(`LESSON CONTEXT: ${lessonContext.lessonTitle || conceptSnapshot.title || ''}${summary ? ' — ' + summary : ''}`);
  }

  if (aiStrategy?.strategy_name) {
    appendixParts.push(`AI STRATEGY: ${aiStrategy.strategy_name}`);
  }

  if (implementationTask?.title) {
    let taskSection = `TASK: ${implementationTask.title}`;
    if (implementationTask.description) {
      taskSection += ` — ${implementationTask.description}`;
    }
    if (implementationTask.requirements?.length) {
      taskSection += '\nREQUIREMENTS:\n' + implementationTask.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n');
    }
    if (implementationTask.artifacts?.length) {
      taskSection += '\nDELIVERABLES: ' + implementationTask.artifacts.map(a => a.name).join(', ');
    }
    appendixParts.push(taskSection);
  }

  const appendix = appendixParts.length > 0
    ? '\n\n---\n' + appendixParts.join('\n')
    : '';

  const finalPrompt = contextBlock + filledPrompt + appendix;

  const summary = {
    learnerContext: learnerLines,
    lessonTitle: lessonContext.lessonTitle || '',
    promptName: templateName || 'Prompt Template',
    taskTitle: implementationTask?.title || null,
    artifactNames: implementationTask?.artifacts?.map(a => a.name) || [],
    llmTarget: selectedLLM.name,
  };

  return {
    finalPrompt,
    summary,
    timestamp: new Date().toISOString(),
    version: 1,
  };
}

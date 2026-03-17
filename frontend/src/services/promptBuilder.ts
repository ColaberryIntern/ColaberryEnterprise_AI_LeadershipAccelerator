/**
 * Unified prompt builder — single source of truth for all AI Workspace prompts.
 * Every entry point (Prompt Lab, Implementation Task, AI Strategy) MUST use this.
 */

export interface PromptBuilderInput {
  systemPrompt?: string;
  learnerContext?: {
    company?: string;
    industry?: string;
    role?: string;
    goal?: string;
    ai_maturity?: string;
    use_case?: string;
  };
  mentorOutput?: string;
  implementationTask?: {
    title: string;
    description: string;
    deliverable: string;
    requirements: string[];
    artifacts: { name: string; description: string; file_types?: string[] }[];
  };
  promptTemplate?: string;
  lessonTitle?: string;
  conceptSnapshot?: { title?: string; definition?: string };
  aiStrategy?: { description?: string; when_to_use_ai?: string[] };
  tools?: { name: string; is_free: boolean; purpose?: string }[];
  workstationPrompt?: string;
  workstationTestMode?: boolean;
}

const CLAUDE_CODE_CONSTRAINT = `
ENVIRONMENT CONSTRAINT:
All projects will be created in Claude Code. If you suggest a tool, framework, or integration:
- It MUST be compatible with Claude Code
- It MUST be configurable within the Claude Code environment
- Do NOT suggest tools that require external-only execution environments unless explicitly stated`;

export function buildFinalPrompt(input: PromptBuilderInput): string {
  const parts: string[] = [];

  // 1. System prompt (admin-configured or default)
  if (input.systemPrompt) {
    parts.push(input.systemPrompt);
  }

  // 2. Learner context block
  if (input.learnerContext) {
    const ctx = input.learnerContext;
    const fields: string[] = [];
    if (ctx.company) fields.push(`Company: ${ctx.company}`);
    if (ctx.industry) fields.push(`Industry: ${ctx.industry}`);
    if (ctx.role) fields.push(`Role: ${ctx.role}`);
    if (ctx.goal) fields.push(`Goal: ${ctx.goal}`);
    if (ctx.ai_maturity) fields.push(`AI Maturity: ${ctx.ai_maturity}`);
    if (ctx.use_case) fields.push(`Use Case: ${ctx.use_case}`);
    if (fields.length > 0) {
      parts.push(`[Context about me: ${fields.join(', ')}]`);
    }
  }

  // 3. Mentor breakdown
  if (input.mentorOutput) {
    parts.push(`MENTOR BRIEFING:\n${input.mentorOutput}`);
  }

  // 4. Implementation task
  if (input.implementationTask) {
    const task = input.implementationTask;
    let taskBlock = `ASSIGNMENT: ${task.title}\nDESCRIPTION: ${task.description}\nDELIVERABLE: ${task.deliverable}`;
    if (task.requirements.length > 0) {
      taskBlock += `\n\nREQUIREMENTS:\n${task.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
    }
    if (task.artifacts.length > 0) {
      taskBlock += `\n\nREQUIRED ARTIFACTS:\n${task.artifacts.map((a, i) => `${i + 1}. ${a.name}: ${a.description}${a.file_types ? ` (${a.file_types.join(', ')})` : ''}`).join('\n')}`;
    }
    parts.push(taskBlock);
  }

  // 5. Tools used
  if (input.tools && input.tools.length > 0) {
    const toolLines = input.tools.map(t => {
      const tag = t.is_free ? 'Free' : 'Paid';
      return `- ${t.name} (${tag})${t.purpose ? `: ${t.purpose}` : ''}`;
    });
    parts.push(`TOOLS:\n${toolLines.join('\n')}`);
  }

  // 6. Prompt template content
  if (input.promptTemplate) {
    parts.push(input.promptTemplate);
  }

  // 7. Lesson context appendix
  if (input.lessonTitle) {
    let appendix = `---\nLESSON: ${input.lessonTitle}`;
    if (input.conceptSnapshot?.title) {
      appendix += `\nCONCEPT: ${input.conceptSnapshot.title}`;
      if (input.conceptSnapshot.definition) appendix += ` — ${input.conceptSnapshot.definition}`;
    }
    if (input.aiStrategy?.description) {
      appendix += `\nAI STRATEGY: ${input.aiStrategy.description}`;
    }
    parts.push(appendix);
  }

  // 8. Test mode
  if (input.workstationTestMode) {
    parts.push(`TEST MODE INSTRUCTIONS:\nI am in test mode. Walk me through the experience exactly as a real student would see it, but when you ask me to do work or submit something, instead of waiting for my submission, you should generate a realistic example yourself and continue as if I had submitted it. Keep the flow moving automatically — show me the full student journey from start to finish.`);
  }

  // 9. Claude Code environment constraint
  parts.push(CLAUDE_CODE_CONSTRAINT);

  return parts.join('\n\n');
}

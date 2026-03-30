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
  skillContext?: {
    developing: { name: string; type: string }[];
    carried_forward: { name: string; from_section: string }[];
  };
  artifactContext?: {
    inputs_from_prior: { name: string; from_section: string }[];
    outputs_required: { name: string; description: string }[];
  };
  variableContext?: {
    available: { key: string; value?: string; source: string }[];
    required: { key: string }[];
    missing: { key: string }[];
  };
  workstationPrompt?: string;
  workstationTestMode?: boolean;
  resolvedVariables?: Record<string, string>;
  variableTrace?: { key: string; value?: string | null; source: string; status: string }[];
}

const CLAUDE_CODE_CONSTRAINT = `
ENVIRONMENT CONSTRAINT:
All projects will be created in Claude Code. If you suggest a tool, framework, or integration:
- It MUST be compatible with Claude Code
- It MUST be configurable within the Claude Code environment
- Do NOT suggest tools that require external-only execution environments unless explicitly stated`;

export function buildFinalPrompt(input: PromptBuilderInput): string {
  const parts: string[] = [];

  // 1. Workstation prompt (global admin-configured guidance for the AI workspace)
  if (input.workstationPrompt) {
    parts.push(input.workstationPrompt);
  }

  // 1b. System prompt (section-specific, if provided)
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

  // 2b. All resolved variables (from curriculum progress)
  if (input.resolvedVariables) {
    const skip = new Set(['full_name', 'email', 'company', 'company_name', 'title']); // already in learner context
    const varLines = Object.entries(input.resolvedVariables)
      .filter(([k, v]) => v && !skip.has(k))
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
    if (varLines.length > 0) {
      parts.push(`[Additional learner data from curriculum progress:\n${varLines.join('\n')}]`);
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

  // 8. Skill & Artifact intelligence
  if (input.skillContext) {
    const lines: string[] = ['SKILL CONTEXT:'];
    if (input.skillContext.developing.length > 0) {
      lines.push('Developing in this section:');
      for (const s of input.skillContext.developing) lines.push(`- ${s.name} (${s.type})`);
    }
    if (input.skillContext.carried_forward.length > 0) {
      lines.push('Carried forward from prior sections:');
      for (const s of input.skillContext.carried_forward) lines.push(`- ${s.name} (from: ${s.from_section})`);
    }
    if (lines.length > 1) parts.push(lines.join('\n'));
  }
  if (input.artifactContext) {
    const lines: string[] = ['ARTIFACT CONTEXT:'];
    if (input.artifactContext.inputs_from_prior.length > 0) {
      lines.push('Inputs available from prior work:');
      for (const a of input.artifactContext.inputs_from_prior) lines.push(`- ${a.name} (from: ${a.from_section})`);
    }
    if (input.artifactContext.outputs_required.length > 0) {
      lines.push('Outputs required from this section:');
      for (const a of input.artifactContext.outputs_required) lines.push(`- ${a.name}: ${a.description}`);
    }
    if (lines.length > 1) parts.push(lines.join('\n'));
  }

  // 9. Variable context
  if (input.variableContext) {
    const lines: string[] = ['VARIABLE CONTEXT:'];
    const avail = input.variableContext.available.filter(v => v.value);
    if (avail.length > 0) {
      lines.push('Available variables (pre-filled from prior work):');
      for (const v of avail) lines.push(`- ${v.key}: ${JSON.stringify(v.value)} (from: ${v.source})`);
    }
    if (input.variableContext.missing.length > 0) {
      lines.push('Missing variables (student must provide):');
      for (const v of input.variableContext.missing) lines.push(`- ${v.key}`);
    }
    if (lines.length > 1) parts.push(lines.join('\n'));
  }

  // 9.5. Variable trace (display-only — not sent to LLM at execution)
  if (input.variableTrace && input.variableTrace.length > 0) {
    const traceLines = input.variableTrace.map(v =>
      `- ${v.key}: ${v.value ? `"${v.value}"` : '[NOT SET]'} [${v.status}, from: ${v.source}]`
    );
    parts.push(`VARIABLE TRACE:\n${traceLines.join('\n')}`);
  }

  // 10. Test mode
  if (input.workstationTestMode) {
    parts.push(`TEST MODE INSTRUCTIONS:\nI am in test mode. Walk me through the experience exactly as a real student would see it, but when you ask me to do work or submit something, instead of waiting for my submission, you should generate a realistic example yourself and continue as if I had submitted it. Keep the flow moving automatically — show me the full student journey from start to finish.`);
  }

  return parts.join('\n\n');
}

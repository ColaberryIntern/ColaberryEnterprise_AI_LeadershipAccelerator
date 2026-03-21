import { NextAction } from '../../models';
import { ActionContext } from './actionContextBuilder';

export interface Prompt {
  type: 'claude_code' | 'debug' | 'extend';
  title: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Generate Prompt Pack
// ---------------------------------------------------------------------------

export function generatePromptPack(
  action: NextAction,
  context: ActionContext,
  systemDocs: string
): Prompt[] {
  const prompts: Prompt[] = [];

  // 1. Claude Code prompt — main implementation prompt
  prompts.push({
    type: 'claude_code',
    title: 'Implement Feature',
    content: buildClaudeCodePrompt(action, context, systemDocs),
  });

  // 2. Debug prompt — for troubleshooting
  prompts.push({
    type: 'debug',
    title: 'Debug & Diagnose',
    content: buildDebugPrompt(action, context),
  });

  // 3. Extend prompt — for extending existing code
  prompts.push({
    type: 'extend',
    title: 'Extend & Improve',
    content: buildExtendPrompt(action, context),
  });

  return prompts;
}

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

function buildClaudeCodePrompt(
  action: NextAction,
  context: ActionContext,
  systemDocs: string
): string {
  const files = context.files_suggested.length > 0
    ? `\n\nRelevant files to examine:\n${context.files_suggested.map((f) => `- ${f}`).join('\n')}`
    : '';

  const constraints = systemDocs
    ? `\n\nProject constraints (from system artifacts):\n${truncate(systemDocs, 500)}`
    : '';

  const stack = context.tech_stack.length > 0
    ? `Tech stack: ${context.tech_stack.join(', ')}`
    : '';

  return `# Task: ${action.title}

## Requirement
${context.requirement_text || action.reason}

## Action Type
${formatActionType(action.action_type)}

## Context
${stack}
Project stage: ${context.project_stage}
Difficulty: ${context.difficulty_level}
${files}
${constraints}

## Instructions
1. Read the relevant files listed above
2. Implement the changes needed to fulfill this requirement
3. Follow existing code patterns and conventions
4. Add appropriate error handling and logging
5. Write tests if applicable

## Output
Provide the complete implementation with file paths.
`;
}

function buildDebugPrompt(
  action: NextAction,
  context: ActionContext
): string {
  const files = context.files_suggested.length > 0
    ? context.files_suggested.map((f) => `- ${f}`).join('\n')
    : '- (check project structure)';

  return `# Debug: ${action.title}

## Problem
${context.requirement_text || action.reason}

## Files to Investigate
${files}

## Diagnostic Steps
1. Check if the relevant files exist and are properly structured
2. Look for missing imports, broken references, or incomplete logic
3. Verify that the implementation matches the requirement specification
4. Check for edge cases that might not be handled
5. Review error handling and logging

## What to Look For
- Missing function implementations
- Incorrect data types or interfaces
- Unhandled error paths
- Missing test coverage
- Configuration issues

## Output
Describe the root cause and provide the fix.
`;
}

function buildExtendPrompt(
  action: NextAction,
  context: ActionContext
): string {
  const artifacts = context.related_artifacts.length > 0
    ? context.related_artifacts.map((a) => `- ${a}`).join('\n')
    : '- (no linked artifacts)';

  return `# Extend: ${action.title}

## Current State
This feature has a partial implementation. The goal is to extend it to fully meet the requirement.

## Requirement
${context.requirement_text || action.reason}

## Related Artifacts
${artifacts}

## Enhancement Areas
1. Add missing functionality to complete the requirement
2. Improve error handling and edge case coverage
3. Add comprehensive tests
4. Update documentation and artifacts
5. Ensure the implementation follows project conventions

## Tech Stack
${context.tech_stack.join(', ') || 'Check project configuration'}

## Output
Provide the extended implementation with explanations for each change.
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatActionType(type: string): string {
  const labels: Record<string, string> = {
    create_artifact: 'Create a new artifact/document',
    update_artifact: 'Update an existing artifact',
    build_feature: 'Build a new feature from scratch',
    fix_issue: 'Fix or complete a partial implementation',
  };
  return labels[type] || type;
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;
}

/**
 * Workstation Context Service
 *
 * Builds a comprehensive context payload for launching AI Workstation
 * (Claude Code) with full project context, current task, and session history.
 */
import { NextAction } from '../models';
import { getProjectByEnrollment } from './projectService';
import { getConnection } from './githubService';
import { generateClaudeMd } from './claudeMdService';
import { getRequirementsStatus } from './requirementsMatchingService';

export interface WorkstationPayload {
  prompt: string;
  repoUrl: string | null;
  sessionSummary: {
    lastAction: string | null;
    lastActionAt: string | null;
    currentTask: string | null;
    requirementsRemaining: number;
    completionPct: number;
  };
}

export async function buildWorkstationContext(enrollmentId: string): Promise<WorkstationPayload> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const connection = await getConnection(enrollmentId);

  // Generate full CLAUDE.md content
  const claudeMd = await generateClaudeMd(enrollmentId);

  // Get current action
  const currentAction = await NextAction.findOne({
    where: { project_id: project.id, status: ['pending', 'accepted'] },
    order: [['created_at', 'DESC']],
  });

  // Get last completed action
  const lastCompleted = await NextAction.findOne({
    where: { project_id: project.id, status: 'completed' },
    order: [['created_at', 'DESC']],
  });

  // Get requirements summary
  let reqRemaining = 0;
  let completionPct = 0;
  try {
    const reqStatus = await getRequirementsStatus(project.id);
    const total = reqStatus.requirements?.length || 0;
    const done = reqStatus.requirements?.filter(
      (r: any) => r.status === 'verified' || r.status === 'matched'
    ).length || 0;
    reqRemaining = total - done;
    completionPct = total > 0 ? Math.round((done / total) * 100) : 0;
  } catch {}

  // Build the prompt
  const parts: string[] = [];

  parts.push(`You are working on ${project.organization_name || 'an AI project'}${project.selected_use_case ? ` — ${project.selected_use_case}` : ''}.`);
  if (connection?.repo_url) {
    parts.push(`Repository: ${connection.repo_url}`);
  }
  parts.push('');

  // Full CLAUDE.md
  parts.push('## CLAUDE.md');
  parts.push(claudeMd);
  parts.push('');

  // Current task
  if (currentAction) {
    parts.push('## Current Task');
    parts.push(`**${currentAction.title}**`);
    if (currentAction.reason) parts.push(currentAction.reason);
    const meta = (currentAction as any).metadata;
    if (meta?.files_suggested?.length) {
      parts.push(`Suggested files: ${meta.files_suggested.join(', ')}`);
    }
    if (meta?.requirement_key) {
      parts.push(`Requirement: ${meta.requirement_key}`);
    }
    parts.push('');
  }

  // What was done last
  if (lastCompleted) {
    parts.push('## What Was Done Last');
    parts.push(`${lastCompleted.title} (completed ${lastCompleted.created_at ? new Date(lastCompleted.created_at).toLocaleDateString() : 'recently'})`);

    parts.push('');
  }

  // Unmatched requirements
  if (reqRemaining > 0) {
    parts.push(`## Requirements Still Needed (${reqRemaining} remaining)`);
    try {
      const reqStatus = await getRequirementsStatus(project.id);
      const unmatched = (reqStatus.requirements || []).filter(
        (r: any) => r.status === 'unmatched' || r.status === 'partial'
      ).slice(0, 10); // top 10
      for (const req of unmatched) {
        parts.push(`- ${req.requirement_key}: ${req.requirement_text}`);
      }
    } catch {}
    parts.push('');
  }

  // Instructions
  parts.push('## Instructions');
  parts.push('1. Read the CLAUDE.md in the repository root for full context');
  parts.push('2. Complete the current task described above');
  parts.push('3. After completion, commit with a descriptive message referencing the requirement key');
  parts.push('4. PROJECT_STATE.json will be auto-updated on the next sync');

  return {
    prompt: parts.join('\n'),
    repoUrl: connection?.repo_url || null,
    sessionSummary: {
      lastAction: lastCompleted?.title || null,
      lastActionAt: lastCompleted?.created_at?.toISOString() || null,
      currentTask: currentAction?.title || null,
      requirementsRemaining: reqRemaining,
      completionPct,
    },
  };
}

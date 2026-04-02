/**
 * CLAUDE.md Generation & Sync Service
 *
 * Generates a CLAUDE.md file from project state (DB source of truth)
 * and syncs it to the participant's GitHub repository.
 *
 * CLAUDE.md is a "projection" of database state into a format that
 * Claude Code can consume for context-aware development.
 */
import { Project, RequirementsMap, NextAction, ProgressionLog, ProjectSystemContract } from '../models';
import { getProjectByEnrollment } from './projectService';
import { getConnection, readFileFromRepo, writeFileToRepo } from './githubService';
import { getRequirementsStatus } from './requirementsMatchingService';
import { calculateProgress } from './projectProgressService';

// ---------------------------------------------------------------------------
// 1. Generate CLAUDE.md content from database state
// ---------------------------------------------------------------------------

export async function generateClaudeMd(enrollmentId: string): Promise<string> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const parts: string[] = [];

  // Header
  parts.push('# CLAUDE.md');
  parts.push(`> Auto-generated from project state. Last updated: ${new Date().toISOString()}`);
  parts.push('> This file is the source of context for Claude Code sessions.');
  parts.push('');

  // Project Overview
  parts.push('## Project Overview');
  parts.push(`- **Organization:** ${project.organization_name || 'Not set'}`);
  parts.push(`- **Industry:** ${project.industry || 'Not set'}`);
  if (project.primary_business_problem) parts.push(`- **Business Problem:** ${project.primary_business_problem}`);
  if (project.selected_use_case) parts.push(`- **Use Case:** ${project.selected_use_case}`);
  if (project.automation_goal) parts.push(`- **Automation Goal:** ${project.automation_goal}`);
  parts.push(`- **Stage:** ${project.project_stage || 'discovery'}`);
  parts.push('');

  // Architecture Contract (if locked)
  try {
    const contract = await ProjectSystemContract.findOne({
      where: { project_id: project.id },
      order: [['created_at', 'DESC']],
    });
    if (contract && (contract as any).contract_json) {
      const contractData = (contract as any).contract_json;
      parts.push('## Architecture Contract');
      if (contractData.system_name) parts.push(`- **System:** ${contractData.system_name}`);
      if (contractData.tech_stack) {
        parts.push(`- **Tech Stack:** ${Array.isArray(contractData.tech_stack) ? contractData.tech_stack.join(', ') : contractData.tech_stack}`);
      }
      if (contractData.architecture_summary) {
        parts.push('');
        parts.push(typeof contractData.architecture_summary === 'string'
          ? contractData.architecture_summary
          : JSON.stringify(contractData.architecture_summary, null, 2));
      }
      parts.push('');
    }
  } catch {}

  // Current State (scores)
  try {
    const progress = await calculateProgress(enrollmentId);
    parts.push('## Current State');
    parts.push(`- **Requirements Coverage:** ${progress.requirementsCompletionPct}%`);
    parts.push(`- **Production Readiness:** ${progress.productionReadinessScore}/100`);
    if (project.health_score) parts.push(`- **Health Score:** ${project.health_score}`);
    if (project.maturity_score) parts.push(`- **Maturity Score:** ${project.maturity_score}`);
    parts.push('');
  } catch {}

  // Requirements Checklist
  try {
    const reqStatus = await getRequirementsStatus(project.id);
    if (reqStatus.requirements && reqStatus.requirements.length > 0) {
      parts.push('## Requirements Checklist');
      for (const req of reqStatus.requirements) {
        const status = req.status === 'verified' || req.status === 'matched'
          ? 'x'
          : req.status === 'partial' ? '~' : ' ';
        const files = req.github_file_paths?.length
          ? ` → ${req.github_file_paths.join(', ')}`
          : '';
        parts.push(`- [${status}] **${req.requirement_key}**: ${req.requirement_text}${files}`);
      }
      parts.push('');
    }
  } catch {}

  // Current Task
  try {
    const currentAction = await NextAction.findOne({
      where: { project_id: project.id, status: ['pending', 'accepted'] },
      order: [['created_at', 'DESC']],
    });
    if (currentAction) {
      parts.push('## Current Task');
      parts.push(`- **Title:** ${currentAction.title}`);
      if (currentAction.reason) parts.push(`- **Reason:** ${currentAction.reason}`);
      const meta = (currentAction as any).metadata;
      if (meta?.files_suggested?.length) {
        parts.push(`- **Suggested Files:** ${meta.files_suggested.join(', ')}`);
      }
      if (meta?.requirement_key) {
        parts.push(`- **Requirement:** ${meta.requirement_key}`);
      }
      parts.push('');
    }
  } catch {}

  // Completed Tasks (session history)
  try {
    const completed = await NextAction.findAll({
      where: { project_id: project.id, status: 'completed' },
      order: [['updated_at', 'DESC']],
      limit: 10,
    });
    if (completed.length > 0) {
      parts.push('## Completed Tasks');
      for (const action of completed) {
        const date = action.created_at ? new Date(action.created_at).toISOString().split('T')[0] : '';
        parts.push(`- ${date}: ${action.title}`);
      }
      parts.push('');
    }
  } catch {}

  // Tech Stack (from GitHub connection)
  try {
    const connection = await getConnection(enrollmentId);
    if (connection) {
      parts.push('## Repository');
      parts.push(`- **URL:** ${connection.repo_url}`);
      if (connection.repo_language) parts.push(`- **Primary Language:** ${connection.repo_language}`);
      if (connection.file_count) parts.push(`- **File Count:** ${connection.file_count}`);
      parts.push('');
    }
  } catch {}

  // Project Variables (discovery data)
  if (project.project_variables && typeof project.project_variables === 'object') {
    const vars = project.project_variables;
    const relevantKeys = ['data_sources', 'success_metrics', 'stakeholders', 'constraints', 'timeline'];
    const entries = Object.entries(vars).filter(([k]) => relevantKeys.includes(k));
    if (entries.length > 0) {
      parts.push('## Discovery Context');
      for (const [key, value] of entries) {
        parts.push(`- **${key.replace(/_/g, ' ')}:** ${typeof value === 'string' ? value : JSON.stringify(value)}`);
      }
      parts.push('');
    }
  }

  // Conventions
  parts.push('## Conventions');
  parts.push('- Commit messages should reference requirement keys (e.g., "Implement REQ-003: user authentication")');
  parts.push('- Update PROJECT_STATE.json after completing significant milestones');
  parts.push('- Keep this CLAUDE.md in the repository root for context persistence');
  parts.push('');

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 2. Generate PROJECT_STATE.json
// ---------------------------------------------------------------------------

export async function generateProjectState(enrollmentId: string): Promise<string> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  let reqTotal = 0, reqCompleted = 0;
  try {
    const reqStatus = await getRequirementsStatus(project.id);
    reqTotal = reqStatus.requirements?.length || 0;
    reqCompleted = reqStatus.requirements?.filter(
      (r: any) => r.status === 'verified' || r.status === 'matched'
    ).length || 0;
  } catch {}

  const completionPct = reqTotal > 0 ? Math.round((reqCompleted / reqTotal) * 100) : 0;

  const currentAction = await NextAction.findOne({
    where: { project_id: project.id, status: ['pending', 'accepted'] },
    order: [['created_at', 'DESC']],
  });

  const state = {
    completion_percentage: completionPct,
    current_phase: (project.project_stage || 'discovery').toUpperCase(),
    last_activity: new Date().toISOString(),
    next_action: currentAction?.title || 'Generate requirements',
    requirements_total: reqTotal,
    requirements_completed: reqCompleted,
    health_score: project.health_score || null,
    velocity_score: (project as any).velocity_score || null,
    maturity_score: project.maturity_score || null,
  };

  return JSON.stringify(state, null, 2);
}

// ---------------------------------------------------------------------------
// 3. Read CLAUDE.md from participant's repo
// ---------------------------------------------------------------------------

export async function getClaudeMdFromRepo(enrollmentId: string): Promise<string | null> {
  return readFileFromRepo(enrollmentId, 'CLAUDE.md');
}

// ---------------------------------------------------------------------------
// 4. Push CLAUDE.md + PROJECT_STATE.json to participant's repo
// ---------------------------------------------------------------------------

export async function pushClaudeMdToRepo(enrollmentId: string): Promise<{
  claudeMd: boolean;
  projectState: boolean;
}> {
  const results = { claudeMd: false, projectState: false };

  try {
    const claudeMdContent = await generateClaudeMd(enrollmentId);
    await writeFileToRepo(enrollmentId, 'CLAUDE.md', claudeMdContent, 'Update CLAUDE.md — sync project state');
    results.claudeMd = true;
  } catch (err) {
    console.error('[ClaudeMd] Failed to push CLAUDE.md:', (err as Error).message);
  }

  try {
    const stateContent = await generateProjectState(enrollmentId);
    await writeFileToRepo(enrollmentId, 'PROJECT_STATE.json', stateContent, 'Update PROJECT_STATE.json — sync project state');
    results.projectState = true;
  } catch (err) {
    console.error('[ClaudeMd] Failed to push PROJECT_STATE.json:', (err as Error).message);
  }

  return results;
}

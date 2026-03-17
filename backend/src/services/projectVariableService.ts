import Project from '../models/Project';

/**
 * Project variable keys that the discovery mini-section can produce.
 */
export const DISCOVERY_VARIABLE_KEYS = [
  'business_problem',
  'ai_use_case',
  'data_sources',
  'automation_goal',
  'success_metrics',
] as const;

/**
 * Get all project variables for an enrollment.
 * Returns empty object if no project exists yet.
 */
export async function getProjectVariables(enrollmentId: string): Promise<Record<string, any>> {
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
  if (!project) return {};
  return project.project_variables || {};
}

/**
 * Merge new variables into the project's project_variables JSONB.
 * Existing keys are overwritten, new keys are added.
 */
export async function updateProjectVariables(
  projectId: string,
  variables: Record<string, any>,
): Promise<Record<string, any>> {
  const project = await Project.findByPk(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const merged = { ...(project.project_variables || {}), ...variables };
  await project.update({ project_variables: merged });
  return merged;
}

/**
 * Update project variables by enrollment ID (convenience wrapper).
 * Also updates Project model fields that correspond to known variable keys.
 */
export async function updateProjectVariablesByEnrollment(
  enrollmentId: string,
  variables: Record<string, any>,
): Promise<Record<string, any>> {
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
  if (!project) {
    throw new Error(`No project found for enrollment: ${enrollmentId}`);
  }

  // Merge into project_variables JSONB
  const merged = { ...(project.project_variables || {}), ...variables };

  // Also sync known keys to Project model columns for direct queries
  const updates: Partial<Record<string, any>> = { project_variables: merged };
  if (variables.business_problem) updates.primary_business_problem = variables.business_problem;
  if (variables.ai_use_case) updates.selected_use_case = variables.ai_use_case;
  if (variables.automation_goal) updates.automation_goal = variables.automation_goal;
  if (variables.data_sources) {
    updates.data_sources = Array.isArray(variables.data_sources)
      ? variables.data_sources
      : [variables.data_sources];
  }

  await project.update(updates);
  return merged;
}

/**
 * Build a project context block for prompt injection.
 * Returns empty string if no project or no variables set.
 */
export async function buildProjectContextBlock(enrollmentId: string): Promise<string> {
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
  if (!project) return '';

  const lines: string[] = [];

  if (project.organization_name) lines.push(`Organization: ${project.organization_name}`);
  if (project.industry) lines.push(`Industry: ${project.industry}`);
  if (project.primary_business_problem) lines.push(`Business Problem: ${project.primary_business_problem}`);
  if (project.selected_use_case) lines.push(`AI Use Case: ${project.selected_use_case}`);
  if (project.automation_goal) lines.push(`Automation Goal: ${project.automation_goal}`);
  if (project.data_sources && Array.isArray(project.data_sources) && project.data_sources.length > 0) {
    lines.push(`Data Sources: ${project.data_sources.join(', ')}`);
  }
  if (project.project_stage) lines.push(`Project Stage: ${project.project_stage}`);

  // Include any additional project_variables not already covered
  const vars = project.project_variables || {};
  const coveredKeys = new Set(['business_problem', 'ai_use_case', 'automation_goal', 'data_sources']);
  for (const [key, value] of Object.entries(vars)) {
    if (coveredKeys.has(key)) continue;
    if (!value) continue;
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
    if (displayValue.trim()) lines.push(`${label}: ${displayValue}`);
  }

  if (lines.length === 0) return '';
  return '\n=== PROJECT CONTEXT ===\n' + lines.join('\n');
}

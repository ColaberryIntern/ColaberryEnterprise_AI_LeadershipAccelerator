import { Project } from '../models';
import { getProjectByEnrollment } from './projectService';
import { fetchAndStoreContract } from './architectIntegrationService';
import { ProjectSuggestion } from './projectSuggestionService';

export interface SelectionResult {
  project: Project;
  contract: any;
  suggestion: ProjectSuggestion;
}

// ---------------------------------------------------------------------------
// Select a project suggestion and trigger contract generation
// ---------------------------------------------------------------------------

export async function selectProject(
  enrollmentId: string,
  suggestionId: string,
  suggestions: ProjectSuggestion[]
): Promise<SelectionResult> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  // Find the selected suggestion
  const suggestion = suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) throw new Error(`Suggestion not found: ${suggestionId}`);

  // Update project with selected suggestion data
  project.selected_use_case = suggestion.name;
  project.project_variables = {
    ...project.project_variables,
    selected_project_name: suggestion.name,
    selected_project_slug: suggestion.slug,
    selected_project_type: suggestion.system_type,
    selected_project_description: suggestion.description,
    selected_project_capabilities: suggestion.key_capabilities,
    selected_at: new Date().toISOString(),
  };
  await project.save();

  console.log(`[ProjectSelection] Selected: "${suggestion.name}" (${suggestion.slug}) for project ${project.id}`);

  // Trigger AI Project Architect contract generation
  let contract: any = null;
  try {
    contract = await fetchAndStoreContract(enrollmentId, suggestion.slug);
    console.log(`[ProjectSelection] Contract generated for ${suggestion.slug}`);
  } catch (err: any) {
    console.error(`[ProjectSelection] Contract generation failed: ${err.message}`);
    // Don't fail selection if architect is unavailable — contract can be generated later
  }

  return { project, contract, suggestion };
}

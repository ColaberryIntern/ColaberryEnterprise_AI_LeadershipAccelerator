import portalApi from '../utils/portalApi';

/**
 * govProjectPortalApi — the student client for an ASSIGNED government project. It calls the participant-guarded
 * backend route (GET /api/portal/gov-projects/:projectId), which returns ONLY the student-safe projection; a
 * project the student is not assigned to answers 404 (the server's enumeration defense), surfaced here as a
 * rejected promise the page renders as "not found".
 */

export interface StudentGovTrackView { trackType: string; status: string; hasBuild: boolean; }
export interface StudentGovRequirementView {
  canonicalReqId: string; statement: string; priority: string; tracks: string[]; evidenceState: string;
}
/** A build story the student works — cites its requirement, carries the Claude Code prompt, honestly unassigned. */
export interface StudentGovBuildStory {
  id: string; requirementId: string; title: string; statement: string;
  release: string; acceptance: string[]; status: 'unassigned'; prompt: string;
}
export interface StudentGovBuildRelease { key: string; name: string; storyIds: string[] }
export interface StudentGovBuildPlan { releases: StudentGovBuildRelease[]; stories: StudentGovBuildStory[]; buildStoryCount: number }
export interface StudentGovProjectView {
  projectId: string;
  name: string;
  status: string;
  tracks: StudentGovTrackView[];
  requirements: StudentGovRequirementView[];
  requirementCounts: { total: number; proposal: number; build: number };
  build: StudentGovBuildPlan;
}

export async function getStudentGovProject(projectId: string): Promise<StudentGovProjectView> {
  const { data } = await portalApi.get<{ project: StudentGovProjectView }>(
    `/api/portal/gov-projects/${encodeURIComponent(projectId)}`,
  );
  return data.project;
}

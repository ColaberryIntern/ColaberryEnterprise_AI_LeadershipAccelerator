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
/** A student's submitted completion evidence for a build story — `submitted` until a reviewer verifies it. */
export interface GovBuildEvidenceView {
  id: string; storyId: string; canonicalReqId: string; description: string;
  artifactRef: string | null; status: 'submitted' | 'verified' | 'rejected'; submittedAt: string | null;
}
/** A build story the student works — cites its requirement, carries the Claude Code prompt + submitted evidence. */
export interface StudentGovBuildStory {
  id: string; requirementId: string; title: string; statement: string;
  release: string; acceptance: string[]; status: 'unassigned'; prompt: string;
  evidence: GovBuildEvidenceView[];
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
  /** Whether the current viewer may verify evidence (a reviewer, not a student) — lights up verify/reject controls. */
  viewerCanVerify: boolean;
}

export async function getStudentGovProject(projectId: string): Promise<StudentGovProjectView> {
  const { data } = await portalApi.get<{ project: StudentGovProjectView }>(
    `/api/portal/gov-projects/${encodeURIComponent(projectId)}`,
  );
  return data.project;
}

/** Hand in completion evidence for a build story. The server records it `submitted` — a reviewer verifies later. */
export async function submitBuildStoryEvidence(
  projectId: string, storyId: string, input: { canonicalReqId: string; description: string; artifactRef?: string | null },
): Promise<GovBuildEvidenceView> {
  const { data } = await portalApi.post<{ evidence: GovBuildEvidenceView }>(
    `/api/portal/gov-projects/${encodeURIComponent(projectId)}/build-stories/${encodeURIComponent(storyId)}/evidence`,
    input,
  );
  return data.evidence;
}

/** A reviewer (evidence.verify) decides a submitted hand-in. Students get 403 server-side; the UI hides it from them. */
export async function verifyBuildStoryEvidence(
  projectId: string, evidenceId: string, decision: 'verified' | 'rejected',
): Promise<GovBuildEvidenceView> {
  const { data } = await portalApi.post<{ evidence: GovBuildEvidenceView }>(
    `/api/portal/gov-projects/${encodeURIComponent(projectId)}/build-evidence/${encodeURIComponent(evidenceId)}/verify`,
    { decision },
  );
  return data.evidence;
}

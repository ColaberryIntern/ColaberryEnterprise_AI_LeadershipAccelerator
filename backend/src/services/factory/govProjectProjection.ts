/**
 * govProjectProjection — the STUDENT-SAFE view of a government delivery project.
 *
 * A student assigned to a gov project sees the work they are doing — the project, its two tracks, and the
 * compliance requirements — but NEVER the admin/internal plumbing: tenant/org/brand ids, who created it, the
 * track OWNER identities, the raw linked student-project id, or content hashes. Those are admin-only fields;
 * sending them and hiding them in the UI would leak them (the API is the trust boundary, not the screen). This
 * module returns ONLY the safe fields, so there is no admin-only data in a student projection to begin with.
 *
 * The access check is the CALLER's job (requireGovProjectAccess). This module assumes the project was already
 * authorized; it adds one honesty guard of its own: it serves ONLY a `government_public_sector`, non-archived
 * project (any other class or an archived one resolves to null -> the route answers 404).
 */

import { deriveGovBuildPlan, buildGovStoryPrompt, type GovBuildStory, type GovBuildRelease } from './proposal/govBuildPlan';
import type { EvidenceView } from './govBuildEvidence';

export interface StudentGovTrackView { trackType: string; status: string; hasBuild: boolean; }
export interface StudentGovRequirementView {
  canonicalReqId: string; statement: string; priority: string; tracks: string[]; evidenceState: string;
}
/** A student-facing build story — the derived story, its Claude Code prompt, and the student's submitted evidence. */
export interface StudentGovBuildStory extends GovBuildStory { prompt: string; evidence: EvidenceView[]; }
export interface StudentGovBuildPlan { releases: GovBuildRelease[]; stories: StudentGovBuildStory[]; buildStoryCount: number; }
export interface StudentGovProjectView {
  projectId: string;
  name: string;
  status: string;
  tracks: StudentGovTrackView[];
  requirements: StudentGovRequirementView[];
  requirementCounts: { total: number; proposal: number; build: number };
  /** The Build-track plan for this project — releases → stories → the prompt the student works from. */
  build: StudentGovBuildPlan;
  /** Whether THIS viewer may verify evidence (holds evidence.verify) — lights up reviewer controls. Never a
   *  student (they lack evidence.verify); it is the viewer's own capability, not a leak of anyone else's. */
  viewerCanVerify: boolean;
}

/**
 * PURE: project a gov delivery project + its tracks + requirements into the student-safe view. Deliberately
 * omits every admin/internal field — the track OWNER identity and the raw `solution_student_project_id` (exposed
 * only as a boolean `hasBuild`), tenant/org/brand ids, `created_by_identity_id`, content hashes. Total.
 */
export function toStudentGovProjectView(project: any, tracks: any[], requirements: any[], viewerCanVerify = false): StudentGovProjectView {
  const trackRows: StudentGovTrackView[] = (Array.isArray(tracks) ? tracks : []).map((t) => ({
    trackType: String(t?.track_type ?? ''),
    status: String(t?.status ?? ''),
    hasBuild: !!(t && t.solution_student_project_id), // a boolean only — never the raw project id
  }));
  const reqRows: StudentGovRequirementView[] = (Array.isArray(requirements) ? requirements : []).map((r) => ({
    canonicalReqId: String(r?.canonical_req_id ?? ''),
    statement: String(r?.statement ?? ''),
    priority: String(r?.priority ?? ''),
    tracks: Array.isArray(r?.tracks) ? r.tracks.map((x: any) => String(x)) : [],
    evidenceState: String(r?.evidence_state ?? ''),
  }));
  // The Build-track plan: derive stories from the requirements' OWN tracks (solution_build only — admin
  // requirements never become a feature), each enriched with the student's Claude Code prompt. Deterministic.
  const planBase = deriveGovBuildPlan(reqRows);
  const build: StudentGovBuildPlan = {
    releases: planBase.releases,
    stories: planBase.stories.map((s) => ({ ...s, prompt: buildGovStoryPrompt(s), evidence: [] as EvidenceView[] })),
    buildStoryCount: planBase.buildStoryCount,
  };
  return {
    projectId: String(project?.id ?? ''),
    name: String(project?.name ?? ''),
    status: String(project?.status ?? ''),
    tracks: trackRows,
    requirements: reqRows,
    requirementCounts: {
      total: reqRows.length,
      proposal: reqRows.filter((r) => r.tracks.includes('proposal')).length,
      build: reqRows.filter((r) => r.tracks.includes('solution_build')).length,
    },
    build,
    viewerCanVerify,
  };
}

/**
 * Load + project. Serves ONLY a non-archived `government_public_sector` project (else null -> 404). Access must
 * already be authorized by the caller's guard; this never performs an access check of its own.
 */
export async function getStudentGovProjectView(deliveryProjectId: string, viewerCanVerify = false): Promise<StudentGovProjectView | null> {
  const { default: DeliveryProject } = await import('../../models/DeliveryProject');
  const { default: ContractTrack } = await import('../../models/ContractTrack');
  const { default: ContractRequirement } = await import('../../models/ContractRequirement');

  const project: any = await DeliveryProject.findByPk(deliveryProjectId);
  if (!project || project.project_class !== 'government_public_sector' || project.archived_at) return null;

  const tracks: any[] = await ContractTrack.findAll({ where: { delivery_project_id: deliveryProjectId } });
  const requirements: any[] = await ContractRequirement.findAll({ where: { delivery_project_id: deliveryProjectId } });
  const view = toStudentGovProjectView(project, tracks, requirements, viewerCanVerify);
  // Attach the student's submitted evidence to each build story (best-effort; never blocks the view).
  try {
    const { listBuildStoryEvidence } = await import('./govBuildEvidence');
    const evidence = await listBuildStoryEvidence(deliveryProjectId);
    if (evidence.length) {
      const byStory = new Map<string, EvidenceView[]>();
      for (const e of evidence) { const list = byStory.get(e.storyId) ?? []; list.push(e); byStory.set(e.storyId, list); }
      view.build.stories = view.build.stories.map((s) => ({ ...s, evidence: byStory.get(s.id) ?? [] }));
    }
  } catch { /* evidence is additive; a failure here never blocks the student view */ }
  return view;
}

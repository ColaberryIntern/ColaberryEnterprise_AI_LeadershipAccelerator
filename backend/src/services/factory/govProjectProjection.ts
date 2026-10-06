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

export interface StudentGovTrackView { trackType: string; status: string; hasBuild: boolean; }
export interface StudentGovRequirementView {
  canonicalReqId: string; statement: string; priority: string; tracks: string[]; evidenceState: string;
}
export interface StudentGovProjectView {
  projectId: string;
  name: string;
  status: string;
  tracks: StudentGovTrackView[];
  requirements: StudentGovRequirementView[];
  requirementCounts: { total: number; proposal: number; build: number };
}

/**
 * PURE: project a gov delivery project + its tracks + requirements into the student-safe view. Deliberately
 * omits every admin/internal field — the track OWNER identity and the raw `solution_student_project_id` (exposed
 * only as a boolean `hasBuild`), tenant/org/brand ids, `created_by_identity_id`, content hashes. Total.
 */
export function toStudentGovProjectView(project: any, tracks: any[], requirements: any[]): StudentGovProjectView {
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
  };
}

/**
 * Load + project. Serves ONLY a non-archived `government_public_sector` project (else null -> 404). Access must
 * already be authorized by the caller's guard; this never performs an access check of its own.
 */
export async function getStudentGovProjectView(deliveryProjectId: string): Promise<StudentGovProjectView | null> {
  const { default: DeliveryProject } = await import('../../models/DeliveryProject');
  const { default: ContractTrack } = await import('../../models/ContractTrack');
  const { default: ContractRequirement } = await import('../../models/ContractRequirement');

  const project: any = await DeliveryProject.findByPk(deliveryProjectId);
  if (!project || project.project_class !== 'government_public_sector' || project.archived_at) return null;

  const tracks: any[] = await ContractTrack.findAll({ where: { delivery_project_id: deliveryProjectId } });
  const requirements: any[] = await ContractRequirement.findAll({ where: { delivery_project_id: deliveryProjectId } });
  return toStudentGovProjectView(project, tracks, requirements);
}

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

import { deriveGovBuildPlan, buildGovStoryPrompt, reconcileGovBuildPlan, type GovBuildStory, type GovBuildRelease } from './proposal/govBuildPlan';
import type { EvidenceView } from './govBuildEvidence';
import type { SharedProposalView, ProposalShareLevel } from './govProposalShare';

export interface StudentGovTrackView { trackType: string; status: string; hasBuild: boolean; }
export interface StudentGovRequirementView {
  canonicalReqId: string; statement: string; priority: string; tracks: string[]; evidenceState: string;
}
/** A student-facing build story — the derived story, its Claude Code prompt, and the student's submitted evidence. */
export interface StudentGovBuildStory extends GovBuildStory { prompt: string; evidence: EvidenceView[]; }
export interface StudentGovBuildPlan {
  releases: GovBuildRelease[];
  stories: StudentGovBuildStory[];
  buildStoryCount: number;
  /** Stories whose requirement left the established set but which still carry the student's work — preserved, flagged. */
  orphanedStories: StudentGovBuildStory[];
}
/** One row of the intern-facing, PRICE-FREE submission checklist: a response slot and whether it is ship-ready. */
export interface StudentSubmissionChecklistItem {
  requirementId: string; statement: string; status: string; approved: boolean; openGapCount: number;
}
export interface StudentSubmissionChecklist {
  items: StudentSubmissionChecklistItem[];
  counts: { total: number; approved: number; remaining: number };
  /** True only when every non-pricing response is approved with no open/filler gap. */
  ready: boolean;
}
export interface StudentGovProjectView {
  projectId: string;
  name: string;
  status: string;
  tracks: StudentGovTrackView[];
  requirements: StudentGovRequirementView[];
  requirementCounts: { total: number; proposal: number; build: number };
  /** The Build-track plan for this project — releases → stories → the prompt the student works from. */
  build: StudentGovBuildPlan;
  /** P6: the proposal projected to THIS viewer's share level ('none' ⇒ empty, hidden). Pricing + identities are
   *  never carried; comment/edit additionally see the open gap questions (never the stored answer text). */
  proposal: SharedProposalView;
  /** P6: a PRICE-FREE submission checklist (one row per non-pricing response) — what is still owed before submit. */
  submissionChecklist: StudentSubmissionChecklist;
  /** Whether THIS viewer may verify evidence (holds evidence.verify) — lights up reviewer controls. Never a
   *  student (they lack evidence.verify); it is the viewer's own capability, not a leak of anyone else's. */
  viewerCanVerify: boolean;
}

/**
 * PURE: a PRICE-FREE submission checklist for an intern — one row per NON-pricing response slot, its lifecycle
 * status, and whether it is ship-ready (approved with no open/filler gap). Pricing slots are dropped by id against
 * the established set's `kind`, the same rail the proposal + requirement projections use, so an intern's checklist
 * can never carry a price. Total; garbage in yields an empty checklist.
 */
export function toStudentSubmissionChecklist(slots: any[], established: any[]): StudentSubmissionChecklist {
  const pricingIds = new Set(
    (Array.isArray(established) ? established : [])
      .filter((r) => r && String(r.kind ?? '').trim().toLowerCase() === 'pricing')
      .map((r) => String(r.id ?? r.canonicalReqId ?? r.canonical_req_id ?? '')),
  );
  const items: StudentSubmissionChecklistItem[] = (Array.isArray(slots) ? slots : [])
    .filter((s) => s && !pricingIds.has(String(s.requirementId)))
    .map((s) => {
      const gaps = Array.isArray(s.gaps) ? s.gaps : [];
      const openGapCount = gaps.filter((g: any) => g && (g.resolution === 'open' || g.resolution === 'filler')).length;
      const status = String(s.status ?? 'unanswered');
      return { requirementId: String(s.requirementId ?? ''), statement: String(s.statement ?? ''), status, approved: status === 'approved' && openGapCount === 0, openGapCount };
    });
  const approved = items.filter((i) => i.approved).length;
  return { items, counts: { total: items.length, approved, remaining: items.length - approved }, ready: items.length > 0 && approved === items.length };
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
  // P5 PRICING RAIL: a pricing requirement is administrative and its statement can carry dollar figures. Pricing is
  // admin-only, so it is DROPPED from the student projection entirely (the API is the trust boundary, not the UI) -
  // a non-admin never receives a pricing requirement, its statement, or its counts.
  const reqRows: StudentGovRequirementView[] = (Array.isArray(requirements) ? requirements : [])
    .filter((r) => String(r?.kind ?? '').trim().toLowerCase() !== 'pricing')
    .map((r) => ({
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
    orphanedStories: [],
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
    // Safe defaults — nothing shared, nothing owed — until the async loader resolves the viewer's grant + responses.
    proposal: { level: 'none', canComment: false, canEdit: false, responses: [] },
    submissionChecklist: { items: [], counts: { total: 0, approved: 0, remaining: 0 }, ready: false },
    viewerCanVerify,
  };
}

/**
 * Load + project. Serves ONLY a non-archived `government_public_sector` project (else null -> 404). Access must
 * already be authorized by the caller's guard; this never performs an access check of its own.
 */
export async function getStudentGovProjectView(deliveryProjectId: string, viewerCanVerify = false, viewerIdentityId: string | null = null): Promise<StudentGovProjectView | null> {
  const { default: DeliveryProject } = await import('../../models/DeliveryProject');
  const { default: ContractTrack } = await import('../../models/ContractTrack');
  const { default: ContractRequirement } = await import('../../models/ContractRequirement');

  const project: any = await DeliveryProject.findByPk(deliveryProjectId);
  if (!project || project.project_class !== 'government_public_sector' || project.archived_at) return null;

  const tracks: any[] = await ContractTrack.findAll({ where: { delivery_project_id: deliveryProjectId } });
  const requirements: any[] = await ContractRequirement.findAll({ where: { delivery_project_id: deliveryProjectId } });
  const view = toStudentGovProjectView(project, tracks, requirements, viewerCanVerify);
  // Overlay persisted assignment + evidence, and reconcile against revisions (orphaned work is surfaced, never
  // dropped). Best-effort; never blocks the view. STUDENT-SAFE: the status (assigned/unassigned) shows, but the
  // assignee IDENTITY is stripped — a student must not learn who else is on the project (the API is the boundary).
  try {
    const { listBuildStoryEvidence } = await import('./govBuildEvidence');
    const { listBuildStoryAssignments } = await import('./govBuildAssignment');
    const [evidence, assignments] = await Promise.all([
      listBuildStoryEvidence(deliveryProjectId),
      listBuildStoryAssignments(deliveryProjectId),
    ]);
    const byStory = new Map<string, EvidenceView[]>();
    for (const e of evidence) { const list = byStory.get(e.storyId) ?? []; list.push(e); byStory.set(e.storyId, list); }
    // Reconcile over the bare derived stories (drop the student-only prompt/evidence first; re-attach after).
    const derived: GovBuildStory[] = view.build.stories.map((s) => ({
      id: s.id, requirementId: s.requirementId, title: s.title, statement: s.statement,
      release: s.release, acceptance: s.acceptance, status: s.status,
    }));
    const recon = reconcileGovBuildPlan(derived, assignments, evidence);
    const toStudent = (s: GovBuildStory): StudentGovBuildStory => ({
      ...s,
      assigneeIdentityId: null, // never leak who else is assigned; the status alone is student-safe
      assignedAt: null,
      prompt: buildGovStoryPrompt(s),
      evidence: byStory.get(s.id) ?? [],
    });
    view.build.stories = recon.stories.map(toStudent);
    view.build.orphanedStories = recon.orphanedStories.map(toStudent);
  } catch { /* overlay is additive; a failure here never blocks the student view */ }

  // P6: the shared proposal (projected to THIS viewer's grant level) + the price-free submission checklist. Built
  // from the SAME response slots the admin workspace uses (deriveResponseSlots + the persisted responses), then run
  // through the P5 trust boundary (toSharedProposalView drops pricing + identities; 'none' ⇒ empty, hidden). The
  // full requirement set is passed as `established` so pricing is identified and dropped by id. Additive: a failure
  // here leaves the safe defaults (nothing shared, nothing owed) in place and never blocks the Build view.
  try {
    const { deriveResponseSlots, applyResponsesToSlots } = await import('./proposal/responseSlots');
    const { listProposalResponses } = await import('./govProposalResponse');
    const { toSharedProposalView, getProposalShareLevel } = await import('./govProposalShare');
    let slots = deriveResponseSlots(requirements);
    const responses = await listProposalResponses(deliveryProjectId);
    slots = applyResponsesToSlots(slots, responses as any);
    const level: ProposalShareLevel = viewerIdentityId ? await getProposalShareLevel(deliveryProjectId, viewerIdentityId) : 'none';
    view.proposal = toSharedProposalView(slots, requirements, level);
    view.submissionChecklist = toStudentSubmissionChecklist(slots, requirements);
  } catch { /* additive; the safe defaults set in the pure view remain */ }
  return view;
}

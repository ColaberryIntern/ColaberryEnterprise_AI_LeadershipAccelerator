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
import type { ProposalDocumentSection, ProposalDocType } from './proposal/govProposalDocuments';
import type { ProposalBlueprint } from './proposal/proposalBlueprintTypes';
import type { CheckScores, GovProposalGate, GateStatus } from './proposal/proposalReviewTypes';
import { proposalReadiness, type ProposalReadiness } from './proposal/proposalReadiness';
import type { VersionView, GateView } from './proposal/govProposalReviewStore';
import type { ReviewRunView } from './proposal/govProposalReviewRunStore';
import type { ProposalDocumentView } from './proposal/govProposalDocumentStore';
import { deriveBuildStoryStage, deriveProposalStage, toCommitFeed, readGovProvenanceFacts, computeOverallProgress, type BuildStage, type ProposalStage, type CommitFeedItem, type GovOverallProgress } from './govCockpit';
import type { GovBuildSummary } from './govBuildSummary';

/** v2 Proposal view: one named document a bid must submit, projected student-safe (no comment-author identities). */
export interface StudentProposalDocumentComment { body: string; at: string; }
/** B.1: the current (latest) version summary for a document — identity-free (authorKind only, never an author id). */
export interface GovDocLatest {
  versionId: string;
  version: number;
  scores: Partial<CheckScores>;
  passes: boolean;
  pageCount: number | null;
  createdAt: string | null;
}
export interface StudentProposalDocument {
  key: string; title: string; status: string; contentHtml: string | null;
  version: number; gate: boolean; order: number; requirementIds: string[];
  /** P1: the document's sections (one per covered requirement). The pricing document is dropped whole above, so no
   *  pricing section ever reaches a student — the sections ride on the non-pricing documents only. */
  sections: ProposalDocumentSection[];
  /** P2: blueprint-derived shape (the pricing document is dropped whole, so these never carry a price). */
  docType: ProposalDocType; pageLimit: number | null; fileName: string | null; blueprintVersion: number | null;
  comments: StudentProposalDocumentComment[]; draftedAt: string | null; acceptedAt: string | null;
  /** C.1: "No longer required" — a blueprint form doc that no longer applies but still has authored work. */
  superseded: boolean;
  /** B.1 read-model (batch-loaded into the projection, no N+1): the per-document summary the Studio UI reads so it
   *  does not fetch versions/gates/runs one doc at a time. All identity-free. */
  latest: GovDocLatest | null;
  gates: Record<GovProposalGate, GateStatus>;
  currentGate: GovProposalGate | null;
  openGapCount: number;
  fatalCount: number;
  cycle: { status: string; runId: string } | null;
  /** v3 (T05): open HumanNeeds that touch this document, viewer-filtered. `fatalNeedsCount` of them block export.
   *  Optional + loader-filled so pre-existing view literals still compile. */
  needsCount?: number;
  fatalNeedsCount?: number;
}

export interface StudentGovTrackView { trackType: string; status: string; hasBuild: boolean; }
export interface StudentGovRequirementView {
  canonicalReqId: string; statement: string; priority: string; tracks: string[]; evidenceState: string;
}
/** A student-facing build story — the derived story, its Claude Code prompt, and the student's submitted evidence. */
export interface StudentGovBuildStory extends GovBuildStory {
  prompt: string;
  evidence: EvidenceView[];
  /** The 4-stage board column (todo/build/matched/done), derived from assignment + evidence. A commit reaches
   *  `matched` at most; only a reviewer-verified row makes it `done`. */
  stage: BuildStage;
  /** Build stories are AI-worked (handed to Claude Code in the build repo); the proposal checklist is human-owned. */
  owner: 'ai';
  /** True when THIS viewer is the story's assignee — the student-safe form of "assigned to me" (never the id). */
  mine: boolean;
  /** The latest matched build-repo commit for this story (sha + first message line), or null. Student-safe. */
  commit: { sha: string; message: string } | null;
}
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
  /** The 3-stage board column (todo/build/done) — a proposal task closes by approval, never a commit. */
  stage: ProposalStage;
  /** Proposal tasks are human-owned (reviews, answers, demo), as against AI-worked build stories. */
  owner: 'human';
  /** True when THIS viewer can edit the proposal (it is theirs to work). */
  mine: boolean;
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
  /** The soliciting agency (public) for the cockpit's project bar. Null when not captured. */
  agency: string | null;
  /** Detected key-date lines (public) — the frontend's govDeadline helper turns these into the close countdown. */
  keyDates: Array<{ date: string | null; text: string | null }>;
  /** Cockpit: the AUTHORITATIVE submission close date for the Studio bar's countdown — the qualification's
   *  source-snapshot closeAt/closeDate, falling back to the dossier key dates (resolveGovCloseDate). Null when none
   *  resolves. Carries no identity. Optional so pre-existing view literals still compile. */
  closeDate?: string | null;
  /** Cockpit: the opportunity's 0-100 priority score (urgency), from the qualification's source snapshot. The Studio
   *  bar shows it next to the countdown so the deadline + urgency survive the move into the Studio. Null when not
   *  captured. Optional so pre-existing view literals still compile. */
  priorityScore?: number | null;
  /** The build-repo commit feed: every matched push for this project, newest first (public commit facts, no identity). */
  commitFeed: CommitFeedItem[];
  /** v2 Build view: the SBP build summary (releases -> stories + progress) and the linked project id for the
   *  deep-link to the build workspace. Null when no build is linked yet. */
  buildSummary: GovBuildSummary | null;
  /** v2 Proposal view: the named documents a bid must submit (AI-drafted, reviewer-accepted). Admin-only docs
   *  (pricing) are dropped for non-reviewers. Each carries the B.1 per-doc summary (latest/gates/currentGate/
   *  openGapCount/fatalCount/cycle), batch-loaded. */
  proposalDocuments: StudentProposalDocument[];
  /** B.1/C.2: the proposal readiness meter — `pct` of scored (non-pricing, non-superseded, non-form) documents that
   *  pass, `passing` of `total`. The header's "Proposal ready x% / 95%" + Where-we-are read this. Same for everyone
   *  (pricing is excluded, not viewer-dependent). */
  proposalReadiness: ProposalReadiness;
  /** P2: the current blueprint derived from the stored solicitation (scoring, Section L rules, required forms incl.
   *  the Texas engine, addenda). Null until a reanalyze has run. Carries no pricing values and no identities. */
  blueprint?: ProposalBlueprint | null;
  /** P4: screenshots captured from the verified build demo, tagged with the requirements they prove. No identities.
   *  Optional at the type level (the loader always sets it) so pre-existing view literals still compile. */
  buildArtifacts?: StudentGovBuildArtifact[];
  /** v2: combined completion across verified build stories + accepted proposal documents — the honest project %. */
  overallProgress: GovOverallProgress;
  /** v3 (T05): the one needs number for the project — open HumanNeeds a human must supply, viewer-filtered (an
   *  intern never sees a pricing or Gold-approval need counted). `fatalNeedsCount` of them block export. Optional +
   *  loader-filled so pre-existing view literals still compile. */
  needsCount?: number;
  fatalNeedsCount?: number;
}

/** P4: a build-evidence screenshot projected student-safe (no identities; the artifact rows carry none). */
export interface StudentGovBuildArtifact { id: string; storyId: string; requirementIds: string[]; commitSha: string | null; caption: string | null; capturedAt: string | null; status: string; }

/**
 * PURE: a PRICE-FREE submission checklist for an intern — one row per NON-pricing response slot, its lifecycle
 * status, and whether it is ship-ready (approved with no open/filler gap). Pricing slots are dropped by id against
 * the established set's `kind`, the same rail the proposal + requirement projections use, so an intern's checklist
 * can never carry a price. Total; garbage in yields an empty checklist.
 */
export function toStudentSubmissionChecklist(slots: any[], established: any[], canEdit = false): StudentSubmissionChecklist {
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
      const approved = status === 'approved' && openGapCount === 0;
      return {
        requirementId: String(s.requirementId ?? ''), statement: String(s.statement ?? ''), status, approved, openGapCount,
        stage: deriveProposalStage({ status, approved }), owner: 'human' as const, mine: canEdit,
      };
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
    // Pure defaults: with no assignment/evidence loaded here, every story is `todo` and unclaimed; the async
    // overlay in getStudentGovProjectView recomputes stage/mine/commit from the persisted state.
    stories: planBase.stories.map((s) => ({ ...s, prompt: buildGovStoryPrompt(s), evidence: [] as EvidenceView[], stage: 'todo' as const, owner: 'ai' as const, mine: false, commit: null })),
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
    // Cockpit project-bar + feed defaults; the async loader fills agency/keyDates (from the qualification) and the
    // commit feed (from the project's github_push evidence).
    agency: null,
    keyDates: [],
    closeDate: null, // filled by the async loader from the qualification's authoritative close date
    priorityScore: null, // filled by the async loader from the qualification's source snapshot
    commitFeed: [],
    buildSummary: null, // filled by the async loader from the materialized SBP build
    proposalDocuments: [], // filled by the async loader from the derived + synced documents
    proposalReadiness: { pct: 0, passing: 0, total: 0 }, // filled by the async loader from the per-doc summaries
    blueprint: null, // filled by the async loader from the latest stored blueprint
    buildArtifacts: [], // filled by the async loader from gov_build_artifacts
    overallProgress: computeOverallProgress({ buildVerified: 0, buildTotal: 0, docsAccepted: 0, docsTotal: 0 }),
  };
}

/** B.1 per-document summary SOURCE: a synced doc view joined with its current version, gate decisions, open-gap count
 *  and latest review run. The async loader builds these from batch-loaded maps; {@link assembleProposalDocuments} is
 *  PURE over them, so it is unit-testable without a DB. */
export interface ProposalDocSummarySource {
  view: ProposalDocumentView;
  latest: VersionView | null;
  gates: GateView[];
  openGapCount: number;
  latestRun: ReviewRunView | null;
}

const EMPTY_GATES: Record<GovProposalGate, GateStatus> = { pink: 'pending', red: 'pending', gold: 'pending', white_glove: 'pending' };
const GATE_SEQUENCE: GovProposalGate[] = ['pink', 'red', 'gold', 'white_glove'];

/**
 * PURE: assemble the viewer-filtered per-document summaries + the readiness meter from batch-loaded sources (B.1).
 * Pricing (admin_only) docs are dropped for a non-reviewer in the CARD list; identities never appear (the version
 * summary carries authorKind only, gates carry no reviewer id). `currentGate` is the first gate not yet approved
 * (null ⇒ all approved ⇒ "Passed"). `fatalCount` comes from the latest version's findings. Readiness is computed
 * over ALL sources via the pure proposalReadiness (which drops pricing/superseded/form), so it is the same honest
 * number for admin and intern alike. Total: garbage ⇒ empty documents + zero readiness.
 */
export function assembleProposalDocuments(sources: ProposalDocSummarySource[], viewerCanVerify: boolean): { documents: StudentProposalDocument[]; readiness: ProposalReadiness } {
  const list = (Array.isArray(sources) ? sources : []).filter((s) => s && s.view);
  const documents: StudentProposalDocument[] = list
    .filter((s) => viewerCanVerify || !s.view.adminOnly)
    .map((s) => {
      const d = s.view;
      const gates: Record<GovProposalGate, GateStatus> = { ...EMPTY_GATES };
      for (const g of Array.isArray(s.gates) ? s.gates : []) gates[g.gate] = (g.status as GateStatus) ?? 'pending';
      const currentGate = GATE_SEQUENCE.find((g) => gates[g] !== 'approved') ?? null;
      const fatalCount = s.latest ? (s.latest.findings ?? []).filter((f) => f.severity === 'fatal').length : 0;
      const latest: GovDocLatest | null = s.latest
        ? { versionId: s.latest.id, version: s.latest.version, scores: s.latest.scores ?? {}, passes: !!s.latest.passes, pageCount: s.latest.pageCount ?? null, createdAt: s.latest.createdAt ?? null }
        : null;
      return {
        key: d.key, title: d.title, status: d.status, contentHtml: d.contentHtml, version: d.version,
        gate: d.gate, order: d.order, requirementIds: d.requirementIds, sections: d.sections,
        docType: d.docType, pageLimit: d.pageLimit, fileName: d.fileName, blueprintVersion: d.blueprintVersion,
        comments: (Array.isArray(d.comments) ? d.comments : []).map((c) => ({ body: c.body, at: c.at })),
        draftedAt: d.draftedAt, acceptedAt: d.acceptedAt,
        superseded: !!d.superseded,
        latest, gates, currentGate,
        openGapCount: s.openGapCount ?? 0,
        fatalCount,
        cycle: s.latestRun ? { status: s.latestRun.status, runId: s.latestRun.id } : null,
      };
    });
  const readiness = proposalReadiness(list.map((s) => ({ adminOnly: s.view.adminOnly, superseded: s.view.superseded, docType: s.view.docType, passes: !!s.latest?.passes })));
  return { documents, readiness };
}

/**
 * PURE (v3 T05): collapse a (viewer-filtered) HumanNeed list into counts — the project total + how many are fatal,
 * and the same per document. A need counts once for the project and once per distinct document it touches, so a
 * card's number is "needs that touch me" and the project number is "needs overall". Structurally typed so the
 * projection does not couple to the full HumanNeed shape.
 */
export function summarizeNeeds(
  needs: Array<{ blocking?: string; usedIn?: Array<{ docKey?: string }> }>,
): { total: number; fatal: number; byDoc: Record<string, { total: number; fatal: number }> } {
  const byDoc: Record<string, { total: number; fatal: number }> = {};
  let total = 0;
  let fatal = 0;
  for (const n of needs || []) {
    const isFatal = n?.blocking === 'fatal';
    total += 1;
    if (isFatal) fatal += 1;
    const docs = new Set<string>();
    for (const u of n?.usedIn || []) {
      if (u && typeof u.docKey === 'string' && u.docKey) docs.add(u.docKey);
    }
    for (const dk of docs) {
      const cell = byDoc[dk] || (byDoc[dk] = { total: 0, fatal: 0 });
      cell.total += 1;
      if (isFatal) cell.fatal += 1;
    }
  }
  return { total, fatal, byDoc };
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
    const toStudent = (s: GovBuildStory): StudentGovBuildStory => {
      const evList = byStory.get(s.id) ?? [];
      // The latest matched build-repo commit for this story (evidence is newest-first), if any.
      const pushEv = evList.find((e) => e.source === 'github_push' && e.commitSha);
      // "mine" is computed from the assignee id BEFORE it is stripped — only the boolean leaves this boundary.
      const mine = !!viewerIdentityId && s.assigneeIdentityId === viewerIdentityId;
      return {
        ...s,
        assigneeIdentityId: null, // never leak who else is assigned; the status alone is student-safe
        assignedAt: null,
        prompt: buildGovStoryPrompt(s),
        evidence: evList,
        stage: deriveBuildStoryStage({ assigned: s.status === 'assigned', evidence: evList }),
        owner: 'ai' as const,
        mine,
        commit: pushEv ? { sha: String(pushEv.commitSha), message: pushEv.description } : null,
      };
    };
    view.build.stories = recon.stories.map(toStudent);
    view.build.orphanedStories = recon.orphanedStories.map(toStudent);
    // The project's build-repo commit feed (matched pushes, newest first) — public commit facts, no identity.
    view.commitFeed = toCommitFeed(evidence);
  } catch { /* overlay is additive; a failure here never blocks the student view */ }

  // Cockpit project bar: the soliciting agency + detected key dates, from THIS project's qualification
  // (requirements_json.provenance + .dossier). Best-effort + student-safe (readGovProvenanceFacts carries only the
  // public agency + key-date lines, never the dossier's contacts or any evaluation/compliance internals).
  try {
    const { default: GovQualification } = await import('../../models/GovQualification');
    const qual: any = await GovQualification.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
    if (qual) {
      const facts = readGovProvenanceFacts(qual.requirements_json);
      view.agency = facts.agency;
      view.keyDates = facts.keyDates;
      // The AUTHORITATIVE deadline + urgency the pursuit carried, so they survive the move into the Studio (the
      // discovery feed's "Closes … · N days left" + Priority). Read the source snapshot's closeAt/closeDate (what the
      // feed uses) — the SAME authoritative branch as govPipeline.resolveGovCloseDate; the ZIP-only dossier fallback is
      // left to the frontend (ContractBar already falls back to dossierDeadlineIso(view.keyDates)), so the student
      // projection stays decoupled from the pipeline module. priorityScore is the 0-100 urgency; null when uncaptured.
      const snap: any = (qual as { source_snapshot?: any }).source_snapshot || null;
      const op: any = snap && snap.opportunity ? snap.opportunity : null;
      const closeAt = (snap && snap.closeAt) || (op && op.closeAt);
      const closeDate = (snap && snap.closeDate) || (op && op.closeDate);
      view.closeDate = closeAt ? String(closeAt) : (closeDate ? String(closeDate) : null);
      view.priorityScore = (snap && (snap.priorityScore ?? (op && op.priorityScore))) ?? null;
    }
  } catch { /* additive; agency/keyDates/closeDate/priorityScore stay at their safe defaults */ }

  // v2 Build view: the SBP build summary (releases -> stories + progress) for the linked build project. Best-effort;
  // it also lazily publishes the plan so the commit->story loop runs. Null when no build is linked yet.
  try {
    const { getGovBuildSummary } = await import('./govBuildSummary');
    view.buildSummary = await getGovBuildSummary(deliveryProjectId);
  } catch { /* additive; buildSummary stays null */ }

  // v2 Proposal view: derive the named documents from the established requirements, SYNC them into the store
  // (preserving authored state), and project student-safe — admin-only (pricing) documents are dropped for a
  // non-reviewer, and comment-author identities are stripped. The overall project % counts ALL documents + build
  // stories (so it is the same honest number for everyone), while the CARD list is viewer-filtered. Best-effort.
  try {
    const { deriveProposalDocuments } = await import('./proposal/govProposalDocuments');
    const { syncProposalDocuments } = await import('./proposal/govProposalDocumentStore');
    // P2: derive the document set FROM the current blueprint (if one has been built), so the sync preserves the
    // blueprint-derived fields (doc_type/page_limit/file_name/blueprint_version) rather than resetting them. The
    // blueprint itself carries no pricing values and no identities, so it is projected as-is.
    const { default: GovProposalBlueprint } = await import('../../models/GovProposalBlueprint');
    const bpRow: any = await GovProposalBlueprint.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
    const blueprint: ProposalBlueprint | null = bpRow ? (bpRow.blueprint_json as ProposalBlueprint) : null;
    view.blueprint = blueprint;
    const docs = await syncProposalDocuments(deliveryProjectId, deriveProposalDocuments(requirements, blueprint, { blueprintVersion: bpRow?.version }));
    // B.1 read-model: fold the per-document summary (latest/gates/currentGate/openGapCount/fatalCount/cycle) into the
    // projection, BATCH-loaded — one query each for current versions, gate decisions, open-gap counts and latest
    // runs across all docs (no per-doc N+1). The pure assembleProposalDocuments applies the viewer filter + readiness.
    const { listVersionsByIds, listGatesForDocs } = await import('./proposal/govProposalReviewStore');
    const { latestRunsForDocs } = await import('./proposal/govProposalReviewRunStore');
    const { openGapCountsByDoc } = await import('./proposal/govProposalGaps');
    const { default: GovProposalDocumentModel } = await import('../../models/GovProposalDocument');
    const docRows: any[] = await GovProposalDocumentModel.findAll({ where: { delivery_project_id: deliveryProjectId } });
    const idByKey = new Map<string, string>();
    const curVerByKey = new Map<string, string | null>();
    for (const r of docRows) { const p: any = r.get({ plain: true }); idByKey.set(p.doc_key, p.id); curVerByKey.set(p.doc_key, p.current_version_id ?? null); }
    const docIds = [...idByKey.values()];
    const currentVersionIds = [...curVerByKey.values()].filter((v): v is string => !!v);
    const [versionsById, gatesByDocId, openGapsByKey, runsByDocId] = await Promise.all([
      listVersionsByIds(currentVersionIds),
      listGatesForDocs(docIds),
      openGapCountsByDoc(deliveryProjectId),
      latestRunsForDocs(docIds),
    ]);
    const sources: ProposalDocSummarySource[] = docs.map((d) => {
      const id = idByKey.get(d.key) ?? '';
      const curVer = curVerByKey.get(d.key) ?? null;
      return {
        view: d,
        latest: curVer ? (versionsById.get(curVer) ?? null) : null,
        gates: gatesByDocId.get(id) ?? [],
        openGapCount: openGapsByKey.get(d.key) ?? 0,
        latestRun: runsByDocId.get(id) ?? null,
      };
    });
    const assembled = assembleProposalDocuments(sources, viewerCanVerify);
    view.proposalDocuments = assembled.documents;
    view.proposalReadiness = assembled.readiness;
    // v3 (T05): the needs counts, viewer-filtered — an intern never sees a pricing or Gold-approval need counted.
    // Project total + per-document, so the Needs-you inbox and each card show the number without a second fetch.
    try {
      const { collectProjectNeeds } = await import('./proposal/collectProjectNeeds');
      const { needsForViewer } = await import('./proposal/aggregateNeeds');
      const projNeeds = needsForViewer(await collectProjectNeeds(deliveryProjectId), { includePricing: viewerCanVerify, canApprove: viewerCanVerify });
      const sum = summarizeNeeds(projNeeds);
      view.needsCount = sum.total;
      view.fatalNeedsCount = sum.fatal;
      for (const d of view.proposalDocuments) {
        const cell = sum.byDoc[d.key];
        d.needsCount = cell?.total ?? 0;
        d.fatalNeedsCount = cell?.fatal ?? 0;
      }
    } catch { /* additive; needs counts stay undefined */ }
    view.overallProgress = computeOverallProgress({
      buildVerified: view.buildSummary?.rollup.verified ?? 0,
      buildTotal: view.buildSummary?.rollup.total ?? 0,
      docsAccepted: docs.filter((d) => d.status === 'accepted').length,
      docsTotal: docs.length,
    });
  } catch { /* additive; proposalDocuments/overallProgress stay at defaults */ }

  // P4: build-evidence artifacts for this project (no identities — the rows carry none). Additive + best-effort.
  try {
    const { default: GovBuildArtifact } = await import('../../models/GovBuildArtifact');
    const rows = await GovBuildArtifact.findAll({ where: { delivery_project_id: deliveryProjectId }, order: [['captured_at', 'DESC']] });
    view.buildArtifacts = rows.map((r) => {
      const p = r.get({ plain: true }) as any;
      return { id: p.id, storyId: p.story_id, requirementIds: Array.isArray(p.requirement_ids) ? p.requirement_ids : [], commitSha: p.commit_sha ?? null, caption: p.caption ?? null, capturedAt: p.captured_at ? new Date(p.captured_at).toISOString() : null, status: p.status };
    });
  } catch { /* additive; buildArtifacts stays [] */ }

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
    view.submissionChecklist = toStudentSubmissionChecklist(slots, requirements, view.proposal.canEdit);
  } catch { /* additive; the safe defaults set in the pure view remain */ }
  return view;
}

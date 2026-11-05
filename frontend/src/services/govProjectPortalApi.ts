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
/** The 4-stage cockpit board column a build story moves through (a commit reaches `matched` at most). */
export type GovBuildStage = 'todo' | 'build' | 'matched' | 'done';
/** A proposal task closes by approval, so it never enters `matched`. */
export type GovProposalStage = 'todo' | 'build' | 'done';
/** A student's submitted completion evidence for a build story — `submitted` until a reviewer verifies it. */
export interface GovBuildEvidenceView {
  id: string; storyId: string; canonicalReqId: string; description: string;
  artifactRef: string | null; status: 'submitted' | 'verified' | 'rejected'; submittedAt: string | null;
  /** 'student' for a manual hand-in, 'github_push' for an auto-matched build-repo commit. Optional (older backends). */
  source?: 'student' | 'github_push';
  /** The matched commit's SHA (github_push only). Optional (older backends). */
  commitSha?: string | null;
}
/** A build story the student works — cites its requirement, carries the Claude Code prompt + submitted evidence. */
export interface StudentGovBuildStory {
  id: string; requirementId: string; title: string; statement: string;
  release: string; acceptance: string[];
  /** `assigned` once an operator assigns it (the student never sees WHO — only the status). */
  status: 'unassigned' | 'assigned'; prompt: string;
  /** True when the requirement left the established set but the student's work is preserved (revision). */
  orphaned?: boolean;
  evidence: GovBuildEvidenceView[];
  /** Cockpit board column, derived from assignment + evidence. Optional (absent on older backends ⇒ derive). */
  stage?: GovBuildStage;
  /** Build stories are AI-worked. Optional (older backends). */
  owner?: 'ai';
  /** True when THIS viewer is the assignee (the student-safe "assigned to me"; never the id). Optional. */
  mine?: boolean;
  /** The latest matched build-repo commit (sha + first message line), or null. Optional (older backends). */
  commit?: { sha: string; message: string } | null;
}
/** One row of the project's build-repo commit feed (matched pushes, newest first) — public commit facts, no identity. */
export interface GovCommitFeedItem {
  sha: string; message: string; storyKey: string; at: string | null; verified: boolean;
}
export interface StudentGovBuildRelease { key: string; name: string; storyIds: string[] }
export interface StudentGovBuildPlan {
  releases: StudentGovBuildRelease[]; stories: StudentGovBuildStory[]; buildStoryCount: number;
  /** Stories whose requirement was revised away but whose work is preserved (optional — absent on older backends). */
  orphanedStories?: StudentGovBuildStory[];
}
/** P6: one shared proposal response, projected to the viewer's share level. Never carries a price or an identity. */
export interface SharedProposalResponse {
  requirementId: string; statement: string; status: string; content: string; openGapCount: number;
  /** Present only for comment/edit members — the open gap QUESTIONS, never the stored answer text. */
  gaps?: { id: string; question: string; suggestions: string[]; resolution: string }[];
}
/** P6: the proposal as THIS viewer may see it. `level: 'none'` ⇒ not shared (empty responses, hidden in the UI). */
export interface SharedProposalView {
  level: 'none' | 'view' | 'comment' | 'edit';
  canComment: boolean;
  canEdit: boolean;
  responses: SharedProposalResponse[];
}
/** P6: one row of the PRICE-FREE submission checklist. */
export interface StudentSubmissionChecklistItem {
  requirementId: string; statement: string; status: string; approved: boolean; openGapCount: number;
  /** Cockpit board column (proposal closes by approval — never `matched`). Optional (older backends). */
  stage?: GovProposalStage;
  /** Proposal tasks are human-owned. Optional (older backends). */
  owner?: 'human';
  /** True when THIS viewer can edit the proposal. Optional (older backends). */
  mine?: boolean;
}
export interface StudentSubmissionChecklist {
  items: StudentSubmissionChecklistItem[];
  counts: { total: number; approved: number; remaining: number };
  ready: boolean;
}
export interface StudentGovProjectView {
  projectId: string;
  name: string;
  status: string;
  tracks: StudentGovTrackView[];
  requirements: StudentGovRequirementView[];
  requirementCounts: { total: number; proposal: number; build: number };
  build: StudentGovBuildPlan;
  /** P6: the proposal projected to this viewer's share level ('none' ⇒ not shared). Optional — absent on older backends. */
  proposal?: SharedProposalView;
  /** P6: the price-free submission checklist. Optional — absent on older backends. */
  submissionChecklist?: StudentSubmissionChecklist;
  /** Whether the current viewer may verify evidence (a reviewer, not a student) — lights up verify/reject controls. */
  viewerCanVerify: boolean;
  /** Cockpit: the soliciting agency (public), for the project bar. Optional (older backends). */
  agency?: string | null;
  /** Cockpit: detected key-date lines (public) — fed to the govDeadline countdown helper. Optional (older backends). */
  keyDates?: Array<{ date: string | null; text: string | null }>;
  /** Cockpit: the build-repo commit feed (matched pushes, newest first). Optional (older backends). */
  commitFeed?: GovCommitFeedItem[];
  /** v2 Build view: releases → stories + progress + the linked project id for the deep-link. Optional (older backends). */
  buildSummary?: GovBuildSummary | null;
  /** v2 Proposal view: the named documents a bid must submit (admin-only pricing dropped for non-reviewers). Optional. */
  proposalDocuments?: GovProposalDocument[];
  /** P2: the blueprint derived from the stored solicitation (scoring, Section L rules, required forms). Null until a
   *  reanalyze runs; optional on older backends. Carries no pricing values and no identities. */
  blueprint?: GovProposalBlueprint | null;
  /** P4: screenshots captured from the verified build demo, tagged with the requirements they prove. Optional. */
  buildArtifacts?: GovBuildArtifactView[];
  /** v2: combined completion across verified build stories + accepted documents. Optional (older backends). */
  overallProgress?: GovOverallProgress;
  /** U1 (B.1/C.2): the proposal readiness meter — pct of scored (non-pricing/superseded/form) documents that pass. */
  proposalReadiness?: GovProposalReadiness;
}

/** U1: the readiness meter the Studio header + Where-we-are read ("Proposal ready x% / 95%"). */
export interface GovProposalReadiness { pct: number; passing: number; total: number; }

/** The project copilot's grounded answer to a question (deterministic, from the student-safe projection). */
export interface GovCopilotAnswer { intent: 'next' | 'review' | 'risk' | 'proposal' | 'other'; answer: string; }

// ── v2: the Build summary (releases → stories) and the Proposal documents ──────────────────────────────────────
export interface GovBuildStorySummary { storyId: string; title: string; releaseKey: string; status: string; verified: boolean; }
export interface GovBuildReleaseSummary { key: string; name: string; status: string; stories: GovBuildStorySummary[]; }
export interface GovBuildRollup { total: number; verified: number; complete: number; inProgress: number; blocked: number; notStarted: number; pct: number; }
export interface GovBuildSummary { studentProjectId: string; releases: GovBuildReleaseSummary[]; rollup: GovBuildRollup; }

export interface GovProposalDocumentComment { body: string; at: string; }
export type GovProposalDocumentStatus = 'not_started' | 'drafting' | 'drafted' | 'changes_requested' | 'accepted';
export type GovProposalDocType = 'derived' | 'form' | 'generated' | 'build';
export type GovGateStatus = 'pending' | 'approved' | 'returned';
/** U1 (B.1): the current-version summary carried on each document (identity-free). */
export interface GovDocLatest { versionId: string; version: number; scores: Partial<Record<GovCheckKey, number>>; passes: boolean; pageCount: number | null; createdAt: string | null; }
export interface GovProposalDocument {
  key: string; title: string; status: GovProposalDocumentStatus; contentHtml: string | null;
  version: number; gate: boolean; order: number; requirementIds: string[];
  /** P2 blueprint-derived shape (optional — absent on older backends / the P1 path). */
  docType?: GovProposalDocType; pageLimit?: number | null; fileName?: string | null; blueprintVersion?: number | null;
  comments: GovProposalDocumentComment[]; draftedAt: string | null; acceptedAt: string | null;
  /** U1 (B.1) per-doc summary (optional — absent on older backends): latest version, gate statuses, current gate,
   *  open-question + fatal counts, the latest review-cycle, and the "No longer required" flag. */
  superseded?: boolean;
  latest?: GovDocLatest | null;
  gates?: Record<GovGateName, GovGateStatus>;
  currentGate?: GovGateName | null;
  openGapCount?: number;
  fatalCount?: number;
  cycle?: { status: string; runId: string } | null;
}

// ── U1 read-model surfaces the Studio UI consumes (questions, activity, review runs, version content) ──────────────
/** B.3: one open question for the agent panel's "Needs your answer" list. `key` round-trips to the answer route. */
export interface GovOpenQuestion { key: string; question: string; why: string | null; documentKeys: string[]; suggestions: string[]; }
/** B.4: one derived activity event for the agent-panel feed. */
export type GovActivityKind = 'version' | 'gate' | 'artifact' | 'blueprint' | 'library_answer' | 'signature';
export interface GovActivityEvent { kind: GovActivityKind; at: string; summary: string; docKey?: string | null; }
/** B.5: a review-cycle run's pollable status. */
export type GovReviewRunStatus = 'running' | 'passed' | 'blocked' | 'failed' | 'done';
export interface GovReviewRun { id: string; documentId: string; status: GovReviewRunStatus; iterations: number; lastMessage: string | null; startedAt: string | null; finishedAt: string | null; }
/** B.2: a version's stored content for the paper preview. */
export interface GovVersionContent { contentHtml: string | null; sections: Array<{ sectionKey: string; heading: string; requirementIds: string[]; order: number; plan?: string; planFields?: GovSectionPlanFields; contentHtml?: string }>; figures: unknown[]; }
export interface GovSectionPlanFields { hotButton: string; feature: string; benefit: string; proof: string; discriminator: string; }

// ── P2: the blueprint (quoted, cited rulebook from the stored solicitation ZIP) ────────────────────────────────
export type GovRuleSeverity = 'fatal' | 'curable' | 'info';
export interface GovBlueprintRule { key: string; value: string; quote: string; sourceFile: string; page?: number; severity: GovRuleSeverity; }
export type GovFormDisposition = 'required' | 'not_required' | 'needs_input' | 'at_award';
export interface GovRequiredForm { key: string; label: string; disposition: GovFormDisposition; triggerReason: string; timing: string; severity: GovRuleSeverity; citation: string; quote?: string; sourceFile?: string; }
export interface GovBlueprintScoringFactor { label: string; points?: number; percent?: number; quote: string; }
export interface GovBlueprintScoring { basis: string | null; basisQuote: string | null; totalPoints: number | null; factors: GovBlueprintScoringFactor[]; }
export interface GovProposalBlueprint {
  rules: GovBlueprintRule[]; forms: GovRequiredForm[]; scoring: GovBlueprintScoring; addenda: GovBlueprintRule[];
  eliminationRisks: Array<{ statement: string; quote: string; sourceFile: string }>;
  buyerType: string | null; droppedRuleCount: number; sourceFiles: string[]; generatedAt: string;
}
export interface GovOverallProgress { buildVerified: number; buildTotal: number; docsAccepted: number; docsTotal: number; pct: number; }

// ── P3: versions, checks, gates ────────────────────────────────────────────────────────────────────────────────
export type GovCheckKey = 'coverage' | 'format' | 'fact' | 'evaluator' | 'proof' | 'clarity';
export interface GovCheckFinding { check: GovCheckKey; severity: 'fatal' | 'major' | 'minor' | 'info'; message: string; sectionKey?: string; }
export interface GovDocumentVersion { id: string; version: number; authorKind: 'agent' | 'human'; changeSummary: string | null; scores: Partial<Record<GovCheckKey, number>>; findings: GovCheckFinding[]; passes: boolean; pageCount: number | null; createdAt: string | null; }
export type GovGateName = 'pink' | 'red' | 'gold' | 'white_glove';
export interface GovGateReview { gate: GovGateName; status: string; versionId: string | null; note: string | null; decidedAt: string | null; }
export interface GovCheckRunResult { scores: Record<GovCheckKey, number>; findings: GovCheckFinding[]; fatal: GovCheckFinding[]; passes: boolean; pageCount: number | null; }
export interface GovDiffSegment { type: 'same' | 'add' | 'del'; text: string; }

// ── P4: build-evidence artifacts ─────────────────────────────────────────────────────────────────────────────
export interface GovBuildArtifactView { id: string; storyId: string; requirementIds: string[]; commitSha: string | null; caption: string | null; capturedAt: string | null; status: string; }

// ── P6: package & export ─────────────────────────────────────────────────────────────────────────────────────
export interface GovSignatureView { formKey: string; signerRole: string; status: string; required: boolean; hasFile: boolean }
export interface GovPackageManifestItem { docKey: string; title: string; fileName: string; version: number; pageCount: number | null; sha256: string; blueprintVersion: number | null; sealed: boolean }
export interface GovPackageResult { ok: boolean; blocking: string[]; manifest?: { exportedAt: string; blueprintVersion: number | null; fileCount: number; items: GovPackageManifestItem[] }; rendered?: number }

/** The reviewer-only P3/P4 actions, provided by the admin cockpit (interns get no reviewApi — gates are reviewer-only). */
export interface GovReviewApi {
  listReview(projectId: string, docKey: string): Promise<{ versions: GovDocumentVersion[]; gates: GovGateReview[] }>;
  runChecks(projectId: string, docKey: string): Promise<GovCheckRunResult>;
  decideGate(projectId: string, docKey: string, gate: GovGateName, decision: 'approve' | 'return', note?: string): Promise<{ gates: GovGateReview[] }>;
  diffVersions(projectId: string, aVersionId: string, bVersionId: string): Promise<{ segments: GovDiffSegment[] }>;
  /** P4: fetch an artifact PNG through the authenticated route and return an object URL (a bare <img src> can't
   *  carry the bearer token). The caller revokes the URL when done. */
  fetchArtifactImage(projectId: string, artifactId: string): Promise<string>;
  insertFigure(projectId: string, docKey: string, artifactId: string): Promise<{ document: GovProposalDocument }>;
  setDemoUrl(projectId: string, demoUrl: string, captureRoot?: string): Promise<{ ok: boolean }>;
  recapture(projectId: string, storyId: string): Promise<unknown>;
  /** P5: kick off the agent review cycle for a document (fire-and-forget; poll versions). */
  runReviewCycle(projectId: string, docKey: string, maxIterations?: number): Promise<{ started: boolean; maxIterations: number }>;
  /** P5: answer a question — saves to the company library and resolves every open gap that asked it. */
  answerQuestion(projectId: string, question: string, answer: string, key?: string): Promise<{ factId: string; gapsResolved: number }>;
  /** P6: the required-form signature status for the package. */
  listSignatures(projectId: string): Promise<{ signatures: GovSignatureView[] }>;
  /** P6: upload a signed copy of a required form. */
  uploadSignedForm(projectId: string, formKey: string, file: File, signerRole?: string): Promise<{ ok: boolean }>;
  /** P6: assemble the package if ready; returns the manifest, or the blocking reasons. */
  assemblePackage(projectId: string): Promise<GovPackageResult>;
}

/** P6: a card for a gov project the intern is assigned to — minimal fields for the "on your profile" surface. */
export interface MyGovProjectCard { projectId: string; name: string; status: string; }

export async function getStudentGovProject(projectId: string): Promise<StudentGovProjectView> {
  const { data } = await portalApi.get<{ project: StudentGovProjectView }>(
    `/api/portal/gov-projects/${encodeURIComponent(projectId)}`,
  );
  return data.project;
}

/** P6: the gov projects THIS intern is assigned to (membership-scoped server-side) — for the profile card. */
export async function listMyGovProjects(): Promise<MyGovProjectCard[]> {
  const { data } = await portalApi.get<{ projects: MyGovProjectCard[] }>('/api/portal/gov-projects');
  return Array.isArray(data?.projects) ? data.projects : [];
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

/**
 * P6: an EDIT-shared intern drafts/edits the proposal response for one requirement. Any save lands `draft` (a
 * changed answer is not reviewed/approved); the intern cannot review or approve (admin-only, 403 server-side). The
 * caller reloads the project after to show the new status. A non-edit viewer is refused server-side.
 */
export async function saveGovProposalResponse(projectId: string, requirementId: string, content: string): Promise<void> {
  await portalApi.post(
    `/api/portal/gov-projects/${encodeURIComponent(projectId)}/proposal/${encodeURIComponent(requirementId)}`,
    { content },
  );
}

/** P6: an EDIT-shared intern resolves a draft gap on a proposal response (answered | filler | open). */
export async function resolveGovProposalGap(
  projectId: string, requirementId: string, gapId: string, resolution: 'open' | 'answered' | 'filler', answer?: string,
): Promise<void> {
  await portalApi.post(
    `/api/portal/gov-projects/${encodeURIComponent(projectId)}/proposal/${encodeURIComponent(requirementId)}/gaps/${encodeURIComponent(gapId)}`,
    { resolution, answer: answer ?? null },
  );
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

/** Ask the project copilot. Answers DETERMINISTICALLY from the same student-safe projection the page renders. */
export async function askGovCopilot(projectId: string, question: string): Promise<GovCopilotAnswer> {
  const { data } = await portalApi.post<GovCopilotAnswer>(
    `/api/portal/gov-projects/${encodeURIComponent(projectId)}/copilot`,
    { question },
  );
  return data;
}

// ── v2 Proposal document actions ───────────────────────────────────────────────────────────────────────────────
const docUrl = (projectId: string, docKey: string, action: string) =>
  `/api/portal/gov-projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(docKey)}/${action}`;

/** Draft a proposal document. With `contentHtml` it saves a manual edit (sanitized server-side); without it, the AI
 *  drafts the whole document from its requirements. Either way it lands `drafted` — never accepted. */
export async function draftGovProposalDocument(projectId: string, docKey: string, contentHtml?: string): Promise<GovProposalDocument> {
  const { data } = await portalApi.post<{ document: GovProposalDocument }>(docUrl(projectId, docKey, 'draft'), contentHtml !== undefined ? { contentHtml } : {});
  return data.document;
}
/** A reviewer accepts a drafted document — the only path to `accepted`. Students get 403 server-side. */
export async function acceptGovProposalDocument(projectId: string, docKey: string): Promise<GovProposalDocument> {
  const { data } = await portalApi.post<{ document: GovProposalDocument }>(docUrl(projectId, docKey, 'accept'), {});
  return data.document;
}
/** A reviewer sends a document back with a note (appended to the review thread). */
export async function requestChangesGovProposalDocument(projectId: string, docKey: string, note: string): Promise<GovProposalDocument> {
  const { data } = await portalApi.post<{ document: GovProposalDocument }>(docUrl(projectId, docKey, 'request-changes'), { note });
  return data.document;
}
/** Add a comment to a document's review thread. */
export async function commentGovProposalDocument(projectId: string, docKey: string, body: string): Promise<GovProposalDocument> {
  const { data } = await portalApi.post<{ document: GovProposalDocument }>(docUrl(projectId, docKey, 'comment'), { body });
  return data.document;
}

// ── Cockpit API adapter ──────────────────────────────────────────────────────────────────────────────────────
// CockpitView / CopilotRail / ProposalDocumentDrawer post through this adapter so the SAME components drive either
// the student PORTAL routes (the default below) or the ADMIN gov-contracts routes (injected by the admin cockpit
// page), without the components knowing which token/route is in play.
export interface GovCockpitApi {
  askCopilot(projectId: string, question: string): Promise<GovCopilotAnswer>;
  draftDocument(projectId: string, docKey: string, contentHtml?: string): Promise<GovProposalDocument>;
  acceptDocument(projectId: string, docKey: string): Promise<GovProposalDocument>;
  requestChanges(projectId: string, docKey: string, note: string): Promise<GovProposalDocument>;
  commentDocument(projectId: string, docKey: string, body: string): Promise<GovProposalDocument>;
}

/** The default adapter — the student portal endpoints (participant token). */
export const portalGovCockpitApi: GovCockpitApi = {
  askCopilot: askGovCopilot,
  draftDocument: draftGovProposalDocument,
  acceptDocument: acceptGovProposalDocument,
  requestChanges: requestChangesGovProposalDocument,
  commentDocument: commentGovProposalDocument,
};

// ── U1 Studio read-model surfaces (questions / activity / review runs / version content) ───────────────────────────
const portalBase = (projectId: string) => `/api/portal/gov-projects/${encodeURIComponent(projectId)}`;

export async function listGovQuestions(projectId: string): Promise<GovOpenQuestion[]> {
  const { data } = await portalApi.get<{ questions: GovOpenQuestion[] }>(`${portalBase(projectId)}/questions?status=open`);
  return Array.isArray(data?.questions) ? data.questions : [];
}
export async function answerGovQuestion(projectId: string, key: string, answer: string): Promise<{ resolved: number; documents: GovProposalDocument[] }> {
  const { data } = await portalApi.post<{ resolved: number; documents: GovProposalDocument[] }>(`${portalBase(projectId)}/questions/${encodeURIComponent(key)}/answer`, { answer });
  return { resolved: data?.resolved ?? 0, documents: Array.isArray(data?.documents) ? data.documents : [] };
}
export async function listGovActivity(projectId: string, limit = 50): Promise<GovActivityEvent[]> {
  const { data } = await portalApi.get<{ activity: GovActivityEvent[] }>(`${portalBase(projectId)}/activity?limit=${limit}`);
  return Array.isArray(data?.activity) ? data.activity : [];
}
export async function startGovReviewCycle(projectId: string, docKey: string, maxIterations?: number): Promise<{ runId: string }> {
  const { data } = await portalApi.post<{ runId: string }>(`${portalBase(projectId)}/documents/${encodeURIComponent(docKey)}/review-cycle`, maxIterations ? { maxIterations } : {});
  return { runId: data.runId };
}
export async function getGovReviewRun(projectId: string, runId: string): Promise<GovReviewRun> {
  const { data } = await portalApi.get<{ run: GovReviewRun }>(`${portalBase(projectId)}/review-cycle/${encodeURIComponent(runId)}`);
  return data.run;
}
export async function getGovVersionContent(projectId: string, docKey: string, versionId: string): Promise<GovVersionContent> {
  const { data } = await portalApi.get<GovVersionContent>(`${portalBase(projectId)}/documents/${encodeURIComponent(docKey)}/versions/${encodeURIComponent(versionId)}`);
  return data;
}

/**
 * GovStudioApi — the Studio shell + agent panel's read-model adapter. The SAME Studio components drive either the
 * portal routes (the default below, participant token) or the admin routes (injected by the admin cockpit page).
 */
export interface GovStudioApi {
  listQuestions(projectId: string): Promise<GovOpenQuestion[]>;
  answerQuestion(projectId: string, key: string, answer: string): Promise<{ resolved: number; documents: GovProposalDocument[] }>;
  listActivity(projectId: string, limit?: number): Promise<GovActivityEvent[]>;
  startReviewCycle(projectId: string, docKey: string, maxIterations?: number): Promise<{ runId: string }>;
  getReviewRun(projectId: string, runId: string): Promise<GovReviewRun>;
  getVersionContent(projectId: string, docKey: string, versionId: string): Promise<GovVersionContent>;
}

export const portalGovStudioApi: GovStudioApi = {
  listQuestions: listGovQuestions,
  answerQuestion: answerGovQuestion,
  listActivity: listGovActivity,
  startReviewCycle: startGovReviewCycle,
  getReviewRun: getGovReviewRun,
  getVersionContent: getGovVersionContent,
};

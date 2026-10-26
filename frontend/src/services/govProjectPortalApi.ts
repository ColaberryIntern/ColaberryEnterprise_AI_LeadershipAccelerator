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
  /** v2: combined completion across verified build stories + accepted documents. Optional (older backends). */
  overallProgress?: GovOverallProgress;
}

/** The project copilot's grounded answer to a question (deterministic, from the student-safe projection). */
export interface GovCopilotAnswer { intent: 'next' | 'review' | 'risk' | 'proposal' | 'other'; answer: string; }

// ── v2: the Build summary (releases → stories) and the Proposal documents ──────────────────────────────────────
export interface GovBuildStorySummary { storyId: string; title: string; releaseKey: string; status: string; verified: boolean; }
export interface GovBuildReleaseSummary { key: string; name: string; status: string; stories: GovBuildStorySummary[]; }
export interface GovBuildRollup { total: number; verified: number; complete: number; inProgress: number; blocked: number; notStarted: number; pct: number; }
export interface GovBuildSummary { studentProjectId: string; releases: GovBuildReleaseSummary[]; rollup: GovBuildRollup; }

export interface GovProposalDocumentComment { body: string; at: string; }
export type GovProposalDocumentStatus = 'not_started' | 'drafting' | 'drafted' | 'changes_requested' | 'accepted';
export interface GovProposalDocument {
  key: string; title: string; status: GovProposalDocumentStatus; contentHtml: string | null;
  version: number; gate: boolean; order: number; requirementIds: string[];
  comments: GovProposalDocumentComment[]; draftedAt: string | null; acceptedAt: string | null;
}
export interface GovOverallProgress { buildVerified: number; buildTotal: number; docsAccepted: number; docsTotal: number; pct: number; }

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

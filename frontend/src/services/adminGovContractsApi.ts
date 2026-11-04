import api from '../utils/api';
import type { StudentGovProjectView, GovCockpitApi, GovCopilotAnswer, GovProposalDocument, GovReviewApi, GovDocumentVersion, GovGateReview, GovCheckRunResult, GovGateName, GovDiffSegment } from './govProjectPortalApi';

/**
 * adminGovContractsApi — the admin Interns-hub "Gov Contracts" tab's one data call.
 *
 * `GET /api/admin/gov-contracts` returns the active government pursuits this caller may see
 * (gated `gov_contracts`): every pursuit for a management/operator viewer, or only the
 * delivery projects the caller is a member of for a scoped viewer. `scope` echoes which.
 * The shape mirrors the backend `GovPipelineCard` (services/factory/govPipeline.ts) exactly.
 */

export type GovContractStage = 'qualifying' | 'ready_to_assign' | 'in_build' | 'passed';

export interface GovContractBuildProgress {
  studentProjectId: string;
  pct: number;
  verified: number;
  total: number;
}

/** An active intern assigned to build this contract (membership ∩ live intern roster). */
export interface GovContractAssignedIntern {
  identityId: string;
  name: string;
  email: string | null;
}

export interface GovContractCard {
  key: string;
  isDecoupled: boolean;
  biddingEntity: string;
  title: string | null;
  agency: string | null;
  decision: string;
  version: number;
  stage: GovContractStage;
  deliveryProjectId: string | null;
  establishedCount: number;
  readyToAdvance: boolean;
  zipAttested: boolean;
  pursuitKind: 'software' | 'services';
  build: GovContractBuildProgress | null;
  /** The submission/close date (ISO), or null when none is resolvable (treated as not-yet-expired, not hidden). */
  closeDate: string | null;
  /** Active interns assigned to this contract; drives the owner line and the "has an active intern" filter. */
  assignedInterns: GovContractAssignedIntern[];
  hasActiveIntern: boolean;
  updatedAt: string | null;
  createdAt: string | null;
}

export interface GovContractsResponse {
  projects: GovContractCard[];
  scope: 'all' | 'member';
}

export async function fetchGovContracts(): Promise<GovContractsResponse> {
  const { data } = await api.get('/api/admin/gov-contracts');
  return data as GovContractsResponse;
}

/**
 * The SAME student-safe projection the assigned intern sees in their cockpit, for an owner/admin to
 * read read-only from the admin left-nav. `GET /api/admin/gov-contracts/:projectId/cockpit`, gated
 * `gov_contracts`; projectId is the delivery project id (a card's `deliveryProjectId`).
 */
export async function fetchGovContractCockpit(projectId: string): Promise<StudentGovProjectView> {
  const { data } = await api.get(`/api/admin/gov-contracts/${encodeURIComponent(projectId)}/cockpit`);
  return (data as { project: StudentGovProjectView }).project;
}

export function errorMessage(e: unknown, fallback: string): string {
  const r = e as { response?: { data?: { error?: string } } };
  return r?.response?.data?.error ?? fallback;
}

// ── Management-drivable cockpit: the admin mirror of the portal proposal + copilot actions ───────────────────────
// These post to the `gov_contracts`-gated admin routes (admin token via `utils/api`), so management can run the
// copilot and draft / accept / request-changes / comment on proposal documents from the admin cockpit.
const adminBase = (projectId: string): string => `/api/admin/gov-contracts/${encodeURIComponent(projectId)}`;
const adminDocUrl = (projectId: string, docKey: string, action: string): string =>
  `${adminBase(projectId)}/documents/${encodeURIComponent(docKey)}/${action}`;

export async function adminAskGovCopilot(projectId: string, question: string): Promise<GovCopilotAnswer> {
  const { data } = await api.post<GovCopilotAnswer>(`${adminBase(projectId)}/copilot`, { question });
  return data as GovCopilotAnswer;
}
export async function adminDraftGovProposalDocument(projectId: string, docKey: string, contentHtml?: string): Promise<GovProposalDocument> {
  const { data } = await api.post<{ document: GovProposalDocument }>(adminDocUrl(projectId, docKey, 'draft'), contentHtml !== undefined ? { contentHtml } : {});
  return data.document;
}
export async function adminAcceptGovProposalDocument(projectId: string, docKey: string): Promise<GovProposalDocument> {
  const { data } = await api.post<{ document: GovProposalDocument }>(adminDocUrl(projectId, docKey, 'accept'), {});
  return data.document;
}
export async function adminRequestChangesGovProposalDocument(projectId: string, docKey: string, note: string): Promise<GovProposalDocument> {
  const { data } = await api.post<{ document: GovProposalDocument }>(adminDocUrl(projectId, docKey, 'request-changes'), { note });
  return data.document;
}
export async function adminCommentGovProposalDocument(projectId: string, docKey: string, body: string): Promise<GovProposalDocument> {
  const { data } = await api.post<{ document: GovProposalDocument }>(adminDocUrl(projectId, docKey, 'comment'), { body });
  return data.document;
}

/** P2: re-read the stored solicitation ZIP into the next blueprint version and re-derive the document set. The
 *  server returns the new version, the blueprint, a diff from the previous one, and the document count (409 when no
 *  stored package exists). */
export interface AdminBlueprintReanalysisResult {
  version: number;
  diff: { summary: string[] };
  documentCount: number;
}
export async function adminReanalyzeGovBlueprint(projectId: string): Promise<AdminBlueprintReanalysisResult> {
  const { data } = await api.post<AdminBlueprintReanalysisResult>(`${adminBase(projectId)}/blueprint/reanalyze`, {});
  return data;
}

// ── P3 review layer (reviewer-only; the admin cockpit holds gov_contracts) ───────────────────────────────────────
export async function adminListGovDocumentReview(projectId: string, docKey: string): Promise<{ versions: GovDocumentVersion[]; gates: GovGateReview[] }> {
  const { data } = await api.get(adminDocUrl(projectId, docKey, 'versions'));
  return data as { versions: GovDocumentVersion[]; gates: GovGateReview[] };
}
export async function adminRunGovDocumentChecks(projectId: string, docKey: string): Promise<GovCheckRunResult> {
  const { data } = await api.post<{ result: GovCheckRunResult }>(adminDocUrl(projectId, docKey, 'run-checks'), {});
  return data.result;
}
export async function adminDecideGovGate(projectId: string, docKey: string, gate: GovGateName, decision: 'approve' | 'return', note?: string): Promise<{ gates: GovGateReview[] }> {
  const { data } = await api.post<{ gates: GovGateReview[] }>(`${adminDocUrl(projectId, docKey, 'gates')}/${encodeURIComponent(gate)}`, { decision, note });
  return data;
}
export async function adminDiffGovVersions(projectId: string, aVersionId: string, bVersionId: string): Promise<{ segments: GovDiffSegment[] }> {
  const { data } = await api.get<{ segments: GovDiffSegment[] }>(`${adminBase(projectId)}/versions/${encodeURIComponent(aVersionId)}/diff/${encodeURIComponent(bVersionId)}`);
  return data;
}

// ── P4 build-evidence (reviewer-only) ────────────────────────────────────────────────────────────────────────
export async function adminFetchGovArtifactImage(projectId: string, artifactId: string): Promise<string> {
  const { data } = await api.get(`${adminBase(projectId)}/artifacts/${encodeURIComponent(artifactId)}/image`, { responseType: 'blob' });
  return URL.createObjectURL(data as Blob);
}
export async function adminInsertGovFigure(projectId: string, docKey: string, artifactId: string): Promise<{ document: GovProposalDocument }> {
  const { data } = await api.post<{ document: GovProposalDocument }>(adminDocUrl(projectId, docKey, 'insert-figure'), { artifactId });
  return data;
}
export async function adminSetGovDemoUrl(projectId: string, demoUrl: string, captureRoot?: string): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>(`${adminBase(projectId)}/build-demo`, { demoUrl, captureRoot });
  return data;
}
export async function adminRecaptureGovStory(projectId: string, storyId: string): Promise<unknown> {
  const { data } = await api.post(`${adminBase(projectId)}/stories/${encodeURIComponent(storyId)}/recapture`, {});
  return data;
}

/** The admin review adapter — the reviewer-only P3/P4 actions (versions, checks, gates, diff, artifacts). */
export const adminGovReviewApi: GovReviewApi = {
  listReview: adminListGovDocumentReview,
  runChecks: adminRunGovDocumentChecks,
  decideGate: adminDecideGovGate,
  diffVersions: adminDiffGovVersions,
  fetchArtifactImage: adminFetchGovArtifactImage,
  insertFigure: adminInsertGovFigure,
  setDemoUrl: adminSetGovDemoUrl,
  recapture: adminRecaptureGovStory,
};

/** The admin adapter — management drives the gov cockpit via the `gov_contracts`-gated admin routes. */
export const adminGovCockpitApi: GovCockpitApi = {
  askCopilot: adminAskGovCopilot,
  draftDocument: adminDraftGovProposalDocument,
  acceptDocument: adminAcceptGovProposalDocument,
  requestChanges: adminRequestChangesGovProposalDocument,
  commentDocument: adminCommentGovProposalDocument,
};

import api from '../utils/api';
import type { StudentGovProjectView, GovCockpitApi, GovCopilotAnswer, GovProposalDocument, GovReviewApi, GovDocumentVersion, GovGateReview, GovCheckRunResult, GovGateName, GovDiffSegment, GovSignatureView, GovPackageResult, GovStudioApi, GovOpenQuestion, GovActivityEvent, GovReviewRun, GovVersionContent, GovSectionPlanFields, GovNeedsGrouped, GovNeedSubmission, GovNeedResolveResult, GovBuildAllResult } from './govProjectPortalApi';

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
export async function adminRunGovReviewCycle(projectId: string, docKey: string, maxIterations?: number): Promise<{ started: boolean; maxIterations: number }> {
  const { data } = await api.post<{ started: boolean; maxIterations: number }>(adminDocUrl(projectId, docKey, 'review-cycle'), { maxIterations });
  return data;
}
export async function adminAnswerGovQuestion(projectId: string, question: string, answer: string, key?: string): Promise<{ factId: string; gapsResolved: number }> {
  const { data } = await api.post<{ factId: string; gapsResolved: number }>(`${adminBase(projectId)}/answer-question`, { question, answer, key });
  return data;
}
export async function adminListGovSignatures(projectId: string): Promise<{ signatures: GovSignatureView[] }> {
  const { data } = await api.get<{ signatures: GovSignatureView[] }>(`${adminBase(projectId)}/package/signatures`);
  return data;
}
export async function adminUploadGovSignedForm(projectId: string, formKey: string, file: File, signerRole?: string): Promise<{ ok: boolean }> {
  const form = new FormData();
  form.append('file', file);
  if (signerRole) form.append('signerRole', signerRole);
  const { data } = await api.post<{ ok: boolean }>(`${adminBase(projectId)}/package/signatures/${encodeURIComponent(formKey)}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}
export async function adminAssembleGovPackage(projectId: string): Promise<GovPackageResult> {
  try { const { data } = await api.post<GovPackageResult>(`${adminBase(projectId)}/package/assemble`, {}); return data; }
  catch (e: any) { if (e?.response?.status === 409 && e.response.data) return e.response.data as GovPackageResult; throw e; }
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
  runReviewCycle: adminRunGovReviewCycle,
  answerQuestion: adminAnswerGovQuestion,
  listSignatures: adminListGovSignatures,
  uploadSignedForm: adminUploadGovSignedForm,
  assemblePackage: adminAssembleGovPackage,
  saveSectionPlan: adminSaveGovSectionPlan,
  editDocument: adminEditGovDocument,
  decideGold: adminDecideGovGold,
};

/** U1 (B.7): save a reviewer's section plan for one section; the backend writes a new human version. */
export async function adminSaveGovSectionPlan(projectId: string, docKey: string, sectionKey: string, plan: GovSectionPlanFields): Promise<{ document: GovProposalDocument }> {
  const { data } = await api.put<{ document: GovProposalDocument }>(`${adminDocUrl(projectId, docKey, 'sections')}/${encodeURIComponent(sectionKey)}/plan`, plan);
  return data as { document: GovProposalDocument };
}

/** The admin adapter — management drives the gov cockpit via the `gov_contracts`-gated admin routes. */
export const adminGovCockpitApi: GovCockpitApi = {
  askCopilot: adminAskGovCopilot,
  draftDocument: adminDraftGovProposalDocument,
  acceptDocument: adminAcceptGovProposalDocument,
  requestChanges: adminRequestChangesGovProposalDocument,
  commentDocument: adminCommentGovProposalDocument,
};

// ── U1 Studio read-model surfaces (admin token) — the admin mirror of GovStudioApi ────────────────────────────────
export async function adminListGovQuestions(projectId: string): Promise<GovOpenQuestion[]> {
  const { data } = await api.get<{ questions: GovOpenQuestion[] }>(`${adminBase(projectId)}/questions?status=open`);
  return Array.isArray(data?.questions) ? data.questions : [];
}
export async function adminAnswerGovQuestionKey(projectId: string, key: string, answer: string): Promise<{ resolved: number; documents: GovProposalDocument[] }> {
  const { data } = await api.post<{ resolved: number; documents: GovProposalDocument[] }>(`${adminBase(projectId)}/questions/${encodeURIComponent(key)}/answer`, { answer });
  return { resolved: data?.resolved ?? 0, documents: Array.isArray(data?.documents) ? data.documents : [] };
}
export async function adminListGovActivity(projectId: string, limit = 50): Promise<GovActivityEvent[]> {
  const { data } = await api.get<{ activity: GovActivityEvent[] }>(`${adminBase(projectId)}/activity?limit=${limit}`);
  return Array.isArray(data?.activity) ? data.activity : [];
}
export async function adminStartGovReviewCycle(projectId: string, docKey: string, maxIterations?: number): Promise<{ runId: string }> {
  const { data } = await api.post<{ runId: string }>(`${adminDocUrl(projectId, docKey, 'review-cycle')}`, maxIterations ? { maxIterations } : {});
  return { runId: (data as { runId: string }).runId };
}
export async function adminGetGovReviewRun(projectId: string, runId: string): Promise<GovReviewRun> {
  const { data } = await api.get<{ run: GovReviewRun }>(`${adminBase(projectId)}/review-cycle/${encodeURIComponent(runId)}`);
  return (data as { run: GovReviewRun }).run;
}
export async function adminGetGovVersionContent(projectId: string, docKey: string, versionId: string): Promise<GovVersionContent> {
  const { data } = await api.get<GovVersionContent>(`${adminBase(projectId)}/documents/${encodeURIComponent(docKey)}/versions/${encodeURIComponent(versionId)}`);
  return data as GovVersionContent;
}

// ── v3 (V1): typed needs list, resolve, Build-all, human edit, Gold Go/No-go (admin token) ─────────────────────
export async function adminListGovNeeds(projectId: string): Promise<GovNeedsGrouped> {
  const { data } = await api.get<Partial<GovNeedsGrouped>>(`${adminBase(projectId)}/needs`);
  return { needs: data?.needs ?? [], blockingExport: data?.blockingExport ?? [], holdingScore: data?.holdingScore ?? [] };
}
export async function adminResolveGovNeed(projectId: string, key: string, submission: GovNeedSubmission): Promise<GovNeedResolveResult> {
  const { data } = await api.post<GovNeedResolveResult>(`${adminBase(projectId)}/needs/${encodeURIComponent(key)}/resolve`, submission);
  return { resolved: data?.resolved ?? key, store: data?.store ?? '', status: data?.status ?? '', unblocked: Array.isArray(data?.unblocked) ? data.unblocked : [] };
}
export async function adminBuildAllGovDocuments(projectId: string): Promise<GovBuildAllResult> {
  const { data } = await api.post<Partial<GovBuildAllResult>>(`${adminBase(projectId)}/build-all`, {});
  return { started: !!data?.started, enqueued: Array.isArray(data?.enqueued) ? data.enqueued : [], skipped: Array.isArray(data?.skipped) ? data.skipped : [] };
}
export async function adminEditGovDocument(projectId: string, docKey: string, contentHtml: string): Promise<{ saved: boolean; passes: boolean; resumed: boolean }> {
  const { data } = await api.post<{ saved: boolean; passes: boolean; resumed: boolean }>(adminDocUrl(projectId, docKey, 'edit'), { contentHtml });
  return { saved: !!data?.saved, passes: !!data?.passes, resumed: !!data?.resumed };
}
export async function adminDecideGovGold(projectId: string, decision: 'go' | 'nogo', note?: string): Promise<{ decision: string; approved?: string[]; skipped?: Array<{ docKey: string; reason: string }>; returned?: string[] }> {
  const { data } = await api.post<{ decision: string; approved?: string[]; skipped?: Array<{ docKey: string; reason: string }>; returned?: string[] }>(`${adminBase(projectId)}/gold`, { decision, note });
  return data;
}

/** The admin Studio read-model adapter (gates/pricing routes stay on adminGovReviewApi). */
export const adminGovStudioApi: GovStudioApi = {
  listQuestions: adminListGovQuestions,
  answerQuestion: adminAnswerGovQuestionKey,
  listActivity: adminListGovActivity,
  startReviewCycle: adminStartGovReviewCycle,
  getReviewRun: adminGetGovReviewRun,
  getVersionContent: adminGetGovVersionContent,
  listNeeds: adminListGovNeeds,
  resolveNeed: adminResolveGovNeed,
  buildAll: adminBuildAllGovDocuments,
};

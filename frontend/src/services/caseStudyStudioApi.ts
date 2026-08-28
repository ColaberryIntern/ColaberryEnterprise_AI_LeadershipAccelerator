import api from '../utils/api';

/**
 * Story Studio admin API client.
 *
 * A SIBLING OF `caseStudyAdminApi.ts`, not an extension of it, matching the
 * backend split: that file drives the review desk, this one drives authoring.
 * Same axios instance, so the same `admin_token` injection and the same 401
 * bounce apply — a Studio call is not a different kind of privileged request.
 *
 * NOTHING HERE PUBLISHES. There is no publish, approve or unpublish function in
 * this module, and adding one would put a lifecycle act on the authoring
 * client. `caseStudyAdminApi` owns those, and keeping the two clients disjoint
 * on that point is a property the suite asserts.
 */

const BASE = '/api/admin/case-studies';

/* ────────────────────────────────────────────────────── the vocabulary ──── */

export type StoryElementStatus =
  | 'generated' | 'needs_evidence' | 'verified' | 'human_approved' | 'hidden';

export interface CaseStudyStoryline {
  readonly caseStudyId: string;
  readonly text: string;
  readonly authoredBy: string;
  readonly updatedAt: string;
}

export interface CaseStudyRepoProof {
  readonly owner: string;
  readonly repo: string;
  readonly proves: readonly string[];
  /** Never empty. The four structural limits are always present. */
  readonly cannotProve: readonly string[];
  readonly technologies: readonly string[];
  readonly architectureSignals: readonly string[];
  readonly firstCommitAt: string | null;
  readonly lastCommitAt: string | null;
  readonly candidateArtifacts: readonly string[];
  readonly accessStatus: string;
}

export type CaseStudyAiDraftStatus = 'proposed' | 'promoted' | 'rejected';

export interface CaseStudyAiDraft {
  readonly id: string;
  readonly caseStudyId: string;
  readonly path: string;
  readonly value: string;
  readonly status: CaseStudyAiDraftStatus;
  readonly generatedBy: string;
  readonly rationale: string;
  readonly createdAt: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
}

export interface CaseStudyDraftRefusal {
  readonly path: string;
  readonly reason: string;
}

export interface CaseStudyArtifactRecord {
  readonly id: string;
  readonly artifactType: string;
  readonly title: string;
  readonly status: 'candidate' | 'approved' | 'rejected';
  readonly visibility: 'public' | 'request_only' | 'private';
  /** Derived from the type. Shown, never set. */
  readonly presentationIsEvidence: boolean;
}

export type CaseStudyChartType = 'bar' | 'ranking';

/** NOTE: no `values`. A chart references metric keys and never carries numbers. */
export interface CaseStudyChartSpec {
  readonly id: string;
  readonly caseStudyId: string;
  readonly chartType: CaseStudyChartType;
  readonly title: string;
  readonly caption: string | null;
  readonly metricKeys: readonly string[];
  readonly approved: boolean;
  readonly createdAt: string;
}

export interface CaseStudyChartResolution {
  readonly chart: CaseStudyChartSpec;
  readonly resolved: readonly {
    readonly metricKey: string; readonly label: string; readonly valueDisplay: string;
  }[];
  /** What the chart names and cannot show. Surfaced, never silently dropped. */
  readonly unresolved: readonly { readonly metricKey: string; readonly reason: string }[];
}

export type CaseStudyQuoteSource =
  | 'client_confirmation' | 'recorded_interview' | 'written_statement' | 'public_statement';

export type CaseStudyQuoteAttribution =
  | {
      readonly displayMode: 'named'; readonly displayName: string; readonly role: string;
      readonly kind: string; readonly consentRecordedAt: string;
    }
  | { readonly displayMode: 'role_only'; readonly role: string; readonly kind: string }
  | { readonly displayMode: 'anonymous'; readonly kind: string };

export interface CaseStudyQuote {
  readonly id: string;
  readonly caseStudyId: string;
  readonly text: string;
  readonly attribution: CaseStudyQuoteAttribution;
  readonly source: CaseStudyQuoteSource;
  readonly verificationClass: 'verified' | 'anonymized' | 'illustrative' | 'pending';
  readonly approved: boolean;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
}

/* ──────────────────────────────────────────────── step 1 — storyline ──── */

export async function getStoryline(caseStudyId: string): Promise<CaseStudyStoryline | null> {
  const { data } = await api.get(`${BASE}/${caseStudyId}/storyline`);
  return data.storyline ?? null;
}

export async function saveStoryline(
  caseStudyId: string, text: string,
): Promise<CaseStudyStoryline> {
  const { data } = await api.put(`${BASE}/${caseStudyId}/storyline`, { text });
  return data.storyline;
}

/* ───────────────────────────────────────────────── step 3 — analyze ──── */

export async function analyzeRepository(
  caseStudyId: string, body: { owner: string; repo: string },
): Promise<CaseStudyRepoProof> {
  const { data } = await api.post(`${BASE}/${caseStudyId}/analyze`, body);
  return data.proof;
}

/* ──────────────────────────────────────── step 4 — the story draft ──── */

export async function generateStoryDraft(
  caseStudyId: string, repositories: readonly { owner: string; repo: string }[],
): Promise<{
  generatedBy: string;
  drafts: readonly CaseStudyAiDraft[];
  refused: readonly CaseStudyDraftRefusal[];
}> {
  const { data } = await api.post(`${BASE}/${caseStudyId}/story-draft`, { repositories });
  return data;
}

export async function listStoryDrafts(
  caseStudyId: string,
): Promise<readonly CaseStudyAiDraft[]> {
  const { data } = await api.get(`${BASE}/${caseStudyId}/story-drafts`);
  return data.drafts ?? [];
}

/**
 * Promote one proposal into snapshot content, as a human act. The server writes
 * the acting admin as the override actor; this client cannot supply one, which
 * is why there is no actor parameter here.
 */
export async function promoteStoryDraft(
  caseStudyId: string, draftId: string,
): Promise<{ outcome: 'promoted' | 'already_decided'; snapshotVersion: number | null }> {
  const { data } = await api.post(`${BASE}/${caseStudyId}/story-drafts/${draftId}/promote`);
  return data;
}

export async function rejectStoryDraft(
  caseStudyId: string, draftId: string,
): Promise<CaseStudyAiDraft> {
  const { data } = await api.post(`${BASE}/${caseStudyId}/story-drafts/${draftId}/reject`);
  return data.draft;
}

/* ──────────────────────────────────────────────────────── visuals ──── */

export async function listArtifactRecords(
  caseStudyId: string,
): Promise<readonly CaseStudyArtifactRecord[]> {
  const { data } = await api.get(`${BASE}/${caseStudyId}/artifacts`);
  return data.artifacts ?? [];
}

/** D-0. Before this existed, no application code could approve an artifact. */
export async function setArtifactStatus(
  caseStudyId: string,
  artifactId: string,
  body: {
    status: 'candidate' | 'approved' | 'rejected';
    visibility: 'public' | 'request_only' | 'private';
  },
): Promise<{ outcome: 'unchanged' | 'updated'; artifact: CaseStudyArtifactRecord }> {
  const { data } = await api.patch(`${BASE}/${caseStudyId}/artifacts/${artifactId}`, body);
  return data;
}

export async function listCharts(
  caseStudyId: string,
): Promise<readonly CaseStudyChartResolution[]> {
  const { data } = await api.get(`${BASE}/${caseStudyId}/charts`);
  return data.charts ?? [];
}

/**
 * Save a chart. THE BODY HAS NO `values` FIELD AND MUST NOT ACQUIRE ONE — the
 * server's schema is `.strict()`, so sending one is a 400 naming the key rather
 * than a silently ignored property.
 */
export async function saveChart(
  caseStudyId: string,
  body: {
    chartId?: string;
    chartType: CaseStudyChartType;
    title: string;
    caption?: string | null;
    metricKeys: readonly string[];
  },
): Promise<CaseStudyChartSpec> {
  const { data } = await api.put(`${BASE}/${caseStudyId}/charts`, body);
  return data.chart;
}

export async function setChartApproval(
  caseStudyId: string, chartId: string, approved: boolean,
): Promise<CaseStudyChartSpec> {
  const { data } = await api.post(`${BASE}/${caseStudyId}/charts/${chartId}/approval`, { approved });
  return data.chart;
}

/* ───────────────────────────────────────────────────────── quotes ──── */

export async function listQuotes(caseStudyId: string): Promise<readonly CaseStudyQuote[]> {
  const { data } = await api.get(`${BASE}/${caseStudyId}/quotes`);
  return data.quotes ?? [];
}

/**
 * Record a quotation a HUMAN obtained.
 *
 * There is deliberately no `generateQuote` in this module and there must never
 * be one. AI may suggest where a quote would strengthen the story; it may never
 * write one. This repository shipped invented client quotations once already.
 */
export async function createQuote(
  caseStudyId: string,
  body: {
    text: string;
    attribution: CaseStudyQuoteAttribution;
    source: CaseStudyQuoteSource;
  },
): Promise<CaseStudyQuote> {
  const { data } = await api.post(`${BASE}/${caseStudyId}/quotes`, body);
  return data.quote;
}

export async function setQuoteApproval(
  caseStudyId: string,
  quoteId: string,
  body: {
    approved: boolean;
    verificationClass?: 'verified' | 'anonymized' | 'illustrative' | 'pending';
  },
): Promise<CaseStudyQuote> {
  const { data } = await api.post(`${BASE}/${caseStudyId}/quotes/${quoteId}/approval`, body);
  return data.quote;
}

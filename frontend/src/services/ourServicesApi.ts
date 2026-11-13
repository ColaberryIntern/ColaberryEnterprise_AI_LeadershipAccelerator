/**
 * ourServicesApi - the typed client for the Our Services evidence page (Services Upgrade SV3).
 *
 * Mirrors three backend contracts that are already live; the frontend cannot import backend types across the
 * workspace boundary, so these interfaces are hand-copied and must change together with:
 *   - backend/src/services/factory/serviceEvidenceSummaryTypes.ts      (GET  .../services/evidence-summary)
 *   - backend/src/routes/admin/caseStudyOutsideIntakeRoutes.ts         (POST .../case-studies/external)
 *   - backend/src/services/caseStudy/caseStudyOutsideIntake.ts         (OutsideImportResult)
 *   - backend/src/routes/admin/serviceProposalRoutes.ts                (propose-service, promote)
 *
 * NULL MEANS "UNKNOWN", NEVER ZERO. The summary returns null for a number it could not read (open opportunity
 * matches when the opportunity feed is down, for example). The UI renders that as "not available", never as 0.
 *
 * Linking a suggestion is the existing decide route (`decideServiceLink` in caseStudyServiceLinkApi.ts); it is not
 * duplicated here.
 */
import api from '../utils/api';
import type { ServiceOffering } from './factoryApi';

export type SummaryStatus = 'active' | 'growth' | 'all';
export type SourceKind = 'inside' | 'outside';
export type EvidenceTier = 'proven' | 'emerging' | 'thin' | 'none';

export interface HeadlineMetric { label: string; value: string | null; verified: boolean }

export interface EvidenceCaseStudy {
  id: string;
  title: string;
  slug: string | null;
  sourceKind: SourceKind;
  industry: string | null;
  year: number | null;
  status: string | null;
  headlineMetric: HeadlineMetric | null;
}

export interface EvidenceService {
  id: string;
  name: string;
  category: string | null;
  status: 'active' | 'growth' | 'retired';
  naicsCodes: string[];
  keywords: string[];
  /** Confirmed links only. */
  insideCount: number;
  outsideCount: number;
  suggestedCount: number;
  newestEvidenceYear: number | null;
  industries: { industry: string; count: number }[];
  evidenceScore: number;
  evidenceTier: EvidenceTier;
  freshness: number;
  /** null = the live opportunity feed could not be read. Never a guessed 0. */
  openOpportunityMatches: number | null;
  caseStudies: EvidenceCaseStudy[];
}

export interface IntakeSuggestion {
  linkId: string;
  serviceId: string;
  serviceName: string;
  /** The suggestor's raw integer score (category 3 + 1 per matched keyword), not a percentage. */
  matchScore: number | null;
  rationale: string | null;
}

export interface IntakeSummaryItem {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  sourceKind: SourceKind;
  industry: string | null;
  createdAt: string | null;
  keywords: string[];
  analysisError: string | null;
  suggestions: IntakeSuggestion[];
}

export interface GrowthPoint {
  quarter: string; // "2026-Q4"
  servicesAdded: number;
  servicesTotal: number;
  linksConfirmed: number;
  linksTotal: number;
}

export interface FitGap {
  qualificationKey: string;
  title: string | null;
  buyer: string | null;
  /** A calendar date, "YYYY-MM-DD". */
  closeDate: string;
  capabilityId: string;
  name: string;
  assessment: 'partial' | 'new';
  matchedServiceId: string | null;
}

export interface DecideNow {
  blockedCaseStudies: { count: number; ids: string[] };
  demandWithoutProof: { count: number | null; ids: string[] };
  staleServices: { count: number; ids: string[] };
  openFitGaps: { count: number | null; items: FitGap[] };
}

export interface EvidenceSummary {
  status: SummaryStatus;
  generatedAt: string;
  services: EvidenceService[];
  intake: IntakeSummaryItem[];
  industryMatrix: { industries: string[]; cells: { serviceId: string; industry: string; count: number }[] };
  growthSeries: GrowthPoint[];
  decideNow: DecideNow;
  opportunityFeed: { source: 'live' | 'snapshot' | 'unavailable'; openCount: number | null };
}

export type OutsideImportStatus = 'created' | 'already_imported' | 'failed';
export interface OutsideImportResult {
  fileName: string;
  status: OutsideImportStatus;
  alreadyImported: boolean;
  caseStudyId: string | null;
  title: string | null;
  /** Set when the draft was created but parsing or analysis failed: it needs manual details. */
  analysisError: string | null;
  suggestionsInserted: number | null;
  error: string | null;
  errorClass: string | null;
}
export interface OutsideImportResponse {
  results: OutsideImportResult[];
  note: string | null;
  summary: { created: number; alreadyImported: number; failed: number; needsManualDetails: number };
}

export interface ProposeServiceBody {
  name: string;
  category?: string | null;
  description?: string | null;
  keywords?: string[];
  naicsCodes?: string[];
}
export interface ProposeServiceResult {
  service: ServiceOffering;
  existing: boolean;
  link: { id: string; state: 'confirmed'; changed: boolean };
  prefilledFromAnalysis: { keywords: boolean; naicsCodes: boolean };
}
export interface PromoteServiceResult { service: ServiceOffering; promoted: boolean; confirmedCaseStudies: number }

const BASE = '/api/admin/factory';

/** The one read that feeds the page. Read-only and tenant-scoped on the server. */
export async function getEvidenceSummary(status: SummaryStatus = 'all'): Promise<EvidenceSummary> {
  const { data } = await api.get<EvidenceSummary>(`${BASE}/services/evidence-summary?status=${status}`);
  return data;
}

/** Upload outside case studies (PDF, DOCX or PPTX; at most 4 files). Answers per file, even when some fail. */
export async function importOutsideFiles(files: File[]): Promise<OutsideImportResponse> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const { data } = await api.post<OutsideImportResponse>(`${BASE}/case-studies/external`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Import one Google Drive file, or every supported file in one Drive folder (manual import only). */
export async function importOutsideFromDrive(input: { driveFileId: string } | { driveFolderId: string }): Promise<OutsideImportResponse> {
  const { data } = await api.post<OutsideImportResponse>(`${BASE}/case-studies/external`, input);
  return data;
}

/** Create a growth service from a case study and confirm the link. Idempotent by name (`existing: true`). */
export async function proposeServiceFromCaseStudy(caseStudyId: string, body: ProposeServiceBody): Promise<ProposeServiceResult> {
  const { data } = await api.post<ProposeServiceResult>(`${BASE}/case-studies/${encodeURIComponent(caseStudyId)}/propose-service`, body);
  return data;
}

/** growth -> active. The server refuses (409) unless the service has at least one confirmed case study. */
export async function promoteService(serviceId: string): Promise<PromoteServiceResult> {
  const { data } = await api.post<PromoteServiceResult>(`${BASE}/services/${encodeURIComponent(serviceId)}/promote`);
  return data;
}

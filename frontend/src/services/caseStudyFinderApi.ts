import api from '../utils/api';

/**
 * caseStudyFinderApi - client for the Case Study Finder (backend: routes/admin/caseStudyFinderRoutes.ts).
 * The Finder only PROPOSES. "Build" creates a PRIVATE draft (the build-case-study skill's steps 0-2) and a Basecamp
 * build ticket; it never publishes. Types mirror backend/src/services/factory/caseStudyFinder/finderTypes.ts and
 * finderBuild.ts (hand-copied across the workspace boundary; change together).
 */
const BASE = '/api/admin/factory/case-study-finder';

export type EvidenceTier = 'proven' | 'emerging' | 'thin' | 'none';
export type NeedKind = 'service' | 'capability';

export interface FinderProcess {
  key: string; owner: string; repo: string; source: 'platform' | 'connected' | 'case_study'; root: string; name: string;
  codeFiles: number; testFiles: number; docPaths: string[]; samplePaths: string[]; keywords: string[];
}
export interface FinderOverlap { key?: string; name?: string; reason: string; caseStudy: { id: string; title: string; status: string } | null }
export interface FinderDelta {
  before: { score: number; tier: EvidenceTier; insideCount: number };
  after: { score: number; tier: EvidenceTier; insideCount: number };
  scoreChange: number; tierChange: boolean; openOpportunities: number | null; firstProof: boolean; fitGapsAnswered: number; assumption: string;
}
export interface FinderNarrative {
  title: string; what: string; when: string; where: string; why: string; how: string; need: string; helps: string; solves: string;
  canShow: string[]; source: 'ai' | 'facts';
}
export interface FinderProposal {
  id: string; rank: number; process: FinderProcess;
  need: { kind: NeedKind; id: string; name: string; status: 'active' | 'growth' | null; reasons: string[]; needScore: number };
  alternatives: { kind: NeedKind; id: string; name: string; match: number }[];
  match: number; sharedTerms: string[];
  fit: { score: number; source: 'ai' | 'keywords'; why: string | null };
  possibleOverlaps: FinderOverlap[];
  delta: FinderDelta | null;
  commits: { count: number; first: string | null; last: string | null; recent: { sha: string; date: string; message: string }[] };
  narrative: FinderNarrative;
  pathScope: string[];
  buildCommand: string;
}
export interface FinderResult {
  generatedAt: string;
  needs: { services: number; withNeed: number; capabilities: number; top: { kind: NeedKind; id: string; name: string; needScore: number; reasons: string[] }[] };
  repos: { owner: string; repo: string; source: string; status: 'read' | 'unavailable' | 'skipped'; processes: number; note: string | null }[];
  processesFound: number;
  proposals: FinderProposal[];
  excluded: FinderOverlap[];
  notes: string[];
}
export interface FinderRun {
  id: string; status: 'running' | 'completed' | 'failed'; stage: string | null; lastError: string | null;
  startedBy: string | null; startedAt: string; finishedAt: string | null;
}
export interface FinderBuild {
  id: string; proposalId: string; caseStudyId: string; title: string; status: 'prepared'; syncStatus: string; syncNote: string | null;
  scope: string[]; command: string; ticketUrl: string | null; ticketError: string | null; createdBy: string | null; createdAt: string; caseStudyUrl: string;
}
export interface FinderState { run: FinderRun | null; result: FinderResult | null; resultAt: string | null; builds: FinderBuild[] }

export type BuildResponse =
  | { kind: 'built' | 'exists'; build: FinderBuild }
  | { kind: 'overlap'; error: string; overlaps: FinderOverlap[]; needsAcknowledgement: boolean }
  | { kind: 'scope_changed'; error: string; expected: string[] }
  | { kind: 'not_found'; error: string };

export async function getFinder(): Promise<FinderState> {
  return (await api.get(BASE)).data;
}
/** 202 -> the new run; 409 -> the run already in progress (returned, not thrown). */
export async function startFinderRun(): Promise<FinderRun> {
  try { return (await api.post(`${BASE}/run`, {})).data.run; } catch (e) {
    const r = (e as { response?: { status?: number; data?: { run?: FinderRun } } }).response;
    if (r?.status === 409 && r.data?.run) return r.data.run;
    throw e;
  }
}
/** The skill's stops (overlap, changed scope, stale proposal) come back as values, not throws, so the UI can show them. */
export async function buildProposal(id: string, scope: string[], acknowledgeOverlaps = false): Promise<BuildResponse> {
  try {
    const res = await api.post(`${BASE}/proposals/${id}/build`, { scope, ...(acknowledgeOverlaps ? { acknowledgeOverlaps: true } : {}) });
    return { kind: res.data.existing ? 'exists' : 'built', build: res.data.build };
  } catch (e) {
    const r = (e as { response?: { status?: number; data?: Record<string, unknown> } }).response;
    const d = r?.data ?? {};
    const error = String(d.error ?? 'Could not prepare the case study build.');
    if (r?.status === 409 && Array.isArray(d.overlaps)) return { kind: 'overlap', error, overlaps: d.overlaps as FinderOverlap[], needsAcknowledgement: !!d.needsAcknowledgement };
    if (r?.status === 409 && Array.isArray(d.expected)) return { kind: 'scope_changed', error, expected: d.expected as string[] };
    if (r?.status === 404) return { kind: 'not_found', error };
    throw e;
  }
}

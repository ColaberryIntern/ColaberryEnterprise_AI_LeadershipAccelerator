/**
 * finderTypes - shapes of the Case Study Finder (Services Upgrade CF1).
 *
 * The Finder answers "which case study should we build next, from what, and what would it buy us?":
 *   NEED    our own data: thin or unproven services, open Gov opportunities that match a service we cannot prove,
 *           capabilities live proposals flagged Partly/New, Growth services one case study short;
 *   SUPPLY  business processes in this repo and in the connected repos (a module with its code, tests, docs, commits);
 *   MINUS   anything an existing case study already covers (the build-case-study skill's overlap hard stop, run first);
 *   DELTA   before/after evidence score and tier, computed with the SAME formula Our Services uses. Never guessed.
 * ADVISORY ONLY: a proposal creates nothing. Building one is a separate, explicit click (CF2).
 */
import type { EvidenceTier } from '../serviceEvidenceScore';

export interface RepoRef {
  owner: string;
  repo: string;
  /** platform = this repo; connected = a student/intern GitHub connection; case_study = a repo already on a case study. */
  source: 'platform' | 'connected' | 'case_study';
}

export interface ProcessCandidate {
  key: string;            // `${owner}/${repo}:${root}`
  owner: string;
  repo: string;
  source: RepoRef['source'];
  root: string;           // directory, no trailing slash ('' = whole repo)
  name: string;           // human name from the directory ("Service Gap", "Inbox")
  codeFiles: number;
  testFiles: number;
  docPaths: string[];     // related markdown found by name (bounded)
  samplePaths: string[];  // a few representative files (bounded)
  keywords: string[];     // tokens from the directory and file names, most frequent first
}

export type NeedKind = 'service' | 'capability';

export interface Need {
  kind: NeedKind;
  /** service id, or the fit-gap capability key for an unmatched capability. */
  id: string;
  name: string;
  status: 'active' | 'growth' | null;
  description: string | null;
  tokens: string[];
  needScore: number;
  reasons: string[];
  /** Service state for the deterministic delta; null for a capability with no service. */
  evidence: {
    insideCount: number; outsideCount: number; newestEvidenceYear: number | null; industries: number;
    score: number; tier: EvidenceTier; openOpportunityMatches: number | null;
  } | null;
  fitGaps: { title: string | null; name: string; assessment: 'partial' | 'new'; closeDate: string }[];
}

export interface ProfileDelta {
  before: { score: number; tier: EvidenceTier; insideCount: number };
  after: { score: number; tier: EvidenceTier; insideCount: number };
  scoreChange: number;
  tierChange: boolean;
  /** Open Gov opportunities matching this service that would have (more) proof. Null when the feed was unavailable. */
  openOpportunities: number | null;
  firstProof: boolean;
  fitGapsAnswered: number;
  assumption: string;
}

export interface ProposalNarrative {
  title: string;
  what: string; when: string; where: string; why: string; how: string;
  need: string; helps: string; solves: string;
  canShow: string[];
  source: 'ai' | 'facts';
}

export interface CommitFact { sha: string; date: string; message: string }

export interface FinderProposal {
  id: string;
  rank: number;
  process: ProcessCandidate;
  need: Pick<Need, 'kind' | 'id' | 'name' | 'status' | 'reasons' | 'needScore'>;
  alternatives: { kind: NeedKind; id: string; name: string; match: number }[];
  match: number;
  sharedTerms: string[];
  /** The judged fit: 'ai' when the model confirmed this need, 'keywords' when it was unavailable (fail soft). */
  fit: { score: number; source: 'ai' | 'keywords'; why: string | null };
  /** Possible overlaps with existing case studies, shown so a person checks them; the build re-runs the hard stop. */
  possibleOverlaps: ExcludedProcess[];
  delta: ProfileDelta | null;
  commits: { count: number; first: string | null; last: string | null; recent: CommitFact[] };
  narrative: ProposalNarrative;
  /** What the build step will scope the draft to (skill §1); a person still approves it. */
  pathScope: string[];
  buildCommand: string;
}

export interface ExcludedProcess {
  key: string; name: string; reason: string; caseStudy: { id: string; title: string; status: string } | null;
}

export interface RepoScan { owner: string; repo: string; source: RepoRef['source']; status: 'read' | 'unavailable' | 'skipped'; processes: number; note: string | null }

export interface FinderResult {
  generatedAt: string;
  needs: { services: number; withNeed: number; capabilities: number; top: Pick<Need, 'kind' | 'id' | 'name' | 'needScore' | 'reasons'>[] };
  repos: RepoScan[];
  processesFound: number;
  proposals: FinderProposal[];
  excluded: ExcludedProcess[];
  notes: string[];
}

export interface FinderRunView {
  id: string;
  status: 'running' | 'completed' | 'failed';
  stage: string | null;
  lastError: string | null;
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

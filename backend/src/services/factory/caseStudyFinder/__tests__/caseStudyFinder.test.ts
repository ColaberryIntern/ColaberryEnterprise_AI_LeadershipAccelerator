import { tokens, humanName } from '../finderText';
import { findProcesses, MIN_CODE_FILES } from '../finderProcesses';
import { buildNeeds, NEED_WEIGHTS } from '../finderNeeds';
import { coverageOf, matchNeeds, wordWeights } from '../finderMatch';
import { profileDelta } from '../finderDelta';
import { applyJudgment, capPerNeed, rankProcesses, toProposal, pathScopeFor, MAX_PER_NEED } from '../finderAssemble';
import { judgePrompt, parseJudgment, MIN_FIT } from '../finderJudge';
import { canShowFacts, factsNarrative } from '../finderNarrative';
import { dedupeRepos, runFinder, type FinderDeps } from '../finderRun';
import { scoreServiceEvidence } from '../../serviceEvidenceScore';
import type { EvidenceService, EvidenceSummary } from '../../serviceEvidenceSummaryTypes';
import type { Need, ProcessCandidate, RepoRef } from '../finderTypes';

const PLATFORM: RepoRef = { owner: 'Org', repo: 'platform', source: 'platform' };
const files = (dir: string, names: string[]): string[] => names.map((n) => `${dir}/${n}`);

function svc(over: Partial<EvidenceService> = {}): EvidenceService {
  return {
    id: 'svc-1', name: 'Call Center Analytics', category: 'AI', status: 'active', naicsCodes: [], keywords: ['call scoring', 'transcript', 'admissions'],
    insideCount: 0, outsideCount: 0, suggestedCount: 0, newestEvidenceYear: null, industries: [], evidenceScore: 0, evidenceTier: 'none',
    freshness: 0, openOpportunityMatches: 3, caseStudies: [], ...over,
  } as EvidenceService;
}

function summary(services: EvidenceService[], over: Partial<EvidenceSummary['decideNow']> = {}): EvidenceSummary {
  return {
    status: 'all', generatedAt: '2026-11-16T12:00:00Z', services, intake: [], industryMatrix: { industries: [], cells: [] }, growthSeries: [],
    decideNow: { blockedCaseStudies: { count: 0, ids: [] }, demandWithoutProof: { count: 0, ids: [] }, staleServices: { count: 0, ids: [] }, openFitGaps: { count: 0, items: [] }, ...over },
    opportunityFeed: { source: 'live', openCount: 10 },
  } as EvidenceSummary;
}

describe('finderText', () => {
  it('splits camelCase, drops code plumbing and singularizes lightly', () => {
    expect(tokens('callScoringService.test.ts')).toEqual(['call', 'scoring']);
    expect(tokens('TranscriptsLoader')).toEqual(['transcript']);
    expect(humanName('serviceGap')).toBe('Service Gap');
  });
});

describe('finderProcesses', () => {
  it('platform repo: one process per services directory, a big sub-directory stands alone, a small one folds back', () => {
    const paths = [
      ...files('backend/src/services/callScoring', ['scorer.ts', 'transcriptReader.ts', 'rubric.ts', 'weights.ts', '__tests__/scorer.test.ts']),
      ...files('backend/src/services/factory', ['catalog.ts', 'catalogStore.ts', 'catalogLoad.ts', 'tiny/a.ts']),
      ...files('backend/src/services/factory/serviceGap', ['assess.ts', 'validate.ts', 'cluster.ts', 'batch.ts']),
      ...files('backend/src/services/small', ['one.ts']),
      'docs/call-scoring.md', 'backend/src/services/callScoring/node_modules/x/y.js',
    ];
    const got = findProcesses(PLATFORM, paths);
    const roots = got.map((p) => p.root).sort();
    expect(roots).toEqual(['backend/src/services/callScoring', 'backend/src/services/factory', 'backend/src/services/factory/serviceGap']);
    const factory = got.find((p) => p.root === 'backend/src/services/factory')!;
    expect(factory.codeFiles).toBe(4); // includes the folded tiny/a.ts, never serviceGap's files
    const call = got.find((p) => p.root.endsWith('callScoring'))!;
    expect(call.testFiles).toBe(1);
    expect(call.codeFiles).toBe(4); // node_modules ignored
    expect(call.docPaths).toEqual(['docs/call-scoring.md']);
    expect(call.keywords.slice(0, 2)).toEqual(['call', 'scoring']);
  });

  it('a small connected repo with no split is one whole-repo process; a near-empty one is none', () => {
    const one = findProcesses({ owner: 'u', repo: 'DataBuddy', source: 'connected' }, ['main.py', 'agent.py', 'tools.py', 'README.md']);
    expect(one).toHaveLength(1);
    expect(one[0].root).toBe('');
    expect(findProcesses({ owner: 'u', repo: 'x', source: 'connected' }, ['README.md', 'a.py'])).toEqual([]);
    expect(MIN_CODE_FILES).toBe(4);
  });
});

describe('finderNeeds', () => {
  it('scores need from tier, Gov demand, proposal gaps and Growth, and explains each part', () => {
    const gap = { qualificationKey: 'q', title: 'County RFP', buyer: null, closeDate: '2026-12-01', capabilityId: 'c', name: 'Call quality analytics', assessment: 'new' as const, matchedServiceId: 'svc-1' };
    const [n] = buildNeeds(summary([svc()], { openFitGaps: { count: 1, items: [gap] } }));
    expect(n.needScore).toBe(NEED_WEIGHTS.tier.none + 18 + 10);
    expect(n.reasons).toEqual(['No confirmed case study yet', '3 open Gov opportunities match this service with no proof behind it', '1 live proposal capability rated Partly/New']);
  });

  it('a proven service with no demand has no need; an unmatched capability becomes its own need; retired is skipped', () => {
    const gap = { qualificationKey: 'q', title: null, buyer: null, closeDate: '2026-12-01', capabilityId: 'c', name: 'Geospatial imagery triage', assessment: 'partial' as const, matchedServiceId: null };
    const needs = buildNeeds(summary([
      svc({ id: 'p', evidenceTier: 'proven', evidenceScore: 90, insideCount: 4, openOpportunityMatches: 0 }),
      svc({ id: 'r', status: 'retired' }),
    ], { openFitGaps: { count: 1, items: [gap] } }));
    expect(needs.map((x) => x.id)).toEqual(['capability:geospatial imagery triage', 'p']);
    expect(needs.find((x) => x.id === 'p')!.needScore).toBe(0);
  });
});

const proc = (over: Partial<ProcessCandidate> = {}): ProcessCandidate => ({
  key: 'Org/platform:backend/src/services/callScoring', owner: 'Org', repo: 'platform', source: 'platform',
  root: 'backend/src/services/callScoring', name: 'Call Scoring', codeFiles: 9, testFiles: 3, docPaths: [], samplePaths: [],
  keywords: ['call', 'scoring', 'transcript', 'rubric'], ...over,
});

describe('finderMatch coverage (the skill overlap hard stop, run first)', () => {
  const cs = (title: string, id = 'cs1') => ({ id, title, slug: null, status: 'approved', capability: null });
  it('a two-word process is EXCLUDED when a case study title carries both words', () => {
    expect(coverageOf(proc(), [cs('Call Scoring for Admissions Teams')], []).excluded?.caseStudy?.title).toBe('Call Scoring for Admissions Teams');
    expect(coverageOf(proc(), [cs('Scoring dashboards')], []).excluded).toBeNull();
  });
  it('a one-word name in a title is only a WARNING: "Reporting" in "Scam Reporting Tool" is not proof', () => {
    const one = proc({ root: 'backend/src/services/reporting', name: 'Reporting', key: 'k' });
    const c = coverageOf(one, [cs('Scam Reporting Tool')], []);
    expect(c.excluded).toBeNull();
    expect(c.warnings[0].caseStudy?.title).toBe('Scam Reporting Tool');
  });
  it('a scope on this code or a specific parent excludes; a broad parent scope (the whole services tree) only warns', () => {
    const scope = (pathScope: string[]) => [{ caseStudyId: 'cs1', owner: 'org', repo: 'PLATFORM', pathScope }];
    expect(coverageOf(proc(), [cs('Something else')], scope(['backend/src/services/callscoring/scorer.ts'])).excluded).not.toBeNull();
    const deep = proc({ root: 'backend/src/services/factory/serviceGap', key: 'k2', name: 'Service Gap' });
    expect(coverageOf(deep, [cs('Something else')], scope(['backend/src/services/factory'])).excluded).not.toBeNull();
    const broad = coverageOf(proc(), [cs('The whole platform')], scope(['backend/src/services']));
    expect(broad.excluded).toBeNull();
    expect(broad.warnings[0].reason).toMatch(/broad case study includes backend\/src\/services/);
  });
  it('a whole connected repo on a case study excludes every process in it; an unscoped one on the platform does not', () => {
    const conn = proc({ source: 'connected', owner: 'u', repo: 'r', root: 'src/x', key: 'u/r:src/x', name: 'X' });
    expect(coverageOf(conn, [cs('Unrelated')], [{ caseStudyId: 'cs1', owner: 'u', repo: 'r', pathScope: [] }]).excluded?.reason).toMatch(/repository is already a case study/);
    expect(coverageOf(proc(), [cs('Unrelated')], [{ caseStudyId: 'cs1', owner: 'Org', repo: 'platform', pathScope: [] }]).excluded).toBeNull();
  });
  it('words common to many processes carry no weight in a match', () => {
    const many = Array.from({ length: 20 }, (_, i) => proc({ key: `k${i}`, keywords: ['report', `unique${i}`, `other${i}`] }));
    const w = wordWeights(many);
    expect(w.get('report')).toBe(0);
    expect(w.get('unique3')).toBeGreaterThan(0);
  });
  it('matching needs at least two shared words', () => {
    const need = { tokens: ['call', 'scoring', 'admission'], needScore: 10 } as Need;
    expect(matchNeeds(proc(), [need])[0].shared).toEqual(['call', 'scoring']);
    expect(matchNeeds(proc(), [{ ...need, tokens: ['call', 'center'] } as Need])).toEqual([]);
  });
});

describe('finderDelta', () => {
  it('uses the Our Services formula: the after score is what the page will read once confirmed', () => {
    const [n] = buildNeeds(summary([svc({ insideCount: 1, evidenceScore: 38, evidenceTier: 'thin', newestEvidenceYear: 2026, industries: [] })]));
    const d = profileDelta(n, 2026)!;
    const expected = scoreServiceEvidence({ insideCount: 2, outsideCount: 0, newestEvidenceYear: 2026, distinctIndustries: 0, currentYear: 2026 });
    expect(d.after).toEqual({ score: expected.score, tier: expected.tier, insideCount: 2 });
    expect(d.before.score).toBe(38);
    expect(d.firstProof).toBe(false);
    expect(d.scoreChange).toBe(expected.score - 38);
  });
  it('a capability with no service has no score to move', () => {
    expect(profileDelta({ evidence: null } as Need, 2026)).toBeNull();
  });
});

describe('finderAssemble', () => {
  it('excludes covered processes (listed, not silent), caps proposals per need, and scopes the build to the process', () => {
    const needs = buildNeeds(summary([svc()]));
    const ps = ['callScoring', 'callScoringV2', 'callScoringLegacy', 'transcriptRubric'].map((d) =>
      proc({ key: `Org/platform:backend/src/services/${d}`, root: `backend/src/services/${d}`, name: d }));
    const covered = [{ id: 'c', title: 'Transcript Rubric review for admissions', slug: null, status: 'draft', capability: null }];
    const { ranked, excluded } = rankProcesses(ps, needs, covered, []);
    expect(excluded.map((e) => e.name)).toEqual(['transcriptRubric']);
    expect(excluded[0].caseStudy?.title).toBe('Transcript Rubric review for admissions');
    expect(ranked).toHaveLength(3); // the shortlist; the final cap applies after judging
    expect(capPerNeed(ranked, MAX_PER_NEED, 8)).toHaveLength(MAX_PER_NEED);
    const p = toProposal(ranked[0], 1, 2026);
    expect(p.pathScope).toEqual([ranked[0].process.root.toLowerCase()]);
    expect(p.buildCommand).toContain('/build-case-study repo=Org/platform scope=backend/src/services/callscoring');
    expect(p.delta?.before.tier).toBe('none');
    expect(p.fit.source).toBe('keywords');
    expect(pathScopeFor(proc({ root: '' }))).toEqual([]);
  });
});

describe('finderJudge (the model judges fit; our code decides what passes)', () => {
  const needs = buildNeeds(summary([svc(), svc({ id: 'svc-2', name: 'Call Routing', keywords: ['call', 'scoring', 'routing'] })]));
  const r = rankProcesses([proc()], needs, [], []).ranked[0];

  it('the prompt offers only opaque refs for the candidates and fences the module facts', () => {
    const { user, refs } = judgePrompt(proc(), needs);
    expect([...refs.keys()]).toEqual(['N1', 'N2']);
    expect(user).toContain('N1 | ');
    expect(user).not.toContain('svc-1');
  });
  it('an answer pointing at a ref we did not send is ignored entirely', () => {
    const refs = new Map([['N1', 'svc-1']]);
    expect(parseJudgment({ ref: 'N7', fit: 90, why: 'x' }, refs)).toBeNull();
    expect(parseJudgment({ ref: 'n1', fit: 140, why: 'fits' }, refs)).toEqual({ needId: 'svc-1', fit: 100, why: 'fits' });
    expect(parseJudgment({ ref: null, fit: 'high' }, refs)).toBeNull();
  });
  it('a rejection or a low fit drops the process; no answer keeps the keyword ranking; a pick can switch the need', () => {
    expect(applyJudgment(r, { needId: null, fit: 80, why: '' }, MIN_FIT)).toBeNull();
    expect(applyJudgment(r, { needId: r.best.need.id, fit: MIN_FIT - 1, why: '' }, MIN_FIT)).toBeNull();
    expect(applyJudgment(r, null, MIN_FIT)).toBe(r);
    const other = [r.best, ...r.alternatives].find((m) => m.need.id !== r.best.need.id)!;
    const switched = applyJudgment(r, { needId: other.need.id, fit: 85, why: 'Routes calls.' }, MIN_FIT)!;
    expect(switched.best.need.id).toBe(other.need.id);
    expect(switched.fit).toEqual({ score: 85, source: 'ai', why: 'Routes calls.' });
  });
});

describe('finderNarrative facts layer', () => {
  it('"what we can show" lists only facts we read or computed', () => {
    const [need] = buildNeeds(summary([svc()]));
    const f = { process: proc({ docPaths: ['docs/call-scoring.md'] }), need, delta: profileDelta(need, 2026), commits: { count: 12, first: '2026-08-01T00:00:00Z', last: '2026-11-10T00:00:00Z', recent: [] } };
    expect(canShowFacts(f)).toEqual([
      '9 source files in backend/src/services/callScoring',
      '3 automated test files that can be run and cited',
      'Written design or runbook: docs/call-scoring.md',
      '12 commits from 2026-08-01 to 2026-11-10, each one citable evidence',
      'Evidence score for Call Center Analytics: 0 -> 38 (none -> thin)',
    ]);
    expect(factsNarrative(f).helps).toBe('First proof for Call Center Analytics: evidence score 0 -> 38, none -> thin, behind 3 open Gov opportunities.');
  });
});

describe('runFinder pipeline (no GitHub, no model, no database)', () => {
  const deps = (over: Partial<FinderDeps> = {}): FinderDeps => ({
    loadSummary: async () => summary([svc()]),
    loadDescriptions: async () => new Map(),
    loadRepos: async () => [PLATFORM, { owner: 'u', repo: 'gone', source: 'connected' }],
    loadCaseStudies: async () => ({ caseStudies: [], scopes: [] }),
    readTree: async (ref) => (ref.repo === 'gone' ? null : { branch: 'main', paths: files('backend/src/services/callScoring', ['scorer.ts', 'transcript.ts', 'rubric.ts', 'weights.ts', 'callScoring.test.ts']) }),
    readCommits: async () => [{ sha: 'a', date: '2026-10-01T00:00:00Z', message: 'Add call scoring' }, { sha: 'b', date: '2026-11-01T00:00:00Z', message: 'Tune weights' }],
    narrate: async (f) => factsNarrative(f),
    judge: async () => null,
    now: () => new Date('2026-11-16T12:00:00Z'),
    ...over,
  });

  it('reads needs and repos, lists an unreadable repo, and returns a proposal with commits and a delta', async () => {
    const stages: string[] = [];
    const r = await runFinder('t', deps(), async (s) => { stages.push(s); });
    expect(r.repos.map((x) => `${x.repo}:${x.status}`)).toEqual(['platform:read', 'gone:unavailable']);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].commits).toMatchObject({ count: 2, first: '2026-10-01T00:00:00Z', last: '2026-11-01T00:00:00Z' });
    expect(r.proposals[0].narrative.when).toBe('Built over 2 commits, 2026-10-01 to 2026-11-01.');
    expect(r.proposals[0].delta?.after.tier).toBe('thin');
    expect(stages[0]).toBe('Reading our needs');
  });

  it('a failed model or commit read never loses the proposal', async () => {
    const r = await runFinder('t', deps({ readCommits: async () => { throw new Error('rate limited'); } }));
    expect(r.proposals[0].commits.count).toBe(0);
  });

  it('dedupes repos case-insensitively and skips placeholder repos', () => {
    expect(dedupeRepos([PLATFORM, { owner: 'org', repo: 'PLATFORM', source: 'connected' }, { owner: 'octocat', repo: 'Hello-World', source: 'connected' }])).toEqual([PLATFORM]);
  });
});

import { prepareBuild, preflightOverlaps, ticketHtml, commandFor, type BuildDeps, type BuildView } from '../finderBuild';
import type { FinderProposal } from '../finderTypes';

const proposal = (over: Partial<FinderProposal> = {}): FinderProposal => ({
  id: 'abcdef0123456789', rank: 1,
  process: { key: 'Org/platform:backend/src/services/hire', owner: 'Org', repo: 'platform', source: 'platform', root: 'backend/src/services/hire', name: 'Hire', codeFiles: 12, testFiles: 4, docPaths: [], samplePaths: [], keywords: ['hire', 'talent'] },
  need: { kind: 'service', id: 'svc-1', name: 'Data Talent Pipeline', status: 'active', reasons: ['Thin proof: evidence score 35 of 100'], needScore: 30 },
  alternatives: [], match: 12, sharedTerms: ['hire', 'talent'], fit: { score: 90, source: 'ai', why: 'Hiring pipeline.' }, possibleOverlaps: [],
  delta: { before: { score: 35, tier: 'thin', insideCount: 1 }, after: { score: 53, tier: 'emerging', insideCount: 2 }, scoreChange: 18, tierChange: true, openOpportunities: 2, firstProof: false, fitGapsAnswered: 0, assumption: 'x' },
  commits: { count: 16, first: null, last: null, recent: [] },
  narrative: { title: 'Hiring Pipeline for Data Talent', what: 'w', when: 'n', where: 'r', why: 'y', how: 'h', need: 'n', helps: 'h', solves: 's', canShow: ['12 source files'], source: 'ai' },
  pathScope: ['backend/src/services/hire'],
  buildCommand: '/build-case-study repo=Org/platform scope=backend/src/services/hire service="Data Talent Pipeline" title="Hiring Pipeline for Data Talent"',
  ...over,
});

function deps(over: Partial<BuildDeps> = {}): BuildDeps & { calls: string[] } {
  const calls: string[] = [];
  let saved: BuildView | null = null;
  return {
    calls,
    loadProposal: async () => proposal(),
    loadCaseStudies: async () => ({ caseStudies: [], scopes: [] }),
    findBuild: async () => null,
    createDraft: async (title, repo) => { calls.push(`create:${title}:${repo}`); return { caseStudyId: 'cs-new', slug: 'hiring', repositoryId: 'repo-1' }; },
    setScope: async (_id, repoId, scope) => { calls.push(`scope:${repoId}:${scope.join(',')}`); },
    saveBuild: async (row) => { calls.push('save'); saved = { ...row, id: 'b1', createdAt: '2026-11-16T00:00:00Z', caseStudyUrl: 'u' } as BuildView; return saved; },
    openTicket: async () => { calls.push('ticket'); return 'https://app.basecamp.com/t/1'; },
    setTicket: async (_id, url, err) => { calls.push(`setTicket:${url}:${err}`); },
    startSync: () => { calls.push('sync'); },
    ...over,
  };
}

const input = { tenantId: 't', proposalId: 'abcdef0123456789', actor: 'ali@colaberry.com', scope: ['backend/src/services/hire'], acknowledgeOverlaps: false };

describe('prepareBuild: the skill steps 0-2 on the server', () => {
  it('creates the private draft, applies the approved scope, saves, opens the ticket, then syncs', async () => {
    const d = deps();
    const out = await prepareBuild(input, d);
    expect(out.kind).toBe('built');
    expect(d.calls).toEqual([
      'create:Hiring Pipeline for Data Talent:Org/platform', 'scope:repo-1:backend/src/services/hire', 'save', 'ticket',
      'setTicket:https://app.basecamp.com/t/1:null', 'sync',
    ]);
    if (out.kind === 'built') {
      expect(out.build.command).toBe(`${proposal().buildCommand} caseStudyId=cs-new`);
      expect(out.build.ticketUrl).toBe('https://app.basecamp.com/t/1');
    }
  });

  it('HARD STOP: an existing case study covering the code means nothing is created', async () => {
    const d = deps({ loadCaseStudies: async () => ({
      caseStudies: [{ id: 'cs9', title: 'Something', slug: 's', status: 'approved', capability: null }],
      scopes: [{ caseStudyId: 'cs9', owner: 'org', repo: 'platform', pathScope: ['backend/src/services/hire'] }],
    }) });
    const out = await prepareBuild(input, d);
    expect(out).toMatchObject({ kind: 'overlap', needsAcknowledgement: false });
    expect(d.calls).toEqual([]);
  });

  it('HARD STOP: a near-identical title or the same slug is an overlap', () => {
    const p = proposal();
    expect(preflightOverlaps(p, [{ id: 'x', title: 'Data Talent Hiring Pipeline', slug: null, status: 'draft', capability: null }], []).hard).toHaveLength(1);
    expect(preflightOverlaps(p, [{ id: 'y', title: 'Other', slug: 'hiring-pipeline-for-data-talent', status: 'draft', capability: null }], []).hard[0].reason).toMatch(/slug/);
    expect(preflightOverlaps(p, [{ id: 'z', title: 'Freight routing', slug: null, status: 'draft', capability: null }], []).hard).toEqual([]);
  });

  it('a possible overlap needs an explicit acknowledgement, then builds', async () => {
    const warn = { key: 'k', name: 'Hire', reason: 'A broad case study includes backend/src/services', caseStudy: { id: 'c', title: 'Platform', status: 'approved' } };
    const d = deps({ loadProposal: async () => proposal({ possibleOverlaps: [warn] }), loadCaseStudies: async () => ({
      caseStudies: [{ id: 'c', title: 'Platform', slug: null, status: 'approved', capability: null }],
      scopes: [{ caseStudyId: 'c', owner: 'Org', repo: 'platform', pathScope: ['backend/src/services'] }],
    }) });
    expect(await prepareBuild(input, d)).toMatchObject({ kind: 'overlap', needsAcknowledgement: true });
    expect(d.calls).toEqual([]);
    expect((await prepareBuild({ ...input, acknowledgeOverlaps: true }, d)).kind).toBe('built');
  });

  it('a scope other than the one shown is refused, so what was approved is what gets applied', async () => {
    const d = deps();
    expect(await prepareBuild({ ...input, scope: ['backend/src'] }, d)).toEqual({ kind: 'scope_changed', expected: ['backend/src/services/hire'] });
    expect(d.calls).toEqual([]);
  });

  it('a second click returns the existing draft, never a duplicate', async () => {
    const existing = { id: 'b0', caseStudyId: 'cs-old' } as BuildView;
    const d = deps({ findBuild: async () => existing });
    expect(await prepareBuild(input, d)).toEqual({ kind: 'exists', build: existing });
    expect(d.calls).toEqual([]);
  });

  it('a Basecamp failure keeps the draft and reports the error with the command to paste', async () => {
    const d = deps({ openTicket: async () => { throw new Error('Basecamp 503'); } });
    const out = await prepareBuild(input, d);
    expect(out.kind).toBe('built');
    if (out.kind === 'built') { expect(out.build.ticketUrl).toBeNull(); expect(out.build.ticketError).toBe('Basecamp 503'); }
    expect(d.calls).toContain('setTicket:null:Basecamp 503');
  });

  it('a stale proposal (not in the latest result) is a 404, not a guess', async () => {
    expect(await prepareBuild(input, deps({ loadProposal: async () => null }))).toEqual({ kind: 'not_found' });
  });
});

describe('the build ticket', () => {
  it('carries the exact command, the draft link, the approved scope and the never-publish rule; escapes HTML', () => {
    const p = proposal({ narrative: { ...proposal().narrative, what: '<script>x</script>' } });
    const html = ticketHtml(p, 'cs-new', commandFor(p, 'cs-new'));
    expect(html).toContain('/admin/case-studies/cs-new');
    expect(html).toContain('caseStudyId=cs-new');
    expect(html).toContain('Approved path scope (1)');
    expect(html).toContain('Never publish');
    expect(html).not.toContain('<script>');
  });
});

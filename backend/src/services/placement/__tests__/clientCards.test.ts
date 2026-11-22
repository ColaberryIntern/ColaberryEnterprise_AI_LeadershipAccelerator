// CP10.2b: the candidate cards' facts. The database read is mocked here (its SQL runs on Postgres in CI's integration
// tier through the route); the decisions (absent = null, scoped to the given ids, a broken Hire index degrades) are pure.
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai/' }) }));

import { latestReadiness, loadCardFacts, MAX_PROJECTS, profileOf, type CardDeps, type IndexEntryLike } from '../clientCards';
import { NO_INTERVIEW } from '../../../db/ensureCareerPrepSchema';

const ANN = '11111111-0000-4000-8000-000000000001';
const BOB = '22222222-0000-4000-8000-000000000002';
const EVE = '99999999-0000-4000-8000-000000000009'; // listed on Hire, but NOT put forward to this client
const entry = (id: string, slug: string, titles: string[], title: unknown = 'AI Solutions Analyst'): IndexEntryLike =>
  ({ page: { enrollment_id: id, slug, approved_identity: { title } }, cases: titles.map((t) => ({ title: t })) });
const deps = (over: Partial<CardDeps> = {}): CardDeps => ({
  readiness: async () => new Map([[ANN, 72]]),
  hireIndex: async () => [entry(ANN, 'ann-lee', ['Freight ETA forecasting']), entry(EVE, 'eve', ['Secret project'])],
  ...over,
});

beforeEach(() => mockQuery.mockReset());

describe('loadCardFacts', () => {
  it('reads facts for the given ids only; an absent fact is null, never invented', async () => {
    const out = await loadCardFacts([ANN, BOB], deps());
    expect(out.profilesUnavailable).toBe(false);
    expect(out.facts.get(ANN)).toEqual({ readiness: 72, profile: { url: 'https://hire.refactored.ai/talent/ann-lee/', role: 'AI Solutions Analyst',
      verifiedProjects: ['Freight ETA forecasting'], verifiedCount: 1 } });
    expect(out.facts.get(BOB)).toEqual({ readiness: null, profile: null });
    expect([...out.facts.keys()]).toEqual([ANN, BOB]); // EVE is listed on Hire but never put forward: not looked at, not returned
    expect(JSON.stringify([...out.facts.values()])).not.toContain('Secret project');
  });
  it('no ids: no reads at all', async () => {
    const readiness = jest.fn(); const hireIndex = jest.fn();
    expect((await loadCardFacts([], { readiness, hireIndex })).facts.size).toBe(0);
    expect(readiness).not.toHaveBeenCalled();
    expect(hireIndex).not.toHaveBeenCalled();
  });
  it('the Hire index fails: every profile is null, profilesUnavailable is true, readiness still shown, a warn line with a class', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const out = await loadCardFacts([ANN], deps({ hireIndex: async () => { throw new Error('db down'); } }));
      expect(out).toEqual({ facts: new Map([[ANN, { readiness: 72, profile: null }]]), profilesUnavailable: true });
      const line = JSON.parse(String(warn.mock.calls[0][0]));
      expect(line).toMatchObject({ level: 'warn', event: 'hire_client_profiles_unavailable', error_class: 'UpstreamUnavailable' });
    } finally { warn.mockRestore(); }
  });
  it('a readiness read failure propagates (the route answers a logged 500)', async () => {
    await expect(loadCardFacts([ANN], deps({ readiness: async () => { throw new Error('db down'); } }))).rejects.toThrow('db down');
  });
  it('the same ids twice give the same facts (a pure read, safe to repeat)', async () => {
    const d = deps();
    expect(await loadCardFacts([ANN, BOB], d)).toEqual(await loadCardFacts([ANN, BOB], d));
  });
});

describe('profileOf', () => {
  it('at most 3 project titles, the count of all; blank titles dropped; the slug is encoded; no headline = null role', () => {
    const p = profileOf(entry(ANN, 'ann lee/x', ['A', ' ', 'B', 'C', 'D'], 42), 'https://hire.refactored.ai/');
    expect(p).toEqual({ url: 'https://hire.refactored.ai/talent/ann%20lee%2Fx/', role: null, verifiedProjects: ['A', 'B', 'C'], verifiedCount: 4 });
    expect(MAX_PROJECTS).toBe(3);
  });
  it('a long headline or title is cut to the 120 the response allows', () => {
    const p = profileOf(entry(ANN, 'a', ['x'.repeat(300)], 'y'.repeat(300)), 'https://h.example');
    expect(p.role).toHaveLength(120);
    expect(p.verifiedProjects[0]).toHaveLength(120);
  });
});

describe('latestReadiness', () => {
  it('one statement, IN (:ids) (never ANY), general readiness only, latest first; rounded; out-of-range rows dropped', async () => {
    mockQuery.mockResolvedValue([[{ enrollment_id: ANN, readiness: '71.6' }, { enrollment_id: BOB, readiness: '140' }]]);
    const out = await latestReadiness([ANN, BOB]);
    expect(out).toEqual(new Map([[ANN, 72]]));
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/IN \(:ids\)/);
    expect(sql).not.toMatch(/ANY\(/);
    expect(sql).toMatch(/DISTINCT ON \(enrollment_id\)[\s\S]*ORDER BY enrollment_id, date DESC/);
    expect(opts.replacements).toEqual({ ids: [ANN, BOB], none: NO_INTERVIEW });
  });
  it('no ids: no query', async () => {
    expect((await latestReadiness([])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

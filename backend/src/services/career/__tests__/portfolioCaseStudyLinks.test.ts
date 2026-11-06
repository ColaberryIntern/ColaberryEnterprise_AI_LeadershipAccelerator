/**
 * The rule that decides whether a project card on a public portfolio is a LINK.
 *
 * WHY THIS SUITE EXISTS. This rule was wrong twice while it was inline in
 * `careerPortfolioPageService.ts`, and it is the one rule on the portfolio that can
 * point a stranger at a learner's writing. Ali, about a learner whose work is not
 * finished: "Farhat's is not ready for public." Her case study EXISTS and it syncs; it
 * is not approved and it is not published. The headline test below is exactly that
 * situation, because the difference between "a case study exists" and "a case study is
 * published" is the difference between a working portfolio and a privacy incident.
 *
 * The gate is injected, so every case here is decided without a database.
 */
jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn().mockResolvedValue([[]]) },
}));

import { sequelize } from '../../../config/database';
import {
  resolveCaseStudyLinks,
  queryLinkedCaseStudyRows,
  queryProjectIdsForCaseStudy,
  CASE_STUDY_PROJECT_LINKS_SQL,
  caseStudyLinksForProjects,
  PORTFOLIO_CASE_STUDY_SURFACE,
  type CaseStudyLinkGate,
} from '../portfolioCaseStudyLinks';

const mockQuery = sequelize.query as unknown as jest.Mock;

/** A gate that publishes exactly the slugs named, and refuses everything else. */
function gatePublishing(...slugs: string[]): CaseStudyLinkGate & {
  loadPublishedRecordBySlug: jest.Mock; isCandidatePubliclyVisible: jest.Mock;
} {
  const live = new Set(slugs);
  return {
    loadPublishedRecordBySlug: jest.fn(async (slug: string) =>
      (live.has(slug) ? { candidate: { slug } } : null)),
    isCandidatePubliclyVisible: jest.fn(() => true),
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([[]]);
});

describe('resolveCaseStudyLinks - a card links only to PUBLISHED writing', () => {
  it('does NOT link a case study that exists but was never published', async () => {
    // The Farhat case, and the whole reason this module is separately tested. The union
    // query DOES return her row: the case study is real, it is attached to her project
    // and it syncs. `loadPublishedRecordBySlug` finds no publication row for it.
    const gate = gatePublishing(); // nothing is live
    const links = await resolveCaseStudyLinks(
      [{ project_id: 'proj-farhat', slug: 'her-draft-case-study' }], gate,
    );

    expect(links).toEqual({});
    // The gate was actually consulted -- an empty result because nobody asked would be
    // the same assertion passing for the wrong reason.
    expect(gate.loadPublishedRecordBySlug)
      .toHaveBeenCalledWith('her-draft-case-study', PORTFOLIO_CASE_STUDY_SURFACE);
  });

  it('links a case study that IS published and publicly visible', async () => {
    const gate = gatePublishing('the-ai-proposes-a-verified-human-decides');
    const links = await resolveCaseStudyLinks(
      [{ project_id: 'proj-quincy', slug: 'the-ai-proposes-a-verified-human-decides' }], gate,
    );
    expect(links).toEqual({ 'proj-quincy': 'the-ai-proposes-a-verified-human-decides' });
  });

  it('does NOT link when a publication row exists but the candidate is refused', async () => {
    // Publication row present, `isCandidatePubliclyVisible` says no -- which is what
    // refuses an unapproved snapshot, an archived record, and a record published to a
    // DIFFERENT surface. Finding a row is not the same as being allowed to show it.
    const gate: CaseStudyLinkGate = {
      loadPublishedRecordBySlug: jest.fn(async () => ({ candidate: { snapshot: 'draft' } })),
      isCandidatePubliclyVisible: jest.fn(() => false),
    };
    const links = await resolveCaseStudyLinks([{ project_id: 'p1', slug: 's1' }], gate);
    expect(links).toEqual({});
  });

  it('requires BOTH checks, so neither one alone can publish a card', async () => {
    // Guards the shape of the condition itself. If someone rewrites `a && b` as `a || b`,
    // each half alone starts linking, and this is the case that notices.
    const onlyRecord: CaseStudyLinkGate = {
      loadPublishedRecordBySlug: jest.fn(async () => ({ candidate: {} })),
      isCandidatePubliclyVisible: jest.fn(() => false),
    };
    const onlyVisible: CaseStudyLinkGate = {
      loadPublishedRecordBySlug: jest.fn(async () => null),
      isCandidatePubliclyVisible: jest.fn(() => true),
    };
    const row = [{ project_id: 'p1', slug: 's1' }];
    expect(await resolveCaseStudyLinks(row, onlyRecord)).toEqual({});
    expect(await resolveCaseStudyLinks(row, onlyVisible)).toEqual({});
  });

  it('links nothing at all when the gate refuses everything, whatever the rows look like', async () => {
    // The gate is the ONLY thing that can put an entry in the map. Rows cannot.
    const refuseAll: CaseStudyLinkGate = {
      loadPublishedRecordBySlug: jest.fn(async () => null),
      isCandidatePubliclyVisible: jest.fn(() => true),
    };
    const links = await resolveCaseStudyLinks([
      { project_id: 'a', slug: 'one' },
      { project_id: 'b', slug: 'two' },
      { project_id: 'c', slug: 'three' },
    ], refuseAll);
    expect(links).toEqual({});
  });

  it('passes the surface through to both halves of the gate', async () => {
    // A portfolio rendered for one surface must not inherit another surface's
    // publications. The surface travels; it is not assumed.
    const gate = gatePublishing('s1');
    await resolveCaseStudyLinks([{ project_id: 'p1', slug: 's1' }], gate, 'partner');
    expect(gate.loadPublishedRecordBySlug).toHaveBeenCalledWith('s1', 'partner');
    expect(gate.isCandidatePubliclyVisible).toHaveBeenCalledWith(expect.anything(), 'partner');
  });
});

describe('resolveCaseStudyLinks - malformed input costs a link, never a crash', () => {
  it.each([
    ['no rows', []],
    ['not an array', null],
    ['undefined', undefined],
    ['a string', 'rows'],
  ])('returns an empty map for %s', async (_label, rows) => {
    expect(await resolveCaseStudyLinks(rows as any, gatePublishing('x'))).toEqual({});
  });

  it.each([
    ['a missing project_id', { slug: 's1' }],
    ['a missing slug', { project_id: 'p1' }],
    ['a null project_id', { project_id: null, slug: 's1' }],
    ['a non-string slug', { project_id: 'p1', slug: 42 }],
    ['an empty slug', { project_id: 'p1', slug: '' }],
  ])('skips a row with %s', async (_label, row) => {
    expect(await resolveCaseStudyLinks([row], gatePublishing('s1'))).toEqual({});
  });

  it('survives a row that is not an object at all', async () => {
    expect(await resolveCaseStudyLinks([null, undefined, 7], gatePublishing('s1'))).toEqual({});
  });
});

describe('resolveCaseStudyLinks - one link per project', () => {
  it('takes the first published slug and does not ask about the project twice', async () => {
    const gate = gatePublishing('first', 'second');
    const links = await resolveCaseStudyLinks([
      { project_id: 'p1', slug: 'first' },
      { project_id: 'p1', slug: 'second' },
    ], gate);

    expect(links).toEqual({ p1: 'first' });
    expect(gate.loadPublishedRecordBySlug).toHaveBeenCalledTimes(1);
  });

  it('keeps looking past an unpublished row to a published one for a DIFFERENT project', async () => {
    const gate = gatePublishing('live');
    const links = await resolveCaseStudyLinks([
      { project_id: 'p1', slug: 'draft' },
      { project_id: 'p2', slug: 'live' },
    ], gate);
    // One refusal must not abandon the rest of the list.
    expect(links).toEqual({ p2: 'live' });
  });
});

describe('queryLinkedCaseStudyRows - both routes to a case study survive', () => {
  it('asks for nothing when there are no projects', async () => {
    expect(await queryLinkedCaseStudyRows([])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('keeps BOTH arms of the union', async () => {
    // The regression this guards is real and was shipped twice: a project_id-only join
    // matched nothing, because `case_studies.project_id` is null on every case study
    // published so far. Quincy's live story is reachable ONLY through the repository
    // arm. If someone simplifies this query back to one arm, his link dies silently.
    await queryLinkedCaseStudyRows(['p1']);
    const sql = String(mockQuery.mock.calls[0][0]);

    expect(sql).toContain('c.project_id IS NOT NULL');              // created from a project
    expect(sql).toContain('linked.project_id = ANY($1::uuid[])');   // filtered to these projects
    expect(sql).toContain('github_connections');                     // reached via its repo
    expect(sql).toContain('case_study_repositories');
    expect(sql).toContain('case_study_repo_collections');
    expect(sql).toMatch(/\bUNION\b/);
  });

  it('matches repo owner and name case-insensitively, because GitHub does', async () => {
    await queryLinkedCaseStudyRows(['p1']);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('lower(r.repo_owner) = lower(g.repo_owner)');
    expect(sql).toContain('lower(r.repo_name)  = lower(g.repo_name)');
  });

  it('excludes archived case studies on both arms', async () => {
    await queryLinkedCaseStudyRows(['p1']);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql.match(/c\.archived_at IS NULL/g)).toHaveLength(2);
  });

  it('binds the project ids rather than interpolating them', async () => {
    await queryLinkedCaseStudyRows(['p1', 'p2']);
    expect(mockQuery.mock.calls[0][1]).toEqual({ bind: [['p1', 'p2']] });
  });

  it('returns an empty list when the driver hands back something unexpected', async () => {
    mockQuery.mockResolvedValue([null]);
    expect(await queryLinkedCaseStudyRows(['p1'])).toEqual([]);
  });
});

/*
 * FORWARD AND REVERSE AGREE BY CONSTRUCTION. The listing (projects -> case studies) and the
 * hire_no_linked_person publish rule (case study -> projects) must answer "does this case
 * study belong to this project?" the same way, or a record can pass the gate on a link the
 * directory never follows and go live listing nobody (a verifier caught exactly that on
 * 2026-11-06). Both queries therefore select from ONE relation; these assert that they do,
 * and pin what the relation is.
 */
describe('one relation, both directions', () => {
  it('embeds the identical relation in the forward and the reverse query', async () => {
    await queryLinkedCaseStudyRows(['p1']);
    mockQuery.mockResolvedValueOnce([[{ project_id: 'p1' }]]);
    await queryProjectIdsForCaseStudy('cs-1');
    const forward = String(mockQuery.mock.calls[0][0]);
    const reverse = String(mockQuery.mock.calls[1][0]);
    expect(forward).toContain(CASE_STUDY_PROJECT_LINKS_SQL);
    expect(reverse).toContain(CASE_STUDY_PROJECT_LINKS_SQL);
  });

  it('has exactly two routes: case_studies.project_id, and a repo matched through github_connections', () => {
    const branches = CASE_STUDY_PROJECT_LINKS_SQL.split(/\bUNION\b/);
    expect(branches).toHaveLength(2);
    expect(branches[0]).toMatch(/FROM case_studies c\s+WHERE c\.project_id IS NOT NULL/);
    expect(branches[1]).toMatch(/FROM github_connections g/);
    // The disagreement the verifier found: a repository's own project_id is NOT a route.
    expect(CASE_STUDY_PROJECT_LINKS_SQL).not.toMatch(/\br\.project_id\b/);
  });

  it('reads the reverse direction by case study id, bound, and returns sorted project ids only', async () => {
    mockQuery.mockResolvedValueOnce([[{ project_id: 'p2' }, { project_id: null }, { nope: 1 }]]);
    expect(await queryProjectIdsForCaseStudy('cs-1')).toEqual(['p2']);
    const [sql, opts] = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(String(sql)).toContain('linked.case_study_id = $1');
    expect(opts).toEqual({ bind: ['cs-1'] });
  });
});

describe('caseStudyLinksForProjects - the production entry point', () => {
  it('short-circuits before touching the database when no project has an id', async () => {
    expect(await caseStudyLinksForProjects([{ name: 'no id' }, null, {}])).toEqual({});
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('short-circuits on a non-array', async () => {
    expect(await caseStudyLinksForProjects(undefined)).toEqual({});
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('stops after the query when nothing is linked, without loading the gate', async () => {
    mockQuery.mockResolvedValue([[]]);
    expect(await caseStudyLinksForProjects([{ id: 'p1' }])).toEqual({});
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

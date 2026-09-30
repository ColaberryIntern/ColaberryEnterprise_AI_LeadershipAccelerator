/**
 * caseStudyProjectSource — unit tests. T008 AC1, AC4 and AC5.
 *
 * NO DATABASE. `models/Project` and `models/GitHubConnection` are mocked, so
 * this suite runs under `jest.ci.config.ts` with `DATABASE_URL` unset.
 *
 * `projectRepoResolver` is DELIBERATELY NOT MOCKED. AC1's claim is that the repo
 * comes from the resolver rather than from `projects.github_repo_url`, and
 * mocking the resolver would make that claim untestable — the suite would prove
 * only that a stub was called. Mocking one level lower, at `GitHubConnection`,
 * exercises the real precedence rule: the headline case seeds a connection while
 * leaving `github_repo_url` null and asserts a repository still comes back,
 * which is exactly the production shape measured 2026-08-20 (0 of 16 connected
 * students had the column populated).
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const mockProjects = {
  row: null as Record<string, unknown> | null,
  lastOptions: null as Record<string, unknown> | null,
  reset(): void { this.row = null; this.lastOptions = null; },
};

const mockConnections = {
  row: null as Record<string, unknown> | null,
  reset(): void { this.row = null; },
};

jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: {
    findByPk: async (id: string, options: Record<string, unknown>) => {
      mockProjects.lastOptions = options;
      const row = mockProjects.row;
      return row && row.id === id ? row : null;
    },
  },
}));

jest.mock('../../../models/GitHubConnection', () => ({
  __esModule: true,
  default: {
    findOne: async (opts: { where?: { project_id?: string } }) => {
      const row = mockConnections.row;
      return row && row.project_id === opts?.where?.project_id ? row : null;
    },
    findAll: async () => [],
  },
}));

import {
  PROJECT_FACT_ATTRIBUTES,
  isCaseStudyProjectSourceError,
  loadCaseStudyProjectFacts,
  projectFactsFromRow,
  toPlatformFactsSeed,
} from '../caseStudyProjectSource';

const PROJECT_ID = randomUUID();
const ENROLLMENT_ID = randomUUID();
const CONNECTION_URL = 'https://github.com/acmeholdings/clientwidget';
const LEGACY_URL = 'https://github.com/stale-owner/stale-repo';

let logs: string[] = [];

beforeEach(() => {
  mockProjects.reset();
  mockConnections.reset();
  logs = [];
  jest.spyOn(console, 'log').mockImplementation((line?: unknown) => { logs.push(String(line)); });
});

afterEach(() => { jest.restoreAllMocks(); });

/** A fully populated row. Individual tests null out what they are testing. */
function seedProject(over: Record<string, unknown> = {}): void {
  mockProjects.row = {
    id: PROJECT_ID,
    enrollment_id: ENROLLMENT_ID,
    program_id: randomUUID(),
    name: 'Stockout Forecaster',
    organization_name: 'Acme Holdings',
    industry: 'Manufacturing',
    primary_business_problem: 'Stockouts cost three shifts a month.',
    selected_use_case: 'Demand forecasting',
    automation_goal: 'Predict reorder points automatically.',
    project_stage: 'implementation',
    system_model: { services: ['api'] },
    executive_summary: 'A confidential internal summary.',
    maturity_score: 62,
    requirements_completion_pct: 80,
    health_score: 71,
    velocity_score: 45,
    stability_score: 90,
    github_repo_url: null,
    archived_at: null,
    ...over,
  };
}

function seedConnection(over: Record<string, unknown> = {}): void {
  mockConnections.row = {
    project_id: PROJECT_ID,
    repo_url: CONNECTION_URL,
    repo_owner: 'acmeholdings',
    repo_name: 'clientwidget',
    ...over,
  };
}

/* ─────────────────── AC1 — the resolver decides, not the column ─────────── */

describe('AC1 — workspace repo comes from resolveProjectRepo()', () => {
  it('imports and calls the resolver, and reads the legacy column only to feed it', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'caseStudyProjectSource.ts'), 'utf8');
    // Prose may discuss the column at length; only the CODE is checked.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).toMatch(/from '\.\.\/projectRepoResolver'/);
    expect(code).toMatch(/resolveProjectRepo\(/);

    // Exactly three sites, all inert: the row type, the select allow-list, and
    // the single line that hands the value to the resolver. Never an answer.
    expect(code.match(/github_repo_url/g)).toHaveLength(3);
    expect(code).toMatch(/const legacyUrl = row\.github_repo_url \?\? null;/);
    expect(code).toMatch(/resolveProjectRepo\(data\.projectId, legacyUrl\)/);

    // The repo pointer is whatever the resolver returned — never rebuilt here.
    expect(code).not.toMatch(/url:\s*[\w.]*github_repo_url/);
    expect(code).not.toMatch(/repo\s*=\s*\{/);
  });

  it('finds the repo when github_repo_url is NULL but a GitHubConnection exists', async () => {
    seedProject({ github_repo_url: null });
    seedConnection();

    const facts = await loadCaseStudyProjectFacts({ projectId: PROJECT_ID });

    expect(facts.repo.source).toBe('connection');
    expect(facts.repo.url).toBe(CONNECTION_URL);
    expect(facts.repo.owner).toBe('acmeholdings');
    expect(facts.repo.name).toBe('clientwidget');
  });

  it('prefers the connection over a stale legacy column value', async () => {
    seedProject({ github_repo_url: LEGACY_URL });
    seedConnection();

    const facts = await loadCaseStudyProjectFacts({ projectId: PROJECT_ID });

    expect(facts.repo.url).toBe(CONNECTION_URL);
    expect(facts.repo.source).toBe('connection');
  });

  it('still honours the legacy column for pre-connection rows', async () => {
    seedProject({ github_repo_url: LEGACY_URL });

    const facts = await loadCaseStudyProjectFacts({ projectId: PROJECT_ID });

    expect(facts.repo.source).toBe('project_column');
    expect(facts.repo.owner).toBe('stale-owner');
  });

  it('ignores a connection row that authorised GitHub but never picked a repo', async () => {
    seedProject({ github_repo_url: null });
    seedConnection({ repo_url: null, repo_owner: null, repo_name: null });

    const facts = await loadCaseStudyProjectFacts({ projectId: PROJECT_ID });

    expect(facts.repo.source).toBe('none');
    expect(facts.repo.url).toBeNull();
  });
});

/* ───────────────── AC4 — no GitHubConnection is still a candidate ────────── */

describe('AC4 — a Project with no GitHubConnection yields a valid candidate', () => {
  it('returns facts with repo.source "none" rather than throwing', async () => {
    seedProject({ github_repo_url: null });

    const facts = await loadCaseStudyProjectFacts({ projectId: PROJECT_ID });

    expect(facts.repo).toEqual({ url: null, owner: null, name: null, source: 'none' });
    expect(facts.projectId).toBe(PROJECT_ID);
    expect(facts.name).toBe('Stockout Forecaster');
    expect(facts.industry).toBe('Manufacturing');
    expect(toPlatformFactsSeed(facts).situation?.narrative).toEqual([
      'Stockouts cost three shifts a month.',
    ]);
  });
});

/* ───────────────────────── AC5 — nullable everything ─────────────────────── */

describe('AC5 — all-null optional fields are ABSENT, never "" or 0', () => {
  const NONE = { url: null, owner: null, name: null, source: 'none' as const };

  it('omits every key the row left null', () => {
    const facts = projectFactsFromRow({ id: PROJECT_ID }, NONE);

    for (const key of [
      'enrollmentId', 'programId', 'name', 'organizationNameCandidate', 'industry',
      'primaryBusinessProblem', 'selectedUseCase', 'automationGoal', 'projectStage',
      'systemModel', 'executiveSummary',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(facts, key)).toBe(false);
    }
    expect(facts.scores).toEqual({});
    expect(facts.archived).toBe(false);
    expect(JSON.stringify(facts)).not.toContain('""');
  });

  it('treats whitespace, empty strings and empty JSONB as absent', () => {
    const facts = projectFactsFromRow({
      id: PROJECT_ID, name: '   ', industry: '', executive_summary: '\t',
      system_model: {}, maturity_score: null, health_score: '',
    }, NONE);

    expect(facts.name).toBeUndefined();
    expect(facts.industry).toBeUndefined();
    expect(facts.executiveSummary).toBeUndefined();
    expect(facts.systemModel).toBeUndefined();
    expect(facts.scores).toEqual({});
  });

  it('keeps a genuine zero score, which is not the same as an absent one', () => {
    const facts = projectFactsFromRow(
      { id: PROJECT_ID, health_score: 0, velocity_score: '42.5' }, NONE,
    );

    expect(facts.scores.health).toBe(0);
    expect(facts.scores.velocity).toBe(42.5);
    expect(facts.scores.maturity).toBeUndefined();
  });

  it('fails closed on a project_stage outside the union', () => {
    expect(projectFactsFromRow({ id: PROJECT_ID, project_stage: 'shipped' }, NONE).projectStage)
      .toBeUndefined();
    expect(projectFactsFromRow({ id: PROJECT_ID, project_stage: 'complete' }, NONE).projectStage)
      .toBe('complete');
  });

  it('produces a seed with the facts absent rather than blank', () => {
    const seed = toPlatformFactsSeed(projectFactsFromRow({ id: PROJECT_ID }, NONE));

    expect(seed).toEqual({ projectId: PROJECT_ID });
    expect(seed.situation).toBeUndefined();
  });

  it('marks an archived project without refusing it', () => {
    const facts = projectFactsFromRow(
      { id: PROJECT_ID, archived_at: '2026-08-01T00:00:00.000Z' }, NONE,
    );
    expect(facts.archived).toBe(true);
  });
});

/* ─────────────────────────── the seed's refusals ─────────────────────────── */

describe('the seed never carries a consent-gated field', () => {
  it('keeps organization_name as a review candidate and out of the seed', async () => {
    seedProject();
    const facts = await loadCaseStudyProjectFacts({ projectId: PROJECT_ID });

    expect(facts.organizationNameCandidate).toBe('Acme Holdings');
    expect(JSON.stringify(toPlatformFactsSeed(facts))).not.toContain('Acme Holdings');
    expect(Object.keys(toPlatformFactsSeed(facts)).sort())
      .toEqual(['industry', 'projectId', 'situation', 'summary']);
  });

  it('falls back to selected_use_case, and never claims verification', () => {
    const facts = projectFactsFromRow(
      { id: PROJECT_ID, selected_use_case: 'Demand forecasting' },
      { url: null, owner: null, name: null, source: 'none' },
    );
    const seed = toPlatformFactsSeed(facts);

    expect(seed.situation?.narrative).toEqual(['Demand forecasting']);
    expect(seed.situation?.verification).toEqual({ class: 'pending', method: 'platform' });
  });

  it('never maps project_stage onto a production or shipped claim', async () => {
    seedProject({ project_stage: 'complete' });
    const facts = await loadCaseStudyProjectFacts({ projectId: PROJECT_ID });

    expect(facts.projectStage).toBe('complete');
    expect(JSON.stringify(toPlatformFactsSeed(facts))).not.toMatch(/shipped|production/i);
  });
});

/* ───────────────────────── exposure, errors and logs ─────────────────────── */

describe('read shape, errors and log hygiene', () => {
  it('never selects a raw untyped blob column (DATA_SOURCE_MAP §4)', async () => {
    seedProject();
    await loadCaseStudyProjectFacts({ projectId: PROJECT_ID });

    const attributes = (mockProjects.lastOptions as { attributes: string[] }).attributes;
    expect(attributes).toEqual([...PROJECT_FACT_ATTRIBUTES]);
    for (const forbidden of [
      'project_variables', 'portfolio_cache', 'claude_md_content',
      'requirements_document', 'readiness_score_breakdown', 'share_token',
    ]) {
      expect(attributes).not.toContain(forbidden);
    }
  });

  it('raises a 404-classed error for an unknown project', async () => {
    await expect(loadCaseStudyProjectFacts({ projectId: randomUUID() })).rejects.toMatchObject({
      error_class: 'CaseStudyProjectNotFound',
      http_status: 404,
    });
  });

  it('raises a 400-classed error for a malformed id, carrying zod issues', async () => {
    try {
      await loadCaseStudyProjectFacts({ projectId: 'not-a-uuid' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(isCaseStudyProjectSourceError(err)).toBe(true);
      const typed = err as { error_class: string; http_status: number; details: { issues: unknown[] } };
      expect(typed.error_class).toBe('CaseStudyProjectValidationError');
      expect(typed.http_status).toBe(400);
      expect(Array.isArray(typed.details.issues)).toBe(true);
    }
  });

  it('emits no enrollment id, organisation name, summary or repo identity', async () => {
    seedProject();
    seedConnection();
    await loadCaseStudyProjectFacts({ projectId: PROJECT_ID, correlationId: 'corr-1' });

    expect(logs.length).toBeGreaterThan(0);
    const all = logs.join('\n');
    for (const secret of [
      ENROLLMENT_ID, 'Acme Holdings', 'A confidential internal summary.',
      'Stockout Forecaster', 'acmeholdings', 'clientwidget', CONNECTION_URL, '@',
    ]) {
      expect(all).not.toContain(secret);
    }

    const entry = JSON.parse(logs[0]);
    expect(entry.service).toBe('case-study-project-source');
    expect(entry.correlation_id).toBe('corr-1');
    expect(entry.outcome).toBe('success');
    expect(entry.project_id).toBe(PROJECT_ID);
    expect(entry.repo_source).toBe('connection');
    // Repo identity is opaque: visibility is unknown here, so it fails closed.
    expect(entry.repo_ref).toMatch(/^[0-9a-f]{16}$/);
    expect(entry.owner).toBeUndefined();
    expect(entry.score_count).toBe(5);
  });

  it('logs the failure path without leaking the id of a row it could not find', async () => {
    await expect(loadCaseStudyProjectFacts({ projectId: randomUUID() })).rejects.toThrow();

    const entry = JSON.parse(logs[0]);
    expect(entry.level).toBe('error');
    expect(entry.outcome).toBe('failure');
    expect(entry.error_class).toBe('CaseStudyProjectNotFound');
    expect(JSON.stringify(entry)).not.toContain(ENROLLMENT_ID);
  });
});

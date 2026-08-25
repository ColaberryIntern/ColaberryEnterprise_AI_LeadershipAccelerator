/**
 * integrationFixtures — the GitHub double and the seed rows the T020 integration
 * suite runs against. `integrationHarness.ts` is the in-memory DATABASE; this is
 * everything that goes into it, plus the repositories the analyzer reads.
 *
 * NOT A TEST FILE — jest's `testMatch` is `__tests__/**\/*.test.ts`, so this is
 * imported and never collected.
 *
 * Split from the harness for CLAUDE.md's 500-line ceiling, on the same seam the
 * feature itself uses (`caseStudyPublicationService` + `…Store`,
 * `caseStudySnapshotBuilder` + `…Sections`): the harness answers "what does the
 * database do", this answers "what is in it". The dependency runs one way — this
 * file imports the harness's types, and the harness imports nothing from here.
 */
import { randomUUID } from 'crypto';
import { fileReply, json, makeGitHubFake, notFound, repoPayload, treePayload } from './githubFetchFake';
import type { FakeRoutes, GitHubFake } from './githubFetchFake';
import type { IntegrationDb, Row } from './integrationHarness';

/* ───────────────────────────────────────────────────────────── PII seeds ──── */

/**
 * Strings seeded into the SOURCE rows on purpose. None of them may reach a
 * snapshot, a public payload or a log line — and a leak test against a fixture
 * that never carried the value proves nothing, which is why they are here.
 */
export const STUDENT_EMAIL = 'learner.pii@example.edu';
export const ENROLLMENT_ID = '33333333-3333-4333-8333-333333333333';
export const INTAKE_ORGANIZATION = 'Northwind Provisions Holdings Inc';
export const PROJECT_VARIABLES_BLOB = 'PROJECT_VARIABLES_SECRET_BLOB';

/* ────────────────────────────────────────────────────── the repositories ──── */

/** A dependency set that exercises the real extractors rather than a stub. */
export const PACKAGE_JSON = JSON.stringify({
  name: 'atlas',
  dependencies: { express: '^4.19.0', react: '^18.3.0', pg: '^8.11.0', openai: '^4.55.0' },
  devDependencies: { jest: '^29.7.0' },
});

/** The same repository one commit later, having taken a dependency on Fastify. */
export const PACKAGE_JSON_V2 = JSON.stringify({
  name: 'atlas',
  dependencies: {
    express: '^4.19.0', react: '^18.3.0', pg: '^8.11.0', openai: '^4.55.0', fastify: '^4.28.0',
  },
  devDependencies: { jest: '^29.7.0' },
});

export const REQUIREMENTS_TXT = 'fastapi==0.111.0\npsycopg2-binary==2.9.9\nanthropic==0.34.0\n';
export const EVAL_REQUIREMENTS_TXT = 'pytest==8.2.0\nlangchain==0.2.0\nchromadb==0.5.0\n';

export const APP_TREE = treePayload([
  { path: 'package.json', type: 'blob', size: 400 },
  { path: 'README.md', type: 'blob', size: 900 },
  { path: 'docs/architecture.md', type: 'blob', size: 700 },
  { path: '.github/workflows/ci.yml', type: 'blob', size: 200 },
  { path: 'src/agents/planner.ts', type: 'blob', size: 2000 },
  { path: 'tests/planner.test.ts', type: 'blob', size: 800 },
]);

export const SERVICE_TREE = treePayload([
  { path: 'requirements.txt', type: 'blob', size: 120 },
  { path: 'README.md', type: 'blob', size: 400 },
  { path: 'src/app.py', type: 'blob', size: 1500 },
  { path: 'tests/test_app.py', type: 'blob', size: 600 },
]);

export const EVAL_TREE = treePayload([
  { path: 'requirements.txt', type: 'blob', size: 110 },
  { path: 'README.md', type: 'blob', size: 300 },
  { path: 'tests/test_eval.py', type: 'blob', size: 900 },
]);

/** One repository, described the way the GitHub fake wants it. */
export interface RepoScript {
  readonly owner: string;
  readonly repo: string;
  readonly sha: string;
  readonly tree: Record<string, unknown>;
  readonly files: Record<string, string>;
  readonly languages: Record<string, number>;
  readonly private?: boolean;
}

/**
 * A GitHub double that answers PER REPOSITORY rather than per attempt.
 *
 * `analyzeRepositories` reads sequentially, so the existing suites key their
 * replies off the attempt number. That works for a fixed two-repo run and
 * breaks the moment a scenario attaches three repositories or re-reads one, so
 * this routes on the URL instead — which is also what the real API does.
 */
export function makeRepoGitHub(scripts: readonly RepoScript[]): GitHubFake {
  /**
   * `owner/repo` followed by a path boundary, never a bare `includes`.
   * `/repos/acme/atlas-eval/languages` contains `/repos/acme/atlas`, so a
   * substring match hands the eval repository's tree to `acme/atlas` and the
   * multi-repo scenario silently analyses the same repository three times.
   */
  const find = (url: string): RepoScript | undefined => scripts.find((s) => {
    const base = `/repos/${s.owner}/${s.repo}`;
    const at = url.indexOf(base);
    if (at === -1) return false;
    const next = url[at + base.length];
    return next === undefined || next === '/' || next === '?';
  });

  // `makeGitHubFake` resolves a route per KIND, not per repository, so the
  // per-repository decision happens inside each reply against the URL this
  // wrapper records immediately before delegating.
  const urlSeen: string[] = [];
  const current = (): RepoScript | undefined => find(urlSeen[urlSeen.length - 1] ?? '');
  const routes: FakeRoutes = {
    repo: () => {
      const s = current();
      return json(repoPayload({
        name: s?.repo, full_name: `${s?.owner}/${s?.repo}`, owner: { login: s?.owner },
        private: s?.private === true, description: `${s?.repo} service`,
      }));
    },
    commits: () => json([{ sha: current()?.sha ?? '' }]),
    languages: () => json(current()?.languages ?? {}),
    tree: () => json(current()?.tree ?? treePayload([])),
    file: (path: string) => {
      const body = current()?.files?.[path];
      return body === undefined ? notFound() : fileReply(body);
    },
  };
  const base = makeGitHubFake(routes);

  const impl = (async (input: unknown, init?: unknown) => {
    urlSeen.push(String(input));
    return (base.impl as unknown as (i: unknown, o?: unknown) => Promise<Response>)(input, init);
  }) as unknown as typeof fetch;

  return {
    impl,
    urls: base.urls,
    filePaths: base.filePaths,
    authorizations: base.authorizations,
    countMatching: (fragment: string) => base.urls.filter((u) => u.includes(fragment)).length,
  };
}

/* ────────────────────────────────────────────────────────────── seeding ──── */

export const APP_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
export const APP_SHA_V2 = 'c3d4e5f60718293a4b5c6d7e8f90123456789abc';
export const SERVICE_SHA = 'b1c2d3e4f5061728394a5b6c7d8e9f0123456789';
export const EVAL_SHA = 'd4e5f60718293a4b5c6d7e8f90123456789abcde';

export function appRepo(over: Partial<RepoScript> = {}): RepoScript {
  return {
    owner: 'acme',
    repo: 'atlas',
    sha: APP_SHA,
    tree: APP_TREE,
    languages: { TypeScript: 90_000 },
    files: {
      'package.json': PACKAGE_JSON,
      'README.md': '# Atlas\n\nA changeover copilot for a bottling line.',
      'docs/architecture.md': '# Architecture\n\nPlanner, executor, ledger.',
      '.github/workflows/ci.yml': 'name: ci\n',
    },
    ...over,
  };
}

export function serviceRepo(over: Partial<RepoScript> = {}): RepoScript {
  return {
    owner: 'acme',
    repo: 'ledger',
    sha: SERVICE_SHA,
    tree: SERVICE_TREE,
    languages: { Python: 40_000 },
    files: {
      'requirements.txt': REQUIREMENTS_TXT,
      'README.md': '# Ledger\n\nChangeover ledger service.',
    },
    ...over,
  };
}

export function evalRepo(over: Partial<RepoScript> = {}): RepoScript {
  return {
    owner: 'acme',
    repo: 'atlas-eval',
    sha: EVAL_SHA,
    tree: EVAL_TREE,
    languages: { Python: 12_000 },
    files: {
      'requirements.txt': EVAL_REQUIREMENTS_TXT,
      'README.md': '# Atlas eval\n\nRegression harness for the planner.',
    },
    ...over,
  };
}

export const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

/** A `projects` row plus the wide columns the source adapter must never select. */
export function seedProject(db: IntegrationDb, over: Row = {}): Row {
  return db.projects.seed({
    id: PROJECT_ID,
    enrollment_id: ENROLLMENT_ID,
    program_id: 'enterprise-accelerator',
    name: 'Bottling line copilot',
    organization_name: INTAKE_ORGANIZATION,
    industry: 'manufacturing',
    primary_business_problem: 'Line changeovers take four hours and stall the whole plant.',
    selected_use_case: 'changeover-copilot',
    automation_goal: 'Cut changeover time down to a single shift.',
    project_stage: 'implementation',
    system_model: { agents: 3 },
    executive_summary: 'A copilot that walks operators through a changeover.',
    maturity_score: 62,
    requirements_completion_pct: 80,
    health_score: 71,
    velocity_score: 55,
    stability_score: 66,
    // The documented production defect: the column nothing writes. The repo has
    // to be found through `github_connections` or not at all.
    github_repo_url: null,
    archived_at: null,
    // Never in PROJECT_FACT_ATTRIBUTES. Selecting it would be the leak.
    project_variables: PROJECT_VARIABLES_BLOB,
    student_email: STUDENT_EMAIL,
    ...over,
  });
}

export function seedConnection(db: IntegrationDb, over: Row = {}): Row {
  return db.connections.seed({
    id: randomUUID(),
    project_id: PROJECT_ID,
    repo_url: 'https://github.com/acme/atlas',
    repo_owner: 'acme',
    repo_name: 'atlas',
    ...over,
  });
}

export function seedEvidenceRecord(db: IntegrationDb, over: Row = {}): Row {
  return db.evidenceRecords.seed({
    id: randomUUID(),
    enrollment_id: ENROLLMENT_ID,
    card_id: '66666666-6666-4666-8666-666666666666',
    source_type: 'github_commit',
    source_ref: 'https://github.com/acme/atlas/commit/a1b2c3d',
    builder_xp: 25,
    validated: true,
    created_at: new Date('2026-07-01T00:00:00.000Z'),
    student_email: STUDENT_EMAIL,
    ...over,
  });
}

export function seedPortfolioArtifact(db: IntegrationDb, over: Row = {}): Row {
  return db.portfolioArtifacts.seed({
    id: randomUUID(),
    enrollment_id: ENROLLMENT_ID,
    kind: 'architecture_doc',
    title: 'Changeover architecture',
    summary: 'Planner, executor, ledger.',
    created_at: new Date('2026-07-02T00:00:00.000Z'),
    ...over,
  });
}

/**
 * A metric that is genuinely publishable: visible, third-party verified, with an
 * evidence pointer and a measurement context. The publish-guard scenario takes
 * this exact row and breaks ONE field, so a refusal names the rule that fired
 * rather than a fixture that was never publishable in the first place.
 */
export function seedPublishableMetric(db: IntegrationDb, caseStudyId: string, over: Row = {}): Row {
  return db.metrics.seed({
    case_study_id: caseStudyId,
    metric_key: 'changeover_time',
    label: 'Changeover time',
    value_display: '2h 04m',
    numeric_value: 124,
    unit: 'minutes',
    metric_type: 'business_outcome',
    verification_class: 'verified',
    verification_method: 'repo',
    verified_at: '2026-08-01T00:00:00.000Z',
    evidence_id: 'ev-77777777-8888-4999-8aaa-bbbbbbbbbbbb',
    is_headline: true,
    publishable: true,
    baseline: '4h 10m',
    sample: '18 changeovers',
    methodology: 'Line telemetry, compared against the prior quarter.',
    limitations: ['single line'],
    ...over,
  });
}

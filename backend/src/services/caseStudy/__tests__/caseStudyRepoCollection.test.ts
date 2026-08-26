/**
 * caseStudyRepoCollection — unit tests.
 *
 * NO DATABASE. Both models and `config/database` are mocked, so this suite runs
 * in CI, which provisions no Postgres and sets no `DATABASE_URL`
 * (`backend/jest.ci.config.ts` is an ignore-list; a suite that needs a database
 * ends up on it and then never runs again, which is how a guard quietly dies).
 *
 * The fake `case_study_repositories` table enforces the SAME case-insensitive
 * unique index the real DDL declares
 * (`cs_repositories_unique_per_collection ON (collection_id, LOWER(repo_owner),
 * LOWER(repo_name))`, `db/ensureCaseStudySchema.ts:144`), so the dedupe tests
 * below fail if either half of the two-layer dedupe — service check, database
 * constraint — is removed.
 */
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

type FakeRow = Record<string, any>;

class FakeRepoTable {
  rows: FakeRow[] = [];
  creates = 0;
  updates = 0;
  destroys = 0;
  /** Fires once immediately before the next create — stages a concurrent insert. */
  beforeCreate: (() => void) | null = null;

  reset(): void {
    this.rows = []; this.creates = 0; this.updates = 0; this.destroys = 0; this.beforeCreate = null;
  }

  private key(r: FakeRow): string {
    return `${r.collection_id}|${String(r.repo_owner).toLowerCase()}|${String(r.repo_name).toLowerCase()}`;
  }

  /** Insert without counting it as a service-driven create. */
  seed(values: FakeRow): FakeRow {
    if (this.rows.some((r) => this.key(r) === this.key(values))) {
      const err: any = new Error('duplicate key value violates unique constraint');
      err.name = 'SequelizeUniqueConstraintError';
      throw err;
    }
    const row: FakeRow = {
      id: randomUUID(), role: 'other', visibility: 'unknown', access_status: 'unknown',
      allow_public_repo_link: false, metadata: {}, project_id: null, github_connection_id: null,
      default_branch: null, last_seen_sha: null, last_synced_at: null, ...values,
    };
    this.rows.push(row);
    return row;
  }

  async findAll(opts: any): Promise<FakeRow[]> {
    return this.rows.filter((r) => r.collection_id === opts?.where?.collection_id);
  }

  async create(values: any, _options?: any): Promise<FakeRow> {
    if (this.beforeCreate) { const hook = this.beforeCreate; this.beforeCreate = null; hook(); }
    const row = this.seed(values);
    this.creates += 1;
    return row;
  }

  async update(values: any, opts: any): Promise<[number]> {
    const where = opts?.where ?? {};
    const ids = Array.isArray(where.id) ? where.id : where.id !== undefined ? [where.id] : null;
    let n = 0;
    for (const r of this.rows) {
      if (ids && !ids.includes(r.id)) continue;
      if (where.collection_id !== undefined && r.collection_id !== where.collection_id) continue;
      Object.assign(r, values);
      n += 1;
    }
    this.updates += n;
    return [n];
  }

  async destroy(opts: any): Promise<number> {
    const where = opts?.where ?? {};
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (r) => !(r.id === where.id && (where.collection_id === undefined || r.collection_id === where.collection_id)),
    );
    const n = before - this.rows.length;
    this.destroys += n;
    return n;
  }
}

class FakeCollectionTable {
  rows: FakeRow[] = [];
  creates = 0;

  reset(): void { this.rows = []; this.creates = 0; }

  async findOrCreate(opts: any): Promise<[FakeRow, boolean]> {
    const caseStudyId = opts?.where?.case_study_id;
    const found = this.rows.find((r) => r.case_study_id === caseStudyId);
    if (found) return [found, false];
    const row: FakeRow = { id: randomUUID(), name: 'Sources', status: 'active', ...(opts?.defaults ?? {}) };
    this.rows.push(row);
    this.creates += 1;
    return [row, true];
  }

  async findOne(opts: any): Promise<FakeRow | null> {
    return this.rows.find((r) => r.case_study_id === opts?.where?.case_study_id) ?? null;
  }
}

const mockRepoTable = new FakeRepoTable();
const mockCollectionTable = new FakeCollectionTable();
const mockQuery = jest.fn();
/** Every write verb on the workspace-repo model. None may ever be called. */
const mockGithubConnection = {
  create: jest.fn(), update: jest.fn(), destroy: jest.fn(), upsert: jest.fn(),
  findOne: jest.fn(), findAll: jest.fn(), findOrCreate: jest.fn(), bulkCreate: jest.fn(),
};

jest.mock('../../../models/CaseStudyRepository', () => ({
  __esModule: true,
  default: {
    findAll: (o: any) => mockRepoTable.findAll(o),
    create: (v: any, o: any) => mockRepoTable.create(v, o),
    update: (v: any, o: any) => mockRepoTable.update(v, o),
    destroy: (o: any) => mockRepoTable.destroy(o),
  },
}));
jest.mock('../../../models/CaseStudyRepoCollection', () => ({
  __esModule: true,
  default: {
    findOrCreate: (o: any) => mockCollectionTable.findOrCreate(o),
    findOne: (o: any) => mockCollectionTable.findOne(o),
  },
}));
jest.mock('../../../models/GitHubConnection', () => ({ __esModule: true, default: mockGithubConnection }));
jest.mock('../../../config/database', () => ({
  sequelize: { transaction: (fn: any) => fn({ id: 'fake-tx' }), query: (...a: any[]) => mockQuery(...a) },
}));

import GitHubConnection from '../../../models/GitHubConnection';
import {
  attachRepository, removeRepository, setRepositoryRole, listRepositories,
  ensureRepoCollection, CaseStudyRepoError, isCaseStudyRepoError,
  MAX_REPOS_PER_CASE_STUDY, CASE_STUDY_REPO_ROLES,
} from '../caseStudyRepoCollection';

const CASE_STUDY = randomUUID();
let logLines: string[] = [];

beforeEach(() => {
  mockRepoTable.reset();
  mockCollectionTable.reset();
  mockQuery.mockReset();
  Object.values(mockGithubConnection).forEach((fn) => fn.mockReset());
  logLines = [];
  jest.spyOn(console, 'log').mockImplementation((line?: any) => { logLines.push(String(line)); });
});

afterEach(() => { jest.restoreAllMocks(); });

/** The thrown error, typed. Fails loudly if the call unexpectedly succeeds. */
async function caught(fn: () => Promise<unknown>): Promise<CaseStudyRepoError> {
  try {
    await fn();
  } catch (err) {
    if (isCaseStudyRepoError(err)) return err;
    throw err;
  }
  throw new Error('expected the call to throw, but it resolved');
}

/* ─────────────────────────────────── AC1 — the right parser, proven ──────── */

describe('parser provenance (AC1)', () => {
  it('keeps the dot in owner/repo.js — the legacy regexes truncate it to "repo"', async () => {
    const { repository } = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'owner/repo.js' });
    expect(repository.repoName).toBe('repo.js');
    expect(repository.repoName).not.toBe('repo');
    expect(repository.repoUrl).toBe('https://github.com/owner/repo.js');
  });

  it('keeps dotted names through a full browser URL too', async () => {
    const { repository } = await attachRepository({
      caseStudyId: CASE_STUDY, reference: 'https://github.com/acme/docs.site.io/tree/main',
    });
    expect(repository.repoName).toBe('docs.site.io');
  });

  it('strips a .git suffix without eating a dotted name', async () => {
    const { repository } = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/node.js.git' });
    expect(repository.repoName).toBe('node.js');
  });

  it('imports the shared parser and none of the forbidden connect machinery (AC6, static half)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'caseStudyRepoCollection.ts'), 'utf8');
    // Prose may discuss what the module refuses to do; only the CODE is checked.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).toMatch(/from '\.\.\/sbp\/repoConnect\/repoReference'/);
    expect(code).toMatch(/parseRepoReference\(/);
    expect(code).toMatch(/sameRepo\(/);

    for (const forbidden of [
      'projectRepoResolver', 'githubService', 'repoConnectService',
      'assertNotClaimedElsewhere', 'assertRebindAllowed',
      'startConnect', 'confirmConnect', 'adoptProvisionedRepo',
      'GitHubConnection',
    ]) {
      expect(code).not.toContain(forbidden);
    }
    expect(code.toLowerCase()).not.toContain('github_connections');
  });
});

/* ──────────────────────── AC2 — every accepted form, and the rejections ──── */

describe('accepted reference forms (AC2)', () => {
  const forms: Array<[string, string]> = [
    ['browser url', 'https://github.com/acme/widget'],
    ['branch url', 'https://github.com/acme/widget/tree/main'],
    ['clone url', 'https://github.com/acme/widget.git'],
    ['scp ssh', 'git@github.com:acme/widget.git'],
    ['ssh url', 'ssh://git@github.com/acme/widget.git'],
    ['scheme-less', 'github.com/acme/widget'],
    ['short form', 'acme/widget'],
  ];

  it.each(forms)('%s resolves to acme/widget', async (_label, reference) => {
    const caseStudyId = randomUUID();
    const { repository } = await attachRepository({ caseStudyId, reference });
    expect(repository.repoOwner).toBe('acme');
    expect(repository.repoName).toBe('widget');
    expect(repository.repoUrl).toBe('https://github.com/acme/widget');
  });

  it('treats all seven forms as ONE repository inside one collection', async () => {
    const caseStudyId = randomUUID();
    const results = [];
    for (const [, reference] of forms) {
      results.push(await attachRepository({ caseStudyId, reference }));
    }
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(mockRepoTable.rows).toHaveLength(1);
    expect(mockRepoTable.creates).toBe(1);
    expect(new Set(results.map((r) => r.repository.id)).size).toBe(1);
  });

  it.each([
    ['a non-GitHub host', 'https://gitlab.com/acme/widget'],
    ['a bitbucket ssh url', 'git@bitbucket.org:acme/widget.git'],
    ['a repo with no owner', 'widget'],
    ['prose', 'please connect my repo'],
    ['an unsupported scheme', 'ftp://github.com/acme/widget'],
  ])('rejects %s with error_class InvalidRepoReference', async (_label, reference) => {
    const err = await caught(() => attachRepository({ caseStudyId: CASE_STUDY, reference }));
    expect(err.error_class).toBe('InvalidRepoReference');
    expect(err.http_status).toBe(400);
    expect(mockRepoTable.creates).toBe(0);
    expect(mockCollectionTable.creates).toBe(0); // rejected before any write
  });
});

/* ────────────────────────────────── AC3 — case-insensitive dedupe ────────── */

describe('case-insensitive dedupe (AC3)', () => {
  it('Owner/Repo and owner/repo are the same repository', async () => {
    const first = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'Owner/Repo' });
    const second = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'owner/repo' });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.repository.id).toBe(first.repository.id);
    expect(mockRepoTable.rows).toHaveLength(1);
    // The first spelling is kept; a duplicate never rewrites the stored casing.
    expect(second.repository.repoOwner).toBe('Owner');
  });

  it('separate Case Studies may each cite the same repository', async () => {
    const other = randomUUID();
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    const second = await attachRepository({ caseStudyId: other, reference: 'acme/widget' });

    expect(second.created).toBe(true);
    expect(mockRepoTable.rows).toHaveLength(2);
    expect(mockCollectionTable.rows).toHaveLength(2);
  });
});

/* ───────────────────────────────────── AC4 — the bounded collection ──────── */

describe('bounded collection (AC4, spec §37)', () => {
  async function fill(caseStudyId: string, n: number): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      await attachRepository({ caseStudyId, reference: `acme/repo-${i}` });
    }
  }

  it('accepts 20 and rejects the 21st', async () => {
    expect(MAX_REPOS_PER_CASE_STUDY).toBe(20);
    await fill(CASE_STUDY, 20);
    expect(mockRepoTable.rows).toHaveLength(20);

    const err = await caught(() => attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/one-too-many' }));
    expect(err.error_class).toBe('RepoCollectionFull');
    expect(err.http_status).toBe(409);
    expect(err.details).toMatchObject({ limit: 20, current: 20 });
    expect(mockRepoTable.rows).toHaveLength(20);
  });

  it('still accepts a REPLAY of an already-attached repo when full', async () => {
    // Idempotency outranks the bound: a retried request must not start failing
    // because the collection filled up in between.
    await fill(CASE_STUDY, 20);
    const replay = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'ACME/Repo-0' });
    expect(replay.created).toBe(false);
    expect(mockRepoTable.rows).toHaveLength(20);
  });

  it('frees a slot when a repository is removed', async () => {
    await fill(CASE_STUDY, 20);
    const [first] = await listRepositories({ caseStudyId: CASE_STUDY });
    await removeRepository({ caseStudyId: CASE_STUDY, repositoryId: first.id });
    const added = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/replacement' });
    expect(added.created).toBe(true);
    expect(mockRepoTable.rows).toHaveLength(20);
  });
});

/* ───────────────────────────────────────── AC5 — idempotent attach ───────── */

describe('idempotency (AC5)', () => {
  it('attaching twice creates exactly one row', async () => {
    const a = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'https://github.com/acme/widget' });
    const b = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'https://github.com/acme/widget' });

    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(a.repository.id).toBe(b.repository.id);
    expect(mockRepoTable.creates).toBe(1);
    expect(mockRepoTable.rows).toHaveLength(1);
    expect(mockCollectionTable.creates).toBe(1);
  });

  it('does not re-classify a repository an admin already placed', async () => {
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget', role: 'frontend' });
    const again = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget', role: 'demo' });
    expect(again.repository.role).toBe('frontend');
    expect(mockRepoTable.updates).toBe(0);
  });

  it('survives the unique-index race and returns the winner', async () => {
    // A concurrent attach lands between our read and our write. The database
    // constraint rejects us; the loser must return the winner's row, not an error.
    const collectionId = await ensureRepoCollection(CASE_STUDY);
    mockRepoTable.beforeCreate = () => {
      mockRepoTable.seed({
        collection_id: collectionId, repo_owner: 'ACME', repo_name: 'Widget',
        repo_url: 'https://github.com/ACME/Widget', role: 'other',
      });
    };

    const result = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    expect(result.created).toBe(false);
    expect(result.repository.repoOwner).toBe('ACME');
    expect(mockRepoTable.rows).toHaveLength(1);
    expect(mockRepoTable.creates).toBe(0);
  });
});

/* ──────────────────────────── AC6 — the workspace-repo invariant is safe ──── */

describe('github_connections is never touched (AC6)', () => {
  it('exercises every public function and writes nothing to the connections model', async () => {
    const attached = await attachRepository({
      caseStudyId: CASE_STUDY, reference: 'acme/widget', role: 'primary',
      githubConnectionId: randomUUID(), projectId: randomUUID(),
    });
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget-api', role: 'backend' });
    await setRepositoryRole({ caseStudyId: CASE_STUDY, repositoryId: attached.repository.id, role: 'docs' });
    await listRepositories({ caseStudyId: CASE_STUDY });
    await removeRepository({ caseStudyId: CASE_STUDY, repositoryId: attached.repository.id });

    for (const [name, fn] of Object.entries(GitHubConnection as unknown as Record<string, jest.Mock>)) {
      expect([name, fn.mock.calls.length]).toEqual([name, 0]);
    }
    // No raw SQL either — a hand-written UPDATE would bypass the model mock.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('records a connection id as a pointer without creating a connection row', async () => {
    const githubConnectionId = randomUUID();
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget', githubConnectionId });
    expect(mockRepoTable.rows[0].github_connection_id).toBe(githubConnectionId);
    expect(mockGithubConnection.create).not.toHaveBeenCalled();
    expect(mockGithubConnection.findOne).not.toHaveBeenCalled();
  });
});

/* ─────────────────────────────────────────── exactly one primary ─────────── */

describe('exactly one primary', () => {
  it('demotes the incumbent when a second repo is attached as primary', async () => {
    const first = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/web', role: 'primary' });
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/api', role: 'primary' });

    const repos = await listRepositories({ caseStudyId: CASE_STUDY });
    expect(repos.filter((r) => r.role === 'primary')).toHaveLength(1);
    expect(repos.find((r) => r.repoName === 'api')!.role).toBe('primary');
    expect(repos.find((r) => r.id === first.repository.id)!.role).toBe('other');
  });

  it('demotes the incumbent when an existing repo is promoted', async () => {
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/web', role: 'primary' });
    const api = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/api', role: 'backend' });

    const updated = await setRepositoryRole({
      caseStudyId: CASE_STUDY, repositoryId: api.repository.id, role: 'primary',
    });
    expect(updated.role).toBe('primary');

    const repos = await listRepositories({ caseStudyId: CASE_STUDY });
    expect(repos.filter((r) => r.role === 'primary')).toHaveLength(1);
    expect(repos[0].repoName).toBe('api'); // primary sorts first
  });

  it('re-promoting the current primary is a no-op that keeps it primary', async () => {
    const web = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/web', role: 'primary' });
    await setRepositoryRole({ caseStudyId: CASE_STUDY, repositoryId: web.repository.id, role: 'primary' });
    const repos = await listRepositories({ caseStudyId: CASE_STUDY });
    expect(repos.filter((r) => r.role === 'primary')).toHaveLength(1);
  });
});

/* ───────────────────────────────────── per-function failure/boundary ─────── */

describe('attachRepository — failure and boundary', () => {
  it('rejects a malformed case study id with Zod issues attached', async () => {
    const err = await caught(() => attachRepository({ caseStudyId: 'not-a-uuid', reference: 'acme/widget' }));
    expect(err.error_class).toBe('CaseStudyRepoValidationError');
    expect(err.http_status).toBe(400);
    expect(Array.isArray(err.details.issues)).toBe(true); // Zod v4 `.issues`, not `.errors`
    expect(mockCollectionTable.creates).toBe(0);
  });

  it('rejects an unknown role', async () => {
    const err = await caught(() => attachRepository({
      caseStudyId: CASE_STUDY, reference: 'acme/widget', role: 'boss' as any,
    }));
    expect(err.error_class).toBe('CaseStudyRepoValidationError');
    expect(mockRepoTable.creates).toBe(0);
  });

  it('rejects an empty reference and an oversized one', async () => {
    const empty = await caught(() => attachRepository({ caseStudyId: CASE_STUDY, reference: '' }));
    expect(empty.error_class).toBe('CaseStudyRepoValidationError');
    const huge = await caught(() => attachRepository({ caseStudyId: CASE_STUDY, reference: 'a'.repeat(501) }));
    expect(huge.error_class).toBe('CaseStudyRepoValidationError');
  });

  it('defaults to role "other", visibility "unknown" and no public link', async () => {
    const { repository } = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    expect(repository.role).toBe('other');
    expect(repository.visibility).toBe('unknown'); // fail closed
    expect(repository.allowPublicRepoLink).toBe(false);
    expect(repository.accessStatus).toBe('unknown');
  });

  it('accepts every declared role', async () => {
    for (const role of CASE_STUDY_REPO_ROLES) {
      const caseStudyId = randomUUID();
      const { repository } = await attachRepository({ caseStudyId, reference: 'acme/widget', role });
      expect(repository.role).toBe(role);
    }
  });
});

describe('removeRepository — failure and boundary', () => {
  it('removes, then is idempotent on replay', async () => {
    const { repository } = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    expect(await removeRepository({ caseStudyId: CASE_STUDY, repositoryId: repository.id })).toEqual({ removed: true });
    expect(await removeRepository({ caseStudyId: CASE_STUDY, repositoryId: repository.id })).toEqual({ removed: false });
    expect(mockRepoTable.rows).toHaveLength(0);
    expect(mockRepoTable.destroys).toBe(1);
  });

  it('cannot remove a repository belonging to another Case Study', async () => {
    const other = randomUUID();
    const victim = await attachRepository({ caseStudyId: other, reference: 'acme/widget' });
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/other' });

    const result = await removeRepository({ caseStudyId: CASE_STUDY, repositoryId: victim.repository.id });
    expect(result).toEqual({ removed: false });
    expect(mockRepoTable.rows.some((r) => r.id === victim.repository.id)).toBe(true);
  });

  it('is a no-op for a Case Study with no collection at all', async () => {
    const result = await removeRepository({ caseStudyId: randomUUID(), repositoryId: randomUUID() });
    expect(result).toEqual({ removed: false });
    expect(mockCollectionTable.creates).toBe(0); // a remove never creates a collection
  });

  it('rejects a malformed repository id', async () => {
    const err = await caught(() => removeRepository({ caseStudyId: CASE_STUDY, repositoryId: '../../etc/passwd' }));
    expect(err.error_class).toBe('CaseStudyRepoValidationError');
    expect(mockRepoTable.destroys).toBe(0);
  });
});

describe('setRepositoryRole — failure and boundary', () => {
  it('throws CaseStudyRepoNotFound for an id that is not attached', async () => {
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    const err = await caught(() => setRepositoryRole({
      caseStudyId: CASE_STUDY, repositoryId: randomUUID(), role: 'docs',
    }));
    expect(err.error_class).toBe('CaseStudyRepoNotFound');
    expect(err.http_status).toBe(404);
    expect(mockRepoTable.updates).toBe(0);
  });

  it('cannot re-role a repository in another Case Study', async () => {
    const other = randomUUID();
    const victim = await attachRepository({ caseStudyId: other, reference: 'acme/widget' });
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/other' });

    const err = await caught(() => setRepositoryRole({
      caseStudyId: CASE_STUDY, repositoryId: victim.repository.id, role: 'primary',
    }));
    expect(err.error_class).toBe('CaseStudyRepoNotFound');
    expect(mockRepoTable.rows.find((r) => r.id === victim.repository.id)!.role).toBe('other');
  });

  it('rejects an unknown role before touching the row', async () => {
    const { repository } = await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    const err = await caught(() => setRepositoryRole({
      caseStudyId: CASE_STUDY, repositoryId: repository.id, role: 'chief' as any,
    }));
    expect(err.error_class).toBe('CaseStudyRepoValidationError');
    expect(mockRepoTable.updates).toBe(0);
  });

  it('throws when the Case Study has no collection', async () => {
    const err = await caught(() => setRepositoryRole({
      caseStudyId: randomUUID(), repositoryId: randomUUID(), role: 'docs',
    }));
    expect(err.error_class).toBe('CaseStudyRepoNotFound');
  });
});

describe('listRepositories — failure and boundary', () => {
  it('returns [] and creates nothing for a Case Study with no sources', async () => {
    expect(await listRepositories({ caseStudyId: randomUUID() })).toEqual([]);
    expect(mockCollectionTable.creates).toBe(0);
    expect(mockCollectionTable.rows).toHaveLength(0);
  });

  it('orders primary first, then owner and name case-insensitively', async () => {
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'Zulu/alpha' });
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/zeta' });
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/alpha' });
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'omega/core', role: 'primary' });

    const repos = await listRepositories({ caseStudyId: CASE_STUDY });
    expect(repos.map((r) => `${r.repoOwner}/${r.repoName}`)).toEqual([
      'omega/core', 'acme/alpha', 'acme/zeta', 'Zulu/alpha',
    ]);
  });

  it('rejects a malformed case study id', async () => {
    const err = await caught(() => listRepositories({ caseStudyId: 'nope' }));
    expect(err.error_class).toBe('CaseStudyRepoValidationError');
  });

  it('never leaks the metadata blob or the raw row shape', async () => {
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    const [repo] = await listRepositories({ caseStudyId: CASE_STUDY });
    expect(Object.keys(repo).sort()).toEqual([
      'accessStatus', 'allowPublicRepoLink', 'collectionId', 'defaultBranch', 'id',
      'lastSeenSha', 'lastSyncedAt', 'repoName', 'repoOwner', 'repoUrl', 'role', 'visibility',
    ]);
  });
});

describe('ensureRepoCollection', () => {
  it('is idempotent — one collection per Case Study', async () => {
    const a = await ensureRepoCollection(CASE_STUDY);
    const b = await ensureRepoCollection(CASE_STUDY);
    expect(a).toBe(b);
    expect(mockCollectionTable.creates).toBe(1);
  });

  it('rejects a malformed case study id', async () => {
    const err = await caught(() => ensureRepoCollection('not-a-uuid'));
    expect(err.error_class).toBe('CaseStudyRepoValidationError');
    expect(mockCollectionTable.creates).toBe(0);
  });
});

/* ────────────────────────────────────────────── structured logging ───────── */

describe('observability', () => {
  it('emits JSON lines carrying a correlation id and an outcome', async () => {
    const correlationId = randomUUID();
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget', correlationId });

    const entries = logLines.map((l) => JSON.parse(l));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      service: 'case-study-repo-collection',
      event: 'case_study.repo_attached',
      outcome: 'success',
      correlation_id: correlationId,
      case_study_id: CASE_STUDY,
      repo_owner: 'acme',
      repo_name: 'widget',
      level: 'info',
    });
    expect(typeof entries[0].timestamp).toBe('string');
  });

  it('mints a correlation id when the caller supplies none', async () => {
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    const entry = JSON.parse(logLines[0]);
    expect(entry.correlation_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
  });

  it('logs a rejection at error level with its error_class and no secret', async () => {
    await caught(() => attachRepository({ caseStudyId: CASE_STUDY, reference: 'https://gitlab.com/a/b' }));
    const entry = JSON.parse(logLines[0]);
    expect(entry).toMatchObject({ level: 'error', outcome: 'failure', error_class: 'InvalidRepoReference' });
    expect(logLines.join('\n')).not.toMatch(/ghp_|github_pat_|token|secret|password/i);
  });

  it('logs an idempotent replay as unchanged, not success', async () => {
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    logLines = [];
    await attachRepository({ caseStudyId: CASE_STUDY, reference: 'acme/widget' });
    expect(JSON.parse(logLines[0]).outcome).toBe('unchanged');
  });
});

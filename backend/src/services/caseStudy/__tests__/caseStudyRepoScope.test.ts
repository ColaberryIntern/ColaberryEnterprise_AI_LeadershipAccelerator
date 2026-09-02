import { randomUUID } from 'crypto';

/**
 * Path scope, from the admin's typed prefix to the stored row and back.
 *
 * NO DATABASE, same reason and same shape as `caseStudyRepoCollection.test.ts`:
 * CI provisions no Postgres, and a suite that needs one lands on the ignore list
 * and is never run again.
 *
 * WHAT THIS GUARDS. `path_scope` is the one column on this table that is a
 * `TEXT[]`, and Sequelize silently drops writes to a column the model does not
 * declare. That failure is invisible from the calling side — attach succeeds,
 * the record comes back, and the scope is simply gone on the next read. So these
 * tests assert the ROW as well as the return value.
 */

type FakeRow = Record<string, any>;

class FakeRepoTable {
  rows: FakeRow[] = [];
  reset(): void { this.rows = []; }
  seed(values: FakeRow): FakeRow {
    const row: FakeRow = {
      id: randomUUID(), role: 'other', visibility: 'unknown', access_status: 'unknown',
      allow_public_repo_link: false, metadata: {}, project_id: null, github_connection_id: null,
      default_branch: null, last_seen_sha: null, last_synced_at: null, path_scope: [], ...values,
    };
    this.rows.push(row);
    return row;
  }
  async findAll(opts: any): Promise<FakeRow[]> {
    return this.rows.filter((r) => r.collection_id === opts?.where?.collection_id);
  }
  async create(values: any): Promise<FakeRow> { return this.seed(values); }
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
    return [n];
  }
  async destroy(): Promise<number> { return 0; }
}

class FakeCollectionTable {
  rows: FakeRow[] = [];
  reset(): void { this.rows = []; }
  async findOrCreate(opts: any): Promise<[FakeRow, boolean]> {
    const caseStudyId = opts?.where?.case_study_id;
    const found = this.rows.find((r) => r.case_study_id === caseStudyId);
    if (found) return [found, false];
    const row: FakeRow = { id: randomUUID(), name: 'Sources', status: 'active', ...(opts?.defaults ?? {}) };
    this.rows.push(row);
    return [row, true];
  }
  async findOne(opts: any): Promise<FakeRow | null> {
    return this.rows.find((r) => r.case_study_id === opts?.where?.case_study_id) ?? null;
  }
}

const mockRepoTable = new FakeRepoTable();
const mockCollectionTable = new FakeCollectionTable();

jest.mock('../../../models/CaseStudyRepository', () => ({
  __esModule: true,
  default: {
    findAll: (o: any) => mockRepoTable.findAll(o),
    create: (v: any, o: any) => mockRepoTable.create(v, o),
    update: (v: any, o: any) => mockRepoTable.update(v, o),
    destroy: (o: any) => mockRepoTable.destroy(),
  },
}));
jest.mock('../../../models/CaseStudyRepoCollection', () => ({
  __esModule: true,
  default: {
    findOrCreate: (o: any) => mockCollectionTable.findOrCreate(o),
    findOne: (o: any) => mockCollectionTable.findOne(o),
  },
}));
jest.mock('../../../config/database', () => ({
  sequelize: { transaction: (fn: any) => fn({ id: 'fake-tx' }), query: jest.fn() },
}));

import {
  attachRepository, listRepositories, setRepositoryPathScope, isCaseStudyRepoError,
} from '../caseStudyRepoCollection';
import { MAX_SCOPE_PREFIXES, normaliseScope } from '../repoPathScope';

const CASE_STUDY = randomUUID();

beforeEach(() => {
  mockRepoTable.reset();
  mockCollectionTable.reset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const attach = (pathScope?: string[]) => attachRepository({
  caseStudyId: CASE_STUDY, reference: 'acme/monorepo', role: 'primary',
  ...(pathScope ? { pathScope } : {}),
});

describe('normaliseScope', () => {
  it('is the one place a scope is canonicalised', () => {
    expect(normaliseScope(['/Backend/SRC/', 'backend/src', '', '  ', 'frontend/src']))
      .toEqual(['backend/src', 'frontend/src']);
  });

  it('drops duplicates that differ only in how they were typed', () => {
    // Two spellings of one prefix are not two prefixes. Left un-deduped they
    // count twice against the bound and appear twice in every log line.
    expect(normaliseScope(['backend/src', 'BACKEND/SRC', '/backend/src/'])).toEqual(['backend/src']);
  });
});

describe('attachRepository with a path scope', () => {
  it('WRITES the scope to the row, normalised', async () => {
    const result = await attach(['/Backend/SRC/Services/', 'backend/src/services']);
    // The row, not just the returned record: a model that failed to declare the
    // column returns a plausible record and stores nothing.
    expect(mockRepoTable.rows[0].path_scope).toEqual(['backend/src/services']);
    expect(result.repository.pathScope).toEqual(['backend/src/services']);
  });

  it('leaves an unscoped attach shaped exactly as before', async () => {
    const result = await attach();
    // OMITTED, not `[]`. These records feed the published snapshot's content
    // hash; emitting an empty array would re-hash every existing Case Study and
    // present that as a change to the story.
    expect('pathScope' in result.repository).toBe(false);
    expect(mockRepoTable.rows[0].path_scope).toEqual([]);
  });

  it('refuses more prefixes than the bound allows', async () => {
    const tooMany = Array.from({ length: MAX_SCOPE_PREFIXES + 1 }, (_, i) => `dir${i}`);
    // Rejected as a validation error the admin can act on, not a 500.
    const err = await attach(tooMany).catch((e: unknown) => e);
    expect(isCaseStudyRepoError(err) && err.error_class).toBe('CaseStudyRepoValidationError');
    expect(mockRepoTable.rows).toHaveLength(0);
  });
});

describe('setRepositoryPathScope', () => {
  it('scopes a repository that is already attached, without re-attaching it', async () => {
    // The point of a separate setter: correcting a typo must not discard the
    // repository's id, and every snapshot that cites that id.
    const { repository } = await attach();
    const updated = await setRepositoryPathScope({
      caseStudyId: CASE_STUDY, repositoryId: repository.id,
      pathScope: ['backend/src/services/agents/corybrain'],
    });
    expect(updated.id).toBe(repository.id);
    expect(updated.pathScope).toEqual(['backend/src/services/agents/corybrain']);
    expect(mockRepoTable.rows[0].path_scope).toEqual(['backend/src/services/agents/corybrain']);
  });

  it('clears the scope when given an empty array', async () => {
    const { repository } = await attach(['backend/src']);
    const cleared = await setRepositoryPathScope({
      caseStudyId: CASE_STUDY, repositoryId: repository.id, pathScope: [],
    });
    // Back to describing the whole repository — and back to the un-scoped SHAPE,
    // so a Case Study that was scoped and then un-scoped is indistinguishable
    // from one that never was.
    expect('pathScope' in cleared).toBe(false);
    expect(mockRepoTable.rows[0].path_scope).toEqual([]);
  });

  it('refuses a repository that belongs to another Case Study', async () => {
    await attach();
    const err = await setRepositoryPathScope({
      caseStudyId: CASE_STUDY, repositoryId: randomUUID(), pathScope: ['backend'],
    }).catch((e: unknown) => e);
    expect(isCaseStudyRepoError(err) && err.error_class).toBe('CaseStudyRepoNotFound');
  });

  it('normalises on write, so the stored scope matches what the analyzer compares', async () => {
    const { repository } = await attach();
    await setRepositoryPathScope({
      caseStudyId: CASE_STUDY, repositoryId: repository.id,
      pathScope: ['/Backend/Src/', 'backend/src'],
    });
    expect(mockRepoTable.rows[0].path_scope).toEqual(['backend/src']);
  });
});

describe('reading a scope back', () => {
  it('survives the round trip through listRepositories', async () => {
    const { repository } = await attach(['backend/src/services']);
    const [listed] = await listRepositories({ caseStudyId: CASE_STUDY });
    expect(listed.id).toBe(repository.id);
    expect(listed.pathScope).toEqual(['backend/src/services']);
  });

  it('reads a column the driver did not return as NO scope, not as a crash', async () => {
    // An older container, a raw query or a hand-built fixture hands back
    // `undefined` here. Describing the whole repository is the safe reading:
    // describing a fraction of it and calling that the whole is not.
    await attach(['backend/src']);
    delete mockRepoTable.rows[0].path_scope;
    const [listed] = await listRepositories({ caseStudyId: CASE_STUDY });
    expect('pathScope' in listed).toBe(false);
  });

  it('ignores non-string entries rather than passing them to the path filter', async () => {
    await attach();
    mockRepoTable.rows[0].path_scope = ['backend/src', 42, null, 'frontend/src'];
    const [listed] = await listRepositories({ caseStudyId: CASE_STUDY });
    expect(listed.pathScope).toEqual(['backend/src', 'frontend/src']);
  });
});

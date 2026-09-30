/**
 * caseStudySnapshotStore — unit tests. T007 AC4 and AC5.
 *
 * NO DATABASE. `models/CaseStudySnapshot` is mocked, so this suite runs under
 * `jest.ci.config.ts` with `DATABASE_URL` unset. The fake table enforces the
 * SAME unique index the real DDL declares —
 * `cs_snapshots_unique_case_version ON (case_study_id, version)`,
 * `db/ensureCaseStudySchema.ts:184` — because AC5's claim is precisely that the
 * version increments by exactly one UNDER that constraint. Without the
 * constraint in the fake, the race tests would prove nothing.
 *
 * The drafts are built by the REAL builder rather than hand-written, so what is
 * under test is the whole spec §30 chain: same repo SHAs + same platform facts
 * ⇒ same hash ⇒ no new version row.
 */
import { randomUUID } from 'crypto';

type FakeRow = Record<string, any>;

class FakeSnapshotTable {
  rows: FakeRow[] = [];
  creates = 0;
  /** Fires once immediately before the next create — stages a concurrent insert. */
  beforeCreate: (() => void) | null = null;
  /** When set, `create` throws this instead of inserting. */
  failWith: Error | null = null;

  reset(): void {
    this.rows = []; this.creates = 0; this.beforeCreate = null; this.failWith = null;
  }

  /** Insert without counting it as a service-driven create. Enforces the unique index. */
  seed(values: FakeRow): FakeRow {
    const clash = this.rows.some(
      (r) => r.case_study_id === values.case_study_id && r.version === values.version,
    );
    if (clash) {
      const err: any = new Error('duplicate key value violates unique constraint "cs_snapshots_unique_case_version"');
      err.name = 'SequelizeUniqueConstraintError';
      throw err;
    }
    const row: FakeRow = {
      id: randomUUID(), status: 'draft', source_commit_map: {}, content: {}, provenance: {},
      generated_by: 'repo_sync', approved_by: null, approved_at: null, created_at: new Date(),
      ...values,
    };
    this.rows.push(row);
    return row;
  }

  async findOne(opts: any): Promise<FakeRow | null> {
    const matching = this.rows.filter((r) => r.case_study_id === opts?.where?.case_study_id);
    if (matching.length === 0) return null;
    return [...matching].sort((a, b) => b.version - a.version)[0];
  }

  async create(values: any): Promise<FakeRow> {
    if (this.beforeCreate) { const hook = this.beforeCreate; this.beforeCreate = null; hook(); }
    if (this.failWith) throw this.failWith;
    const row = this.seed(values);
    this.creates += 1;
    return row;
  }
}

const mockTable = new FakeSnapshotTable();

jest.mock('../../../models/CaseStudySnapshot', () => ({
  __esModule: true,
  default: {
    findOne: (o: any) => mockTable.findOne(o),
    create: (v: any) => mockTable.create(v),
  },
}));

import { buildCaseStudySnapshot } from '../caseStudySnapshotBuilder';
import { persistCaseStudySnapshot, MAX_VERSION_ATTEMPTS } from '../caseStudySnapshotStore';
import { fixedClock, makePlatform, makeRepo, makeRepoFacts, SHA_A, SHA_B } from './snapshotFixtures';

const CASE_STUDY = randomUUID();
let logLines: string[] = [];
let logSpy: jest.SpyInstance;

beforeEach(() => {
  mockTable.reset();
  logLines = [];
  logSpy = jest.spyOn(console, 'log').mockImplementation((line?: unknown) => {
    logLines.push(String(line));
  });
});
afterEach(() => logSpy.mockRestore());

/** A draft from the real builder. `sha` is the only thing that varies by default. */
const draftFor = (sha: string = SHA_A, clock = '2026-08-22T10:00:00.000Z') => buildCaseStudySnapshot({
  caseStudyId: CASE_STUDY,
  platform: makePlatform(),
  repos: [makeRepo({ facts: makeRepoFacts({ metadata: { latestCommitSha: sha } }) })],
  now: fixedClock(clock),
});

const persist = (sha: string = SHA_A, clock?: string) => persistCaseStudySnapshot({
  caseStudyId: CASE_STUDY, draft: draftFor(sha, clock), correlationId: 'corr-1',
});

/* ── AC4 — same SHAs + same platform facts ⇒ same hash ⇒ no new version row ── */

describe('AC4 — identical inputs never create a new version', () => {
  it('writes version 1 on the first sync', async () => {
    const first = await persist();
    expect(first).toMatchObject({ outcome: 'created', version: 1, status: 'draft', race: false });
    expect(mockTable.rows).toHaveLength(1);
  });

  it('re-running the identical sync writes NOTHING and returns the same row', async () => {
    const first = await persist();
    const second = await persist();
    expect(second.outcome).toBe('unchanged');
    expect(second.version).toBe(1);
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(second.contentHash).toBe(first.contentHash);
    expect(mockTable.creates).toBe(1);
    expect(mockTable.rows).toHaveLength(1);
  });

  it('survives five consecutive syncs with one row to show for it', async () => {
    for (let i = 0; i < 5; i += 1) await persist();
    expect(mockTable.rows).toHaveLength(1);
    expect(mockTable.creates).toBe(1);
  });

  it('is unchanged even when the sync ran at a completely different time', async () => {
    await persist(SHA_A, '2026-08-22T10:00:00.000Z');
    const later = await persist(SHA_A, '2031-06-05T09:30:00.000Z');
    expect(later.outcome).toBe('unchanged');
    expect(mockTable.rows).toHaveLength(1);
  });

  it('logs the no-op as `unchanged`, so a sync run does not report invented activity', async () => {
    await persist();
    logLines = [];
    await persist();
    const line = logLines.map((l) => JSON.parse(l)).find((l) => l.event === 'case_study.snapshot_persisted');
    expect(line.outcome).toBe('unchanged');
    expect(line.service).toBe('case-study-snapshot');
    expect(line.correlation_id).toBe('corr-1');
  });
});

/* ── AC5 — a changed SHA is a new hash is a new version, incremented by one ── */

describe('AC5 — a changed SHA creates exactly one new version', () => {
  it('increments the version by exactly 1', async () => {
    const first = await persist(SHA_A);
    const second = await persist(SHA_B);
    expect(second.outcome).toBe('created');
    expect(second.version).toBe(first.version + 1);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(mockTable.rows.map((r) => r.version)).toEqual([1, 2]);
  });

  it('keeps incrementing by one across a run of changes', async () => {
    const shas = [SHA_A, SHA_B, 'c'.repeat(40), 'd'.repeat(40)];
    for (const sha of shas) await persist(sha);
    expect(mockTable.rows.map((r) => r.version)).toEqual([1, 2, 3, 4]);
  });

  it('a revert to earlier content is a CHANGE against the latest, not a no-op', async () => {
    await persist(SHA_A);
    await persist(SHA_B);
    const back = await persist(SHA_A);
    expect(back.outcome).toBe('created');
    expect(back.version).toBe(3);
  });

  it('the unique (case_study_id, version) index is real in this fake', () => {
    mockTable.seed({ case_study_id: CASE_STUDY, version: 1, content_hash: 'x' });
    expect(() => mockTable.seed({ case_study_id: CASE_STUDY, version: 1, content_hash: 'y' }))
      .toThrow(/unique constraint/);
  });

  it('versions are scoped per Case Study — a sibling starts again at 1', async () => {
    await persist(SHA_A);
    const other = await persistCaseStudySnapshot({
      caseStudyId: 'other-case-study', draft: draftFor(SHA_A),
    });
    expect(other.version).toBe(1);
    expect(mockTable.rows).toHaveLength(2);
  });

  it('persists the content, provenance and commit map the builder produced', async () => {
    const draft = draftFor(SHA_A);
    await persistCaseStudySnapshot({ caseStudyId: CASE_STUDY, draft });
    const row = mockTable.rows[0];
    expect(row.content_hash).toBe(draft.contentHash);
    expect(row.source_commit_map).toEqual({ 'colaberry/accelerator': SHA_A });
    expect(row.content.identity.slug).toBe('bottling-line-copilot');
    expect(row.generated_by).toBe('repo_sync');
    expect(row.generated_at).toBeInstanceOf(Date);
    expect(row.generated_at.toISOString()).toBe(draft.generatedAt);
    expect(row.status).toBe('draft');
  });
});

/* ── the concurrent-version race ─────────────────────────────────────────── */

describe('the (case_study_id, version) race', () => {
  it('yields to a competitor that wrote the SAME content and reports unchanged', async () => {
    const draft = draftFor(SHA_A);
    mockTable.beforeCreate = () => {
      mockTable.seed({ case_study_id: CASE_STUDY, version: 1, content_hash: draft.contentHash });
    };
    const result = await persistCaseStudySnapshot({ caseStudyId: CASE_STUDY, draft });
    expect(result.outcome).toBe('unchanged');
    expect(result.race).toBe(true);
    expect(mockTable.rows).toHaveLength(1);
    expect(mockTable.creates).toBe(0);
  });

  it('takes the NEXT version when a competitor wrote different content', async () => {
    mockTable.beforeCreate = () => {
      mockTable.seed({ case_study_id: CASE_STUDY, version: 1, content_hash: 'f'.repeat(64) });
    };
    const result = await persistCaseStudySnapshot({ caseStudyId: CASE_STUDY, draft: draftFor(SHA_A) });
    expect(result.outcome).toBe('created');
    expect(result.version).toBe(2);
    expect(result.race).toBe(true);
  });

  it('gives up after a bounded number of attempts rather than spinning forever', async () => {
    let n = 0;
    const stage = () => {
      n += 1;
      mockTable.seed({ case_study_id: CASE_STUDY, version: n, content_hash: `${n}`.repeat(64).slice(0, 64) });
      mockTable.beforeCreate = stage;
    };
    mockTable.beforeCreate = stage;
    await expect(persistCaseStudySnapshot({ caseStudyId: CASE_STUDY, draft: draftFor(SHA_A) }))
      .rejects.toThrow(/unique constraint/);
    expect(n).toBe(MAX_VERSION_ATTEMPTS);
  });

  it('does not retry a failure that is not a version race', async () => {
    mockTable.failWith = new Error('connection terminated unexpectedly');
    await expect(persistCaseStudySnapshot({ caseStudyId: CASE_STUDY, draft: draftFor(SHA_A) }))
      .rejects.toThrow(/connection terminated/);
    const failure = logLines.map((l) => JSON.parse(l)).find((l) => l.outcome === 'failure');
    expect(failure.context.error_class).toBe('DatabaseError');
  });
});

/* ── validation and options ──────────────────────────────────────────────── */

describe('validation', () => {
  it('refuses a draft whose hash is not 64 lowercase hex characters', async () => {
    const draft = { ...draftFor(SHA_A), contentHash: 'NOT-A-HASH' };
    await expect(persistCaseStudySnapshot({ caseStudyId: CASE_STUDY, draft }))
      .rejects.toThrow(/content_hash must be 64 lowercase hex characters/);
    expect(mockTable.rows).toHaveLength(0);
  });

  it('refuses an empty case study id before touching the database', async () => {
    await expect(persistCaseStudySnapshot({ caseStudyId: '  ', draft: draftFor(SHA_A) }))
      .rejects.toThrow(/Invalid persist input/);
    expect(mockTable.creates).toBe(0);
  });

  it('honours an explicit status, so an approved snapshot can be written directly', async () => {
    const result = await persistCaseStudySnapshot({
      caseStudyId: CASE_STUDY, draft: draftFor(SHA_A), status: 'approved',
    });
    expect(result.status).toBe('approved');
    expect(mockTable.rows[0].status).toBe('approved');
  });

  it('does not overwrite an approved snapshot — a change appends a draft beside it', async () => {
    await persistCaseStudySnapshot({ caseStudyId: CASE_STUDY, draft: draftFor(SHA_A), status: 'approved' });
    const next = await persist(SHA_B);
    expect(next.version).toBe(2);
    expect(next.status).toBe('draft');
    expect(mockTable.rows[0].status).toBe('approved');
  });
});

/**
 * OPT-IN INTEGRATION TEST - proves phase A2's idempotency is the unique index, against a real
 * Postgres.
 *
 * ---------------------------------------------------------------------------
 * WHY A UNIT TEST CANNOT STAND IN FOR THIS
 * ---------------------------------------------------------------------------
 * A2's stated acceptance is that "a second sync at the same commit produces no new rows". The
 * unit suites cannot show that. They mock the store, so what they prove is which rows are
 * OFFERED to the insert. Whether a second offer of the same row is refused is a property of
 * `ON CONFLICT (project_id, story_id, artifact_key, commit_sha) DO NOTHING` and of the index
 * that conflict target names. A regex over the DDL would prove the statement was written, not
 * that Postgres accepted it, not that it covers the intended columns, and not that the second
 * insert returns nothing.
 *
 * It also proves the thing that made a NEW table necessary rather than generalizing
 * `gov_build_artifacts`: that table is unique on (story_id, commit_sha), so it cannot hold two
 * artifacts for one story at one commit. The fourth test below is that exact case.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts storyArtifactIdempotency.integration
 *
 * CI's "Integration tier (Postgres)" job discovers every `*.integration.test.ts` under
 * `backend/src` from the filesystem and gives each suite its own database, so this is picked up
 * with no list to update.
 *
 * With no DATABASE_URL it SKIPS LOUDLY. A suite that returns early reports as passed, which is
 * worse than no suite: the record then reads as though the criterion was met.
 *
 * It writes only to `story_artifact_verifications` and to a minimal `projects` row it creates
 * itself, and removes both afterwards whether the assertions passed or failed. It must never be
 * pointed at production.
 */

/**
 * This makes the file a MODULE rather than a script. Every import below is dynamic, inside
 * `beforeAll`, to control load order the way the other integration suites do, which leaves no
 * top-level import to do it. Without this marker the file's top-level `const`s are GLOBALS, and
 * `HAS_DB` and `describeIfDb` then collide with `ensurePublishingSchema.integration.test.ts`,
 * which declares the same two names the same way. Caught by the test typecheck gate as four
 * errors across two files, two of them in a file this branch never touched.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[storyArtifactIdempotency.integration] SKIPPED: no DATABASE_URL. A2 claims a re-sync over\n'
    + 'the same commit writes no new row. That is a unique index doing the work, and without a\n'
    + 'real database this suite is not evidence of it.',
  );
}

describeIfDb('story artifact rows are idempotent per (project, story, key, commit)', () => {
  let sequelize: any;
  let ensureStoryArtifactSchema: any;
  let recordStoryArtifacts: any;
  let listStoryArtifacts: any;

  const PROJECT = '44444444-4444-4444-8444-444444444444';
  const STORY = 'S-001';
  const COMMIT_A = 'a'.repeat(40);
  const COMMIT_B = 'b'.repeat(40);

  const match = (key: string, verdict = 'satisfied', path = `docs/${key}.pdf`) => ({
    key,
    verdict: verdict as any,
    repo_path: path,
    blob_sha: 'f'.repeat(40),
    size_bytes: 2048,
    reason: 'committed',
  });

  const countRows = async (): Promise<number> => {
    const [r]: any = await sequelize.query(
      'SELECT COUNT(*)::int AS n FROM story_artifact_verifications WHERE project_id = :p',
      { replacements: { p: PROJECT }, type: (await import('sequelize')).QueryTypes.SELECT },
    );
    return Number(r.n);
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ ensureStoryArtifactSchema } = await import('../../../db/ensureStoryArtifactSchema'));
    ({ recordStoryArtifacts, listStoryArtifacts } = await import('../storyArtifactVerificationStore'));

    // The FK target. This suite gets its own database, so creating a minimal `projects` here is
    // safe; the pgcrypto extension is what `gen_random_uuid()` needs on an older server.
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await ensureStoryArtifactSchema();
    await sequelize.query(
      'INSERT INTO projects (id) VALUES (:p) ON CONFLICT DO NOTHING',
      { replacements: { p: PROJECT } },
    );
  });

  afterAll(async () => {
    try {
      await sequelize.query('DELETE FROM story_artifact_verifications WHERE project_id = :p',
        { replacements: { p: PROJECT } });
      await sequelize.query('DELETE FROM projects WHERE id = :p', { replacements: { p: PROJECT } });
    } finally {
      await sequelize.close();
    }
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM story_artifact_verifications WHERE project_id = :p',
      { replacements: { p: PROJECT } });
  });

  const record = (commitSha: string, matches: any[]) => recordStoryArtifacts({
    projectId: PROJECT,
    storyId: STORY,
    commitSha,
    planVersion: 1,
    mode: 'report_only',
    matches,
  });

  it('creates a table this writer can actually use, rather than printing that it did', async () => {
    const { storyArtifactsReady } = await import('../../../db/ensureStoryArtifactSchema');
    expect(storyArtifactsReady()).toBe(true);
  });

  it('records one row for the one artifact that is there, out of three declared', async () => {
    // The phase's stated acceptance, first half, against a real database.
    const outcome = await record(COMMIT_A, [
      match('ART-001'),
      match('ART-002', 'missing'),
      match('ART-003', 'missing'),
    ]);
    expect(outcome.inserted).toBe(1);
    expect(outcome.offered).toBe(1);
    expect(outcome.skipped).toBeNull();
    expect(await countRows()).toBe(1);

    const rows = await listStoryArtifacts(PROJECT);
    expect(rows).toHaveLength(1);
    expect(rows[0].artifact_key).toBe('ART-001');
    expect(rows[0].commit_sha).toBe(COMMIT_A);
    expect(rows[0].verdict).toBe('satisfied');
    expect(rows[0].mode).toBe('report_only');
    expect(rows[0].blob_sha).toBe('f'.repeat(40));
  });

  it('writes NO new row on a second sync over the same commit', async () => {
    // The phase's stated acceptance, second half. This is the assertion that only a database
    // can make, and the reason this file exists.
    const first = await record(COMMIT_A, [match('ART-001')]);
    expect(first.inserted).toBe(1);

    const second = await record(COMMIT_A, [match('ART-001')]);
    expect(second.inserted).toBe(0);
    expect(second.offered).toBe(1);
    expect(second.skipped).toBeNull();

    const third = await record(COMMIT_A, [match('ART-001')]);
    expect(third.inserted).toBe(0);

    expect(await countRows()).toBe(1);
  });

  it('does record the same artifact again at a DIFFERENT commit', async () => {
    // The control. An index that refused this would make the table a snapshot rather than a
    // history, and "handed over at which commit" is the question it exists to answer.
    expect((await record(COMMIT_A, [match('ART-001')])).inserted).toBe(1);
    expect((await record(COMMIT_B, [match('ART-001')])).inserted).toBe(1);
    expect(await countRows()).toBe(2);
  });

  it('holds SEVERAL artifacts for one story at one commit', async () => {
    // Exactly what `gov_build_artifacts` cannot do: it is unique on (story_id, commit_sha), so
    // the second of these would have collided. This is the measured reason A2 has its own table.
    const outcome = await record(COMMIT_A, [
      match('ART-001'),
      match('ART-002'),
      match('ART-003', 'present_content_unchecked'),
    ]);
    expect(outcome.inserted).toBe(3);
    expect(await countRows()).toBe(3);

    const keys = (await listStoryArtifacts(PROJECT)).map((r: any) => r.artifact_key).sort();
    expect(keys).toEqual(['ART-001', 'ART-002', 'ART-003']);
  });

  it('inserts exactly one row when two syncs of the same push race', async () => {
    // The shape a check-then-insert would lose: the push webhook fires while the student is
    // pressing Sync. Both calls see no row, both insert, and the index decides.
    const results = await Promise.all([
      record(COMMIT_A, [match('ART-001')]),
      record(COMMIT_A, [match('ART-001')]),
      record(COMMIT_A, [match('ART-001')]),
    ]);
    const inserted = results.reduce((n, r) => n + r.inserted, 0);
    expect(inserted).toBe(1);
    expect(await countRows()).toBe(1);
  });

  it('records nothing, and says so, when no match is satisfying', async () => {
    const outcome = await record(COMMIT_A, [match('ART-001', 'missing'), match('ART-002', 'empty_file')]);
    expect(outcome.inserted).toBe(0);
    expect(outcome.offered).toBe(0);
    expect(outcome.skipped).toBe('nothing_satisfying');
    expect(await countRows()).toBe(0);
  });

  it('refuses to write a row that names no commit', async () => {
    const outcome = await record('', [match('ART-001')]);
    expect(outcome.inserted).toBe(0);
    expect(outcome.skipped).toBe('no_commit');
    expect(await countRows()).toBe(0);
  });

  it('filters by story without an array replacement', async () => {
    // `IN (:ids)` rather than `= ANY(:ids)`: an array replacement through this ORM produced a
    // malformed array literal in production and crash-looped the service.
    await record(COMMIT_A, [match('ART-001')]);
    expect(await listStoryArtifacts(PROJECT, [STORY])).toHaveLength(1);
    expect(await listStoryArtifacts(PROJECT, ['S-999'])).toHaveLength(0);
    expect(await listStoryArtifacts(PROJECT, [])).toHaveLength(0);
    expect(await listStoryArtifacts(PROJECT, [STORY, 'S-999'])).toHaveLength(1);
  });
});

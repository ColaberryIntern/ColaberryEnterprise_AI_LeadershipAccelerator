/**
 * OPT-IN INTEGRATION TEST - proves phase A3's central claim against a real Postgres: a story's
 * celebration fires ONCE, for the life of the system.
 *
 * ---------------------------------------------------------------------------
 * WHY A UNIT TEST CANNOT STAND IN FOR THIS
 * ---------------------------------------------------------------------------
 * "Fires on the first satisfying sync and never again" is a property of the unique index on
 * (project_id, story_id), which carries NO commit. The unit suites mock the store, so what they
 * prove is that the celebration is computed on the transition and offered once. Whether a SECOND
 * offer is refused, at a different commit, after a force-push, or from two syncs racing the same
 * push, is Postgres's answer and nothing else's.
 *
 * The contrast with A2's table is the thing most likely to be broken by a well-meaning edit, so
 * it is asserted here directly: `story_artifact_verifications` is keyed per COMMIT and SHOULD
 * gain a row at a new commit, while this table is keyed per STORY and must not.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts storyCelebrationOnce.integration
 *
 * CI's "Integration tier (Postgres)" job discovers every `*.integration.test.ts` under
 * `backend/src` from the filesystem and gives each its own database, so this needs no list
 * updating. With no DATABASE_URL it SKIPS LOUDLY: a suite that returns early reports as passed,
 * which would make the record read as though the claim had been proven.
 *
 * It writes only to `story_completion_events` and a minimal `projects` row it creates itself,
 * and removes both afterwards. It must never be pointed at production.
 */

/**
 * Makes this file a MODULE rather than a script. Every import is dynamic, inside `beforeAll`, so
 * there is no top-level import to do it, and without this the top-level `const`s are GLOBALS that
 * collide with the other integration suites declaring the same two names.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[storyCelebrationOnce.integration] SKIPPED: no DATABASE_URL. A3 claims a celebration fires\n'
    + 'once for the life of a story. That is a unique index doing the work, and without a real\n'
    + 'database this suite is not evidence of it.',
  );
}

describeIfDb('a story celebration fires once, for the life of the story', () => {
  let sequelize: any;
  let ensureStoryCompletionSchema: any;
  let recordStoryCelebration: any;
  let listStoryCelebrations: any;
  let QueryTypes: any;

  const PROJECT = '55555555-5555-4555-8555-555555555555';
  const STORY = 'STORY-001';

  const celebration = (headline = 'Your churn model evaluation report is in your repository.') => ({
    headline,
    caveat: null,
    artifacts: [{
      key: 'ART-001',
      name: 'churn model evaluation report',
      content_unchecked: false,
      where: 'repo' as const,
      repo_path: 'docs/churn.pdf',
    }],
  });

  const fire = (commitSha: string | null, head?: string) => recordStoryCelebration({
    projectId: PROJECT,
    storyId: STORY,
    commitSha,
    planVersion: 1,
    celebration: celebration(head),
  });

  const countRows = async (): Promise<number> => {
    const [r]: any = await sequelize.query(
      'SELECT COUNT(*)::int AS n FROM story_completion_events WHERE project_id = :p',
      { replacements: { p: PROJECT }, type: QueryTypes.SELECT },
    );
    return Number(r.n);
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ QueryTypes } = await import('sequelize'));
    ({ ensureStoryCompletionSchema } = await import('../../../db/ensureStoryCompletionSchema'));
    ({ recordStoryCelebration, listStoryCelebrations } = await import('../storyCompletionStore'));

    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await ensureStoryCompletionSchema();
    await sequelize.query('INSERT INTO projects (id) VALUES (:p) ON CONFLICT DO NOTHING',
      { replacements: { p: PROJECT } });
  });

  afterAll(async () => {
    try {
      await sequelize.query('DELETE FROM story_completion_events WHERE project_id = :p',
        { replacements: { p: PROJECT } });
      await sequelize.query('DELETE FROM projects WHERE id = :p', { replacements: { p: PROJECT } });
    } finally {
      await sequelize.close();
    }
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM story_completion_events WHERE project_id = :p',
      { replacements: { p: PROJECT } });
  });

  it('creates a table the writer can actually use, rather than printing that it did', async () => {
    const { storyCompletionsReady } = await import('../../../db/ensureStoryCompletionSchema');
    expect(storyCompletionsReady()).toBe(true);
  });

  it('records the celebration the first time, with the sentence as it read', async () => {
    const out = await fire('a'.repeat(40));
    expect(out.inserted).toBe(1);
    expect(out.skipped).toBeNull();

    const rows = await listStoryCelebrations(PROJECT);
    expect(rows).toHaveLength(1);
    expect(rows[0].story_id).toBe(STORY);
    expect(rows[0].headline).toBe('Your churn model evaluation report is in your repository.');
    expect(rows[0].artifact_keys).toEqual(['ART-001']);
    expect(rows[0].artifact_names).toEqual(['churn model evaluation report']);
    expect(rows[0].seen_at).toBeNull();
  });

  it('NEVER fires a second time, not even at a different commit', async () => {
    // The claim. A2's audit table is keyed per commit and SHOULD gain a row here; this one is
    // keyed per story and must not.
    expect((await fire('a'.repeat(40))).inserted).toBe(1);
    expect((await fire('a'.repeat(40))).inserted).toBe(0);
    expect((await fire('b'.repeat(40))).inserted).toBe(0);
    expect((await fire(null)).inserted).toBe(0);
    expect(await countRows()).toBe(1);
  });

  it('keeps the ORIGINAL sentence when a later sync would word it differently', async () => {
    // A contract can be edited after the fact. Re-deriving the sentence later would quietly
    // rewrite what somebody was told, so the row is written once and left alone.
    await fire('a'.repeat(40), 'Your churn model evaluation report is in your repository.');
    await fire('b'.repeat(40), 'Your COMPLETELY DIFFERENT THING is in your repository.');
    const rows = await listStoryCelebrations(PROJECT);
    expect(rows).toHaveLength(1);
    expect(rows[0].headline).toContain('churn model evaluation report');
    expect(rows[0].headline).not.toContain('COMPLETELY DIFFERENT');
  });

  it('fires exactly once when two syncs of the same push race', async () => {
    // The real shape: the webhook fires while the student is pressing Sync. Both see no row.
    const results = await Promise.all([
      fire('a'.repeat(40)), fire('a'.repeat(40)), fire('a'.repeat(40)),
    ]);
    expect(results.reduce((n: number, r: any) => n + r.inserted, 0)).toBe(1);
    expect(await countRows()).toBe(1);
  });

  it('still celebrates a DIFFERENT story on the same project', async () => {
    // The control. An index that refused this would give a project one celebration in total.
    await fire('a'.repeat(40));
    const other = await recordStoryCelebration({
      projectId: PROJECT,
      storyId: 'STORY-002',
      commitSha: 'a'.repeat(40),
      planVersion: 1,
      celebration: celebration('Your decision record is in your repository.'),
    });
    expect(other.inserted).toBe(1);
    expect(await countRows()).toBe(2);
  });

  it('says so, rather than throwing, when there is nothing to say', async () => {
    const out = await recordStoryCelebration({
      projectId: PROJECT,
      storyId: STORY,
      commitSha: 'a'.repeat(40),
      planVersion: 1,
      celebration: { headline: '', caveat: null, artifacts: [] },
    });
    expect(out.inserted).toBe(0);
    expect(out.skipped).toBe('nothing_to_say');
    expect(await countRows()).toBe(0);
  });

  it('carries a caveat when one was computed', async () => {
    const out = await recordStoryCelebration({
      projectId: PROJECT,
      storyId: STORY,
      commitSha: 'a'.repeat(40),
      planVersion: 1,
      celebration: {
        headline: 'Your churn model evaluation report is in your repository.',
        caveat: 'It was found in place, and the contents were not read.',
        artifacts: celebration().artifacts,
      },
    });
    expect(out.inserted).toBe(1);
    const rows = await listStoryCelebrations(PROJECT);
    expect(rows[0].caveat).toContain('contents were not read');
  });
});

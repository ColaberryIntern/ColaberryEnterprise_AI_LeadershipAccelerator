/**
 * Career Prep R1.2 against a REAL Postgres (the integration tier): a saved practice answer is public ONLY while it is
 * switched on AND its owner's portfolio page is published and `public`. Off, deleted, unlisted or another student's
 * flip: the public route answers the same 404 as a missing file. Exercised through the real public route.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts savedAnswersPublic.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[careerPrep savedAnswersPublic.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('public practice answers against Postgres', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensureCareerPrepSchema');
  let saved: typeof import('../savedAnswers');
  let app: import('express').Express;
  let request: typeof import('supertest');
  let root: string;
  const E1 = '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const E2 = '8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const S1 = '8ccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const A1 = '8ddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const ASSET = 'aaaabbbbccccddddeeeeffff';
  const url = `/api/public/hire/practice-answer/${ASSET}/stream`;
  const get = () => request(app).get(url);

  beforeAll(async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-answers-it-'));
    process.env.PREP_ANSWER_DIR = root;
    fs.mkdirSync(path.join(root, ASSET), { recursive: true });
    fs.writeFileSync(path.join(root, ASSET, 'stream.mp4'), 'mp4-bytes');
    fs.writeFileSync(path.join(root, ASSET, 'poster.jpg'), 'jpg-bytes');
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensureCareerPrepSchema');
    saved = await import('../savedAnswers');
    const express = (await import('express')).default;
    const { createHireVideoRouter } = await import('../../../routes/publicHireVideoRoutes');
    request = (await import('supertest')).default;
    app = express();
    app.use(createHireVideoRouter());
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY, full_name TEXT)');
    await sequelize.query(`INSERT INTO enrollments (id, full_name) VALUES ('${E1}', 'One'), ('${E2}', 'Two') ON CONFLICT (id) DO NOTHING`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS career_portfolio_pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id UUID NOT NULL, slug VARCHAR(160) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'draft', visibility VARCHAR(24) NOT NULL DEFAULT 'unlisted')`);
    await sequelize.query(`INSERT INTO career_portfolio_pages (enrollment_id, slug, status, visibility) VALUES ('${E1}', 'r12-it-one', 'published', 'public')`);
    await schema.ensureCareerPrepSchema();
    await sequelize.query(`INSERT INTO prep_sessions (id, enrollment_id) VALUES ('${S1}', '${E1}')`);
    await sequelize.query(`INSERT INTO prep_attempts (id, session_id, enrollment_id, segment_index, client_key, status) VALUES ('${A1}', '${S1}', '${E1}', 1, 'k1', 'done')`);
    await sequelize.query(`INSERT INTO prep_saved_answers (enrollment_id, attempt_id, asset_id, question, delivery, seconds) VALUES ('${E1}', '${A1}', '${ASSET}', 'Tell me about a project.', 81, 42)`);
  });

  afterAll(async () => {
    await sequelize.query(`DELETE FROM career_portfolio_pages WHERE slug = 'r12-it-one'`);
    for (const sql of schema.CAREER_PREP_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('a saved answer is private by default: the column defaults off and the public route 404s', async () => {
    const [[row]] = await sequelize.query(`SELECT show_public FROM prep_saved_answers WHERE attempt_id = '${A1}'`) as [Array<{ show_public: boolean }>, unknown];
    expect(row.show_public).toBe(false);
    expect((await get()).status).toBe(404);
    expect(await saved.readPublicAnswers(E1)).toEqual([]);
  });

  it("another student cannot flip it (404), and the answer stays private", async () => {
    await expect(saved.setShowPublic(E2, A1, true)).rejects.toThrow('not found');
    expect((await get()).status).toBe(404);
  });

  it('switched on by its owner: public, never cached, and the profile lists the question but not the score', async () => {
    const view = await saved.setShowPublic(E1, A1, true);
    expect(view.showPublic).toBe(true);
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(await saved.readPublicAnswers(E1)).toEqual([{
      question: 'Tell me about a project.', seconds: 42,
      streamUrl: `/api/public/hire/practice-answer/${ASSET}/stream`, posterUrl: `/api/public/hire/practice-answer/${ASSET}/poster`,
    }]);
  });

  it('an unlisted page hides it at once', async () => {
    await sequelize.query(`UPDATE career_portfolio_pages SET visibility = 'unlisted' WHERE slug = 'r12-it-one'`);
    expect((await get()).status).toBe(404);
    expect(await saved.readPublicAnswers(E1)).toEqual([]);
    await sequelize.query(`UPDATE career_portfolio_pages SET visibility = 'public' WHERE slug = 'r12-it-one'`);
    expect((await get()).status).toBe(200);
  });

  it('switched off: 404 at once', async () => {
    await saved.setShowPublic(E1, A1, false);
    expect((await get()).status).toBe(404);
    await saved.setShowPublic(E1, A1, true);
    expect((await get()).status).toBe(200);
  });

  it('deleted: 404 at once', async () => {
    await saved.deleteAnswer(E1, A1, root);
    expect((await get()).status).toBe(404);
    expect(await saved.readPublicAnswers(E1)).toEqual([]);
  });
});

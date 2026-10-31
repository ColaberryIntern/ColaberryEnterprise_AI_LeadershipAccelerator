/**
 * INTEGRATION TEST — executes the REAL draft INSERT statements against a real Postgres.
 *
 * ── Why this exists alongside the source scan ─────────────────────────────────────────
 *
 * `scheduledEmailRawInsertsSupplyId.test.ts` reads the SQL text and asserts the column list
 * contains `id`. That catches a new writer cheaply and needs no database. It still only
 * proves the statement was WRITTEN a certain way. It cannot prove Postgres accepts it.
 *
 * On 2026-10-31 both raw writers into `scheduled_emails` omitted `id`, which is
 * `uuid NOT NULL` with no database default, so every row they ever attempted failed with
 * `null value in column "id" ... violates not-null constraint`. Both writers had passing
 * unit tests throughout, because those tests mock `sequelize.query` — and a mock accepts
 * SQL the real schema rejects. That is the entire lesson of the defect, and a second
 * text-matching test would have repeated the mistake in a new costume.
 *
 * So this suite takes the statements FROM THE SOURCE FILES and runs them. Extracting rather
 * than copying is deliberate: a pasted copy can drift from the writer it claims to cover,
 * and a test covering a stale copy of the SQL is exactly the kind of evidence that reads
 * green while the real statement is broken.
 *
 * ── The built-in mutation check ───────────────────────────────────────────────────────
 *
 * This suite also strips `id` back out of each extracted statement and asserts the insert
 * FAILS with a not-null violation. A check that passes with the defect reintroduced proves
 * nothing, and here that assurance is automatic rather than something a person has to
 * remember to do by hand.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 * It joins the `Integration tier (Postgres)` CI job by existing: `scripts/ci/runIntegrationSuites.js`
 * derives its suite list from `*.integration.test.ts` under `backend/src` and gives each file
 * its own disposable database. Locally:
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts scheduledEmailDraftInsert.integration
 *
 * With no DATABASE_URL it SKIPS loudly rather than passing vacuously. It creates its own
 * `scheduled_emails` table in its own database and never reads or writes an existing one,
 * so it must still never be pointed at production.
 */

import * as fs from 'fs';
import * as path from 'path';
import { QueryTypes, Sequelize } from 'sequelize';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // A suite that skips in silence is indistinguishable from one that passed.
  // eslint-disable-next-line no-console
  console.warn(
    '[scheduledEmailDraftInsert.integration] SKIPPED: no DATABASE_URL. This suite executes the\n'
      + 'real draft INSERTs against Postgres; without one it is not evidence.',
  );
}

const BACKEND_SRC = path.join(__dirname, '..', '..', '..', '..');

/**
 * `scheduled_emails` as production constrains it, in the parts this test turns on.
 *
 * `id uuid NOT NULL` with NO DEFAULT is the whole point — reproducing it is what makes the
 * defect reproducible. `scheduled_for` is NOT NULL in production too, and `status` is
 * varchar(32) because the draft statuses are up to 25 characters and would not have fitted
 * the original varchar(20).
 */
const CREATE_TABLE = `
  CREATE TABLE scheduled_emails (
    id uuid NOT NULL,
    lead_id integer,
    sequence_id uuid,
    step_index integer,
    subject varchar(255),
    body text,
    to_email varchar(255),
    scheduled_for timestamptz NOT NULL,
    sent_at timestamptz,
    status varchar(32),
    created_at timestamptz,
    channel varchar(32),
    max_attempts integer,
    attempts_made integer,
    metadata jsonb,
    campaign_id uuid,
    ai_instructions text,
    ai_generated boolean
  )
`;

/** Source with comments stripped, so a SQL-looking string in prose cannot be extracted. */
function codeOf(relative: string): string {
  return fs
    .readFileSync(path.join(BACKEND_SRC, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * The one `INSERT INTO scheduled_emails ... RETURNING ...` statement in a file.
 *
 * Throws rather than returning null on no match: a helper that quietly yields nothing turns
 * every assertion below it into a pass, which is the vacuous-green failure this whole change
 * is a reaction to.
 */
function extractInsert(relative: string): string {
  const m = codeOf(relative).match(/INSERT\s+INTO\s+scheduled_emails[\s\S]*?RETURNING[^\n`]*/i);
  if (!m) throw new Error(`no INSERT INTO scheduled_emails found in ${relative}`);
  return m[0];
}

/** Strip `id` from the column list and its value from VALUES, reproducing the defect. */
function withoutId(sql: string): string {
  const stripped = sql
    .replace(/\(\s*id\s*,/i, '(')
    .replace(/\(\s*gen_random_uuid\(\)\s*,/i, '(');
  if (stripped === sql) throw new Error('mutation did not change the statement');
  return stripped;
}

const DRAFT_REPOSITORY = 'services/explorerGrowth/drafts/draftRepository.ts';
const AGENT_EMAIL_TOOL = 'services/agents/tools/agentEmailTool.ts';

describeIfDb('draft INSERTs against a real Postgres (requires DATABASE_URL)', () => {
  let sequelize: Sequelize;

  beforeAll(async () => {
    sequelize = new Sequelize(process.env.DATABASE_URL as string, { logging: false });
    await sequelize.query(CREATE_TABLE);
  });

  afterAll(async () => {
    if (sequelize) await sequelize.close();
  });

  afterEach(async () => {
    await sequelize.query('DELETE FROM scheduled_emails');
  });

  /** `draftRepository` binds with `:name` replacements. */
  const draftReplacements = {
    lead_id: 1,
    campaign_id: null,
    step_index: 0,
    subject: 'integration subject',
    body: 'integration body',
    to_email: 'nobody@example.com',
    status: 'explorer_draft',
    ai_instructions: 'brief',
    metadata: JSON.stringify({ source: 'integration test' }),
  };

  /** `agentEmailTool` binds with `$name` binds. */
  const agentBind = {
    leadId: 1,
    toEmail: 'nobody@example.com',
    subject: 'integration subject',
    body: 'integration body',
    status: 'agent_draft',
    campaignId: null,
    metadata: JSON.stringify({ source: 'integration test' }),
  };

  it('inserts the draftRepository statement and returns an id', async () => {
    const rows = await sequelize.query<{ id: string }>(extractInsert(DRAFT_REPOSITORY), {
      replacements: draftReplacements,
      type: QueryTypes.SELECT,
    });
    expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('inserts the agentEmailTool statement and returns an id', async () => {
    const rows = await sequelize.query<{ id: string }>(extractInsert(AGENT_EMAIL_TOOL), {
      bind: agentBind,
      type: QueryTypes.SELECT,
    });
    expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('MUTATION: the draftRepository statement without id is rejected by the constraint', async () => {
    await expect(
      sequelize.query(withoutId(extractInsert(DRAFT_REPOSITORY)), {
        replacements: draftReplacements,
        type: QueryTypes.SELECT,
      }),
    ).rejects.toThrow(/null value in column "id"/i);
  });

  it('MUTATION: the agentEmailTool statement without id is rejected by the constraint', async () => {
    await expect(
      sequelize.query(withoutId(extractInsert(AGENT_EMAIL_TOOL)), {
        bind: agentBind,
        type: QueryTypes.SELECT,
      }),
    ).rejects.toThrow(/null value in column "id"/i);
  });
});

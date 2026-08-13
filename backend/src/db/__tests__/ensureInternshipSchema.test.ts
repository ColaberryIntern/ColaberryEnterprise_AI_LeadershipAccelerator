const queryMock = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

import {
  ensureInternshipSchema,
  INTERNSHIP_APPLICATION_STATUSES,
  INTERNSHIP_OFFERING_STATUSES,
} from '../ensureInternshipSchema';

/** All DDL issued by one full run, normalised to single-spaced text. */
async function runAndCollect(): Promise<string[]> {
  queryMock.mockReset();
  queryMock.mockResolvedValue([[], {}]);
  await ensureInternshipSchema();
  return queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' ').trim());
}

describe('ensureInternshipSchema — idempotency', () => {
  it('issues only IF NOT EXISTS DDL, so it is safe on every boot', async () => {
    const sqls = await runAndCollect();
    expect(sqls.length).toBeGreaterThan(0);
    for (const sql of sqls) {
      expect(sql).toMatch(/IF NOT EXISTS/i);
    }
  });

  it('issues no destructive statement', async () => {
    const sqls = await runAndCollect();
    for (const sql of sqls) {
      expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM|ALTER COLUMN)\b/i);
    }
  });

  it('produces byte-identical DDL on a second run', async () => {
    const first = await runAndCollect();
    const second = await runAndCollect();
    expect(second).toEqual(first);
  });

  it('creates both tables', async () => {
    const sqls = await runAndCollect();
    expect(sqls.some((s) => /CREATE TABLE IF NOT EXISTS internship_offerings/i.test(s))).toBe(true);
    expect(sqls.some((s) => /CREATE TABLE IF NOT EXISTS internship_applications/i.test(s))).toBe(true);
  });
});

describe('the duplicate-application guarantee', () => {
  it('enforces one application per person per offering at the DATABASE level', async () => {
    // This is the whole point of the table design. An application flow WILL be
    // double-submitted by a retried request or a double-click; application-level
    // checks race, a unique index does not.
    const sqls = await runAndCollect();
    const unique = sqls.find((s) => /CREATE UNIQUE INDEX IF NOT EXISTS idx_internship_applications_unique/i.test(s));
    expect(unique).toBeDefined();
    expect(unique).toMatch(/ON internship_applications \(offering_id, email_normalized\)/i);
  });

  it('makes email_normalized NOT NULL, without which that index is meaningless', async () => {
    // A nullable dedupe key would let unlimited NULL-email duplicates through,
    // because Postgres treats NULLs as distinct in a unique index.
    const sqls = await runAndCollect();
    const table = sqls.find((s) => /CREATE TABLE IF NOT EXISTS internship_applications/i.test(s))!;
    expect(table).toMatch(/email_normalized VARCHAR\(320\) NOT NULL/i);
  });

  it('keeps the offering slug unique, since a route will resolve on it', async () => {
    const sqls = await runAndCollect();
    expect(
      sqls.some((s) => /CREATE UNIQUE INDEX IF NOT EXISTS idx_internship_offerings_slug/i.test(s)),
    ).toBe(true);
  });
});

describe('identity columns are deliberately unconstrained', () => {
  it('adds NO foreign key from applications to enrollments or leads', async () => {
    // Deliberate, matching page_events.lead_id in EPIC 1: an FK forces a
    // validate-scan under lock on deploy, and neither id is guaranteed present.
    // An applicant may be neither an enrolled learner nor a captured lead —
    // exactly who a never-marketed product attracts first.
    const sqls = await runAndCollect();
    const table = sqls.find((s) => /CREATE TABLE IF NOT EXISTS internship_applications/i.test(s))!;
    expect(table).not.toMatch(/enrollment_id UUID[^,]*REFERENCES/i);
    expect(table).not.toMatch(/lead_id INTEGER[^,]*REFERENCES/i);
    // both nullable
    expect(table).toMatch(/enrollment_id UUID,/i);
    expect(table).toMatch(/lead_id INTEGER,/i);
  });

  it('DOES cascade applications when their offering is deleted', async () => {
    // The one FK that is correct: an application without its offering is orphaned data.
    const sqls = await runAndCollect();
    const table = sqls.find((s) => /CREATE TABLE IF NOT EXISTS internship_applications/i.test(s))!;
    expect(table).toMatch(/offering_id UUID NOT NULL REFERENCES internship_offerings \(id\) ON DELETE CASCADE/i);
  });

  it('indexes every identity column that will be queried', async () => {
    const sqls = await runAndCollect();
    for (const idx of ['enrollment', 'lead', 'email']) {
      expect(
        sqls.some((s) => new RegExp(`idx_internship_applications_${idx}\\b`, 'i').test(s)),
      ).toBe(true);
    }
  });
});

describe('status vocabularies', () => {
  it('includes accepted, which is what makes a learner CONVERTED (plan §8.1)', async () => {
    expect(INTERNSHIP_APPLICATION_STATUSES).toContain('accepted');
  });

  it('defaults a new application to started and a new offering to draft', async () => {
    const sqls = await runAndCollect();
    const apps = sqls.find((s) => /CREATE TABLE IF NOT EXISTS internship_applications/i.test(s))!;
    const offers = sqls.find((s) => /CREATE TABLE IF NOT EXISTS internship_offerings/i.test(s))!;
    // A draft offering cannot accept applications, so the safe default is draft
    // rather than open — a mistyped seed must not open a live intake.
    expect(offers).toMatch(/status VARCHAR\(30\) NOT NULL DEFAULT 'draft'/i);
    expect(apps).toMatch(/status VARCHAR\(30\) NOT NULL DEFAULT 'started'/i);
    expect(INTERNSHIP_OFFERING_STATUSES[0]).toBe('draft');
  });
});

describe('anti-drift vs the Sequelize models', () => {
  // The models and this DDL are two descriptions of one table. When they
  // disagree, reads fail at runtime on a column that does not exist — the exact
  // failure this guard prevents.
  //
  // Columns are read from the model SOURCE rather than by importing the model,
  // because importing runs Model.init() against the mocked database in this
  // file and throws. Static parsing also keeps the guard honest: it sees what
  // the file declares, not what Sequelize resolved at runtime.
  function declaredColumns(modelFile: string): string[] {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const src: string = fs.readFileSync(
      path.join(__dirname, '..', '..', 'models', modelFile),
      'utf8',
    );
    const initBlock = src.slice(src.indexOf('.init('));
    const keys = Array.from(initBlock.matchAll(/^ {4}(\w+): \{/gm)).map((m) => m[1]);
    if (keys.length === 0) throw new Error(`no columns parsed from ${modelFile}`);
    return keys;
  }

  it('creates every column the InternshipApplication model declares', async () => {
    const sqls = await runAndCollect();
    const table = sqls.find((s) => /CREATE TABLE IF NOT EXISTS internship_applications/i.test(s))!;
    const cols = declaredColumns('InternshipApplication.ts');
    expect(cols).toContain('email_normalized'); // parser sanity
    for (const col of cols) {
      expect(table.toLowerCase()).toContain(col.toLowerCase());
    }
  });

  it('creates every column the InternshipOffering model declares', async () => {
    const sqls = await runAndCollect();
    const table = sqls.find((s) => /CREATE TABLE IF NOT EXISTS internship_offerings/i.test(s))!;
    const cols = declaredColumns('InternshipOffering.ts');
    expect(cols).toContain('slug'); // parser sanity
    for (const col of cols) {
      expect(table.toLowerCase()).toContain(col.toLowerCase());
    }
  });
});

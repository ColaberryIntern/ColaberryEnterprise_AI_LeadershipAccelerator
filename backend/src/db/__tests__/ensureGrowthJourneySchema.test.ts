import * as fs from 'fs';
import * as path from 'path';
import { GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import { JourneyProgram } from '../../models/JourneyProgram';
import { JourneyPath, OFFER_FAMILIES, LEARNER_OFFER_FAMILIES } from '../../models/JourneyPath';

/**
 * T201 — the shared Growth Journey foundation schema.
 *
 * Two properties carry the weight here, and neither is about the tables being
 * correct in the abstract:
 *
 *   1. ADDITIVE ONLY. AD-1 settled that Explorer Growth is extended beside
 *      rather than reshaped, so a `DROP`, a retype or a rename appearing in
 *      this SQL is not a style problem, it is the hard stop the run is bounded
 *      by.
 *
 *   2. BOOT ORDER. These tables carry foreign keys to `tenants` and `brands`,
 *      which `ensureMultiTenantSchema` creates. Registered too early they would
 *      reference tables that do not exist — and since each statement is
 *      individually caught, that fails as a console warning at boot rather than
 *      a crash. The tables would simply be absent until something queried them.
 */

const SQL = GROWTH_JOURNEY_STATEMENTS.join('\n');

const serverSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'server.ts'),
  'utf8',
);

describe('the schema is additive, and provably so', () => {
  it('creates only, with IF NOT EXISTS on every statement', () => {
    for (const s of GROWTH_JOURNEY_STATEMENTS) {
      expect(s).toMatch(/IF NOT EXISTS/i);
      expect(s).toMatch(/^\s*CREATE/i);
    }
  });

  it('contains no DROP', () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
  });

  it('contains no ALTER', () => {
    // Not even an additive ALTER. Every column this run needs is on a table it
    // creates itself; an ALTER here would mean it is reaching into someone
    // else's table.
    expect(SQL).not.toMatch(/\bALTER\b/i);
  });

  it('contains no RENAME and no TRUNCATE', () => {
    expect(SQL).not.toMatch(/\bRENAME\b/i);
    expect(SQL).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('touches no explorer_ table', () => {
    // The AD-1 hard stop, asserted rather than trusted.
    expect(SQL).not.toMatch(/explorer_/i);
  });

  it('creates exactly the two tables Phase 1 owns', () => {
    const tables = [...SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map((m) => m[1]);
    expect(tables.sort()).toEqual(['journey_paths', 'journey_programs']);
  });
});

describe('the foreign keys point at the multi-tenant tables', () => {
  it('journey_programs references tenants and brands', () => {
    const programs = GROWTH_JOURNEY_STATEMENTS.find((s) =>
      /CREATE TABLE IF NOT EXISTS journey_programs/i.test(s),
    )!;
    expect(programs).toMatch(/tenant_id UUID NOT NULL REFERENCES tenants\(id\)/i);
    expect(programs).toMatch(/brand_id UUID NOT NULL REFERENCES brands\(id\)/i);
  });

  it('journey_paths references journey_programs', () => {
    const paths = GROWTH_JOURNEY_STATEMENTS.find((s) =>
      /CREATE TABLE IF NOT EXISTS journey_paths/i.test(s),
    )!;
    expect(paths).toMatch(/program_id UUID NOT NULL REFERENCES journey_programs\(id\)/i);
  });

  it('scopes the program slug per BRAND, not per tenant', () => {
    // The `colaberry` tenant holds both colaberry-training and
    // colaberry-enterprise; each may run a program called `learner`. A
    // tenant-scoped unique index would make those collide.
    expect(SQL).toMatch(/journey_programs_brand_slug_unique[\s\S]*?\(brand_id, slug\)/i);
  });

  it('allows one path per offer family per program', () => {
    expect(SQL).toMatch(/journey_paths_program_family_unique[\s\S]*?\(program_id, offer_family\)/i);
  });
});

describe('boot ordering — the criterion that would fail silently', () => {
  it('registers ensureGrowthJourneySchema AFTER ensureMultiTenantSchema', () => {
    const multi = serverSource.indexOf('await ensureMultiTenantSchema()');
    const journey = serverSource.indexOf('await ensureGrowthJourneySchema()');

    expect(multi).toBeGreaterThan(-1);
    expect(journey).toBeGreaterThan(-1);
    expect(journey).toBeGreaterThan(multi);
  });

  it('registers it after the Explorer ensure step too, not beside it', () => {
    // ensureExplorerGrowthSchema runs well before the tenancy tables exist.
    // Landing next to it is the specific mistake this asserts against.
    const explorer = serverSource.indexOf('await ensureExplorerGrowthSchema()');
    const journey = serverSource.indexOf('await ensureGrowthJourneySchema()');
    expect(journey).toBeGreaterThan(explorer);
  });
});

/**
 * The expected column lists are WRITTEN OUT LITERALLY and never derived from
 * `Model.getAttributes()`. `explorerGrowthModels.test.ts` states the reason in
 * its own header: a derived list makes the test assert only that the code
 * equals itself.
 *
 * The comparison is a SET EQUALITY in both directions, not `toContain`. An
 * earlier version of this file looped `expect(sqlBlock).toContain(col)` over
 * the model's attributes, which is one-directional AND substring-based, so it
 * passed under two real drift scenarios: a column present in the SQL but absent
 * from the model, and a deleted `id UUID PRIMARY KEY` line — because
 * `toContain('id')` is satisfied by the `id` inside `tenant_id`. Both are now
 * failures.
 */
const EXPECTED_PROGRAM_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'slug',
  'name',
  'kind',
  'status',
  'description',
  'metadata',
  'created_at',
  'updated_at',
];

const EXPECTED_PATH_COLUMNS = [
  'id',
  'program_id',
  'offer_family',
  'name',
  'status',
  'priority',
  'metadata',
  'created_at',
  'updated_at',
];

/** Column names actually declared by a CREATE TABLE statement. */
function columnsDeclaredIn(table: string): string[] {
  const sqlBlock = GROWTH_JOURNEY_STATEMENTS.find((s) =>
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i').test(s),
  );
  expect(sqlBlock).toBeDefined();

  const body = sqlBlock!.slice(sqlBlock!.indexOf('(') + 1, sqlBlock!.lastIndexOf(')'));
  const NOT_A_COLUMN = /^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK|EXCLUDE)$/i;

  return body
    .split('\n')
    .map((line) => line.trim().match(/^(\w+)\s+\S/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1])
    .filter((word) => !NOT_A_COLUMN.test(word));
}

describe('the models match the SQL, in both directions', () => {
  it('parses the DDL rather than substring-matching it', () => {
    // Non-vacuity tripwire. If the parser silently returned [] every set
    // comparison below would pass against an empty SQL block.
    expect(columnsDeclaredIn('journey_programs').length).toBe(
      EXPECTED_PROGRAM_COLUMNS.length,
    );
    expect(columnsDeclaredIn('journey_paths').length).toBe(EXPECTED_PATH_COLUMNS.length);
  });

  it('journey_programs: SQL declares exactly the expected columns', () => {
    expect(columnsDeclaredIn('journey_programs').sort()).toEqual(
      [...EXPECTED_PROGRAM_COLUMNS].sort(),
    );
  });

  it('journey_programs: JourneyProgram maps exactly the same set', () => {
    expect(Object.keys(JourneyProgram.getAttributes()).sort()).toEqual(
      [...EXPECTED_PROGRAM_COLUMNS].sort(),
    );
  });

  it('journey_paths: SQL declares exactly the expected columns', () => {
    expect(columnsDeclaredIn('journey_paths').sort()).toEqual([...EXPECTED_PATH_COLUMNS].sort());
  });

  it('journey_paths: JourneyPath maps exactly the same set', () => {
    expect(Object.keys(JourneyPath.getAttributes()).sort()).toEqual(
      [...EXPECTED_PATH_COLUMNS].sort(),
    );
  });

  it('the models declare the foreign keys, not only the SQL', () => {
    // The SQL-level assertions above check the DDL text. This checks the model,
    // which is what application code reads — a model missing `references`
    // would otherwise pass every other test in this file.
    const program = JourneyProgram.getAttributes();
    expect((program.tenant_id.references as { model: string }).model).toBe('tenants');
    expect((program.brand_id.references as { model: string }).model).toBe('brands');
    expect(
      (JourneyPath.getAttributes().program_id.references as { model: string }).model,
    ).toBe('journey_programs');
  });

  it('defaults a new program to draft, not active', () => {
    // A program seeded by mistake must not be resolvable as a brand's default
    // until someone activates it deliberately.
    expect(JourneyProgram.getAttributes().status.defaultValue).toBe('draft');
    expect(JourneyPath.getAttributes().status.defaultValue).toBe('draft');
  });
});

describe('the offer families match the spec', () => {
  it('lists exactly eleven', () => {
    // §4 (request.md:264-276). An earlier plan draft said six.
    expect(OFFER_FAMILIES).toHaveLength(11);
    expect(new Set(OFFER_FAMILIES).size).toBe(11);
  });

  it('identifies five learner families, so the AI Flotation denial can enumerate six', () => {
    // business_training plus every learner_* family is six. A draft of the plan
    // named four, which would have let AI Flotation resolve
    // learner_community_subscription while the test stayed green.
    expect(LEARNER_OFFER_FAMILIES).toHaveLength(5);
    expect([...LEARNER_OFFER_FAMILIES, 'business_training']).toHaveLength(6);
    for (const f of LEARNER_OFFER_FAMILIES) expect(f).toMatch(/^learner_/);
  });

  it('offer_family is a plain string column, deliberately not a Postgres enum', () => {
    // The set is expected to grow and a Postgres enum cannot have a value
    // removed. Permitted values are enforced by T202's policy table and its
    // mutation-checked contract test, where the assertion is visible.
    expect(SQL).toMatch(/offer_family VARCHAR\(64\) NOT NULL/i);
    expect(SQL).not.toMatch(/CREATE TYPE/i);
  });
});

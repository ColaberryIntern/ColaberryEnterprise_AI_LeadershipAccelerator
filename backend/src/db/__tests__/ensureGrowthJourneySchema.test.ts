import * as fs from 'fs';
import * as path from 'path';
import { GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import { JourneyProgram } from '../../models/JourneyProgram';
import { JourneyPath } from '../../models/JourneyPath';
import { BrandOfferPolicy } from '../../models/BrandOfferPolicy';
import Brand from '../../models/Brand';
import { GrowthJourneyEnrollment } from '../../models/GrowthJourneyEnrollment';
import {
  OfferFamily,
  OFFER_FAMILIES,
  LEARNER_OFFER_FAMILIES,
} from '../../models/OfferFamily';

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

/**
 * Offset of an ACTIVE occurrence of a boot call — one that is not commented out.
 *
 * A plain `indexOf` matches the text, not the call. An independent review proved
 * it: commenting out the seed invocation while leaving the line in place passed
 * all 40 tests. The shape was inherited from the T201/T202 assertions in this
 * same file, so all four now go through here.
 *
 * The consequence of a disabled boot call is fail-closed — an empty registry,
 * and every brand resolving `program_not_active` — but "fails safe" is not the
 * same as "noticed", and a boot step silently switched off is exactly the kind
 * of thing that stays switched off.
 */
function activeBootCall(needle: string): number {
  let from = 0;
  for (;;) {
    const at = serverSource.indexOf(needle, from);
    if (at === -1) return -1;
    const lineStart = serverSource.lastIndexOf('\n', at) + 1;
    if (!serverSource.slice(lineStart, at).includes('//')) return at;
    from = at + needle.length;
  }
}

describe('the schema is additive, and provably so', () => {
  it('every statement carries IF NOT EXISTS', () => {
    for (const s of GROWTH_JOURNEY_STATEMENTS) {
      expect(s).toMatch(/IF NOT EXISTS/i);
    }
  });

  it('is all CREATE except exactly ONE additive ALTER', () => {
    // T203 needs a column on `brands`, which this run does not own, so the
    // no-ALTER rule narrowed rather than vanished. The count is pinned at one:
    // a second ALTER appearing here is a decision somebody should have to make
    // deliberately, not a line that slides in.
    const alters = GROWTH_JOURNEY_STATEMENTS.filter((s) => /^\s*ALTER/i.test(s));
    const creates = GROWTH_JOURNEY_STATEMENTS.filter((s) => /^\s*CREATE/i.test(s));

    expect(alters).toHaveLength(1);
    expect(creates).toHaveLength(GROWTH_JOURNEY_STATEMENTS.length - 1);
    expect(alters[0]).toMatch(/ALTER\s+TABLE\s+brands\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
  });

  it('contains no DROP', () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
  });

  it('alters nothing except by ADDING one nullable column', () => {
    // AN ALLOWLIST, NOT A BLOCKLIST, and that change came from being caught.
    // The first version of this test excluded the reshaping forms BY NAME -
    // ALTER COLUMN, DROP COLUMN, SET DATA TYPE, SET NOT NULL, ADD CONSTRAINT,
    // DROP CONSTRAINT - and an independent review then walked three statements
    // straight past it: an appended `ADD UNIQUE (slug)`, an appended
    // `ADD CHECK (slug <> '')`, and a `DEFAULT gen_random_uuid()` clause. None
    // of the three is spelled like anything on the list.
    //
    // A blocklist can only refuse what somebody thought of. This is the AD-1
    // hard stop being loosened, so the rule is inverted: every ALTER must match
    // the whole permitted shape end to end. Anything appended to it, and
    // anything extra inside it, fails - including forms nobody has thought of.
    // STRUCTURALLY strict, WHITESPACE tolerant - and that split came from a
    // control that failed. The first version matched literal single spaces
    // between tokens, so a semantically identical statement with one extra
    // space was rejected. That brittleness matters more than it looks: the
    // next person to reformat this DDL would see a red test with no real
    // defect behind it, and the obvious way to make it green again is to
    // loosen the pattern - which is how a rule like this decays back into the
    // blocklist it replaced.
    const PERMITTED =
      /^\s*ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+\w+\s+UUID\s+REFERENCES\s+\w+\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL\s*$/i;

    const alters = GROWTH_JOURNEY_STATEMENTS.filter((x) => /\bALTER\b/i.test(x));
    expect(alters).toHaveLength(1);
    for (const statement of alters) expect(statement).toMatch(PERMITTED);
  });

  it('refuses every reshaping form by name as well, including the unnamed-constraint ones', () => {
    // Kept BESIDE the allowlist rather than replaced by it, for two reasons: a
    // named refusal tells the next person WHY, and this one also covers a CREATE
    // statement that tried to smuggle one of these in, which the ALTER-shaped
    // allowlist above would never inspect.
    //
    // `ADD UNIQUE`, `ADD CHECK`, `ADD PRIMARY KEY` and `ADD FOREIGN KEY` are the
    // unnamed constraint forms. Excluding only `ADD CONSTRAINT` missed all four,
    // because Postgres does not require you to name a constraint to add one.
    for (const form of [
      /ALTER\s+COLUMN/i,
      /DROP\s+COLUMN/i,
      /SET\s+DATA\s+TYPE/i,
      /SET\s+NOT\s+NULL/i,
      /DROP\s+DEFAULT/i,
      /ADD\s+CONSTRAINT/i,
      /DROP\s+CONSTRAINT/i,
      /ADD\s+UNIQUE/i,
      /ADD\s+CHECK/i,
      /ADD\s+PRIMARY\s+KEY/i,
      /ADD\s+FOREIGN\s+KEY/i,
    ]) {
      expect(SQL).not.toMatch(form);
    }
  });

  it('creates no index on a table this run does not own', () => {
    // Y1, and it PREDATES this task: the original T201/T202 block - CREATE-only,
    // IF NOT EXISTS, no ALTER - passed this too, so the hole has been open since
    // the first commit of this run.
    //
    //   CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_uniq ON brands (slug)
    //
    // That statement is CREATE-leading, carries IF NOT EXISTS, contains no
    // ALTER, and is spelled like none of the named refusals above - because a
    // unique constraint does not have to be written `ADD UNIQUE`. Yet it
    // reshapes `brands`, which `ensureMultiTenantSchema` owns, takes a
    // write-blocking lock, and fails outright if duplicate slugs already exist.
    //
    // ADDITIVE IS ABOUT WHAT A STATEMENT DOES, NOT WHAT IT STARTS WITH. Every
    // index this module creates must therefore name a table this module
    // created.
    // T205's table had to be ADDED here before its indexes were accepted, which
    // is this guard working rather than a chore: an index on a table the run
    // does not own is now a deliberate edit, not a line that slides in.
    const RUN_OWNED = [
      'brand_offer_policies',
      'growth_journey_enrollments',
      'journey_paths',
      'journey_programs',
      'offer_families',
    ];

    const indexed = [
      ...SQL.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+\w+\s+ON\s+(\w+)/gi),
    ].map((m) => m[1]);

    // Non-vacuity, two ways: the parse must find every index statement present,
    // and there must be some. A regex that silently matched nothing would
    // otherwise satisfy the loop below.
    const indexStatements = GROWTH_JOURNEY_STATEMENTS.filter((s) => /CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(s));
    expect(indexed).toHaveLength(indexStatements.length);
    expect(indexed.length).toBeGreaterThan(4);

    for (const table of indexed) expect(RUN_OWNED).toContain(table);
  });

  it('the only table this run touches without creating it is brands, by ADD COLUMN alone', () => {
    // States the boundary positively, so the next person adding a statement can
    // see the whole rule in one place rather than inferring it from refusals.
    const created = [...SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map((m) => m[1]);
    const altered = [...SQL.matchAll(/ALTER\s+TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(altered).toEqual(['brands']);
    expect(created).not.toContain('brands');
  });

  it('carries no literal control byte where an escape was meant', () => {
    // 0x08 is what a shell heredoc writes when the source said `\b`. It sits
    // inside a regex looking exactly like a word boundary and silently disables
    // the pattern - which is how the DEFAULT guard below shipped inert and
    // passed 35 of 35. The repo rule is never to write source through a
    // heredoc; this is the assertion that notices when it happened anyway.
    const source = fs.readFileSync(path.join(__dirname, 'ensureGrowthJourneySchema.test.ts'), 'utf8');
    for (const ch of ['\u0007', '\u0008', '\u000b', '\u000c', '\u001b']) {
      expect(source).not.toContain(ch);
    }
  });

  it('the added column is NULLABLE and carries no DEFAULT', () => {
    // A NOT NULL or defaulted column would rewrite every existing `brands` row
    // - which is a migration with a table lock, not an additive ensure step.
    const alter = GROWTH_JOURNEY_STATEMENTS.find((s) => /\bALTER\b/i.test(s))!;
    expect(alter).not.toMatch(/\bNOT NULL\b/i);
    // `\bDEFAULT\b`, not `/DEFAULT/`: the column is CALLED
    // `default_journey_program_id`, so the bare pattern matched the column name
    // itself - the same substring trap as `toContain('id')` matching `tenant_id`.
    expect(alter).not.toMatch(/\bDEFAULT\b/i);
  });

  it('the brands column CLEARS rather than cascades when a program is deleted', () => {
    // ON DELETE CASCADE here would mean deleting a journey programme deleted
    // its brand, and every lead, domain and policy hanging off it.
    const alter = GROWTH_JOURNEY_STATEMENTS.find((s) => /\bALTER\b/i.test(s))!;
    // `\s+` at every seam, same reasoning as the allowlist: these can only
    // produce a FALSE POSITIVE, never let a defect through - and a red test
    // with no defect behind it is what tempts the next person to loosen the
    // rule until it stops refusing anything.
    expect(alter).toMatch(/REFERENCES\s+journey_programs\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i);
    expect(alter).not.toMatch(/ON DELETE CASCADE/i);
  });

  it('contains no RENAME and no TRUNCATE', () => {
    expect(SQL).not.toMatch(/\bRENAME\b/i);
    expect(SQL).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('touches no explorer_ table', () => {
    // The AD-1 hard stop, asserted rather than trusted.
    expect(SQL).not.toMatch(/explorer_/i);
  });

  it('creates exactly the five tables Phase 1 owns so far', () => {
    // An explicit list rather than a count. T203 adds a column to `brands` and
    // T205 adds `growth_journey_enrollments`, so this list will grow again -
    // the assertion exists to catch a table nobody meant to add, and a count
    // would not distinguish the two.
    const tables = [...SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map((m) => m[1]);
    expect(tables.sort()).toEqual([
      'brand_offer_policies',
      'growth_journey_enrollments',
      'journey_paths',
      'journey_programs',
      'offer_families',
    ]);
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

  it('brand_offer_policies references tenants and brands', () => {
    const policies = GROWTH_JOURNEY_STATEMENTS.find((s) =>
      /CREATE TABLE IF NOT EXISTS brand_offer_policies/i.test(s),
    )!;
    expect(policies).toMatch(/tenant_id UUID NOT NULL REFERENCES tenants\(id\)/i);
    expect(policies).toMatch(/brand_id UUID NOT NULL REFERENCES brands\(id\)/i);
  });

  it('scopes the offer-family catalog slug GLOBALLY, unlike brands', () => {
    // brands.slug is unique per tenant. The offer vocabulary is deliberately
    // shared, because comparing what different brands may offer is the point of
    // the policy table - a per-tenant catalog would make ai_consulting a
    // different thing per tenant and the comparison meaningless.
    expect(SQL).toMatch(/offer_families_slug_unique[\s\S]*?\(slug\)/i);
    expect(SQL).not.toMatch(/offer_families_slug_unique[\s\S]*?\(tenant_id, slug\)/i);
  });

  it('allows one policy per brand per offer family', () => {
    expect(SQL).toMatch(/brand_offer_policies_brand_family_unique[\s\S]*?\(brand_id, offer_family\)/i);
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
    const multi = activeBootCall('await ensureMultiTenantSchema()');
    const journey = activeBootCall('await ensureGrowthJourneySchema()');

    expect(multi).toBeGreaterThan(-1);
    expect(journey).toBeGreaterThan(-1);
    expect(journey).toBeGreaterThan(multi);
  });

  it('seeds the offer policy AFTER the tables it writes to are ensured', () => {
    // T202. Seeding first is not a crash - every write is individually caught -
    // so it would surface as warnings and an EMPTY policy table, which then
    // denies every brand every family because the resolver fails closed. Safe,
    // silent, and wrong.
    const ensure = activeBootCall('await ensureGrowthJourneySchema()');
    const seed = activeBootCall('await seedBrandOfferPolicy()');
    expect(ensure).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(ensure);
  });

  it('seeds journey programs AFTER the tables AND after the offer policy', () => {
    // T212. The table dependency is the hard one - `journey_programs` and
    // `journey_paths` must exist - and, as with the policy seed, getting it
    // wrong is not a crash: every write is individually caught, so it would
    // surface as warnings and an empty registry, which then makes every brand
    // default resolve nothing. Safe, silent, and wrong.
    //
    // The policy ordering is not a database dependency (paths are derived from
    // compile-time definitions, not from policy ROWS) but it is asserted anyway
    // so the two steps stay readable in the order that shows section 4
    // governing section 5.
    const ensure = activeBootCall('await ensureGrowthJourneySchema()');
    const policy = activeBootCall('await seedBrandOfferPolicy()');
    const programs = activeBootCall('await seedJourneyPrograms()');

    expect(ensure).toBeGreaterThan(-1);
    expect(policy).toBeGreaterThan(-1);
    expect(programs).toBeGreaterThan(-1);
    expect(programs).toBeGreaterThan(ensure);
    expect(programs).toBeGreaterThan(policy);
  });

  it('registers it after the Explorer ensure step too, not beside it', () => {
    // ensureExplorerGrowthSchema runs well before the tenancy tables exist.
    // Landing next to it is the specific mistake this asserts against.
    const explorer = activeBootCall('await ensureExplorerGrowthSchema()');
    const journey = activeBootCall('await ensureGrowthJourneySchema()');
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

const EXPECTED_OFFER_FAMILY_COLUMNS = [
  'id',
  'slug',
  'name',
  'status',
  'description',
  'metadata',
  'created_at',
  'updated_at',
];

const EXPECTED_POLICY_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'offer_family',
  'decision',
  'status',
  'effective_from',
  'effective_to',
  'approved_landing_pages',
  'approved_claims',
  'content_collections',
  'approved_ctas',
  'conversion_events',
  'required_approvals',
  'notes',
  'created_at',
  'updated_at',
];

const EXPECTED_ENROLLMENT_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'program_id',
  'path_id',
  'subject_ref',
  'lead_id',
  'enrollment_id',
  'status',
  'source',
  'enrolled_at',
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
    expect(columnsDeclaredIn('offer_families').length).toBe(
      EXPECTED_OFFER_FAMILY_COLUMNS.length,
    );
    expect(columnsDeclaredIn('brand_offer_policies').length).toBe(
      EXPECTED_POLICY_COLUMNS.length,
    );
    expect(columnsDeclaredIn('growth_journey_enrollments').length).toBe(
      EXPECTED_ENROLLMENT_COLUMNS.length,
    );
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

  it('every column the DDL ADDS to an existing table is declared on its model', () => {
    // The bug this exists to prevent actually happened in this repo, on the
    // tenancy columns: the DDL added them, every service read and wrote them,
    // and no model declared them - so Sequelize, which only ever touches
    // attributes a model knows about, silently returned undefined and dropped
    // every write. Green tests throughout.
    // `ensureMultiTenantSchema.modelParity.test.ts` carries the full account;
    // that test parses only ITS OWN statement list, so this module needs its own.
    const rx = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi;
    const added = [...SQL.matchAll(rx)].map((m) => ({ table: m[1], column: m[2] }));

    // Non-vacuity: an empty parse would satisfy the loop below.
    expect(added).toEqual([{ table: 'brands', column: 'default_journey_program_id' }]);

    const byTable: Record<string, string[]> = {
      brands: Object.keys(Brand.getAttributes()),
    };
    for (const { table, column } of added) {
      expect(byTable[table]).toBeDefined();
      expect(byTable[table]).toContain(column);
    }
  });

  it('the added brands column points at journey_programs on the MODEL too', () => {
    const attr = Brand.getAttributes().default_journey_program_id;
    expect(attr).toBeDefined();
    expect((attr.references as { model: string }).model).toBe('journey_programs');
    expect(attr.allowNull).toBe(true);
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

  it('offer_families: SQL and model agree on the same expected set', () => {
    expect(columnsDeclaredIn('offer_families').sort()).toEqual(
      [...EXPECTED_OFFER_FAMILY_COLUMNS].sort(),
    );
    expect(Object.keys(OfferFamily.getAttributes()).sort()).toEqual(
      [...EXPECTED_OFFER_FAMILY_COLUMNS].sort(),
    );
  });

  it('brand_offer_policies: SQL and model agree on the same expected set', () => {
    expect(columnsDeclaredIn('brand_offer_policies').sort()).toEqual(
      [...EXPECTED_POLICY_COLUMNS].sort(),
    );
    expect(Object.keys(BrandOfferPolicy.getAttributes()).sort()).toEqual(
      [...EXPECTED_POLICY_COLUMNS].sort(),
    );
  });

  it('growth_journey_enrollments: SQL and model agree on the same expected set', () => {
    expect(columnsDeclaredIn('growth_journey_enrollments').sort()).toEqual(
      [...EXPECTED_ENROLLMENT_COLUMNS].sort(),
    );
    expect(Object.keys(GrowthJourneyEnrollment.getAttributes()).sort()).toEqual(
      [...EXPECTED_ENROLLMENT_COLUMNS].sort(),
    );
  });

  it('every index NAMED _unique is DECLARED UNIQUE — and vice versa', () => {
    // A mutation that changed `CREATE UNIQUE INDEX` to `CREATE INDEX` on the
    // backfill's idempotency key passed all 75 tests, because the assertion
    // below matched the index NAME and its columns and never the keyword. A
    // non-unique index called `..._unique` is the worst kind of lie: every
    // reader trusts the name, and duplicates land anyway. This is inherited -
    // all five `_unique` indexes in this module were asserted the same way - so
    // it is closed for all of them at once, both directions.
    const declaredUnique = [...SQL.matchAll(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi)].map(
      (m) => m[1],
    );
    const namedUnique = [...SQL.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+_unique)\b/gi)].map(
      (m) => m[1],
    );

    // Non-vacuity: there are five today, and a parse that found none would
    // satisfy both loops below.
    expect(declaredUnique.length).toBeGreaterThanOrEqual(5);
    expect(namedUnique.length).toBeGreaterThanOrEqual(5);

    for (const name of namedUnique) expect(declaredUnique).toContain(name);
    for (const name of declaredUnique) expect(name).toMatch(/_unique$/);
  });

  it('the backfill idempotency key is a UNIQUE index, not an application check', () => {
    // A backfill over 217 rows that checked "have we done this already?" in
    // application code would lose to a concurrent run - two boots, or a boot and
    // a manual invocation - and produce duplicate participations that every
    // later count would report as real.
    expect(SQL).toMatch(
      /growth_journey_enrollments_program_subject_unique[\s\S]*?\(program_id, subject_ref\)/i,
    );
  });

  it('growth_journey_enrollments does NOT foreign-key enrollment_id', () => {
    // Deliberate: Explorer profiles are keyed on the enrollment id and the
    // backfill reads them, so a hard FK would make this table's integrity depend
    // on a row another system may archive. Asserted so the absence reads as a
    // decision rather than an oversight.
    const stmt = GROWTH_JOURNEY_STATEMENTS.find((x) =>
      /CREATE TABLE IF NOT EXISTS growth_journey_enrollments/i.test(x),
    )!;
    expect(stmt).toMatch(/enrollment_id UUID,/);
    expect(stmt).not.toMatch(/enrollment_id UUID[^,]*REFERENCES/i);
    // The FKs it DOES carry.
    expect(stmt).toMatch(/program_id UUID NOT NULL REFERENCES journey_programs\(id\)/i);
    expect(stmt).toMatch(/path_id UUID REFERENCES journey_paths\(id\) ON DELETE SET NULL/i);
  });

  it('brand_offer_policies carries all EIGHT attributes §4:278 requires', () => {
    // Named individually. Cycle 2 of the plan enumerated six and dropped the
    // last two, so a set comparison against a list I wrote is not enough - each
    // one is asserted by name.
    const cols = columnsDeclaredIn('brand_offer_policies');
    expect(cols).toContain('status');
    expect(cols).toContain('effective_from');
    expect(cols).toContain('effective_to');
    expect(cols).toContain('approved_landing_pages');
    expect(cols).toContain('approved_claims');
    expect(cols).toContain('content_collections');
    expect(cols).toContain('approved_ctas');
    expect(cols).toContain('conversion_events');
    expect(cols).toContain('required_approvals');
  });

  it('every approved-content column defaults to an empty array, never null', () => {
    // A caller reading the list must never have to distinguish "nothing
    // approved" from "column not set" - one of those two readings eventually
    // gets treated as unrestricted.
    const policies = GROWTH_JOURNEY_STATEMENTS.find((s) =>
      /CREATE TABLE IF NOT EXISTS brand_offer_policies/i.test(s),
    )!;
    for (const col of [
      'approved_landing_pages',
      'approved_claims',
      'content_collections',
      'approved_ctas',
      'conversion_events',
      'required_approvals',
    ]) {
      // `\\[` and not `\[`: inside a template literal `\[` collapses to `[`,
      // which makes the pattern an EMPTY CHARACTER CLASS that matches nothing —
      // so this assertion failed against DDL that was already correct.
      expect(policies).toMatch(new RegExp(`${col} JSONB NOT NULL DEFAULT '\\[\\]'::jsonb`));
    }
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

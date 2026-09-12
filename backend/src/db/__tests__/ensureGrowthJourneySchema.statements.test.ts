import * as fs from 'fs';
import * as path from 'path';
import { GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import { SQL } from './helpers/growthJourneyDdl';
import { activeBootCall } from './helpers/bootCalls';

/**
 * T201 — the shared Growth Journey foundation schema: THE STATEMENTS.
 *
 * Split from a single 690-line file in Phase 2 (T222), which put it over the
 * repo's 500-line ceiling; this half holds every assertion about the SQL text
 * itself and the boot order. `ensureGrowthJourneySchema.parity.test.ts` holds
 * the model↔DDL column parity. Not one assertion was dropped in the split — the
 * `it(` count before equals the count across both files after.
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

/** Every file whose bytes the control-byte tripwire scans. */
const SCHEMA_TEST_FAMILY = [
  __filename,
  path.join(__dirname, 'ensureGrowthJourneySchema.parity.test.ts'),
  path.join(__dirname, 'ensureGrowthJourneySchema.phase2.test.ts'),
  path.join(__dirname, 'helpers', 'growthJourneyDdl.ts'),
  path.join(__dirname, 'helpers', 'bootCalls.ts'),
  path.join(__dirname, '..', 'ensureGrowthJourneySchema.ts'),
];

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
      'growth_journey_classifications',
      'growth_journey_enrollments',
      'growth_journey_transitions',
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
    // Scans this file, its sibling, the helpers and the DDL module itself — the
    // split must not leave any of the family outside the tripwire.
    for (const file of SCHEMA_TEST_FAMILY) {
      const source = fs.readFileSync(file, 'utf8');
      for (const ch of ['\u0007', '\u0008', '\u000b', '\u000c', '\u001b']) {
        expect(source).not.toContain(ch);
      }
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

  it('creates exactly the seven tables the run owns so far (five from Phase 1, two from Phase 2)', () => {
    // An explicit list rather than a count. The assertion exists to catch a
    // table nobody meant to add, and a count would not distinguish the two.
    // Phase 2 (T222) added classifications and transitions; decisions is
    // Phase 3's and handoffs Phase 4's, so their absence here is deliberate.
    const tables = [...SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map((m) => m[1]);
    expect(tables.sort()).toEqual([
      'brand_offer_policies',
      'growth_journey_classifications',
      'growth_journey_enrollments',
      'growth_journey_transitions',
      'journey_paths',
      'journey_programs',
      'offer_families',
    ]);
  });

  it('the brands ALTER is the LAST statement, as its own comment claims', () => {
    // The DDL comment says "placed last so journey_programs exists before the
    // foreign key names it". Until Phase 2 nothing enforced that; adding two
    // tables after it would have made the comment false without any test
    // noticing. A comment that states a property is a test somebody owes.
    const last = GROWTH_JOURNEY_STATEMENTS[GROWTH_JOURNEY_STATEMENTS.length - 1];
    expect(last).toMatch(/^\s*ALTER\s+TABLE\s+brands\b/i);
    const alterCount = GROWTH_JOURNEY_STATEMENTS.filter((x) => /^\s*ALTER\b/i.test(x)).length;
    expect(alterCount).toBe(1);
  });

  it('the Phase 2 tables are append-only in the DDL: no updated_at column', () => {
    // §6.4: classifications and transitions are append-only. The absence of an
    // updated_at column is the structural half of that; the tests under
    // services/growthJourney assert the behavioural half (no .update/.destroy).
    for (const table of ['growth_journey_classifications', 'growth_journey_transitions']) {
      const stmt = GROWTH_JOURNEY_STATEMENTS.find((x) =>
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i').test(x),
      );
      expect(stmt).toBeDefined();
      expect(stmt).toMatch(/created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/i);
      expect(stmt).not.toMatch(/updated_at/i);
    }
    // Control: the enrollments table, which IS updatable, does carry one.
    const enrollments = GROWTH_JOURNEY_STATEMENTS.find((x) =>
      /CREATE TABLE IF NOT EXISTS growth_journey_enrollments\b/i.test(x),
    );
    expect(enrollments).toMatch(/updated_at/i);
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

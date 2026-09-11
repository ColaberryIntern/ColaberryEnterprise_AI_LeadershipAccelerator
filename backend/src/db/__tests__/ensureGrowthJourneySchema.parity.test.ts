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
import { SQL, columnsDeclaredIn } from './helpers/growthJourneyDdl';

/**
 * T201 — the shared Growth Journey foundation schema: MODEL ↔ DDL PARITY.
 *
 * The other half of the file split in Phase 2 (T222); see
 * `ensureGrowthJourneySchema.statements.test.ts` for the statement-text and
 * boot-order assertions. `columnsDeclaredIn` moved to `helpers/growthJourneyDdl.ts`
 * so the Phase 2 parity tests can use the same parser.
 */

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

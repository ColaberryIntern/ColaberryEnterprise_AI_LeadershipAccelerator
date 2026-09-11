import { MARKETING_CAMPAIGN_SCHEMA_STATEMENTS } from '../ensureMarketingCampaignSchema';
import { modelsByTable, modelColumnNames, parseAddedColumns } from './schemaParityHelpers';
import '../../models';

/**
 * Schema/model parity for the campaign planning + taxonomy columns.
 *
 * This one is higher-stakes than the tracked-links parity test, and in the opposite
 * direction. `tracked_links` is a brand-new table, so a mismatch means a feature does not
 * work. `campaigns` is a LIVE table with production rows, and Sequelize emits every declared
 * attribute in every SELECT — so a column declared on the model but missing in the database
 * does not degrade the marketing feature, it makes **every campaign read in the product**
 * fail at the database. The blast radius is the existing system, not the new one.
 *
 * Needs no database: it compares the DDL text against the model definition directly.
 */

describe('ensureMarketingCampaignSchema — DDL and model agree', () => {
  const added = parseAddedColumns(MARKETING_CAMPAIGN_SCHEMA_STATEMENTS);

  it('pins the exact set of columns the DDL adds', () => {
    // Pinned as a set, not a count. Following caseStudyModelParity.test.ts, which pins its
    // total exactly rather than asserting a lower bound — a loose guard lets a column be
    // dropped from both DDL and model without anything noticing.
    expect(added.map((a) => a.table)).toEqual(Array(10).fill('campaigns'));
    expect(added.map((a) => a.column).sort()).toEqual([
      'approver_admin_id',
      'archived_at',
      'archived_reason',
      'funnel_stage',
      'goals_json',
      'owner_admin_id',
      'parent_campaign_id',
      'planned_end_at',
      'planned_start_at',
      'utm_campaign_slug',
    ]);
  });

  it('every added column is declared on the Campaign model', () => {
    const model = modelsByTable()['campaigns'];
    expect(model).toBeDefined();
    const mapped = modelColumnNames(model);
    const missing = added.filter((a) => !mapped.has(a.column)).map((a) => a.column);
    // A failure here means the column exists in Postgres but is invisible to the ORM:
    // reads return undefined and writes are silently dropped.
    expect(missing).toEqual([]);
  });

  it('the DDL is additive only — no DROP, RENAME, retype, or NOT NULL on a live table', () => {
    // `campaigns` carries production rows. Any of these would be a destructive migration
    // dressed up as a boot-time ensure.
    const joined = MARKETING_CAMPAIGN_SCHEMA_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME/);
    expect(joined).not.toMatch(/ALTER\s+COLUMN/);
    expect(joined).not.toMatch(/SET\s+NOT\s+NULL/);
    // The form the other five guards all missed: NOT NULL applied at ADD COLUMN time, which
    // Postgres rejects outright on a populated table unless a DEFAULT comes with it - and if
    // one does, it rewrites every row. `IF NOT EXISTS` does not match this pattern, because
    // that phrase is NOT EXISTS, never NOT NULL.
    expect(joined).not.toMatch(/ADD\s+COLUMN[^\n]*NOT\s+NULL/);
    // Proves the guard above can still fail. A regex that quietly stops matching reads exactly
    // like a clean result.
    expect('ALTER TABLE T ADD COLUMN IF NOT EXISTS C TEXT NOT NULL').toMatch(
      /ADD\s+COLUMN[^\n]*NOT\s+NULL/,
    );
    expect(joined).not.toMatch(/TRUNCATE|DELETE\s+FROM|UPDATE\s+CAMPAIGNS/);
  });

  it('every statement is idempotent', () => {
    for (const sql of MARKETING_CAMPAIGN_SCHEMA_STATEMENTS) {
      expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
    }
  });

  it('the utm slug index is unique, per-tenant, and partial', () => {
    // - unique: the slug is the stable tracking identity; a collision merges two campaigns'
    //   clicks, sessions and leads into one bucket that cannot be untangled afterwards
    // - per-tenant: separate legal entities may both legitimately run `spring-openhouse`
    // - partial: NOT because NULLs would collide — Postgres treats NULLs as distinct in a
    //   unique index, so a non-partial index would build fine over an all-NULL column. It is
    //   partial for index size, explicit intent, and independence from NULL-distinctness
    //   semantics (which `NULLS NOT DISTINCT`, PG15+, exists to change).
    const idx = MARKETING_CAMPAIGN_SCHEMA_STATEMENTS.find((s) =>
      s.includes('campaigns_tenant_utm_slug_unique'),
    );
    expect(idx).toBeDefined();
    expect(idx).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(idx).toMatch(/\(\s*tenant_id\s*,\s*utm_campaign_slug\s*\)/);
    expect(idx).toMatch(/WHERE\s+utm_campaign_slug\s+IS\s+NOT\s+NULL/i);
  });
});

describe('Campaign model — every column is mapped by .init()', () => {
  /**
   * WHAT THIS SUITE DOES AND DOES NOT PROVE — stated plainly, because an earlier version of
   * this comment claimed a guarantee it cannot deliver.
   *
   * It asserts that each column is a MAPPED SEQUELIZE ATTRIBUTE, which comes from `.init()`.
   * That is worth asserting: an attribute missing from `.init()` is invisible to the ORM, so
   * reads return undefined and writes are silently dropped.
   *
   * It does **not** prove the `declare`-block half of the fix. `declare` emits no runtime
   * property — it is type-level only — and `getAttributes()` is populated by `.init()`
   * regardless. So these assertions pass identically with or without
   * `declare capability_id` / `declare mode_override`. Nor could any test in this directory
   * prove it: `tsconfig.json` excludes the `__tests__` directory and every `.test.ts` file,
   * and ts-jest runs with `isolatedModules`, so test files are never type-checked by any
   * gate. (Glob patterns are spelled out in words here on purpose: writing them literally
   * puts a `*` immediately before a `/`, which closes this comment block early. That exact
   * mistake broke this suite once already.)
   *
   * The `declare` fix is proven instead by `tsc --noEmit` over real compiled source: the
   * `(c as any)` casts in `services/autonomousRequirementExpansionService.ts`,
   * `routes/projectRoutes.ts` and `routes/admin/campaignRoutes.ts` were removed in the same
   * task, so those files now read `c.mode_override` / `c.capability_id` through the typed
   * model. Delete either `declare` line and the backend typecheck fails with TS2339.
   */
  const MUST_BE_READABLE = [
    'capability_id',
    'mode_override',
    'funnel_stage',
    'owner_admin_id',
    'approver_admin_id',
    'planned_start_at',
    'planned_end_at',
    'utm_campaign_slug',
    'goals_json',
    'parent_campaign_id',
    'archived_at',
    'archived_reason',
  ];

  it.each(MUST_BE_READABLE)('campaigns.%s is a mapped model column', (column) => {
    const model = modelsByTable()['campaigns'];
    expect(modelColumnNames(model).has(column)).toBe(true);
  });

  it('keeps the legacy free-text `goals` column alongside typed `goals_json`', () => {
    // goals_json is additive. Repurposing or dropping `goals` would silently discard prose
    // that existing campaigns still carry.
    const mapped = modelColumnNames(modelsByTable()['campaigns']);
    expect(mapped.has('goals')).toBe(true);
    expect(mapped.has('goals_json')).toBe(true);
  });

  it('does not confuse planned dates with actuals', () => {
    // started_at/completed_at are ACTUALS and must survive; pacing needs both pairs.
    const mapped = modelColumnNames(modelsByTable()['campaigns']);
    for (const c of ['started_at', 'completed_at', 'planned_start_at', 'planned_end_at']) {
      expect(mapped.has(c)).toBe(true);
    }
  });

  it('does not confuse the required approver with the recorded approver', () => {
    const mapped = modelColumnNames(modelsByTable()['campaigns']);
    expect(mapped.has('approver_admin_id')).toBe(true); // who must approve
    expect(mapped.has('approved_by')).toBe(true); // who did approve
  });
});

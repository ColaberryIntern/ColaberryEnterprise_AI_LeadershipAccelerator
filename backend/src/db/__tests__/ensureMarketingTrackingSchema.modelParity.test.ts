import { MARKETING_TRACKING_SCHEMA_STATEMENTS } from '../ensureMarketingTrackingSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
import '../../models';

/**
 * Schema/model parity for tracked_links and link_clicks.
 *
 * THE BUG THIS EXISTS TO PREVENT — it already happened once in this repo, on the tenancy
 * columns: the DDL added columns, every service was written to read and write them, and
 * no Sequelize model declared them. Sequelize only ever touches attributes a model knows
 * about, so reads returned `undefined` and `update({ ... })` silently dropped the write
 * while reporting success. Every unit test passed, because they all mock the models.
 *
 * The same failure here would be worse in one specific way: a dropped write on
 * `link_clicks` loses a click permanently. There is no second source to reconcile against
 * — the click already happened and the visitor is gone.
 *
 * This test needs no database. It parses the DDL and compares it directly against the
 * model definitions, which are the two sources of truth.
 */

describe('ensureMarketingTrackingSchema — every created column is declared on its model', () => {
  const created = parseCreatedTables(MARKETING_TRACKING_SCHEMA_STATEMENTS);

  it('the DDL actually creates the two tables (guards a silently-empty parse)', () => {
    // If the parser ever stops matching, every assertion below would vacuously pass.
    const tables = created.map((c) => c.table).sort();
    expect(tables).toEqual(['link_clicks', 'tracked_links']);
  });

  it('pins the exact column count per table', () => {
    // Pinned rather than `> 10`, following caseStudyModelParity.test.ts which pins its DDL
    // total exactly. A loose bound lets a column be deleted from BOTH the DDL and the model
    // without any test noticing — `visitor_fingerprint`, `bot_reason`, `placement_id` and
    // `user_agent` are not in the REQUIRED list below and would have vanished silently.
    // Changing these numbers is fine; doing it without meaning to is what this catches.
    const counts = Object.fromEntries(created.map((c) => [c.table, c.columns.length]));
    expect(counts).toEqual({ tracked_links: 24, link_clicks: 19 });
  });

  it('every created table has a registered Sequelize model', () => {
    const byTable = modelsByTable();
    const unknown = created.map((c) => c.table).filter((t) => !byTable[t]);
    expect(unknown).toEqual([]);
  });

  it('every created column is declared as a model attribute', () => {
    const byTable = modelsByTable();
    const missing: string[] = [];

    for (const { table, columns } of created) {
      const model = byTable[table];
      if (!model) continue; // reported by the test above
      const mapped = modelColumnNames(model);
      for (const column of columns) {
        if (!mapped.has(column)) {
          missing.push(`${table}.${column} (model ${model.name})`);
        }
      }
    }

    // A failure here means the column exists in Postgres but is invisible to the ORM:
    // reads return undefined and writes are silently dropped.
    expect(missing).toEqual([]);
  });

  it('declares no model attribute that the DDL will not create', () => {
    // The inverse direction. A model attribute with no column produces a runtime error on
    // the first insert, in production, at the moment a real person clicks a real link.
    const byTable = modelsByTable();
    const extra: string[] = [];

    for (const { table, columns } of created) {
      const model = byTable[table];
      if (!model) continue;
      const ddl = new Set(columns);
      for (const field of modelColumnNames(model)) {
        if (!ddl.has(field)) extra.push(`${table}.${field}`);
      }
    }

    expect(extra).toEqual([]);
  });
});

describe('the tracking columns the redirect and attribution actually depend on', () => {
  /**
   * Named explicitly rather than derived, so deleting a column from the DDL cannot quietly
   * make this suite pass by leaving nothing to check.
   */
  const REQUIRED: Array<[string, string[]]> = [
    ['tracked_links', [
      'id', 'tenant_id', 'brand_id', 'campaign_id', 'short_code', 'destination_url',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'status', 'published_at', 'superseded_by', 'first_click_at', 'last_click_at',
    ]],
    ['link_clicks', [
      'tracked_link_id', 'occurred_at', 'ip_hash', 'is_bot',
      'fbclid', 'gclid', 'msclkid', 'ttclid', 'click_ids',
    ]],
  ];

  it.each(REQUIRED)('%s declares its tracking attributes', (table, columns) => {
    const model = modelsByTable()[table];
    expect(model).toBeDefined();
    const attrs = Object.keys(model.getAttributes());
    for (const column of columns) expect(attrs).toContain(column);
  });

  it('link_clicks stores a hashed IP and never a raw address column', () => {
    // Privacy invariant, asserted rather than left to review: qrRedirectRoutes already
    // hashes, and this table must not quietly become the place raw IPs live.
    const attrs = Object.keys(modelsByTable()['link_clicks'].getAttributes());
    expect(attrs).toContain('ip_hash');
    expect(attrs).not.toContain('ip_address');
    expect(attrs).not.toContain('ip');
  });

  it('tracked_links can express supersession, so published attribution is never rewritten', () => {
    const attrs = Object.keys(modelsByTable()['tracked_links'].getAttributes());
    expect(attrs).toContain('superseded_by');
    expect(attrs).toContain('published_at');
  });
});

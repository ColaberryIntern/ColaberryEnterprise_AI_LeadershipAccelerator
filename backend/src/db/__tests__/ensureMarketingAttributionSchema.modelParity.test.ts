import { MARKETING_ATTRIBUTION_SCHEMA_STATEMENTS } from '../ensureMarketingAttributionSchema';
import { modelsByTable, modelColumnNames, parseAddedColumns } from './schemaParityHelpers';
import { FIRST_TOUCH_FIELDS } from '../../modules/tenancy/leadContextService';
import '../../models';

/**
 * Schema/model parity for the attribution columns added to `visitor_sessions`.
 *
 * Higher stakes than a new table, in the same way T002's campaign columns were: Sequelize
 * emits every DECLARED attribute in every SELECT, so a column the model declares and the
 * database lacks does not degrade the new feature — it makes **every visitor-session read in
 * the product** fail at the database. The blast radius is the existing tracker.
 */

describe('ensureMarketingAttributionSchema — DDL and model agree', () => {
  const added = parseAddedColumns(MARKETING_ATTRIBUTION_SCHEMA_STATEMENTS);

  it('pins the exact set of columns added', () => {
    expect(added.map((a) => a.table)).toEqual(Array(7).fill('visitor_sessions'));
    expect(added.map((a) => a.column).sort()).toEqual([
      'click_ids', 'fbclid', 'gclid', 'msclkid', 'ttclid', 'utm_content', 'utm_term',
    ]);
  });

  it('every added column is declared on the VisitorSession model', () => {
    const model = modelsByTable()['visitor_sessions'];
    expect(model).toBeDefined();
    const mapped = modelColumnNames(model);
    expect(added.filter((a) => !mapped.has(a.column)).map((a) => a.column)).toEqual([]);
  });

  it('is additive only — no destructive statement against a live table', () => {
    const joined = MARKETING_ATTRIBUTION_SCHEMA_STATEMENTS.join('\n').toUpperCase();
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
    expect(joined).not.toMatch(/TRUNCATE|DELETE\s+FROM|UPDATE\s+VISITOR_SESSIONS/);
  });

  it('every statement is idempotent', () => {
    for (const sql of MARKETING_ATTRIBUTION_SCHEMA_STATEMENTS) {
      expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
    }
  });

  it('the click-ID indexes are PARTIAL', () => {
    // Nearly every session is organic and carries no click ID. Indexing those rows costs
    // write throughput on a high-write table for nothing; the reconciliation query only ever
    // looks at the small subset that has one.
    for (const id of ['fbclid', 'gclid', 'msclkid', 'ttclid']) {
      const idx = MARKETING_ATTRIBUTION_SCHEMA_STATEMENTS.find((s) => s.includes(`idx_visitor_sessions_${id}`));
      expect(idx).toBeDefined();
      expect(idx).toMatch(new RegExp(`WHERE\\s+${id}\\s+IS\\s+NOT\\s+NULL`, 'i'));
    }
  });
});

describe('the columns paid reconciliation depends on', () => {
  it('visitor_sessions can now hold all four adopted click IDs', () => {
    // None of these was ever a COLUMN before, and none was ever persisted. Every paid click
    // arrived carrying one and every one was dropped, which is why an ad platform's click
    // could never be reconciled against our conversion.
    //
    // Precisely: `gclid` and `fbclid` did appear at the base commit, in
    // `schemas/publicCaseStudySchema.ts`, as examples of query keys that are deliberately
    // IGNORED. An earlier version of this comment said they appeared "nowhere in the
    // codebase", which was wrong in the direction that flatters the change.
    const mapped = modelColumnNames(modelsByTable()['visitor_sessions']);
    for (const c of ['fbclid', 'gclid', 'msclkid', 'ttclid']) expect(mapped.has(c)).toBe(true);
  });

  it('utm_term and utm_content are real columns, not JSONB', () => {
    // They were already being validated at the ingest boundary and then packed into
    // strapi_attribution, where nothing could query them - the system asked for the data,
    // confirmed it was well-formed, and put it somewhere unreadable.
    const mapped = modelColumnNames(modelsByTable()['visitor_sessions']);
    expect(mapped.has('utm_term')).toBe(true);
    expect(mapped.has('utm_content')).toBe(true);
  });

  it('keeps the original three UTM columns', () => {
    const mapped = modelColumnNames(modelsByTable()['visitor_sessions']);
    for (const c of ['utm_source', 'utm_medium', 'utm_campaign']) expect(mapped.has(c)).toBe(true);
  });
});

describe('the write-once first-touch doctrine is untouched', () => {
  /**
   * `leadContextService` states the rule: first-touch fields are WRITE-ONCE, last-touch fields
   * are freely updated. Session-level attribution is a DIFFERENT thing - each visit records
   * its own - and this task must not blur the two.
   *
   * Pinned explicitly because the failure would be silent: if a later change routed session
   * attribution into the first-touch set, a returning visitor's second campaign would overwrite
   * the campaign that originally acquired them, and the lead's origin would be quietly
   * rewritten with no error anywhere.
   */
  it('adds no session attribution field to FIRST_TOUCH_FIELDS', () => {
    const added = ['utm_term', 'utm_content', 'fbclid', 'gclid', 'msclkid', 'ttclid', 'click_ids'];
    for (const f of added) {
      expect(FIRST_TOUCH_FIELDS as readonly string[]).not.toContain(f);
    }
  });

  it('FIRST_TOUCH_FIELDS still names the fields it always did', () => {
    // Guards against the inverse mistake: silently SHRINKING the write-once set would let a
    // later touch overwrite a lead's true origin.
    expect((FIRST_TOUCH_FIELDS as readonly string[]).length).toBeGreaterThan(0);
    expect(FIRST_TOUCH_FIELDS as readonly string[]).toEqual(
      expect.arrayContaining(['first_campaign_id', 'first_touch_at']),
    );
  });
});

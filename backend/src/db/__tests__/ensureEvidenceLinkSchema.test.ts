import {
  evidenceLinkStatements,
  NEW_TABLES,
  SOURCE_SYSTEMS,
  INITIATIVE_TYPES,
  RELATIONS,
  LINK_METHODS,
  FORBIDDEN_CONTENT_COLUMNS,
} from '../ensureEvidenceLinkSchema';
import { activeBootCall, serverSourceText } from './helpers/bootCalls';

/**
 * R3 acceptance: one additive join table that every surface above reads, and nothing else.
 *
 * These are properties of the SCHEMA, asserted before any code path exists. If the table
 * has nowhere to put a document body, no future handler can accidentally put one there; if
 * the unique index is present, scheduled ingestion cannot double a timeline. Both become
 * structurally true rather than merely intended.
 */
const S = evidenceLinkStatements();
const SQL = S.join('\n');

describe('the table holds pointers, never the evidence itself', () => {
  it('has no column that could carry a document body', () => {
    for (const banned of FORBIDDEN_CONTENT_COLUMNS) {
      expect(SQL.toLowerCase()).not.toMatch(new RegExp(`\\b${banned}\\b\\s+(text|bytea|jsonb|varchar)`));
    }
  });

  it('stores no binary type at all', () => {
    expect(SQL).not.toMatch(/BYTEA|BLOB|OID\b/i);
  });

  it('carries a source pointer and a URL a human can follow', () => {
    expect(SQL).toMatch(/source_id VARCHAR\(255\) NOT NULL/);
    expect(SQL).toMatch(/source_url TEXT/);
  });

  it('leaves the source pointer unconstrained, because the canonical copy is elsewhere', () => {
    expect(SQL).not.toMatch(/source_id[^,]*REFERENCES/i);
  });
});

describe('exactly one new table', () => {
  it('creates one table and it is the spine', () => {
    const created = (SQL.match(/CREATE TABLE IF NOT EXISTS (\w+)/g) || [])
      .map((c) => c.replace('CREATE TABLE IF NOT EXISTS ', ''));
    expect(created).toEqual([...NEW_TABLES]);
    expect(created).toEqual(['revenue_evidence_links']);
  });

  it('only ALTERs the table it creates itself', () => {
    // bootSchemaCreatable.test.ts rejects an ALTER against a table nothing in the boot
    // path creates, and it was right to.
    const altered = new Set((SQL.match(/ALTER TABLE\s+(\w+)/gi) || [])
      .map((a) => a.replace(/ALTER TABLE\s+/i, '').toLowerCase()));
    expect([...altered]).toEqual(['revenue_evidence_links']);
  });
});

describe('scheduled ingestion cannot double a timeline', () => {
  it('has the unique index that makes linking idempotent', () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_evidence_links_source_initiative/);
    expect(SQL).toMatch(/ON revenue_evidence_links \(source_system, source_id, initiative_type, initiative_key\)/);
  });

  it('deliberately leaves `relation` OUT of the unique key', () => {
    // If a classifier changes its mind about how a document relates to an initiative, the
    // right outcome is one row that gets corrected, not two that both claim to be it.
    const uq = S.find((x) => x.includes('uq_revenue_evidence_links_source_initiative'))!;
    expect(uq).not.toMatch(/relation/);
  });

  it('indexes the drill-down query on observed_at, not created_at', () => {
    // The reader is asking "what happened and when", not "when did we find out".
    expect(SQL).toMatch(/idx_revenue_evidence_links_initiative_observed[\s\S]*?observed_at DESC/);
  });

  it('keeps a partial index for live links, so unlinked rows stay out of the hot path', () => {
    const live = S.find((x) => x.includes('idx_revenue_evidence_links_live'))!;
    expect(live).toMatch(/WHERE unlinked_at IS NULL/);
  });
});

describe('observed_at is never defaulted, because a wrong date is worse than no link', () => {
  it('is NOT NULL and carries no default', () => {
    expect(SQL).toMatch(/observed_at TIMESTAMPTZ NOT NULL\s*,/);
    expect(SQL).not.toMatch(/observed_at TIMESTAMPTZ NOT NULL DEFAULT/);
  });

  it('is a different column from created_at, which DOES default', () => {
    expect(SQL).toMatch(/created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  });
});

/**
 * The reason these constraints are generated rather than retyped: on 2026-11-03 the R2
 * diagnosis found `revenueOpportunityService` filtering
 * `pipeline_stage IN ('qualified','proposal','negotiation')` when two of those three
 * literals were not values of that column. A hardcoded list drifted from what it described
 * and the scan could never match. These tests fail the moment the DDL and the exported
 * vocabulary disagree.
 */
describe('the database vocabulary and the TypeScript vocabulary cannot drift', () => {
  const checkFor = (name: string) => S.find((x) => x.includes(`ADD CONSTRAINT ${name}`))!;

  it.each([
    ['ck_revenue_evidence_links_source_system', SOURCE_SYSTEMS],
    ['ck_revenue_evidence_links_initiative_type', INITIATIVE_TYPES],
    ['ck_revenue_evidence_links_relation', RELATIONS],
    ['ck_revenue_evidence_links_link_method', LINK_METHODS],
  ] as const)('%s lists exactly the exported values', (name, values) => {
    const stmt = checkFor(name);
    expect(stmt).toBeDefined();
    for (const v of values) expect(stmt).toContain(`'${v}'`);
    // And nothing else: count the quoted literals so an extra one is caught too.
    expect((stmt.match(/'[a-z_]+'/g) || []).length).toBe(values.length);
  });

  it('keeps every vocabulary a plain varchar, not a Postgres enum', () => {
    // An enum would make adding a source system a migration. These sets will grow.
    expect(SQL).not.toMatch(/CREATE TYPE/i);
    expect(SQL).toMatch(/source_system VARCHAR\(40\) NOT NULL/);
    expect(SQL).toMatch(/relation VARCHAR\(40\) NOT NULL/);
  });

  it('every vocabulary value is a bare identifier, so interpolation cannot inject', () => {
    for (const v of [...SOURCE_SYSTEMS, ...INITIATIVE_TYPES, ...RELATIONS, ...LINK_METHODS]) {
      expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('a confidence score only means something on a machine-made link', () => {
  // Anchored on ADD, not on the bare constraint name: every constraint here is dropped and
  // re-added for re-runnability, so a name search finds the DROP first and asserts nothing.
  const added = (name: string) => S.find((x) => x.includes(`ADD CONSTRAINT ${name}`))!;

  it('forbids confidence on a human link and requires it on an automatic one', () => {
    const c = added('ck_revenue_evidence_links_confidence');
    expect(c).toMatch(/link_method = 'human' AND confidence IS NULL/);
    expect(c).toMatch(/link_method = 'automatic' AND confidence IS NOT NULL/);
    expect(c).toMatch(/confidence >= 0 AND confidence <= 1/);
  });

  it('requires an unlink to name who did it', () => {
    expect(added('ck_revenue_evidence_links_unlink_attributed'))
      .toMatch(/unlinked_at IS NULL OR unlinked_by IS NOT NULL/);
  });
});

describe('additive only', () => {
  it('never drops a table or a column', () => {
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('declares every table and index with IF NOT EXISTS', () => {
    expect(SQL).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    const idx = S.filter((x) => /CREATE (UNIQUE )?INDEX/i.test(x));
    expect(idx.length).toBeGreaterThanOrEqual(4);
    for (const x of idx) expect(x).toMatch(/INDEX IF NOT EXISTS/i);
  });

  it('only drops a constraint it immediately re-adds', () => {
    const dropped = (SQL.match(/DROP CONSTRAINT IF EXISTS (\w+)/g) || [])
      .map((d) => d.replace('DROP CONSTRAINT IF EXISTS ', ''));
    expect(dropped.length).toBeGreaterThan(0);
    for (const name of dropped) expect(SQL).toContain(`ADD CONSTRAINT ${name}`);
  });

  it('touches no existing table, so it cannot break a surface that already works', () => {
    const touched = new Set([
      ...(SQL.match(/CREATE TABLE IF NOT EXISTS (\w+)/g) || [])
        .map((c) => c.replace('CREATE TABLE IF NOT EXISTS ', '')),
      ...(SQL.match(/ALTER TABLE\s+(\w+)/gi) || [])
        .map((a) => a.replace(/ALTER TABLE\s+/i, '')),
    ]);
    expect([...touched]).toEqual(['revenue_evidence_links']);
  });
});

describe('the schema ensure is wired into boot', () => {
  const CALL = 'await ensureEvidenceLinkSchema()';

  it('POSITIVE CONTROL: the helper can see real boot calls', () => {
    // Without this, every test below would pass on a helper that had silently stopped
    // matching anything at all.
    expect(activeBootCall('await ensureAccountArtifactLinkSchema()')).toBeGreaterThan(-1);
  });

  it('the call is ACTIVE, not merely present in the text', () => {
    expect(activeBootCall(CALL)).toBeGreaterThan(-1);
  });

  it('runs BEFORE app.listen, so the table exists before the port opens', () => {
    expect(activeBootCall(CALL)).toBeLessThan(serverSourceText().indexOf('app.listen('));
  });

  it('is wrapped, so a schema failure cannot stop the port binding', () => {
    const src = serverSourceText();
    const at = activeBootCall(CALL);
    const around = src.slice(Math.max(0, at - 250), at + 300);
    expect(around).toMatch(/try\s*\{/);
    expect(around).toMatch(/catch/);
  });
});

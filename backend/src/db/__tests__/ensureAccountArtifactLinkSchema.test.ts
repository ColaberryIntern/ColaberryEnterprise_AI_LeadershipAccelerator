import {
  accountArtifactLinkStatements,
  NEW_TABLES,
  ARTIFACT_KINDS,
  FORBIDDEN_CONTENT_COLUMNS,
} from '../ensureAccountArtifactLinkSchema';
import { activeBootCall, serverSourceText } from './helpers/bootCalls';

/**
 * C8.5 acceptance: "Links only, no duplication."
 *
 * That is a property of the SCHEMA before it is a property of any code path. If the table
 * has nowhere to put a document, no future handler can accidentally put one there, and
 * the "second canonical location" the ticket warns about becomes structurally impossible
 * rather than merely discouraged.
 */
const S = accountArtifactLinkStatements();
const SQL = S.join('\n');

describe('the table cannot hold an artifact, only a pointer to one', () => {
  it('has no column that could carry a document', () => {
    // The named failure mode on C8.5, asserted rather than promised in a comment.
    for (const banned of FORBIDDEN_CONTENT_COLUMNS) {
      expect(SQL.toLowerCase()).not.toMatch(new RegExp(`\\b${banned}\\b\\s+(text|bytea|jsonb|varchar)`));
    }
  });

  it('stores no binary type at all', () => {
    expect(SQL).not.toMatch(/BYTEA|BLOB|OID\b/i);
  });

  it('carries a canonical_url, which is the whole mechanism', () => {
    expect(SQL).toMatch(/canonical_url TEXT NOT NULL/);
  });

  it('keeps the source pointer unconstrained, per CertEvidenceMapping', () => {
    // A hard FK would force every canonical source to be a table in this database, which
    // is exactly what it is not: the canonical copy lives in the Basecamp vault.
    expect(SQL).toMatch(/source_id VARCHAR\(64\)/);
    expect(SQL).not.toMatch(/source_id[^,]*REFERENCES/i);
  });
});

describe('exactly one new table, and no second account universe', () => {
  it('creates one table and it is the link table', () => {
    const created = (SQL.match(/CREATE TABLE IF NOT EXISTS (\w+)/g) || [])
      .map((c) => c.replace('CREATE TABLE IF NOT EXISTS ', ''));
    expect(created).toEqual([...NEW_TABLES]);
    expect(created).toEqual(['account_artifact_links']);
  });

  it('creates no table that looks like a second account or artifact store', () => {
    for (const t of NEW_TABLES) {
      expect(t).not.toMatch(/^(accounts|artifacts|documents|files|organizations)$/);
    }
  });

  it('only ALTERs the table it creates itself', () => {
    // So the boot-ALTER population does not grow. bootSchemaCreatable.test.ts rejects an
    // ALTER against a table nothing in the boot path creates, and it was right to.
    const altered = new Set((SQL.match(/ALTER TABLE\s+(\w+)/gi) || [])
      .map((a) => a.replace(/ALTER TABLE\s+/i, '').toLowerCase()));
    expect([...altered]).toEqual(['account_artifact_links']);
  });
});

describe('a document cannot be linked to the same account twice', () => {
  it('has the unique index that makes the ticket metric true', () => {
    // "Nobody re-sends a document an account already has" is a uniqueness guarantee, and
    // it is the single reason this is a table rather than a JSONB array on organizations.
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_account_artifact_links_account_url/);
    expect(SQL).toMatch(/ON account_artifact_links \(organization_id, canonical_url\)/);
  });

  it('cascades from the account so deleting one strands no links', () => {
    expect(SQL).toMatch(/REFERENCES organizations \(id\) ON DELETE CASCADE/);
  });
});

describe('additive only', () => {
  it('never drops a table or a column', () => {
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('declares every index and table with IF NOT EXISTS', () => {
    expect(SQL).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    const idx = S.filter((x) => /CREATE (UNIQUE )?INDEX/i.test(x));
    expect(idx.length).toBeGreaterThanOrEqual(3);
    for (const x of idx) expect(x).toMatch(/INDEX IF NOT EXISTS/i);
  });

  it('only drops a constraint it immediately re-adds', () => {
    const dropped = (SQL.match(/DROP CONSTRAINT IF EXISTS (\w+)/g) || [])
      .map((d) => d.replace('DROP CONSTRAINT IF EXISTS ', ''));
    expect(dropped.length).toBeGreaterThan(0);
    for (const name of dropped) expect(SQL).toContain(`ADD CONSTRAINT ${name}`);
  });
});

describe('the seven artifact kinds C8.5 names', () => {
  it('covers every kind the ticket lists', () => {
    expect([...ARTIFACT_KINDS]).toEqual([
      'deck', 'research', 'account_brief', 'proposal',
      'contract', 'pilot_outcome', 'case_study',
    ]);
  });

  it('keeps the kind a plain varchar, not a Postgres enum', () => {
    // An enum would make adding a kind a migration. The set is enforced in the service
    // and by the Zod schema at the route boundary.
    expect(SQL).toMatch(/artifact_kind VARCHAR\(40\) NOT NULL/);
    expect(SQL).not.toMatch(/CREATE TYPE/i);
  });
});

describe('the schema ensure is wired into boot', () => {
  const CALL = 'await ensureAccountArtifactLinkSchema()';

  it('POSITIVE CONTROL: the helper can see real boot calls', () => {
    expect(activeBootCall('await ensureStrategicAccountSchema()')).toBeGreaterThan(-1);
  });

  it('the call is ACTIVE, not merely present in the text', () => {
    expect(activeBootCall(CALL)).toBeGreaterThan(-1);
  });

  it('runs AFTER the organizations extension, because the FK needs that table', () => {
    expect(activeBootCall(CALL))
      .toBeGreaterThan(activeBootCall('await ensureStrategicAccountSchema()'));
  });

  it('runs BEFORE app.listen, so the table exists before the port opens', () => {
    expect(activeBootCall(CALL)).toBeLessThan(serverSourceText().indexOf('app.listen('));
  });

  it('is wrapped, so a schema failure cannot stop the port binding', () => {
    const src = serverSourceText();
    const at = activeBootCall(CALL);
    const around = src.slice(Math.max(0, at - 250), at + 300);
    expect(around).toMatch(/try \{/);
    expect(around).toMatch(/catch \(/);
  });
});

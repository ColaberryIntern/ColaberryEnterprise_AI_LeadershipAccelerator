import * as fs from 'fs';
import * as path from 'path';
import {
  strategicAccountStatements,
  NEW_TABLES,
  RECONCILED_MODELS,
} from '../ensureStrategicAccountSchema';

/**
 * C8.3 acceptance: "No parallel account table created unless C6.1 justified it."
 *
 * C6.1 returned ten verdicts and exactly ONE was BUILD — the warm-paths join, justified
 * by a sweep that found 24 relationship-ish columns and none joining a person to an
 * account. Everything else was REUSE or EXTEND. This suite holds the statement list to
 * that, so a second account table cannot arrive quietly in a later edit.
 *
 * It also holds the OTHER half of the design in place: the EXTEND columns deliberately
 * are not DDL here, they ride the boot reconciler. A test that only checked this file
 * would pass while the columns reached no database at all.
 */
const S = strategicAccountStatements();
const SQL = S.join('\n');

describe('exactly one new table, and it is the one C6.1 justified', () => {
  it('creates one table and no more', () => {
    const created = (SQL.match(/CREATE TABLE IF NOT EXISTS (\w+)/g) || [])
      .map((c) => c.replace('CREATE TABLE IF NOT EXISTS ', ''));
    expect(created).toEqual([...NEW_TABLES]);
    expect(created).toHaveLength(1);
    expect(created[0]).toBe('account_warm_paths');
  });

  it('creates NO table that looks like a second account or person universe', () => {
    // The named failure mode. A table called accounts/companies/contacts would be the
    // parallel universe regardless of what its columns held.
    for (const t of NEW_TABLES) {
      expect(t).not.toMatch(/^(accounts|strategic_accounts|companies|contacts|people)$/);
    }
    expect(SQL).not.toMatch(/CREATE TABLE IF NOT EXISTS (accounts|companies|contacts)\b/);
  });

  it('every CREATE TABLE is IF NOT EXISTS, so a re-run is a no-op', () => {
    const bare = SQL.match(/CREATE TABLE (?!IF NOT EXISTS)/g) || [];
    expect(bare).toHaveLength(0);
  });
});

describe('the EXTEND columns ride the reconciler, not boot DDL', () => {
  it('does not ALTER organizations or leads', () => {
    // bootSchemaCreatable.test.ts rejected the first draft for this: nothing in the boot
    // path CREATEs `leads`, so the ALTER fails on a pristine database and is swallowed,
    // leaving a column that only looks added.
    expect(SQL).not.toMatch(/ALTER TABLE\s+organizations/i);
    expect(SQL).not.toMatch(/ALTER TABLE\s+leads/i);
    expect(SQL).not.toMatch(/ADD COLUMN/i);
  });

  it('server.ts reconciles BOTH models, or the columns reach no database', () => {
    // The assertion that makes the split safe. Declaring an attribute on a model that
    // nothing reconciles reads as working and writes nothing.
    const server = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server.ts'), 'utf8',
    );
    const call = server.indexOf('reconcileMissingColumns([');
    expect(call).toBeGreaterThan(-1);
    const list = server.slice(call, server.indexOf(']);', call));
    for (const model of RECONCILED_MODELS) {
      expect(list).toContain(model);
    }
  });

  it('the models actually declare the new columns', () => {
    // A model missing the attribute means the reconciler has nothing to add.
    const dir = path.join(__dirname, '..', '..', 'models');
    const org = fs.readFileSync(path.join(dir, 'Organization.ts'), 'utf8');
    for (const c of ['initiative', 'icp_segment', 'funding_probability',
      'next_action', 'next_action_due_on', 'account_score', 'attributes']) {
      expect(org).toMatch(new RegExp(`${c}:\\s*\\{\\s*type:`));
    }
    const lead = fs.readFileSync(path.join(dir, 'Lead.ts'), 'utf8');
    expect(lead).toMatch(/organization_id:\s*\{\s*type:\s*DataTypes\.UUID/);
  });
});

describe('additive only', () => {
  it('never drops a table or a column', () => {
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('never retypes or renames anything', () => {
    expect(SQL).not.toMatch(/ALTER\s+COLUMN/i);
    expect(SQL).not.toMatch(/RENAME/i);
  });

  it('declares every index with IF NOT EXISTS', () => {
    const idx = S.filter((s) => /CREATE (UNIQUE )?INDEX/i.test(s));
    expect(idx.length).toBeGreaterThanOrEqual(3);
    for (const s of idx) expect(s).toMatch(/INDEX IF NOT EXISTS/i);
  });

  it('only ever drops a constraint it immediately re-adds', () => {
    // The one legal DROP in the house idiom: the re-runnable FK pair. A DROP CONSTRAINT
    // with no matching ADD would be a silent loss of referential integrity.
    const dropped = (SQL.match(/DROP CONSTRAINT IF EXISTS (\w+)/g) || [])
      .map((d) => d.replace('DROP CONSTRAINT IF EXISTS ', ''));
    expect(dropped.length).toBeGreaterThan(0);
    for (const name of dropped) expect(SQL).toContain(`ADD CONSTRAINT ${name}`);
  });

  it('adds no constraint to organization_type, because nine rows already exist', () => {
    // C6.1 proposed a `strategic_account` VALUE. The column is a bare varchar with no
    // enum and no CHECK, so adding one now would be a new restriction on existing rows.
    expect(SQL).not.toMatch(/organization_type/);
    expect(SQL).not.toMatch(/CREATE TYPE/i);
  });

  it('the one ALTER is against the table this file itself creates', () => {
    // So the boot-ALTER population does not grow: account_warm_paths is boot-creatable
    // precisely because the statement above creates it.
    const altered = new Set((SQL.match(/ALTER TABLE\s+(\w+)/gi) || [])
      .map((a) => a.replace(/ALTER TABLE\s+/i, '').toLowerCase()));
    expect([...altered]).toEqual(['account_warm_paths']);
    expect(NEW_TABLES).toContain('account_warm_paths');
  });
});

describe('the warm-paths table cannot silently duplicate a relationship', () => {
  it('has a unique index on (account, person, kind)', () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_account_warm_paths_account_person_kind/);
    expect(SQL).toMatch(/ON account_warm_paths \(organization_id, lead_id, relationship_kind\)/);
  });

  it('cascades from the account so deleting one strands nothing', () => {
    expect(SQL).toMatch(/REFERENCES organizations \(id\) ON DELETE CASCADE/);
  });
});

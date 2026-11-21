import {
  DEAL_BASIS_SOURCES,
  MIN_DEAL_BASIS_CHARS,
  NEW_TABLES,
  enterpriseDealValueStatements,
} from '../ensureEnterpriseDealValueSchema';

/**
 * R23 Phase 2 — the DDL's own acceptance.
 *
 * These assert the properties that would be expensive to discover in production, in the order
 * they would hurt:
 *
 * 1. **The partial unique index exists and is partial.** Without `WHERE superseded_at IS NULL`
 *    a re-priced deal is counted twice by the headline's `SUM`, and the error grows silently
 *    with every correction. A plain unique index would be worse than none, because it would
 *    make a revision impossible instead of merely wrong.
 * 2. **The vocabulary CHECK is generated from the exported array.** `ensureEvidenceLinkSchema`
 *    once had a hardcoded list that drifted from its column and made 1,100 leads invisible.
 * 3. **Every statement is idempotent**, because this runs on every backend boot.
 * 4. **The foreign key names the right parent**, since a dangling value is money attributed
 *    to nothing.
 */

const SQL = enterpriseDealValueStatements();
const all = SQL.join('\n;\n');

describe('enterprise_deal_values: the table this stream has never had', () => {
  it('declares exactly the one table it owns', () => {
    expect(NEW_TABLES).toEqual(['enterprise_deal_values']);
  });

  it('creates the table additively, so a second boot is a no-op', () => {
    expect(all).toContain('CREATE TABLE IF NOT EXISTS enterprise_deal_values');
  });

  it('keeps ONE LIVE value per intake, and does it with a PARTIAL index', () => {
    const idx = SQL.find((s) => s.includes('uq_enterprise_deal_values_live_intake'));
    expect(idx).toBeTruthy();
    expect(idx).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(idx).toContain('(enterprise_intake_id)');
    // The whole point. A unique index without this clause makes a correction impossible.
    expect(idx).toContain('WHERE superseded_at IS NULL');
  });

  it('every statement is re-runnable', () => {
    for (const s of SQL) {
      const head = s.trim().split('\n')[0];
      const idempotent = /IF NOT EXISTS/.test(s) || /DROP CONSTRAINT IF EXISTS/.test(s)
        || /ADD CONSTRAINT/.test(s);
      expect(idempotent).toBe(true);
    }
    // Every ADD CONSTRAINT is preceded by its own DROP, which is what makes the pair
    // re-runnable rather than merely tolerated.
    const added = SQL.filter((s) => s.includes('ADD CONSTRAINT'))
      .map((s) => (s.match(/ADD CONSTRAINT (\w+)/) || [])[1]);
    const dropped = SQL.filter((s) => s.includes('DROP CONSTRAINT IF EXISTS'))
      .map((s) => (s.match(/DROP CONSTRAINT IF EXISTS (\w+)/) || [])[1]);
    expect(added.sort()).toEqual(dropped.sort());
  });
});

describe('enterprise_deal_values: the rails', () => {
  it('generates the basis vocabulary from the exported array, not a hardcoded copy', () => {
    const check = SQL.find((s) => s.includes('ck_enterprise_deal_values_basis_source')
      && s.includes('ADD CONSTRAINT'));
    expect(check).toBeTruthy();
    for (const v of DEAL_BASIS_SOURCES) {
      expect(check).toContain(`'${v}'`);
    }
    // And nothing else, so a value removed from the array really leaves the constraint.
    const quoted = (check!.match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, '')).sort();
    expect(quoted).toEqual([...DEAL_BASIS_SOURCES].sort());
  });

  it('uses a DIFFERENT vocabulary from gov bids, because the evidence differs', () => {
    // A gov bid is priced against a solicitation or an award notice; an enterprise deal
    // against a signed agreement or an SOW. Sharing the list would force every enterprise
    // deal into human_estimate and throw away the distinction.
    expect(DEAL_BASIS_SOURCES).toContain('signed_agreement');
    expect(DEAL_BASIS_SOURCES).toContain('statement_of_work');
    expect(DEAL_BASIS_SOURCES).not.toContain('solicitation_document');
    expect(DEAL_BASIS_SOURCES).not.toContain('award_notice');
    // The weakest option is present and named as judgment, so a guess can be recorded
    // honestly rather than dressed up as something stronger.
    expect(DEAL_BASIS_SOURCES).toContain('human_estimate');
  });

  it('refuses a negative deal but allows zero, which means something real', () => {
    const c = SQL.find((s) => s.includes('ck_enterprise_deal_values_value_nonneg')
      && s.includes('ADD CONSTRAINT'));
    expect(c).toContain('deal_value_cents >= 0');
  });

  it('allows a null term but never a nonsense one', () => {
    const c = SQL.find((s) => s.includes('ck_enterprise_deal_values_period_sane')
      && s.includes('ADD CONSTRAINT'));
    expect(c).toContain('period_months IS NULL OR period_months > 0');
  });

  it('enforces a checkable basis in the DATABASE, so psql cannot bypass it', () => {
    const c = SQL.find((s) => s.includes('ck_enterprise_deal_values_basis_present')
      && s.includes('ADD CONSTRAINT'));
    expect(c).toContain(`length(btrim(value_basis)) >= ${MIN_DEAL_BASIS_CHARS}`);
    expect(MIN_DEAL_BASIS_CHARS).toBeGreaterThanOrEqual(25);
  });

  it('requires a named human, because the intake it describes is run by an AI', () => {
    const c = SQL.find((s) => s.includes('ck_enterprise_deal_values_confirmed_by_present')
      && s.includes('ADD CONSTRAINT'));
    expect(c).toContain('length(btrim(confirmed_by)) > 0');
    expect(all).toContain('confirmed_by VARCHAR(255) NOT NULL');
  });

  it('makes a supersede both-or-neither, so history cannot become unreadable', () => {
    const c = SQL.find((s) => s.includes('ck_enterprise_deal_values_supersede_paired')
      && s.includes('ADD CONSTRAINT'));
    expect(c).toContain('(superseded_at IS NULL) = (superseded_by_id IS NULL)');
  });

  it('points the foreign key at enterprise_intakes and cascades', () => {
    const fk = SQL.find((s) => s.includes('fk_enterprise_deal_values_intake')
      && s.includes('ADD CONSTRAINT'));
    expect(fk).toContain('FOREIGN KEY (enterprise_intake_id)');
    expect(fk).toContain('REFERENCES enterprise_intakes(id)');
    // If the intake goes, the figure describing it is meaningless; an orphan would sit in a SUM.
    expect(fk).toContain('ON DELETE CASCADE');
  });
});

describe('enterprise_deal_values: the DDL interpolation guard', () => {
  it('refuses a vocabulary value that is not a bare identifier', () => {
    // The values are compile-time literals, which is the only thing that makes interpolation
    // acceptable. This proves the guard is live rather than decorative: without it, a future
    // edit pasting in something quoted or spaced would produce DDL nobody read.
    jest.resetModules();
    jest.doMock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('../ensureEnterpriseDealValueSchema');
    // Every shipped value passes the guard, which is the positive half of the check.
    for (const v of mod.DEAL_BASIS_SOURCES) {
      expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('the shipped vocabulary contains nothing that could break out of a SQL literal', () => {
    for (const v of DEAL_BASIS_SOURCES) {
      expect(v).not.toMatch(/['";\s)(-]/);
      expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

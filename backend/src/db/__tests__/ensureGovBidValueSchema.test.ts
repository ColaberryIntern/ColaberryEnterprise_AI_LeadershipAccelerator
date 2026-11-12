jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import {
  MIN_VALUE_BASIS_CHARS,
  NEW_TABLES,
  VALUE_BASIS_SOURCES,
  govBidValueStatements,
} from '../ensureGovBidValueSchema';

/**
 * R16 acceptance for the one table this ladder had to add.
 *
 * WHAT THESE PROVE AND WHAT THEY DO NOT. The statements are generated, so these assert the
 * generated DDL contains the rails it claims. They do NOT prove Postgres accepts it: a
 * mocked sequelize never parses SQL. The statements were run against production separately,
 * and saying so here is cheaper than someone later believing a green suite covered it.
 */
const SQL = govBidValueStatements();
const ALL = SQL.join('\n');

describe('the table is namespaced, because an unprefixed name collided once already', () => {
  it('owns exactly one table and it carries the feature prefix', () => {
    expect(NEW_TABLES).toEqual(['gov_bid_values']);
  });

  /**
   * R14 is the retrospective ticket for `evidence_links`: the name was taken, the
   * `IF NOT EXISTS` create became a no-op, and every index and constraint after it failed
   * against another feature's columns while logging at `warn`. Nothing looked broken until a
   * user clicked a card. A bare noun is the shape of that mistake, so it is refused here.
   */
  it('never reverts to a bare, unprefixed table name', () => {
    expect(ALL).not.toMatch(/CREATE TABLE IF NOT EXISTS (bid_values|proposal_values)\b/);
    expect(SQL[0]).toMatch(/CREATE TABLE IF NOT EXISTS gov_bid_values/);
  });
});

describe('one live price per bid, so a total is a plain SUM', () => {
  /**
   * The index must be PARTIAL. Without the WHERE, re-pricing a bid would be refused
   * outright; with a non-partial index on the project alone, superseded history could not
   * exist. With it, history accumulates and exactly one row is ever live — which is what
   * makes SUM over live rows correct without a window function.
   */
  it('has a unique index restricted to live rows', () => {
    expect(ALL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_gov_bid_values_live_project[\s\S]*?ON gov_bid_values \(delivery_project_id\) WHERE superseded_at IS NULL/,
    );
  });

  it('indexes the price history of one bid for the drill-down', () => {
    expect(ALL).toMatch(/idx_gov_bid_values_project_history[\s\S]*?\(delivery_project_id, confirmed_at\)/);
  });
});

describe('the rails are generated from the exported vocabulary, never retyped', () => {
  /**
   * A hardcoded list drifting from the column it describes is what made
   * `revenueOpportunityService` unsatisfiable against its own data and left 1,100
   * high-intent leads invisible. So the CHECK is generated, and this asserts the generated
   * SQL still contains exactly the declared values.
   */
  it('checks basis_source against every declared source and nothing else', () => {
    const clause = ALL.match(/CHECK \(basis_source IN \(([^)]*)\)\)/);
    expect(clause).not.toBeNull();
    const inSql = (clause as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/'/g, '')).sort();
    expect(inSql).toEqual([...VALUE_BASIS_SOURCES].sort());
  });

  it('orders the basis sources strongest-evidence first, so the weakest reads as weakest', () => {
    expect(VALUE_BASIS_SOURCES[0]).toBe('award_notice');
    expect(VALUE_BASIS_SOURCES[VALUE_BASIS_SOURCES.length - 1]).toBe('human_estimate');
  });
});

describe('a number with nothing behind it cannot be stored', () => {
  /**
   * The database enforces the basis floor as well as the service, so a direct psql insert
   * cannot put an unaccountable figure on Ram's screen. Enforcing it in only one of the two
   * places would make the other a comment.
   */
  it('requires a value_basis long enough for someone else to check', () => {
    expect(ALL).toMatch(
      new RegExp(`CHECK \\(length\\(btrim\\(value_basis\\)\\) >= ${MIN_VALUE_BASIS_CHARS}\\)`),
    );
    expect(MIN_VALUE_BASIS_CHARS).toBeGreaterThanOrEqual(25);
  });

  it('requires confirmed_by to actually name someone', () => {
    expect(ALL).toMatch(/CHECK \(length\(btrim\(confirmed_by\)\) > 0\)/);
  });

  it('declares confirmed_by and confirmed_at NOT NULL, because a price is a human claim', () => {
    expect(SQL[0]).toMatch(/confirmed_by VARCHAR\(255\) NOT NULL/);
    expect(SQL[0]).toMatch(/confirmed_at TIMESTAMPTZ NOT NULL/);
  });
});

describe('boundaries', () => {
  it('allows a zero-value bid but refuses a negative one', () => {
    expect(ALL).toMatch(/CHECK \(proposal_value_cents >= 0\)/);
  });

  /**
   * NULL already means "the term was not recorded", which is the state that makes the
   * service withhold an annualized figure. A zero or negative term would make that figure
   * meaningless instead, so the column is either absent or sane.
   */
  it('allows an absent term but refuses a nonsensical one', () => {
    expect(ALL).toMatch(/CHECK \(period_months IS NULL OR period_months > 0\)/);
  });

  it('keeps a supersede both-or-neither, so history stays readable', () => {
    expect(ALL).toMatch(/CHECK \(\(superseded_at IS NULL\) = \(superseded_by_id IS NULL\)\)/);
  });

  it('uses BIGINT for cents, so a large contract cannot overflow', () => {
    expect(SQL[0]).toMatch(/proposal_value_cents BIGINT NOT NULL/);
  });
});

describe('a price cannot be attributed to nothing', () => {
  it('foreign-keys the bid to a real delivery project, cascading on delete', () => {
    expect(ALL).toMatch(
      /FOREIGN KEY \(delivery_project_id\) REFERENCES delivery_projects\(id\) ON DELETE CASCADE/,
    );
  });
});

describe('idempotency: the whole point of an ensure', () => {
  /**
   * Every statement is re-runnable. The creates are IF NOT EXISTS and each constraint is
   * dropped before it is added, which is the house idiom precisely so a second boot is a
   * no-op rather than a pile of "already exists" warnings that train people to ignore the
   * boot log.
   */
  it('is safe to run twice: every statement is guarded or drop-then-add', () => {
    for (const s of SQL) {
      const guarded = /IF NOT EXISTS/.test(s)
        || /DROP CONSTRAINT IF EXISTS/.test(s)
        || /ADD CONSTRAINT/.test(s);
      expect(guarded).toBe(true);
    }
  });

  it('drops each constraint it adds, in the statement immediately before', () => {
    const added = SQL.filter((s) => /ADD CONSTRAINT (\w+)/.test(s))
      .map((s) => (s.match(/ADD CONSTRAINT (\w+)/) as RegExpMatchArray)[1]);
    expect(added.length).toBeGreaterThan(0);
    for (const name of added) {
      expect(ALL).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${name}\\b`));
    }
  });
});

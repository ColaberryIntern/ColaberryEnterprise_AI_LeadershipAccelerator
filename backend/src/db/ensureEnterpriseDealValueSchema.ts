import { sequelize } from '../config/database';

/**
 * ensureEnterpriseDealValueSchema — R23 Phase 2, the one thing the enterprise funnel has
 * never had: a price.
 *
 * ── WHY THIS TABLE HAS TO EXIST ──────────────────────────────────────────────────────────
 *
 * R23 Phase 1 put enterprise.colaberry.ai on the Revenue Flow board and it could only ever
 * report zero. Not because nobody will buy, but because `enterprise_intakes` has no column
 * that could hold what a deal is worth. Measured read-only on 2026-11-21: no value, price,
 * amount or contract column anywhere on that model, so a signed intake carries no figure and
 * none can be derived from it.
 *
 * This is the identical wall R16 hit on government bids. Its conclusion, recorded on that
 * ticket, was "SO THE ONLY MISSING PIECE IS PRICE": the whole funnel existed except the
 * number. `gov_bid_values` supplied it, and this table is that answer applied to the
 * enterprise site. Everything structural here is deliberately the same shape, because the
 * problem is the same problem and a second pattern would be a second thing to learn.
 *
 * ── THE NAME WAS CHECKED AGAINST PRODUCTION BEFORE IT WAS TAKEN ──────────────────────────
 *
 * `enterprise_deal_values`, `deal_values`, `enterprise_values`, `enterprise_deal_value`,
 * `enterprise_intake_values`, `intake_values` and `enterprise_contract_values` were all
 * queried in `information_schema.tables` on production on 2026-11-21, alongside a positive
 * control (`gov_bid_values`, which returned 1). All seven returned 0, and the only
 * neighbouring table matching `%deal%` or `%value%` is `gov_bid_values` itself.
 *
 * That check is not ceremony. R14 is the retrospective for the day `evidence_links` collided
 * with a table another feature already owned: `CREATE TABLE IF NOT EXISTS` turned the
 * collision into silence, the create was a no-op, every index and constraint after it failed
 * against someone else's columns, all ten failures logged at `warn`, and nothing looked
 * broken until a user clicked a card and every Revenue Room drill-down answered "Could not
 * build the drill-down."
 *
 * `IF NOT EXISTS` protects against a SECOND RUN. It does not protect against a SECOND OWNER,
 * and it cannot tell the two apart. The `enterprise_` prefix is the cheap guard; the lookup
 * is the real one.
 *
 * ── A VALUE IS A HUMAN'S CLAIM, AND THAT IS THE WHOLE POINT ──────────────────────────────
 *
 * `confirmed_by` is NOT NULL and names a person. No job may write this row, and the service
 * takes that name from the session rather than the request body.
 *
 * It is doing more work than it looks, for a reason specific to this funnel. The W28 intake
 * is AI-driven end to end: an agent runs the interview, drafts the pilot options and drafts
 * the proposal. A deal value written by that same machinery would be the model's estimate
 * of its own pipeline, printed on a board whose headline is money. Requiring a named human
 * is what keeps the figure a commitment rather than a generated number.
 *
 * ── WHY `period_months` IS NOT OPTIONAL THINKING ─────────────────────────────────────────
 *
 * A twelve-month build and a one-off training week are both "deal value". Summing them into
 * one headline beside annualized membership revenue would invite exactly the comparison that
 * is wrong. So the term is stored and the service reports total contract value AND an
 * annualized figure, labelled as two different things. A null term means nobody recorded it,
 * and the annualized number is then withheld rather than guessed.
 *
 * ── CORRECTIONS SUPERSEDE, THEY DO NOT OVERWRITE ─────────────────────────────────────────
 *
 * A re-priced deal inserts a new row and stamps `superseded_at` on the old one, so "the
 * value was revised on the 14th" is itself a dated event the timeline can show. An UPDATE
 * would destroy that, and on a consulting deal the first number against the signed number is
 * often the most interesting line on the page. The partial unique index keeps exactly one
 * live row per intake, which is what makes `SUM` over live rows correct without a window
 * function.
 */

/** Tables this module owns. Asserted against production before the name was taken. */
export const NEW_TABLES: ReadonlyArray<string> = ['enterprise_deal_values'];

/**
 * Where the number came from, ordered strongest to weakest.
 *
 * Deliberately NOT the same vocabulary as `gov_bid_values`. A government bid is priced
 * against a solicitation document and an award notice; an enterprise deal is priced against
 * a signed agreement, a statement of work, or somebody's read of a conversation. Reusing the
 * gov list would have forced every enterprise deal into `human_estimate` and thrown away the
 * distinction this column exists to preserve.
 */
export const DEAL_BASIS_SOURCES = [
  'signed_agreement',   // a countersigned contract or order form. strongest.
  'statement_of_work',  // an agreed SOW with a figure in it
  'accepted_proposal',  // they accepted our written proposal at this price
  'verbal_commitment',  // a named person said yes to a number, not yet papered
  'human_estimate',     // somebody's judgment. weakest, and says so.
] as const;

export type DealBasisSource = typeof DEAL_BASIS_SOURCES[number];

/**
 * The shortest `value_basis` that can actually be checked by someone else. "SOW" is not a
 * basis; "SOW dated 2026-12-02, three phases at $45,000 each, countersigned by their CTO" is.
 * The floor is enforced in the service rather than the database because the message matters
 * more than the rejection, but it is declared here next to the column it governs.
 */
export const MIN_DEAL_BASIS_CHARS = 25;

/**
 * Render a vocabulary as a SQL value list.
 *
 * These are compile-time literals and can never come from a request, which is the only thing
 * that makes interpolation acceptable. Rather than ask a reviewer to take that on trust, each
 * value is re-checked here and throws at boot, so a future edit that pastes in something
 * quoted or spaced fails loudly instead of producing DDL nobody read. Copied deliberately
 * from `ensureGovBidValueSchema`, which copied it from `ensureEvidenceLinkSchema` after a
 * hardcoded list drifted from its column and made 1,100 leads invisible.
 */
function valueList(values: ReadonlyArray<string>): string {
  for (const v of values) {
    if (!/^[a-z][a-z0-9_]*$/.test(v)) {
      throw new Error(
        `enterprise_deal_values vocabulary value ${JSON.stringify(v)} is not a bare `
        + 'identifier. These values are interpolated into DDL, so only [a-z0-9_] is allowed.',
      );
    }
  }
  return values.map((v) => `'${v}'`).join(', ');
}

export function enterpriseDealValueStatements(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS enterprise_deal_values (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

       enterprise_intake_id UUID NOT NULL,

       deal_value_cents BIGINT NOT NULL,
       currency VARCHAR(3) NOT NULL DEFAULT 'USD',
       period_months INTEGER,

       value_basis TEXT NOT NULL,
       basis_source VARCHAR(40) NOT NULL,

       confirmed_by VARCHAR(255) NOT NULL,
       confirmed_at TIMESTAMPTZ NOT NULL,

       superseded_at TIMESTAMPTZ,
       superseded_by_id UUID,
       notes TEXT,

       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,

    // ── ONE LIVE VALUE PER INTAKE ────────────────────────────────────────────────────────
    // Partial, so superseded history accumulates without ever competing to be the answer.
    // This is what lets the headline be a plain SUM over live rows: without it a re-priced
    // deal would be counted twice and the error would grow with every correction.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_enterprise_deal_values_live_intake
       ON enterprise_deal_values (enterprise_intake_id) WHERE superseded_at IS NULL`,

    // The board's own read: every live value, newest confirmation first.
    `CREATE INDEX IF NOT EXISTS idx_enterprise_deal_values_confirmed
       ON enterprise_deal_values (confirmed_at DESC) WHERE superseded_at IS NULL`,

    // The drill-down read: the full value history of one deal, oldest first, so a revision
    // reads as a revision.
    `CREATE INDEX IF NOT EXISTS idx_enterprise_deal_values_intake_history
       ON enterprise_deal_values (enterprise_intake_id, confirmed_at)`,

    // ── THE RAILS, GENERATED FROM THE EXPORTED ARRAY ─────────────────────────────────────
    // Dropped-then-added so the pair is re-runnable, which is the house idiom.
    `ALTER TABLE enterprise_deal_values DROP CONSTRAINT IF EXISTS ck_enterprise_deal_values_basis_source`,
    `ALTER TABLE enterprise_deal_values ADD CONSTRAINT ck_enterprise_deal_values_basis_source
       CHECK (basis_source IN (${valueList(DEAL_BASIS_SOURCES)}))`,

    // A negative deal is not a thing. Zero is allowed and means something real: work taken
    // at no charge, which a reader should see rather than have filtered out.
    `ALTER TABLE enterprise_deal_values DROP CONSTRAINT IF EXISTS ck_enterprise_deal_values_value_nonneg`,
    `ALTER TABLE enterprise_deal_values ADD CONSTRAINT ck_enterprise_deal_values_value_nonneg
       CHECK (deal_value_cents >= 0)`,

    // A term of zero or negative months would make the annualized figure meaningless, and
    // NULL already means "nobody recorded the term". So the column is either absent or sane.
    `ALTER TABLE enterprise_deal_values DROP CONSTRAINT IF EXISTS ck_enterprise_deal_values_period_sane`,
    `ALTER TABLE enterprise_deal_values ADD CONSTRAINT ck_enterprise_deal_values_period_sane
       CHECK (period_months IS NULL OR period_months > 0)`,

    // A value with no stated basis is the figure-on-a-slide this whole surface exists to
    // prevent. Enforced in the database too, so a direct psql insert cannot bypass it.
    `ALTER TABLE enterprise_deal_values DROP CONSTRAINT IF EXISTS ck_enterprise_deal_values_basis_present`,
    `ALTER TABLE enterprise_deal_values ADD CONSTRAINT ck_enterprise_deal_values_basis_present
       CHECK (length(btrim(value_basis)) >= ${MIN_DEAL_BASIS_CHARS})`,

    // `confirmed_by` names a PERSON. The whole reason this figure can go on a revenue board
    // is that a human put their name against it, and the intake it describes was run by an
    // AI from end to end. An empty string is refused at the database, not only in the service.
    `ALTER TABLE enterprise_deal_values DROP CONSTRAINT IF EXISTS ck_enterprise_deal_values_confirmed_by_present`,
    `ALTER TABLE enterprise_deal_values ADD CONSTRAINT ck_enterprise_deal_values_confirmed_by_present
       CHECK (length(btrim(confirmed_by)) > 0)`,

    // A supersede is both-or-neither: a row stamped as replaced must say what replaced it, or
    // the history becomes unreadable in exactly the way an UPDATE would have made it.
    `ALTER TABLE enterprise_deal_values DROP CONSTRAINT IF EXISTS ck_enterprise_deal_values_supersede_paired`,
    `ALTER TABLE enterprise_deal_values ADD CONSTRAINT ck_enterprise_deal_values_supersede_paired
       CHECK ((superseded_at IS NULL) = (superseded_by_id IS NULL))`,

    // The deal must be a real intake. A dangling value would be money attributed to nothing,
    // and CASCADE is right here rather than RESTRICT: if the intake is deleted the figure
    // describing it is meaningless, and keeping it would leave an orphan in a SUM.
    `ALTER TABLE enterprise_deal_values DROP CONSTRAINT IF EXISTS fk_enterprise_deal_values_intake`,
    `ALTER TABLE enterprise_deal_values ADD CONSTRAINT fk_enterprise_deal_values_intake
       FOREIGN KEY (enterprise_intake_id) REFERENCES enterprise_intakes(id) ON DELETE CASCADE`,
  ];
}

/**
 * Create the table and its rails. Idempotent, and each statement is attempted independently
 * so one failure cannot silently abandon the rest — the failure mode R14 was written about.
 */
export async function ensureEnterpriseDealValueSchema(): Promise<void> {
  for (const sql of enterpriseDealValueStatements()) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      // Logged with the statement's opening line so a warn in the boot log is actionable
      // rather than a shrug. Ten anonymous warns are how the R14 outage stayed invisible.
      const head = sql.trim().split('\n')[0].slice(0, 110);
      console.warn(`[DB] enterprise_deal_values statement failed (${head}): ${err?.message}`);
    }
  }
}

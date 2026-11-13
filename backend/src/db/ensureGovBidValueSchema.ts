import { sequelize } from '../config/database';

/**
 * ensureGovBidValueSchema — R16, the one thing the government pipeline has never had:
 * a price.
 *
 * ── WHY THIS TABLE HAS TO EXIST AT ALL ───────────────────────────────────────────────────
 *
 * Ali's ask for the Revenue Flow dashboard: "What about the proposal value and then
 * reporting on the status of if we won. We have this much of possible proposal winnings."
 *
 * The second half of that needs nothing new. `gov_submission` has carried `status`,
 * `outcome`, `outcome_note`, `outcome_recorded_at` and `externally_submitted_at` since P5,
 * with a tested `POST /outcome` route and an EXPORTED-is-not-SUBMITTED honesty rail. It has
 * simply never been written to: measured read-only on 2026-11-12, that table holds zero
 * rows.
 *
 * The first half has nowhere to go. Measured the same day, against production:
 *   - `gov_qualifications` has 22 columns and not one of them is a value, a budget, a
 *     ceiling, a close date or a deadline. Only `created_at` and `updated_at`.
 *   - `source_snapshot` is the obvious candidate and is NULL on all 14 flagged rows, so the
 *     solicitation's own numbers were never captured.
 *   - `gov_company_references.contract_value` exists but describes OUR PAST contracts, for
 *     proposal credibility, and holds zero rows.
 *   - `delivery_opportunities.value_score` is an integer SCORE for a capability inside a
 *     delivery project. It is not dollars and must not be read as dollars.
 *
 * So the funnel Ali described — flagged, priced, ready, exported, submitted, acknowledged,
 * won or lost — is entirely present in the schema except "priced". This table is that step
 * and nothing else.
 *
 * ── THE NAME WAS CHECKED AGAINST PRODUCTION BEFORE IT WAS CHOSEN ─────────────────────────
 *
 * `gov_bid_values`, `bid_values`, `gov_bid_value`, `proposal_values` and
 * `gov_proposal_values` were all queried in `information_schema.tables` on production first.
 * None existed. That check is not ceremony: R14 is the retrospective ticket for the day
 * `evidence_links` collided with a table another feature already owned, and
 * `CREATE TABLE IF NOT EXISTS` turned the collision into silence — the create was a no-op,
 * every index and constraint after it failed against someone else's columns, all ten
 * failures logged at `warn`, and nothing looked broken until a user clicked a card and every
 * Revenue Room drill-down answered "Could not build the drill-down."
 *
 * `IF NOT EXISTS` protects against a SECOND RUN. It does not protect against a SECOND
 * OWNER, and it cannot tell the two apart. The prefix is the cheap fix; the lookup is the
 * actual fix.
 *
 * ── A VALUE IS A HUMAN'S CLAIM, AND THAT IS THE POINT ────────────────────────────────────
 *
 * `confirmed_by` is NOT NULL and names a person. No job may write this row.
 *
 * That constraint is doing more work than it looks. `revenueInitiatives.ts` has carried this
 * complaint since R1: "There is no column anywhere that records 'a human confirmed this bid
 * is live', so the distinction cannot be computed." It is the declared `unlockedBy` for the
 * whole government card. Pricing a bid IS that confirmation — nobody attaches a dollar
 * figure and a basis to a row they believe is a test.
 *
 * Which is why the dashboard can finally be safe. On 2026-11-12 the 14 flagged rows included
 * one named "Snow College Adult Learner - T8 test", "RFP - Enterprise Work Order Management
 * System" twice under two project ids, and three rows with no delivery project at all.
 * "Possible proposal winnings" sums ONLY priced bids, so none of those three can inflate it,
 * and the count of unpriced bids is reported beside the total so the gap stays visible
 * rather than being quietly excluded.
 *
 * ── WHY `period_months` IS NOT OPTIONAL THINKING ─────────────────────────────────────────
 *
 * A five-year $5M contract and a one-year $100K contract are both "proposal value". Summing
 * them into one headline and putting it next to $72.8K of annualized membership revenue
 * would invite exactly the comparison that is wrong. So the period is stored and the service
 * reports total contract value AND an annualized figure, labelled as two different things.
 * A null period means nobody recorded the term, and the annualized number is then withheld
 * rather than guessed — the same rule the rest of this surface already follows.
 *
 * ── CORRECTIONS SUPERSEDE, THEY DO NOT OVERWRITE ─────────────────────────────────────────
 *
 * A re-priced bid inserts a new row and stamps `superseded_at` on the old one, so "the value
 * was revised on the 14th" is itself a dated event the timeline can show. An UPDATE would
 * destroy that, and the first estimate against the final one is often the most interesting
 * line on the whole page. The partial unique index keeps exactly one live row per bid, which
 * is what makes `SUM` over live rows correct without a window function.
 */

/** Tables this module owns. Asserted against production before the name was taken. */
export const NEW_TABLES: ReadonlyArray<string> = ['gov_bid_values'];

/**
 * Where the number came from. Each value is a real provenance a reader can weigh, ordered
 * from strongest to weakest, and the service surfaces it on the drill-down so a figure
 * sourced from an award notice never reads the same as somebody's guess.
 */
export const VALUE_BASIS_SOURCES = [
  'award_notice',          // the agency told us what it is worth. strongest.
  'solicitation_document', // a figure printed in the RFP itself
  'vendor_quote',          // our own priced response
  'comparable_contract',   // a similar award, named in the basis text
  'human_estimate',        // somebody's judgment. weakest, and says so.
] as const;

export type ValueBasisSource = typeof VALUE_BASIS_SOURCES[number];

/**
 * The shortest `value_basis` that can actually be checked by someone else. "RFP" is not a
 * basis; "Section 2.4 of the RFP states a not-to-exceed of $450,000 over 3 years" is. The
 * floor is enforced in the service rather than the database because the message matters
 * more than the rejection, but it is declared here next to the column it governs.
 */
export const MIN_VALUE_BASIS_CHARS = 25;

/**
 * Render a vocabulary as a SQL value list.
 *
 * These are compile-time literals and can never come from a request, which is the only
 * thing that makes interpolation acceptable. Rather than ask a reviewer to take that on
 * trust, each value is re-checked here and throws at boot, so a future edit that pastes in
 * something quoted or spaced fails loudly instead of producing DDL nobody read. Copied
 * deliberately from `ensureEvidenceLinkSchema`, which generates its CHECKs the same way
 * after a hardcoded list drifted from its column and made 1,100 leads invisible.
 */
function valueList(values: ReadonlyArray<string>): string {
  for (const v of values) {
    if (!/^[a-z][a-z0-9_]*$/.test(v)) {
      throw new Error(
        `gov_bid_values vocabulary value ${JSON.stringify(v)} is not a bare identifier. `
        + 'These values are interpolated into DDL, so only [a-z0-9_] is allowed.',
      );
    }
  }
  return values.map((v) => `'${v}'`).join(', ');
}

export function govBidValueStatements(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS gov_bid_values (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

       delivery_project_id UUID NOT NULL,

       proposal_value_cents BIGINT NOT NULL,
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

    // ── ONE LIVE PRICE PER BID ───────────────────────────────────────────────────────────
    // Partial, so superseded history accumulates without ever competing to be the answer.
    // This is what lets the headline be a plain SUM over live rows: without it, a re-priced
    // bid would be counted twice and the error would grow silently with every correction.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_gov_bid_values_live_project
       ON gov_bid_values (delivery_project_id) WHERE superseded_at IS NULL`,

    // The dashboard's own read: every live price, newest confirmation first.
    `CREATE INDEX IF NOT EXISTS idx_gov_bid_values_confirmed
       ON gov_bid_values (confirmed_at DESC) WHERE superseded_at IS NULL`,

    // The drill-down read: the full price history of one bid, oldest first, so a revision
    // reads as a revision.
    `CREATE INDEX IF NOT EXISTS idx_gov_bid_values_project_history
       ON gov_bid_values (delivery_project_id, confirmed_at)`,

    // ── THE RAILS, GENERATED FROM THE EXPORTED ARRAY ─────────────────────────────────────
    // Dropped-then-added so the pair is re-runnable, which is the house idiom.
    `ALTER TABLE gov_bid_values DROP CONSTRAINT IF EXISTS ck_gov_bid_values_basis_source`,
    `ALTER TABLE gov_bid_values ADD CONSTRAINT ck_gov_bid_values_basis_source
       CHECK (basis_source IN (${valueList(VALUE_BASIS_SOURCES)}))`,

    // A negative contract is not a thing. Zero is allowed and means something real: a bid
    // priced at nothing, which a reader should see rather than have filtered out.
    `ALTER TABLE gov_bid_values DROP CONSTRAINT IF EXISTS ck_gov_bid_values_value_nonneg`,
    `ALTER TABLE gov_bid_values ADD CONSTRAINT ck_gov_bid_values_value_nonneg
       CHECK (proposal_value_cents >= 0)`,

    // A term of zero or negative months would make the annualized figure meaningless, and
    // NULL already means "nobody recorded the term". So the column is either absent or sane.
    `ALTER TABLE gov_bid_values DROP CONSTRAINT IF EXISTS ck_gov_bid_values_period_sane`,
    `ALTER TABLE gov_bid_values ADD CONSTRAINT ck_gov_bid_values_period_sane
       CHECK (period_months IS NULL OR period_months > 0)`,

    // A price with no stated basis is the figure-on-a-slide this whole surface exists to
    // prevent. Enforced in the database too, so a direct psql insert cannot bypass it.
    `ALTER TABLE gov_bid_values DROP CONSTRAINT IF EXISTS ck_gov_bid_values_basis_present`,
    `ALTER TABLE gov_bid_values ADD CONSTRAINT ck_gov_bid_values_basis_present
       CHECK (length(btrim(value_basis)) >= ${MIN_VALUE_BASIS_CHARS})`,

    // `confirmed_by` names a PERSON. The whole reason a priced bid can be trusted as a live
    // one is that a human put their name against it, so an empty string is refused at the
    // database rather than only in the service.
    `ALTER TABLE gov_bid_values DROP CONSTRAINT IF EXISTS ck_gov_bid_values_confirmed_by_present`,
    `ALTER TABLE gov_bid_values ADD CONSTRAINT ck_gov_bid_values_confirmed_by_present
       CHECK (length(btrim(confirmed_by)) > 0)`,

    // A supersede is both-or-neither: a row stamped as replaced must say what replaced it,
    // or the history becomes unreadable in exactly the way an UPDATE would have made it.
    `ALTER TABLE gov_bid_values DROP CONSTRAINT IF EXISTS ck_gov_bid_values_supersede_paired`,
    `ALTER TABLE gov_bid_values ADD CONSTRAINT ck_gov_bid_values_supersede_paired
       CHECK ((superseded_at IS NULL) = (superseded_by_id IS NULL))`,

    // The bid must be a real delivery project. Unlike the evidence spine's deliberately
    // unconstrained initiative pointer, this column has exactly one referent and a dangling
    // price would be money attributed to nothing.
    `ALTER TABLE gov_bid_values DROP CONSTRAINT IF EXISTS fk_gov_bid_values_delivery_project`,
    `ALTER TABLE gov_bid_values ADD CONSTRAINT fk_gov_bid_values_delivery_project
       FOREIGN KEY (delivery_project_id) REFERENCES delivery_projects(id) ON DELETE CASCADE`,
  ];
}

/**
 * Create the table and its rails. Idempotent, and each statement is attempted
 * independently so one failure cannot silently abandon the rest — the failure mode R14 was
 * written about.
 */
export async function ensureGovBidValueSchema(): Promise<void> {
  for (const sql of govBidValueStatements()) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      // Logged with the statement's opening line so a warn in the boot log is actionable
      // rather than a shrug. Ten anonymous warns are how the R14 outage stayed invisible.
      const head = sql.trim().split('\n')[0].slice(0, 110);
      console.warn(`[DB] gov_bid_values statement failed (${head}): ${err?.message}`);
    }
  }
}

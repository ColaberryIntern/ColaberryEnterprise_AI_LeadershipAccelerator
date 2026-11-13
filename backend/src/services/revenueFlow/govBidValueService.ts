/**
 * R16 — recording and reading what a government bid is worth.
 *
 * The write side of `gov_bid_values`. Everything that prices a bid goes through here, for
 * the same reason the evidence spine funnels every read through one service: the rules below
 * are the table's value, and a caller that goes around them produces a pipeline total that
 * looks right and is not.
 *
 * ── THE RULES ────────────────────────────────────────────────────────────────────────────
 *
 * 1. A PRICE IS A HUMAN'S CLAIM. `confirmedBy` is required and must name a person. There is
 *    no job-writable path into this table, deliberately. Pricing a bid is the confirmation
 *    that it is a real pursuit, which is the thing `revenueInitiatives.ts` has said is
 *    missing since R1 and named as the government card's `unlockedBy`.
 *
 * 2. A PRICE WITHOUT A BASIS IS REFUSED. Not "warned about" — refused, with a message that
 *    says what a basis looks like. "RFP" is not a basis. "Section 2.4 states a
 *    not-to-exceed of $450,000 over 3 years" is. The database enforces the floor too, so a
 *    direct psql insert cannot bypass it.
 *
 * 3. A CORRECTION SUPERSEDES, IT NEVER OVERWRITES. Re-pricing inserts a new row and stamps
 *    the old one. So "the value was revised" becomes a dated event the timeline shows,
 *    rather than history quietly disappearing. Both writes happen in ONE transaction, so a
 *    crash between them cannot leave a bid with two live prices or none.
 *
 * 4. THE TERM IS STORED OR ADMITTED. A five-year contract and a one-year contract are both
 *    "proposal value". `periodMonths` null means nobody recorded the term, and the
 *    annualized figure is then withheld rather than guessed.
 */
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  MIN_VALUE_BASIS_CHARS,
  VALUE_BASIS_SOURCES,
  ValueBasisSource,
} from '../../db/ensureGovBidValueSchema';

export interface BidValue {
  id: string;
  deliveryProjectId: string;
  proposalValueCents: number;
  currency: string;
  periodMonths: number | null;
  valueBasis: string;
  basisSource: ValueBasisSource;
  confirmedBy: string;
  confirmedAt: string;
  supersededAt: string | null;
  notes: string | null;
}

export interface ConfirmBidValueInput {
  deliveryProjectId: string;
  proposalValueCents: number;
  valueBasis: string;
  basisSource: ValueBasisSource;
  confirmedBy: string;
  periodMonths?: number | null;
  currency?: string;
  notes?: string | null;
  /** Injectable so tests are deterministic. Never defaulted inside the SQL. */
  now?: Date;
}

export class BidValueRejected extends Error {
  readonly error_class = 'ValidationError';
  constructor(message: string) {
    super(message);
    this.name = 'BidValueRejected';
  }
}

/** True when the table exists. A missing table is not an empty one. */
export async function bidValueTableExists(): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'gov_bid_values'`,
    { type: QueryTypes.SELECT },
  );
  return (rows[0]?.n ?? 0) > 0;
}

interface Row {
  id: string;
  delivery_project_id: string;
  proposal_value_cents: string | number;
  currency: string;
  period_months: number | null;
  value_basis: string;
  basis_source: ValueBasisSource;
  confirmed_by: string;
  confirmed_at: string;
  superseded_at: string | null;
  notes: string | null;
}

/**
 * `proposal_value_cents` is BIGINT, which `pg` returns as a STRING to avoid silently
 * losing precision above 2^53. Parsing it here rather than at each call site is the
 * difference between a total and a string concatenation — a bug that would read as a
 * plausible but enormous number, which is the worst kind on a revenue page.
 */
function toBidValue(r: Row): BidValue {
  return {
    id: r.id,
    deliveryProjectId: r.delivery_project_id,
    proposalValueCents: Number(r.proposal_value_cents),
    currency: r.currency,
    periodMonths: r.period_months,
    valueBasis: r.value_basis,
    basisSource: r.basis_source,
    confirmedBy: r.confirmed_by,
    confirmedAt: r.confirmed_at,
    supersededAt: r.superseded_at,
    notes: r.notes,
  };
}

/** Reject anything that would put an unaccountable number on Ram's screen. */
function validate(input: ConfirmBidValueInput): void {
  if (!input.deliveryProjectId || !/^[0-9a-f-]{36}$/i.test(input.deliveryProjectId)) {
    throw new BidValueRejected('deliveryProjectId must be the bid\'s delivery project UUID.');
  }
  if (!Number.isInteger(input.proposalValueCents) || input.proposalValueCents < 0) {
    throw new BidValueRejected(
      'proposalValueCents must be a whole number of cents, zero or more. '
      + 'A dollar amount with a decimal point is the usual cause.',
    );
  }
  if (!VALUE_BASIS_SOURCES.includes(input.basisSource)) {
    throw new BidValueRejected(
      `basisSource must be one of: ${VALUE_BASIS_SOURCES.join(', ')}. `
      + 'It records how strong the number is, so it cannot be left to default.',
    );
  }
  const basis = String(input.valueBasis ?? '').trim();
  if (basis.length < MIN_VALUE_BASIS_CHARS) {
    throw new BidValueRejected(
      `valueBasis must be at least ${MIN_VALUE_BASIS_CHARS} characters and say where the `
      + 'number came from, specifically enough that someone else could check it. '
      + '"RFP" is not a basis; "Section 2.4 states a not-to-exceed of $450,000 over 3 '
      + 'years" is.',
    );
  }
  if (!String(input.confirmedBy ?? '').trim()) {
    throw new BidValueRejected(
      'confirmedBy must name the person recording this value. A priced bid is only '
      + 'trustworthy because a human put their name against it, so there is no '
      + 'job-writable path here.',
    );
  }
  if (input.periodMonths !== undefined && input.periodMonths !== null) {
    if (!Number.isInteger(input.periodMonths) || input.periodMonths <= 0) {
      throw new BidValueRejected(
        'periodMonths must be a positive whole number of months, or omitted entirely to '
        + 'mean the term was not recorded.',
      );
    }
  }
}

/**
 * Price a bid, superseding any value it already had.
 *
 * Returns the new live value and the one it replaced, so a caller can tell a first price
 * from a revision without a second query — which is what lets the timeline classify the
 * event as `bid_priced` or `bid_repriced` correctly.
 */
export async function confirmBidValue(
  input: ConfirmBidValueInput,
): Promise<{ value: BidValue; superseded: BidValue | null }> {
  validate(input);
  if (!(await bidValueTableExists())) {
    throw new BidValueRejected(
      'gov_bid_values is not present in this database, so a value cannot be recorded. '
      + 'A missing table is not an empty one.',
    );
  }

  const now = input.now ?? new Date();

  // ONE transaction. Superseding the old row and inserting the new one are halves of a
  // single fact, and the partial unique index means a crash between them would otherwise
  // leave the bid either double-priced (index refuses, write lost) or unpriced.
  return sequelize.transaction(async (t: Transaction) => {
    const existing = await sequelize.query<Row>(
      `SELECT * FROM gov_bid_values
        WHERE delivery_project_id = :pid AND superseded_at IS NULL
        FOR UPDATE`,
      { type: QueryTypes.SELECT, replacements: { pid: input.deliveryProjectId }, transaction: t },
    );
    const prior = existing[0] ? toBidValue(existing[0]) : null;

    const inserted = await sequelize.query<Row>(
      `INSERT INTO gov_bid_values
         (delivery_project_id, proposal_value_cents, currency, period_months,
          value_basis, basis_source, confirmed_by, confirmed_at, notes)
       VALUES (:pid, :cents, :currency, :period, :basis, :source, :by, :at, :notes)
       RETURNING *`,
      {
        type: QueryTypes.SELECT,
        transaction: t,
        replacements: {
          pid: input.deliveryProjectId,
          cents: input.proposalValueCents,
          currency: (input.currency ?? 'USD').toUpperCase(),
          period: input.periodMonths ?? null,
          basis: String(input.valueBasis).trim(),
          source: input.basisSource,
          by: String(input.confirmedBy).trim(),
          at: now,
          notes: input.notes ?? null,
        },
      },
    );
    const fresh = toBidValue(inserted[0]);

    // Stamped AFTER the insert so `superseded_by_id` can point at a row that exists. The
    // partial unique index tolerates this order because the old row stops being live in the
    // same statement that records its replacement.
    if (prior) {
      await sequelize.query(
        `UPDATE gov_bid_values
            SET superseded_at = :at, superseded_by_id = :newId, updated_at = NOW()
          WHERE id = :oldId`,
        {
          type: QueryTypes.UPDATE,
          transaction: t,
          replacements: { at: now, newId: fresh.id, oldId: prior.id },
        },
      );
    }

    return { value: fresh, superseded: prior };
  });
}

/** Every live price, newest confirmation first. Empty when the table is absent. */
export async function getLiveBidValues(): Promise<BidValue[]> {
  if (!(await bidValueTableExists())) return [];
  const rows = await sequelize.query<Row>(
    `SELECT * FROM gov_bid_values WHERE superseded_at IS NULL ORDER BY confirmed_at DESC`,
    { type: QueryTypes.SELECT },
  );
  return rows.map(toBidValue);
}

/**
 * The full price history of one bid, oldest first.
 *
 * Oldest first on purpose: a revision only reads as a revision when the reader meets the
 * original before its replacement.
 */
export async function getBidValueHistory(deliveryProjectId: string): Promise<BidValue[]> {
  if (!(await bidValueTableExists())) return [];
  const rows = await sequelize.query<Row>(
    `SELECT * FROM gov_bid_values
      WHERE delivery_project_id = :pid
      ORDER BY confirmed_at ASC`,
    { type: QueryTypes.SELECT, replacements: { pid: deliveryProjectId } },
  );
  return rows.map(toBidValue);
}

/**
 * Annualize a priced bid, or refuse to.
 *
 * Returns null when the term was not recorded. That is the whole reason `periodMonths`
 * exists: a $5M five-year contract annualizes to $1M, and reporting the $5M beside $72.8K
 * of annual membership revenue invites precisely the comparison that is wrong. Guessing
 * twelve months would be worse than saying nothing, so this says nothing.
 */
export function annualizedCents(value: BidValue): number | null {
  if (!value.periodMonths || value.periodMonths <= 0) return null;
  return Math.round((value.proposalValueCents / value.periodMonths) * 12);
}

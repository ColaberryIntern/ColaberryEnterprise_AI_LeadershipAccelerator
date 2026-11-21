import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  DEAL_BASIS_SOURCES,
  DealBasisSource,
  MIN_DEAL_BASIS_CHARS,
} from '../../db/ensureEnterpriseDealValueSchema';

/**
 * R23 Phase 2 — reading and writing what an enterprise deal is worth.
 *
 * The table's own header carries the design. This module is the only way in, and it exists
 * to hold three rules that a bare INSERT would let a caller skip:
 *
 *   1. `confirmedBy` names a person, and the caller must get it from the session. The W28
 *      intake is AI-driven end to end, so a value written without a human's name would be
 *      the model's estimate of its own pipeline printed on a money board.
 *   2. A basis long enough to be checked by somebody else.
 *   3. A revision SUPERSEDES rather than overwrites, in one transaction.
 *
 * It is modelled line for line on `govBidValueService`, because the problem is the same
 * problem and two different shapes for it would be two things to learn.
 */

/** A value was refused. The message is the useful part: it says what a usable one looks like. */
export class DealValueRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DealValueRejected';
  }
}

export interface DealValue {
  id: string;
  enterpriseIntakeId: string;
  dealValueCents: number;
  currency: string;
  periodMonths: number | null;
  valueBasis: string;
  basisSource: DealBasisSource;
  confirmedBy: string;
  confirmedAt: string;
  supersededAt: string | null;
  supersededById: string | null;
  notes: string | null;
}

export interface ConfirmDealValueInput {
  enterpriseIntakeId: string;
  dealValueCents: number;
  valueBasis: string;
  basisSource: DealBasisSource;
  periodMonths?: number | null;
  currency?: string;
  notes?: string | null;
  /** From the session. Never from a request body. */
  confirmedBy: string;
  /** Injectable for tests; defaults to now. */
  now?: Date;
}

interface Row {
  id: string;
  enterprise_intake_id: string;
  deal_value_cents: string | number;
  currency: string;
  period_months: number | null;
  value_basis: string;
  basis_source: string;
  confirmed_by: string;
  confirmed_at: string | Date;
  superseded_at: string | Date | null;
  superseded_by_id: string | null;
  notes: string | null;
}

const iso = (v: string | Date | null): string | null =>
  (v === null ? null : new Date(v).toISOString());

function toDealValue(r: Row): DealValue {
  return {
    id: r.id,
    enterpriseIntakeId: r.enterprise_intake_id,
    // BIGINT comes back as a string from pg. Number() is safe here and the ceiling is stated
    // rather than assumed: 2^53 cents is about $90 trillion, so the only way to exceed it is
    // a typo, which the basis requirement makes someone explain in writing anyway.
    dealValueCents: Number(r.deal_value_cents),
    currency: r.currency,
    periodMonths: r.period_months,
    valueBasis: r.value_basis,
    basisSource: r.basis_source as DealBasisSource,
    confirmedBy: r.confirmed_by,
    confirmedAt: iso(r.confirmed_at) as string,
    supersededAt: iso(r.superseded_at),
    supersededById: r.superseded_by_id,
    notes: r.notes,
  };
}

/**
 * Whether the table is there at all.
 *
 * Checked rather than assumed, and the distinction is load bearing everywhere on this
 * surface: a missing table is `unmeasurable`, an empty one is a measured zero. The read paths
 * below return `[]` when it is absent, and the WRITE path throws, because silently accepting
 * a value nobody can store would be the worst of the three outcomes.
 */
export async function dealValueTableExists(): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'enterprise_deal_values'`,
    { type: QueryTypes.SELECT },
  );
  return (rows[0]?.n ?? 0) > 0;
}

function validate(input: ConfirmDealValueInput): void {
  if (!input.enterpriseIntakeId || !String(input.enterpriseIntakeId).trim()) {
    throw new DealValueRejected('An enterprise intake id is required.');
  }
  if (!Number.isInteger(input.dealValueCents)) {
    throw new DealValueRejected(
      'dealValueCents must be a whole number of CENTS, not dollars. The usual cause is '
      + 'passing a dollar amount: $45,000 is 4500000, not 45000.',
    );
  }
  if (input.dealValueCents < 0) {
    throw new DealValueRejected('A deal cannot be worth less than nothing.');
  }
  if (!DEAL_BASIS_SOURCES.includes(input.basisSource as DealBasisSource)) {
    throw new DealValueRejected(
      `basisSource must be one of: ${DEAL_BASIS_SOURCES.join(', ')}.`,
    );
  }
  const basis = String(input.valueBasis ?? '').trim();
  if (basis.length < MIN_DEAL_BASIS_CHARS) {
    throw new DealValueRejected(
      `valueBasis must be at least ${MIN_DEAL_BASIS_CHARS} characters, and must be something `
      + 'another person could check. "SOW" is not a basis; "SOW dated 2026-12-02, three '
      + 'phases at $45,000 each, countersigned by their CTO" is.',
    );
  }
  if (!String(input.confirmedBy ?? '').trim()) {
    throw new DealValueRejected(
      'A deal value must name the person confirming it. This intake was run by an AI from '
      + 'end to end, so an unattributed figure would be the model pricing its own pipeline.',
    );
  }
  if (input.periodMonths !== undefined && input.periodMonths !== null) {
    if (!Number.isInteger(input.periodMonths) || input.periodMonths <= 0) {
      throw new DealValueRejected(
        'periodMonths must be a positive whole number of months, or omitted entirely to mean '
        + 'the term was not recorded.',
      );
    }
  }
}

/**
 * Record what a deal is worth, superseding any value it already had.
 *
 * Returns the new live value and the one it replaced, so a caller can tell a first value from
 * a revision without a second query — which is what lets the timeline classify the event as
 * `enterprise_priced` or `enterprise_repriced` correctly.
 */
export async function confirmDealValue(
  input: ConfirmDealValueInput,
): Promise<{ value: DealValue; superseded: DealValue | null }> {
  validate(input);
  if (!(await dealValueTableExists())) {
    throw new DealValueRejected(
      'enterprise_deal_values is not present in this database, so a value cannot be '
      + 'recorded. A missing table is not an empty one.',
    );
  }

  const now = input.now ?? new Date();

  // ONE transaction. Superseding the old row and inserting the new one are halves of a single
  // fact, and the partial unique index means a crash between them would otherwise leave the
  // deal either double-valued (index refuses, write lost) or unpriced.
  return sequelize.transaction(async (t: Transaction) => {
    const existing = await sequelize.query<Row>(
      `SELECT * FROM enterprise_deal_values
        WHERE enterprise_intake_id = :iid AND superseded_at IS NULL
        FOR UPDATE`,
      { type: QueryTypes.SELECT, replacements: { iid: input.enterpriseIntakeId }, transaction: t },
    );
    const prior = existing[0] ? toDealValue(existing[0]) : null;

    const inserted = await sequelize.query<Row>(
      `INSERT INTO enterprise_deal_values
         (enterprise_intake_id, deal_value_cents, currency, period_months,
          value_basis, basis_source, confirmed_by, confirmed_at, notes)
       VALUES (:iid, :cents, :currency, :period, :basis, :source, :by, :at, :notes)
       RETURNING *`,
      {
        type: QueryTypes.SELECT,
        transaction: t,
        replacements: {
          iid: input.enterpriseIntakeId,
          cents: input.dealValueCents,
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
    const fresh = toDealValue(inserted[0]);

    // Stamped AFTER the insert so `superseded_by_id` can point at a row that exists. The
    // partial unique index tolerates this order because the old row stops being live in the
    // same statement that records its replacement.
    if (prior) {
      await sequelize.query(
        `UPDATE enterprise_deal_values
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

/** Every live value, newest confirmation first. Empty when the table is absent. */
export async function getLiveDealValues(): Promise<DealValue[]> {
  if (!(await dealValueTableExists())) return [];
  const rows = await sequelize.query<Row>(
    `SELECT * FROM enterprise_deal_values
      WHERE superseded_at IS NULL
      ORDER BY confirmed_at DESC`,
    { type: QueryTypes.SELECT },
  );
  return rows.map(toDealValue);
}

/**
 * The full value history of one deal, oldest first, so a revision reads as a revision.
 *
 * Includes superseded rows deliberately: the first number against the signed number is often
 * the most informative line on the page, and an UPDATE would have thrown it away.
 */
export async function getDealValueHistory(enterpriseIntakeId: string): Promise<DealValue[]> {
  if (!(await dealValueTableExists())) return [];
  const rows = await sequelize.query<Row>(
    `SELECT * FROM enterprise_deal_values
      WHERE enterprise_intake_id = :iid
      ORDER BY confirmed_at ASC`,
    { type: QueryTypes.SELECT, replacements: { iid: enterpriseIntakeId } },
  );
  return rows.map(toDealValue);
}

/**
 * The value expressed per year, or null when the term was not recorded.
 *
 * Null rather than the raw figure, and that is the point: a twelve-month build and a
 * one-week training engagement are not comparable, and assuming twelve months for a deal
 * nobody timed would silently flatter a short one. The headline shows total contract value
 * and this side by side, labelled, never summed.
 */
export function annualizedCents(value: DealValue): number | null {
  if (value.periodMonths === null || value.periodMonths <= 0) return null;
  return Math.round((value.dealValueCents / value.periodMonths) * 12);
}

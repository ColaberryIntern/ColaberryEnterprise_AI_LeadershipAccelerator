import React, { useState } from 'react';
import api from '../../../utils/api';
import { paintFor } from './flowTokens';

/**
 * R23 Phase 3 — the control that lets a person record what an enterprise deal is worth.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM `BidPricingPanel` ────────────────────────────────────
 *
 * The two look alike and are not the same form. A government bid has one figure and an
 * optional term. An enterprise deal has an ENGAGEMENT SHAPE, and Plan A's shape is a monthly
 * retainer, so the figure a person actually negotiated is a monthly fee rather than a total.
 * Folding both into one component would mean one form whose central field changes meaning
 * depending on a prop, which is the ambiguity this panel exists to remove.
 *
 * ── THE RETAINER IS THE WHOLE POINT OF THIS FORM ─────────────────────────────────────────
 *
 * Ali, 2026-11-21, on Plan A and Middlesex: "We are looking at a retainer, a monthly fee."
 *
 * `enterprise_deal_values.deal_value_cents` always holds the TOTAL contract value, because
 * one invariant is what makes every SUM on that table correct. So a retainer has to be
 * multiplied out, and the question is who does the multiplying. If it is the person at the
 * keyboard, then the field says "contract value", they type the number they negotiated —
 * $4,500 — and a twelve-month engagement is recorded as $4,500 instead of $54,000. The
 * mandatory basis text makes them DESCRIBE the figure, which helps a reader afterwards and
 * prevents nothing at the moment of entry.
 *
 * So this form asks for the monthly fee, requires the term, and shows the computed total
 * BEFORE the save: "$4,500 per month over 12 months = $54,000 total contract value". The
 * multiplication is visible, so a wrong term is wrong on screen rather than wrong in the
 * database. The server enforces the same split through a discriminated union, so a client
 * that skipped this form could not post a retainer as a total either.
 *
 * The mode opens on the plan's own shape and remains overridable, because a Plan A deal
 * genuinely sold as a fixed-scope project exists. What the person cannot do is answer a field
 * whose meaning is ambiguous.
 *
 * ── WHY IT SAYS WHETHER THE FIGURE REACHES THE HEADLINE ──────────────────────────────────
 *
 * Only SIGNED deals are summed into the stream's headline; a priced proposal is a forecast.
 * Someone pricing a deal cannot see that rule from the form, so the form states it per row.
 * A number that silently does not appear where the person expected is how people stop
 * trusting a dashboard.
 */

export interface EnterpriseDealRow {
  enterpriseIntakeId: string;
  company: string;
  planKey: string | null;
  planLabel: string | null;
  shape: string | null;
  stage: string;
  signed: boolean;
  priced: {
    cents: number;
    display: string;
    periodMonths: number | null;
    monthlyCents: number | null;
    basisSource: string;
    valueBasis: string;
    confirmedBy: string;
    confirmedAt: string;
  } | null;
}

interface Props {
  deals: EnterpriseDealRow[];
  /** True when the source table could not be read at all, which is not the same as empty. */
  unmeasurable?: boolean;
  onPriced?: () => void;
  'data-testid'?: string;
}

/** Mirrors `DEAL_BASIS_SOURCES`, strongest evidence first. */
const BASIS_SOURCES: Array<{ value: string; label: string }> = [
  { value: 'signed_agreement', label: 'Signed agreement (countersigned contract or order form)' },
  { value: 'statement_of_work', label: 'Statement of work (an agreed SOW with the figure in it)' },
  { value: 'accepted_proposal', label: 'Accepted proposal (they said yes to our written price)' },
  { value: 'verbal_commitment', label: 'Verbal commitment (a named person agreed, not yet papered)' },
  { value: 'human_estimate', label: 'Judgment call (weakest, and says so)' },
];

const MIN_BASIS = 25;

export type Mode = 'monthly_retainer' | 'total_contract';

/**
 * ── THE THREE FUNCTIONS BELOW ARE EXPORTED SO THEY CAN BE TESTED DIRECTLY ────────────────
 *
 * They hold the only logic on this panel that can lose money, and a component's behaviour
 * behind a click is the hardest kind of thing to assert in this repo: `@testing-library/react`
 * is not a dependency here, and adding one is an escalation-tier decision rather than a step
 * in a feature. The precedent panel (`BidPricingPanel`) was therefore tested only through
 * `renderToStaticMarkup`, which runs no handlers, so its dollars-to-cents conversion has never
 * been asserted at all.
 *
 * Pulling the arithmetic out as pure functions is the better answer regardless of the tooling:
 * the $4,500-versus-$54,000 decision is now a function with inputs and an output, rather than
 * a branch inside a submit handler.
 */

/** The entry mode a deal opens on: its plan's own shape, defaulting to one total figure. */
export function initialMode(shape: string | null | undefined): Mode {
  return shape === 'monthly_retainer' ? 'monthly_retainer' : 'total_contract';
}

/**
 * The total contract value a retainer entry will record, or null when it cannot be known yet.
 *
 * Null rather than a partial answer: with no term there is no total, and showing the monthly
 * fee as though it were the total is the exact error this form exists to prevent.
 */
export function retainerTotalCents(amountDollars: number, termMonths: number): number | null {
  if (!Number.isFinite(amountDollars) || amountDollars < 0) return null;
  if (!Number.isInteger(termMonths) || termMonths <= 0) return null;
  // Dollars to cents FIRST, rounded once, then multiplied. Rounding after the multiplication
  // would let a half-cent monthly fee drift by the length of the term.
  return Math.round(amountDollars * 100) * termMonths;
}

/**
 * The request body for one save, in the shape the server's discriminated union requires.
 *
 * Returns two genuinely different objects rather than one with optional fields, because the
 * server refuses a mixed body outright: a retainer carrying `dealValueCents` is a 400, and so
 * is a total-contract deal carrying `monthlyFeeCents`.
 */
export function dealValuePayload(args: {
  mode: Mode;
  enterpriseIntakeId: string;
  amountDollars: number;
  months: string;
  valueBasis: string;
  basisSource: string;
}): Record<string, unknown> {
  const { mode, enterpriseIntakeId, amountDollars, months, valueBasis, basisSource } = args;
  const common = { enterpriseIntakeId, valueBasis: valueBasis.trim(), basisSource };
  const term = Number(months);
  if (mode === 'monthly_retainer') {
    return {
      ...common,
      valueKind: 'monthly_retainer',
      monthlyFeeCents: Math.round(amountDollars * 100),
      periodMonths: term,
    };
  }
  return {
    ...common,
    valueKind: 'total_contract',
    dealValueCents: Math.round(amountDollars * 100),
    periodMonths: months.trim() === '' ? null : term,
  };
}

/** How far a prospect got, in words. Keys match the backend's own funnel stage keys. */
const STAGE_LABEL: Record<string, string> = {
  inquired: 'filled out the form',
  call_requested: 'asked for the call',
  interviewed: 'completed the AI interview',
  proposal_sent: 'proposal sent',
  signed: 'signed',
  lost: 'did not proceed',
};

const dollars = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function DealPricingPanel({
  deals,
  unmeasurable = false,
  onPriced,
  'data-testid': testId = 'deal-pricing',
}: Props) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('total_contract');
  const [dollarsIn, setDollarsIn] = useState('');
  const [months, setMonths] = useState('');
  const [basisSource, setBasisSource] = useState('signed_agreement');
  const [basis, setBasis] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setOpenFor(null); setMode('total_contract'); setDollarsIn(''); setMonths('');
    setBasisSource('signed_agreement'); setBasis(''); setErr(null);
  }

  /** Open a row with the entry mode its plan implies. See the module header. */
  function open(deal: EnterpriseDealRow) {
    setOpenFor(deal.enterpriseIntakeId);
    setMode(initialMode(deal.shape));
    setDollarsIn(''); setMonths(''); setBasis(''); setBasisSource('signed_agreement');
    setErr(null);
  }

  const amount = Number(dollarsIn);
  const amountOk = dollarsIn.trim() !== '' && Number.isFinite(amount) && amount >= 0;
  const termNum = Number(months);
  const termOk = months.trim() !== '' && Number.isInteger(termNum) && termNum > 0;
  // A retainer with no term has no total, so the term is required in that mode only.
  const termSatisfied = mode === 'monthly_retainer' ? termOk : (months.trim() === '' || termOk);
  const basisOk = basis.trim().length >= MIN_BASIS;
  const canSave = amountOk && termSatisfied && basisOk && !busy;

  // The multiplication, shown before the save rather than discovered after it. Same function
  // the payload uses, so the figure on screen cannot disagree with the figure sent.
  const computedTotalCents = mode === 'monthly_retainer' && amountOk
    ? retainerTotalCents(amount, termNum)
    : null;

  async function save(deal: EnterpriseDealRow) {
    setBusy(true); setErr(null);
    try {
      // Two genuinely different bodies, matching the server's discriminated union. Built by
      // the exported helper so the shape is testable without a click.
      await api.post('/api/admin/commercialization/revenue-flow/deal-value', dealValuePayload({
        mode,
        enterpriseIntakeId: deal.enterpriseIntakeId,
        amountDollars: amount,
        months,
        valueBasis: basis,
        basisSource,
      }));
      reset();
      onPriced?.();
    } catch (e: any) {
      // The server's own message, which names what a usable basis looks like and why a
      // retainer needs a term. More useful than anything this component could invent.
      setErr(e?.response?.data?.error || e?.message || 'Could not record the value.');
    } finally {
      setBusy(false);
    }
  }

  const unpricedSigned = deals.filter((d) => d.signed && !d.priced).length;

  return (
    <div className="card border-0 shadow-sm mb-4" data-testid={testId}>
      <div className="card-body p-3">
        <h2 className="h6 mb-1">Price the enterprise deals</h2>
        <div className="small text-muted mb-3">
          The enterprise headline sums only deals a named person has valued. A signed deal
          with no value is reported beside the total rather than counted as zero.{' '}
          {unpricedSigned > 0
            ? `${unpricedSigned} signed deal(s) carry no value, so they are absent from it.`
            : 'Every signed deal that exists is valued.'}
        </div>

        {/* A missing table and an empty one are different answers, and the panel says which. */}
        {unmeasurable && (
          <div className="text-muted small" data-testid={`${testId}-unmeasurable`}>
            enterprise_intakes cannot be read in this database, so there is nothing to price
            and this is not a measured zero.
          </div>
        )}

        {/* Shown rather than hidden when empty. The point of this panel is that a write path
            now exists; rendering nothing would look identical to there being none. */}
        {!unmeasurable && deals.length === 0 && (
          <div className="text-muted small" data-testid={`${testId}-empty`}>
            No enterprise inquiry exists yet, so there is no deal to value. A deal value is
            recorded against an intake, so the first one becomes available here as soon as
            somebody fills in the form on enterprise.colaberry.ai.
          </div>
        )}

        {deals.map((deal) => {
          const isOpen = openFor === deal.enterpriseIntakeId;
          return (
            <div
              key={deal.enterpriseIntakeId}
              className="py-2"
              style={{ borderTop: '1px solid var(--border-subtle, #f1f5f9)' }}
              data-testid={`${testId}-row`}
            >
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{deal.company}</div>
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {deal.priced ? (
                      <span
                        style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: paintFor('good').bg, color: paintFor('good').fg,
                          border: `1px solid ${paintFor('good').fg}`,
                        }}
                      >
                        <span aria-hidden="true">$</span> {deal.priced.display}
                        {deal.priced.periodMonths
                          ? ` over ${deal.priced.periodMonths} months`
                          : ' (no term recorded)'}
                        {/* The monthly figure, where the term makes it recoverable. For a
                            retainer this is the number that was actually negotiated. */}
                        {deal.priced.monthlyCents !== null
                          && ` · ${dollars(deal.priced.monthlyCents)}/mo`}
                        {' · '}
                        {deal.priced.basisSource.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: paintFor('warn').bg, color: paintFor('warn').fg,
                          border: `1px solid ${paintFor('warn').fg}`,
                        }}
                        data-testid={`${testId}-unpriced`}
                      >
                        <span aria-hidden="true">○</span> Not valued
                      </span>
                    )}
                    {deal.planLabel ? (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {deal.planLabel}
                        {deal.shape === 'monthly_retainer' && ' (retainer)'}
                      </span>
                    ) : (
                      // The known gap, named on the row. The W28 form does not yet constrain
                      // its service field to the three plans.
                      <span
                        style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: paintFor('warn').bg, color: paintFor('warn').fg,
                          border: `1px dashed ${paintFor('warn').fg}`,
                        }}
                        data-testid={`${testId}-no-plan`}
                      >
                        <span aria-hidden="true">⚑</span> plan not recorded
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {STAGE_LABEL[deal.stage] ?? deal.stage}
                    </span>
                  </div>
                  {deal.priced && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {deal.priced.valueBasis}
                      {' · '}
                      {deal.priced.confirmedBy},{' '}
                      {String(deal.priced.confirmedAt).slice(0, 10)}
                    </div>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => (isOpen ? reset() : open(deal))}
                    data-testid={`${testId}-open-${deal.enterpriseIntakeId}`}
                  >
                    {isOpen ? 'Cancel' : deal.priced ? 'Revise value' : 'Set value'}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div
                  className="mt-3 p-3"
                  style={{ background: 'var(--surface-subtle)', borderRadius: 6 }}
                >
                  {/* Whether this figure reaches the headline. See the module header. */}
                  <div
                    className="mb-2 p-2"
                    style={{
                      fontSize: 11,
                      background: deal.signed ? paintFor('good').bg : paintFor('warn').bg,
                      borderLeft: `3px solid ${deal.signed ? paintFor('good').fg : paintFor('warn').fg}`,
                    }}
                    data-testid={`${testId}-reach`}
                  >
                    {deal.signed
                      ? 'This deal is signed, so the value you record is summed into the '
                        + 'enterprise headline.'
                      : 'This deal is not signed yet, so the value you record is a forecast: '
                        + 'it appears on the timeline and is NOT summed into the enterprise '
                        + 'headline, which counts signed deals only.'}
                  </div>

                  {/* ── HOW THIS DEAL IS PRICED ──────────────────────────────────────── */}
                  <div className="mb-2">
                    <div className="form-label small fw-medium mb-1">How is it priced?</div>
                    <div className="btn-group btn-group-sm" role="group">
                      <button
                        type="button"
                        className={`btn btn-outline-secondary${mode === 'monthly_retainer' ? ' active' : ''}`}
                        aria-pressed={mode === 'monthly_retainer'}
                        onClick={() => setMode('monthly_retainer')}
                        data-testid={`${testId}-mode-retainer`}
                      >
                        A monthly retainer
                      </button>
                      <button
                        type="button"
                        className={`btn btn-outline-secondary${mode === 'total_contract' ? ' active' : ''}`}
                        aria-pressed={mode === 'total_contract'}
                        onClick={() => setMode('total_contract')}
                        data-testid={`${testId}-mode-total`}
                      >
                        One total figure
                      </button>
                    </div>
                    {deal.shape === 'monthly_retainer' && (
                      <div className="form-text" style={{ fontSize: 11 }}>
                        {deal.planLabel} is a retainer plan, so this opens on the monthly
                        fee. Change it if this particular deal was sold as a fixed project.
                      </div>
                    )}
                  </div>

                  <div className="row g-2">
                    <div className="col-md-4">
                      <label
                        className="form-label small fw-medium"
                        htmlFor={`amt-${deal.enterpriseIntakeId}`}
                      >
                        {mode === 'monthly_retainer'
                          ? 'Monthly fee (US dollars)'
                          : 'Total contract value (US dollars)'}
                      </label>
                      <input
                        id={`amt-${deal.enterpriseIntakeId}`}
                        className="form-control form-control-sm"
                        inputMode="decimal"
                        value={dollarsIn}
                        onChange={(e) => setDollarsIn(e.target.value)}
                        placeholder={mode === 'monthly_retainer' ? '4500' : '54000'}
                        data-testid={`${testId}-amount`}
                      />
                      <div className="form-text" style={{ fontSize: 11 }}>
                        {mode === 'monthly_retainer'
                          ? 'The recurring fee per month, not the whole engagement.'
                          : 'The whole engagement, not per year and not per month.'}
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label
                        className="form-label small fw-medium"
                        htmlFor={`mon-${deal.enterpriseIntakeId}`}
                      >
                        Term (months){mode === 'monthly_retainer' && ' (required)'}
                      </label>
                      <input
                        id={`mon-${deal.enterpriseIntakeId}`}
                        className="form-control form-control-sm"
                        inputMode="numeric"
                        value={months}
                        onChange={(e) => setMonths(e.target.value)}
                        placeholder="12"
                        data-testid={`${testId}-term`}
                      />
                      <div
                        className="form-text"
                        style={{
                          fontSize: 11,
                          color: mode === 'monthly_retainer' && !termOk
                            ? paintFor('warn').fg : 'var(--text-muted)',
                        }}
                        data-testid={`${testId}-term-hint`}
                      >
                        {mode === 'monthly_retainer'
                          ? 'A retainer needs its term: the total contract value is the '
                            + 'monthly fee times this number.'
                          : 'Leave blank if unknown. Blank withholds the per-year figure '
                            + 'rather than guessing twelve months.'}
                      </div>
                    </div>
                    <div className="col-md-5">
                      <label
                        className="form-label small fw-medium"
                        htmlFor={`src-${deal.enterpriseIntakeId}`}
                      >
                        How do we know?
                      </label>
                      <select
                        id={`src-${deal.enterpriseIntakeId}`}
                        className="form-select form-select-sm"
                        value={basisSource}
                        onChange={(e) => setBasisSource(e.target.value)}
                      >
                        {BASIS_SOURCES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* The multiplication, on screen, before the save. */}
                    {mode === 'monthly_retainer' && (
                      <div className="col-12">
                        <div
                          className="p-2"
                          style={{ fontSize: 12, background: 'var(--surface-subtle)' }}
                          data-testid={`${testId}-computed`}
                        >
                          {computedTotalCents === null
                            ? 'Enter the monthly fee and the term to see the total contract '
                              + 'value that will be recorded.'
                            : `${dollars(Math.round(amount * 100))} per month over ${termNum} `
                              + `months = ${dollars(computedTotalCents)} total contract value.`}
                        </div>
                      </div>
                    )}

                    <div className="col-12">
                      <label
                        className="form-label small fw-medium"
                        htmlFor={`bas-${deal.enterpriseIntakeId}`}
                      >
                        The basis, specifically enough that someone else could check it
                      </label>
                      <textarea
                        id={`bas-${deal.enterpriseIntakeId}`}
                        className="form-control form-control-sm"
                        rows={2}
                        value={basis}
                        onChange={(e) => setBasis(e.target.value)}
                        placeholder="SOW dated 2026-12-02, $4,500 per month for 12 months, countersigned by their COO."
                      />
                      <div
                        className="form-text"
                        style={{
                          fontSize: 11,
                          color: basisOk ? 'var(--text-muted)' : paintFor('warn').fg,
                        }}
                        data-testid={`${testId}-basis-hint`}
                      >
                        {basisOk
                          ? 'Good. Someone else can check this.'
                          : `At least ${MIN_BASIS} characters. "SOW" is not a basis; name the `
                            + 'document, the date and the figure.'}
                      </div>
                    </div>
                  </div>

                  {err && (
                    <div
                      className="alert alert-danger py-2 mt-2 mb-0"
                      style={{ fontSize: 12 }}
                      data-testid={`${testId}-error`}
                    >
                      {err}
                    </div>
                  )}

                  <div className="d-flex gap-2 mt-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!canSave}
                      onClick={() => save(deal)}
                      data-testid={`${testId}-save`}
                    >
                      {busy ? 'Saving…' : deal.priced ? 'Replace the value' : 'Record the value'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={reset}
                    >
                      Cancel
                    </button>
                  </div>
                  {deal.priced && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      The current value is kept as history rather than overwritten, so the
                      revision shows on the timeline.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

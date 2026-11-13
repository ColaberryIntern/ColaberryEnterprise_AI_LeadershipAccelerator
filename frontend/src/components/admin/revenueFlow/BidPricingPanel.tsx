import React, { useState } from 'react';
import api from '../../../utils/api';
import { paintFor } from './flowTokens';

/**
 * R16 Phase 3 — the control that turns "14 flagged, none priced" into a number.
 *
 * ── WHY PRICING IS WRITTEN HERE AND OUTCOME IS NOT ───────────────────────────────────────
 *
 * Two different writes with two different owners.
 *
 * A PRICE is revenue work and had nowhere to live until R16 created `gov_bid_values`, so the
 * control is here and posts to this surface's own endpoint.
 *
 * An OUTCOME is program work. `POST /api/admin/factory/qualification/:id/outcome` already
 * exists, is tested, generates the private case-study and capability candidates on a win or
 * a loss, and sits behind its own `requireSection('program')` gate. This panel LINKS to the
 * Proposal Studio rather than re-implementing it. Saving a click is not worth a second write
 * path, because two paths are how a dashboard and a subsystem start disagreeing about
 * whether something was submitted.
 *
 * ── THE FORM REFUSES A NUMBER NOBODY CAN ACCOUNT FOR, AND SAYS WHY ───────────────────────
 *
 * The server rejects a `valueBasis` under 25 characters and the database enforces the same
 * floor, so a direct insert cannot bypass it. The form therefore shows the requirement up
 * front and disables submit until it is met, rather than letting someone type a figure, press
 * save, and receive a 400. A validation rule the user discovers by failing is a rule the
 * product is keeping from them.
 *
 * The amount is entered in DOLLARS and converted once, here, with a round. Cents are what
 * crosses the wire because `1234.56` has no exact binary representation and a pipeline total
 * that drifts by fractions of a cent per bid is a defect nobody finds for a year.
 */

export interface PricedValue {
  cents: number;
  display: string;
  periodMonths: number | null;
  basisSource: string;
  valueBasis: string;
  confirmedBy: string;
  confirmedAt: string;
}

export interface FlaggedBid {
  deliveryProjectId: string;
  canonicalOpportunityId: string | null;
  name: string;
  flags: string[];
  priced: PricedValue | null;
  outcome: string;
}

interface Props {
  bids: FlaggedBid[];
  onPriced?: () => void;
  'data-testid'?: string;
}

/** Mirrors `VALUE_BASIS_SOURCES`, strongest evidence first. */
const BASIS_SOURCES: Array<{ value: string; label: string }> = [
  { value: 'award_notice', label: 'Award notice (the agency told us)' },
  { value: 'solicitation_document', label: 'Solicitation document (printed in the RFP)' },
  { value: 'vendor_quote', label: 'Our own priced response' },
  { value: 'comparable_contract', label: 'A comparable award (name it in the basis)' },
  { value: 'human_estimate', label: 'Judgment call (weakest, and says so)' },
];

const MIN_BASIS = 25;

export default function BidPricingPanel({
  bids,
  onPriced,
  'data-testid': testId = 'bid-pricing',
}: Props) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [dollarsIn, setDollarsIn] = useState('');
  const [months, setMonths] = useState('');
  const [basisSource, setBasisSource] = useState('solicitation_document');
  const [basis, setBasis] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setOpenFor(null); setDollarsIn(''); setMonths('');
    setBasisSource('solicitation_document'); setBasis(''); setErr(null);
  }

  const amount = Number(dollarsIn);
  const amountOk = dollarsIn.trim() !== '' && Number.isFinite(amount) && amount >= 0;
  const basisOk = basis.trim().length >= MIN_BASIS;
  const canSave = amountOk && basisOk && !busy;

  async function save(bid: FlaggedBid) {
    setBusy(true); setErr(null);
    try {
      await api.post('/api/admin/commercialization/revenue-flow/bid-value', {
        deliveryProjectId: bid.deliveryProjectId,
        // Dollars to cents, rounded once, here. See the module header.
        proposalValueCents: Math.round(amount * 100),
        valueBasis: basis.trim(),
        basisSource,
        periodMonths: months.trim() === '' ? null : Number(months),
      });
      reset();
      onPriced?.();
    } catch (e: any) {
      // Surface the server's own message: it names what a usable basis looks like, which is
      // more useful than anything this component could invent.
      setErr(e?.response?.data?.error || e?.message || 'Could not record the value.');
    } finally {
      setBusy(false);
    }
  }

  const unpriced = bids.filter((b) => !b.priced).length;

  return (
    <div className="card border-0 shadow-sm mb-4" data-testid={testId}>
      <div className="card-body p-3">
        <h2 className="h6 mb-1">Price the bids</h2>
        <div className="small text-muted mb-3">
          Possible proposal winnings counts only bids a person has priced, which is what keeps
          a test row out of the total. {unpriced === 0
            ? 'Every flagged bid now has a value.'
            : `${unpriced} of ${bids.length} still have none, so they are absent from it.`}
        </div>

        {bids.length === 0 && (
          <div className="text-muted small" data-testid={`${testId}-empty`}>
            No bid carries the pursuit flag.
          </div>
        )}

        {bids.map((bid) => {
          const isOpen = openFor === bid.deliveryProjectId;
          const suspect = bid.flags.length > 0;
          return (
            <div
              key={bid.deliveryProjectId}
              className="py-2"
              style={{ borderTop: '1px solid var(--border-subtle, #f1f5f9)' }}
              data-testid={`${testId}-row`}
            >
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{bid.name}</div>
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {bid.priced ? (
                      <span
                        style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: paintFor('good').bg, color: paintFor('good').fg,
                          border: `1px solid ${paintFor('good').fg}`,
                        }}
                      >
                        <span aria-hidden="true">$</span> {bid.priced.display}
                        {bid.priced.periodMonths ? ` over ${bid.priced.periodMonths} months` : ' (no term recorded)'}
                        {' · '}
                        {bid.priced.basisSource.replace(/_/g, ' ')}
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
                        <span aria-hidden="true">○</span> Not priced
                      </span>
                    )}
                    {/* Row-level problems, straight from the data. Someone deciding what to
                        price needs to see which rows should NOT be priced. */}
                    {bid.flags.map((f) => (
                      <span
                        key={f}
                        style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: paintFor('warn').bg, color: paintFor('warn').fg,
                          border: `1px dashed ${paintFor('warn').fg}`,
                        }}
                      >
                        <span aria-hidden="true">⚑</span> {f}
                      </span>
                    ))}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      outcome: {bid.outcome}
                    </span>
                  </div>
                  {bid.priced && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {bid.priced.valueBasis} — {bid.priced.confirmedBy},{' '}
                      {String(bid.priced.confirmedAt).slice(0, 10)}
                    </div>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => (isOpen ? reset() : setOpenFor(bid.deliveryProjectId))}
                    data-testid={`${testId}-open-${bid.deliveryProjectId}`}
                  >
                    {isOpen ? 'Cancel' : bid.priced ? 'Revise value' : 'Set value'}
                  </button>
                  {/* Outcome lives where it already lives. See the module header. */}
                  {bid.canonicalOpportunityId && (
                    <a
                      className="btn btn-outline-secondary btn-sm"
                      href={`/admin/gov-qualification?gws=${encodeURIComponent(bid.canonicalOpportunityId)}`}
                      data-testid={`${testId}-outcome-link`}
                    >
                      Record outcome
                    </a>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 p-3" style={{ background: 'var(--surface-subtle)', borderRadius: 6 }}>
                  {suspect && (
                    <div
                      className="mb-2 p-2"
                      style={{
                        fontSize: 11,
                        background: paintFor('warn').bg,
                        borderLeft: `3px solid ${paintFor('warn').fg}`,
                      }}
                    >
                      This row is flagged: {bid.flags.join('; ')}. Pricing it will include it in
                      the pipeline total, so price it only if it is a real pursuit.
                    </div>
                  )}
                  <div className="row g-2">
                    <div className="col-md-4">
                      <label className="form-label small fw-medium" htmlFor={`amt-${bid.deliveryProjectId}`}>
                        Contract value (US dollars)
                      </label>
                      <input
                        id={`amt-${bid.deliveryProjectId}`}
                        className="form-control form-control-sm"
                        inputMode="decimal"
                        value={dollarsIn}
                        onChange={(e) => setDollarsIn(e.target.value)}
                        placeholder="450000"
                      />
                      <div className="form-text" style={{ fontSize: 11 }}>
                        Total value if we win, not per year.
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small fw-medium" htmlFor={`mon-${bid.deliveryProjectId}`}>
                        Term (months)
                      </label>
                      <input
                        id={`mon-${bid.deliveryProjectId}`}
                        className="form-control form-control-sm"
                        inputMode="numeric"
                        value={months}
                        onChange={(e) => setMonths(e.target.value)}
                        placeholder="36"
                      />
                      <div className="form-text" style={{ fontSize: 11 }}>
                        Leave blank if unknown. Blank withholds the per-year figure rather
                        than guessing twelve months.
                      </div>
                    </div>
                    <div className="col-md-5">
                      <label className="form-label small fw-medium" htmlFor={`src-${bid.deliveryProjectId}`}>
                        How do we know?
                      </label>
                      <select
                        id={`src-${bid.deliveryProjectId}`}
                        className="form-select form-select-sm"
                        value={basisSource}
                        onChange={(e) => setBasisSource(e.target.value)}
                      >
                        {BASIS_SOURCES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium" htmlFor={`bas-${bid.deliveryProjectId}`}>
                        The basis, specifically enough that someone else could check it
                      </label>
                      <textarea
                        id={`bas-${bid.deliveryProjectId}`}
                        className="form-control form-control-sm"
                        rows={2}
                        value={basis}
                        onChange={(e) => setBasis(e.target.value)}
                        placeholder="Section 2.4 of the RFP states a not-to-exceed of $450,000 over 3 years."
                      />
                      <div
                        className="form-text"
                        style={{ fontSize: 11, color: basisOk ? 'var(--text-muted)' : paintFor('warn').fg }}
                        data-testid={`${testId}-basis-hint`}
                      >
                        {basisOk
                          ? 'Good — this can be checked by someone else.'
                          : `At least ${MIN_BASIS} characters. "RFP" is not a basis; name the clause, the page or the notice.`}
                      </div>
                    </div>
                  </div>

                  {err && (
                    <div className="alert alert-danger py-2 mt-2 mb-0" style={{ fontSize: 12 }} data-testid={`${testId}-error`}>
                      {err}
                    </div>
                  )}

                  <div className="d-flex gap-2 mt-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!canSave}
                      onClick={() => save(bid)}
                      data-testid={`${testId}-save`}
                    >
                      {busy ? 'Saving…' : bid.priced ? 'Replace the value' : 'Record the value'}
                    </button>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={reset}>
                      Cancel
                    </button>
                  </div>
                  {bid.priced && (
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

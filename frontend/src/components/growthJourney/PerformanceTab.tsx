import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import {
  getRates, getMetrics, fractionPct, rateAbsentReason,
} from '../../services/growthJourneyPerformanceApi';
import type {
  HandoffRates, MedianHours, Rate, ServedMetric,
} from '../../services/growthJourneyPerformanceApi';
import { safeText } from './journeyText';
import { JourneyEmpty, JourneySelect, JourneyFilterBar } from './journeyPaging';
import ReceiptsPanel from './ReceiptsPanel';
import OutcomesPanel from './OutcomesPanel';
import ByJourneyPanel from './ByJourneyPanel';

/**
 * Performance: the rates, and the only metrics that carry freshness
 * (Phase 6, T615).
 *
 * ── A NULL IS NEVER A ZERO. THAT IS THE WHOLE TAB. ──────────────────────────
 *
 * The plan's M1 mutation is "a `null` rate rendered as `0%`", and it is the right
 * mutation to pick: an acceptance rate of 0% means every handoff was refused, which
 * is a crisis. A `null` means no handoff was created, which is a quiet week. A
 * screen that prints 0% for both has told an operator the opposite of the truth.
 *
 * So every absent value renders as an em dash with its SPECIFIC reason beside it -
 * "nothing was accepted, so there was nothing to connect with" is actionable, the
 * API's bare `no_denominator` is not. `RATE_MEANINGS` holds that mapping, and three
 * further absences each mean something different and none of them zero: a median
 * below 3 samples (shown with its sample count, which the API's single reason
 * cannot distinguish from none), a REFUSED window (with how far over the cap), and
 * `has_leads: false` on by-journey, which carries no reason string at all. This tab
 * uses `fractionPct`; by-journey uses `percentValue`, because the two reads return
 * the same field names on different scales.
 *
 * ── FRESHNESS: THE PLAN ASKS FOR IT, THE READS DO NOT CARRY IT ──────────────
 *
 * `MetricFreshness` exists only on `/performance/metrics`, which the plan did not
 * list. Rather than fake a badge from a client clock - a freshness claim this screen
 * cannot make - the metrics panel renders the real one and the rates panel renders
 * the per-value reasons it does have. Recorded in the session log, not papered over.
 */

const WINDOWS: readonly { value: string; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days (the API default)' },
  { value: '90', label: '90 days' },
  { value: '365', label: '365 days (the maximum)' },
];

const RATE_FIELDS: readonly (keyof HandoffRates)[] = [
  'acceptance_rate', 'expiry_rate', 'connection_rate', 'meeting_rate',
  'qualification_rate', 'proposal_rate', 'conversion_rate', 'false_positive_handoff_rate',
];

const MEDIAN_FIELDS: readonly (keyof HandoffRates)[] = [
  'time_to_accept_hours', 'time_to_disposition_hours', 'time_to_first_connection_hours',
];

const label = (f: string) => f.replace(/_/g, ' ').replace(/ hours$/, ' (hours)');

function RateCell({ rate, field }: { rate: Rate; field: string }) {
  const reason = rateAbsentReason(rate, field);
  return (
    <>
      <span className={rate.value === null ? 'text-muted' : ''}>{fractionPct(rate)}</span>
      {reason
        ? <span className="small text-muted d-block">{reason}</span>
        : (
          <span className="small text-muted d-block">
            {rate.numerator} of {rate.denominator}
          </span>
        )}
    </>
  );
}

function MedianCell({ median }: { median: MedianHours }) {
  if (median.value === null) {
    return (
      <>
        <span className="text-muted">&mdash;</span>
        <span className="small text-muted d-block">
          {median.samples === 0
            ? 'no samples yet'
            : `only ${median.samples} sample${median.samples === 1 ? '' : 's'} — a median needs 3`}
        </span>
      </>
    );
  }
  return (
    <>
      <span>{median.value.toFixed(1)}h</span>
      <span className="small text-muted d-block">
        {median.samples} sample{median.samples === 1 ? '' : 's'}
      </span>
    </>
  );
}

function FreshnessBadge({ metric }: { metric: ServedMetric }) {
  const f = metric.freshness;
  const tone = f.verdict === 'fresh' ? 'bg-success'
    : f.verdict === 'stale' ? 'bg-warning text-dark' : 'bg-secondary';
  return (
    <>
      <span className={`badge ${tone}`}>{f.verdict}</span>
      {/* The API's own sentence, which always says WHICH timestamp it used. */}
      <span className="small text-muted d-block">{safeText(f.reason)}</span>
    </>
  );
}

export default function PerformanceTab({ brandId, programId }: { brandId?: string; programId?: string }) {
  const [windowDays, setWindowDays] = React.useState('30');
  const rates = useGrowthJourneyData(
    () => getRates({ brand_id: brandId || undefined, window_days: Number(windowDays) }),
    `rates:${brandId ?? ''}:${windowDays}`,
  );
  const metrics = useGrowthJourneyData(
    () => getMetrics({ brand_id: brandId || undefined }),
    `metrics:${brandId ?? ''}`,
  );

  return (
    <section>
      <h2 className="h5 mb-3">How the handoff pipeline is performing</h2>
      <JourneyFilterBar
        right={(
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={rates.reload}>
            Reload
          </button>
        )}
      >
        <JourneySelect
          label="Window"
          value={windowDays}
          options={WINDOWS}
          onChange={setWindowDays}
        />
      </JourneyFilterBar>

      <AsyncPanel state={rates} onRetry={rates.reload}>
        {(data) => (
          data.brands.length === 0 ? (
            <JourneyEmpty
              noun="brands with handoff rates"
              scope={data.scope}
              hint="No brand in your scope has a handoff in this window, which is a different answer from a rate of zero."
            />
          ) : (
            <>
              {data.brands.map((brand) => (
                <div className="card border-0 shadow-sm mb-3" key={brand.brand_id}>
                  <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <span className="fw-semibold">
                      Brand <code>{safeText(brand.brand_id)}</code>
                    </span>
                    <span className="small text-muted">
                      {data.window_days}-day window · {brand.handoffs_in_window} handoffs ·
                      {' '}{brand.outcomes_in_window} outcomes
                    </span>
                  </div>
                  <div className="card-body">
                    {brand.rates === null ? (
                      <div className="alert alert-warning mb-0" role="status">
                        <strong>These rates were refused, not computed.</strong> This window
                        holds {brand.handoffs_in_window} handoffs and{' '}
                        {brand.outcomes_in_window} outcomes, past the cap of{' '}
                        {data.max_handoffs_per_brand} and {data.max_outcomes_per_brand}.
                        Narrow the window rather than reading these as zero
                        {brand.reason ? ` (${safeText(brand.reason)})` : ''}.
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-hover mb-0 align-middle">
                          <caption className="small text-muted">
                            An em dash is not a zero. A rate with nothing in its
                            denominator is absent, and the line under it says which
                            denominator was empty — &ldquo;no handoff was created&rdquo; and
                            &ldquo;every handoff was refused&rdquo; are opposite findings.
                          </caption>
                          <thead className="table-light">
                            <tr>
                              <th scope="col">Measure</th>
                              <th scope="col">All queues</th>
                              {Object.keys(brand.rates.by_queue).map((q) => (
                                <th scope="col" key={q}>{q.replace(/_/g, ' ')}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {RATE_FIELDS.map((field) => (
                              <tr key={String(field)}>
                                <th scope="row" className="fw-normal">{label(String(field))}</th>
                                <td><RateCell rate={brand.rates!.all[field] as Rate} field={String(field)} /></td>
                                {Object.entries(brand.rates!.by_queue).map(([q, qr]) => (
                                  <td key={q}><RateCell rate={qr![field] as Rate} field={String(field)} /></td>
                                ))}
                              </tr>
                            ))}
                            {MEDIAN_FIELDS.map((field) => (
                              <tr key={String(field)}>
                                <th scope="row" className="fw-normal">{label(String(field))}</th>
                                <td><MedianCell median={brand.rates!.all[field] as MedianHours} /></td>
                                {Object.entries(brand.rates!.by_queue).map(([q, qr]) => (
                                  <td key={q}><MedianCell median={qr![field] as MedianHours} /></td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )
        )}
      </AsyncPanel>

      <h3 className="h6 mt-4 mb-2">Metrics, with the freshness the API reports</h3>
      <AsyncPanel state={metrics} onRetry={metrics.reload}>
        {(data) => (
          data.metrics.length === 0 ? (
            <JourneyEmpty noun="metrics" scope={data.scope} />
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span className="fw-semibold">Metrics</span>
                <span className="small text-muted">computed at {safeText(data.computed_at)}</span>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-hover mb-0 align-middle">
                    <caption className="small text-muted">
                      This is the only journey read that carries a freshness verdict, so
                      it is the only place a badge here is a fact rather than a guess. The
                      rates above report their own absences instead.
                    </caption>
                    <thead className="table-light">
                      <tr>
                        <th scope="col">Metric</th>
                        <th scope="col">Value</th>
                        <th scope="col">Freshness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.metrics.map((m) => (
                        <tr key={m.key}>
                          <th scope="row" className="fw-normal"><code>{safeText(m.key)}</code></th>
                          <td>
                            {m.value === null
                              ? <span className="text-muted">&mdash;</span>
                              : m.value}
                          </td>
                          <td><FreshnessBadge metric={m} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        )}
      </AsyncPanel>

      {/* The other three plan-named reads. T615's first pass shipped their client
          functions with NO CONSUMER, so the audit trail T606 exposes was
          unreachable from this workspace; separate components keep this file
          inside its budget. See each panel's own header. */}
      <ReceiptsPanel brandId={brandId} programId={programId} />
      <OutcomesPanel brandId={brandId} />
      <ByJourneyPanel brandId={brandId} />
    </section>
  );
}

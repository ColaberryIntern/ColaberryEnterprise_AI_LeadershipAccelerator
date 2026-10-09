import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { getByJourney, percentValue } from '../../services/growthJourneyPerformanceApi';
import type { JourneyMetricRow } from '../../services/growthJourneyPerformanceApi';
import { safeText } from './journeyText';
import { JourneyEmpty } from './journeyPaging';

/**
 * By-journey: the funnel per programme and path (Phase 6, T615).
 *
 * ── THE FOURTH ABSENCE, AND THE ONE WITH NO REASON STRING ───────────────────
 *
 * The other three performance absences carry a `reason` the API supplies:
 * `no_denominator`, `below_min_samples`, `window_too_large`. This read has none.
 * Its only signal is `has_leads`, and when it is false EVERY count and EVERY rate
 * is `null` - including `leads_count` and `campaigns_count`, which are null rather
 * than 0.
 *
 * That distinction is the whole panel. A programme with `leads_count: 0` would mean
 * "nobody arrived". `has_leads: false` means "this programme is not running yet",
 * and the row appears at all only because it exists in `journey_programs`. Printing
 * 0 would turn "we have not started" into "we started and nobody came", which is
 * the same class of error as a null rate rendered as 0% - and the plan's M1 picked
 * that one for a reason.
 *
 * ── PERCENTAGES HERE, FRACTIONS ON `/rates` ─────────────────────────────────
 *
 * `open_rate` on this read is 0..100 to two decimals. `open_rate` on `/rates` is a
 * fraction 0..1. Same field name, two scales, one project. `percentValue` does NOT
 * multiply; `fractionPct` does. They are separate functions rather than one with a
 * flag, because a flag is a thing a caller gets wrong and a wrong flag here yields
 * a plausible number rather than an error.
 *
 * ── AND `classified_count` IS NOT AN INDEPENDENT FIGURE ─────────────────────
 *
 * The service sets `classified_count: leads` - a byte-identical duplicate of
 * `leads_count` with no distinct source. Rendering both as separate columns would
 * invite an operator to compare two numbers that cannot differ, so only one is
 * shown and the duplication is recorded here.
 */

const RATES: readonly (keyof JourneyMetricRow)[] = [
  'open_rate', 'click_rate', 'reply_rate', 'conversion_rate',
];

function NotRunning({ row }: { row: JourneyMetricRow }) {
  return (
    <td colSpan={7} className="text-muted">
      Not running yet — no classified {row.path_slug ? 'subject on this path' : 'subject on this programme'}.
      Every figure is absent rather than zero, because nobody has arrived to count.
    </td>
  );
}

export default function ByJourneyPanel({ brandId }: { brandId?: string }) {
  const state = useGrowthJourneyData(
    () => getByJourney({ brand_id: brandId || undefined }),
    `byjourney:${brandId ?? ''}`,
  );

  return (
    <>
      <h3 className="h6 mt-4 mb-2">By programme and path</h3>
      <AsyncPanel state={state} onRetry={state.reload}>
        {(data) => (
          data.journeys.length === 0 ? (
            <JourneyEmpty
              noun="programmes"
              scope={data.scope}
              hint="No journey programme is visible in this scope, which is a seeding answer rather than a funnel of zero."
            />
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span className="fw-semibold">Funnel by programme</span>
                <span className="small text-muted">
                  {data.scope.start || data.scope.end
                    ? <>window {safeText(data.scope.start ?? 'any')} to {safeText(data.scope.end ?? 'any')}</>
                    : 'no date window applied'}
                  {' '}· this read is not paged
                </span>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-hover mb-0 align-middle">
                    <caption className="small text-muted">
                      A programme that is not running shows every figure as absent, never as
                      zero: &ldquo;nobody has arrived&rdquo; and &ldquo;people arrived and did
                      nothing&rdquo; are opposite findings. Rates here are percentages, unlike
                      the handoff rates above, which are fractions.
                    </caption>
                    <thead className="table-light">
                      <tr>
                        <th scope="col">Programme</th>
                        <th scope="col">Path</th>
                        <th scope="col">Subjects</th>
                        <th scope="col">Sent</th>
                        <th scope="col">Open</th>
                        <th scope="col">Click</th>
                        <th scope="col">Reply</th>
                        <th scope="col">Conversion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.journeys.map((row) => (
                        <tr key={`${row.program_slug}:${row.path_slug ?? 'none'}`}>
                          <th scope="row" className="fw-normal">
                            {safeText(row.program_name)}
                            <span className="small text-muted d-block">
                              <code>{safeText(row.program_slug)}</code> · {safeText(row.program_status)}
                            </span>
                          </th>
                          {row.has_leads ? (
                            <>
                              <td>
                                {row.path_slug
                                  ? <code>{safeText(row.path_slug)}</code>
                                  : <span className="text-muted">no path chosen</span>}
                              </td>
                              <td>{row.leads_count}</td>
                              <td>{row.emails_sent}</td>
                              {RATES.map((f) => (
                                <td key={String(f)}>
                                  {percentValue(row[f] as number | null)}
                                  {row[f] === null && (
                                    <span className="small text-muted d-block">nothing sent to divide by</span>
                                  )}
                                </td>
                              ))}
                            </>
                          ) : (
                            <NotRunning row={row} />
                          )}
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
    </>
  );
}

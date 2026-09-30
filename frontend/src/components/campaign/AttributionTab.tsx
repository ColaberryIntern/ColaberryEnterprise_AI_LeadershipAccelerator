import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

/**
 * AttributionTab — three models side by side, with the two things a chart usually hides
 * printed above it: how much of the population it describes, and whether the arithmetic held.
 *
 * IDENTITY COVERAGE FIRST. Attribution can only speak about leads with a linked visitor, and
 * the registry records that link as partial. A chart over 12% of leads that does not say "12%"
 * is a chart about the wrong population, so coverage is the first thing on the tab, with the
 * registry's own reason.
 *
 * WARNINGS ARE SHOWN, NOT RESOLVED. If any lead's credit did not sum to 1.0 the backend says
 * so and leaves the numbers as the model produced them. This tab renders that warning as a
 * banner next to the affected model. It does not rescale, hide the lead, or round the chart
 * into adding up - because a chart that adds to 100% on top of a model that gave 90% is a chart
 * nobody will ever question.
 */

type Model = 'first_touch' | 'last_non_direct' | 'linear';

interface Aggregate {
  model: Model | 'custom';
  bySource: Record<string, number>;
  leads: number;
  leadsWithWarnings: number;
  warnings: string[];
}

interface AttributionResult {
  campaignId: string;
  windowDays: number;
  leads: number;
  identifiedLeads: number;
  identityCoverage: number;
  coverageNote: string;
  models: Record<Model, Aggregate>;
}

const MODEL_LABELS: Record<Model, { name: string; blurb: string }> = {
  first_touch: { name: 'First touch', blurb: 'All credit to the earliest visit in the window.' },
  last_non_direct: { name: 'Last non-direct', blurb: 'All credit to the latest visit that was not direct.' },
  linear: { name: 'Linear', blurb: 'Credit split equally across every visit in the window.' },
};

const WINDOWS = [7, 14, 30, 60, 90];

interface Props {
  campaignId: string;
}

export default function AttributionTab({ campaignId }: Props): React.ReactElement {
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState<AttributionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/api/admin/campaigns/${campaignId}/attribution`, { params: { window: windowDays } })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setError('Attribution could not be computed. This is a failed request, not an empty campaign.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, windowDays]);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <label className="small text-muted mb-0" htmlFor="attribution-window">Attribution window</label>
        <select
          id="attribution-window"
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
        >
          {WINDOWS.map((w) => <option key={w} value={w}>{w} days before enrolment</option>)}
        </select>
      </div>

      {loading && <div className="text-muted small py-3" data-testid="attribution-loading">Computing attribution...</div>}

      {error && (
        <div className="alert alert-danger small" role="alert" data-testid="attribution-error">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Coverage is stated before any chart, because it is the denominator of every one. */}
          <div className="alert alert-secondary small mb-3" data-testid="attribution-coverage">
            <div className="fw-semibold">
              Identity coverage: {Math.round(data.identityCoverage * 100)}% ({data.identifiedLeads} of {data.leads} leads have a linked visitor)
            </div>
            <div className="text-muted">
              Every chart below describes only those {data.identifiedLeads} leads. {data.coverageNote}
            </div>
          </div>

          <div className="row g-3">
            {(Object.keys(MODEL_LABELS) as Model[]).map((model) => {
              const agg = data.models[model];
              const total = Object.values(agg.bySource).reduce((a, b) => a + b, 0);
              const rows = Object.entries(agg.bySource).sort((a, b) => b[1] - a[1]);
              return (
                <div className="col-12 col-lg-4" key={model}>
                  <div className="card h-100">
                    <div className="card-body">
                      <div className="fw-semibold">{MODEL_LABELS[model].name}</div>
                      <div className="small text-muted mb-2">{MODEL_LABELS[model].blurb}</div>

                      {/* The credit-sum guard, surfaced. Never resolved here. */}
                      {agg.leadsWithWarnings > 0 && (
                        <div className="alert alert-warning small py-2 mb-2" role="alert" data-testid={`attribution-warning-${model}`}>
                          <div className="fw-semibold">
                            {agg.leadsWithWarnings} lead{agg.leadsWithWarnings === 1 ? '' : 's'} did not sum to 1.0
                          </div>
                          <div>The shares below are exactly what the model produced. They have not been rescaled.</div>
                          {agg.warnings.slice(0, 3).map((w) => <div key={w} className="text-muted">{w}</div>)}
                        </div>
                      )}

                      {rows.length === 0 ? (
                        <div className="text-muted small fst-italic">No identified leads to attribute.</div>
                      ) : (
                        <table className="table table-sm mb-0 small">
                          <tbody>
                            {rows.map(([source, credit]) => (
                              <tr key={source}>
                                <td className={source === 'direct' || source === 'unknown' ? 'text-muted fst-italic' : ''}>
                                  {source}
                                </td>
                                <td className="text-end">{credit.toFixed(2)}</td>
                                <td className="text-end text-muted">
                                  {total > 0 ? `${Math.round((credit / total) * 100)}%` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

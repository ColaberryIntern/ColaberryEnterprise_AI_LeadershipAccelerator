import React, { useEffect, useState } from 'react';
import {
  fetchAcquisitionFunnel, type AcquisitionFunnel, type FunnelStage,
} from './acquisitionFunnelApi';

/**
 * What happened to the people who clicked.
 *
 * WHY IT IS HERE. This tab opened on "No marketing funnel data available yet. Data will appear
 * once campaigns have enrolled leads." That is the CAMPAIGN graph, driven by an engine paused
 * since August, so it would keep saying that no matter how much traffic arrived. Meanwhile the
 * first paid ads produced 262 visitors and 109 signups in three days, every step of it recorded
 * and none of it shown. Ali: "I'm expecting to see a dashboard about this new landing page or
 * more details about what has been clicked on and accounts being created."
 *
 * ── WHY EACH NUMBER CARRIES ITS OWN SENTENCE ──
 *
 * The figures here are close enough to each other to be confused: 38 page loads from 16 visitors
 * across 24 sessions is three true numbers for one page, and a dashboard that stacks them without
 * saying which is which invites somebody to quote the flattering one. So every stage states its
 * unit and what it does not mean.
 *
 * A LATER STAGE CAN EXCEED AN EARLIER ONE, and that is a finding rather than a bug. Each stage is
 * measured independently; an untracked page produces zero visitors and real signups. Clamping
 * them into a tidy descending shape would hide exactly that gap, so the percentages are drawn
 * against the widest stage and an increase is labelled rather than smoothed.
 */

const PCT = (value: number, of: number): string => (of > 0 ? `${Math.round((value / of) * 100)}%` : '-');

function StageRow({ stage, widest, previous }: { stage: FunnelStage; widest: number; previous: FunnelStage | null }) {
  const width = widest > 0 ? Math.max(2, Math.round((stage.count / widest) * 100)) : 2;
  // Step-over-step, against the previous stage. Can exceed 100%, and says so rather than hiding it.
  const step = previous && previous.count > 0 ? Math.round((stage.count / previous.count) * 100) : null;
  const grew = step !== null && step > 100;

  return (
    <div className="mb-3" data-testid={`funnel-stage-${stage.key}`}>
      <div className="d-flex align-items-baseline justify-content-between">
        <span className="fw-semibold">{stage.label}</span>
        <span className="d-flex align-items-baseline gap-2">
          <span className="fs-5 fw-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {stage.count.toLocaleString()}
          </span>
          <span className="text-muted small">{stage.unit}</span>
          {step !== null && (
            <span className={`badge ${grew ? 'bg-warning text-dark' : 'bg-light text-dark'}`} title="Compared with the stage above">
              {step}%
            </span>
          )}
        </span>
      </div>
      <div className="progress" style={{ height: 8 }} role="img" aria-label={`${stage.count} ${stage.unit}`}>
        <div className="progress-bar" style={{ width: `${width}%`, backgroundColor: '#1a365d' }} />
      </div>
      <div className="form-text small mb-0">{stage.note}</div>
      {grew && (
        <div className="form-text small text-warning mb-0">
          More than the stage above. Measured independently, so this usually means a page that is
          not carrying the tracker.
        </div>
      )}
    </div>
  );
}

export default function AcquisitionFunnelPanel({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<AcquisitionFunnel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    fetchAcquisitionFunnel(days)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setError('The funnel could not be loaded.'); });
    return () => { live = false; };
  }, [days]);

  if (error) return <div className="alert alert-danger py-2 small" data-testid="funnel-error">{error}</div>;
  if (!data) return <p className="text-muted small mb-0">Loading the funnel...</p>;

  const widest = Math.max(...data.stages.map((s) => s.count), 1);

  return (
    <div data-testid="acquisition-funnel">
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>From ad click to coming back</span>
          <span className="text-muted small">last {data.windowDays} days</span>
        </div>
        <div className="card-body">
          {data.empty ? (
            <p className="text-muted mb-0" data-testid="funnel-empty">
              Nothing recorded in this window. This counts landing-page traffic and signups, so it
              stays empty until a page is published and someone visits it.
            </p>
          ) : (
            data.stages.map((stage, i) => (
              <StageRow
                key={stage.key}
                stage={stage}
                widest={widest}
                previous={i === 0 ? null : data.stages[i - 1]}
              />
            ))
          )}
        </div>
      </div>

      {data.untrackedPages.length > 0 && (
        /* Named rather than shown as zeros: a page with no tracker cannot be measured, and
           averaging it into a conversion rate would understate every other page. */
        <div className="alert alert-warning py-2 small" data-testid="funnel-untracked">
          <strong>{data.untrackedPages.length} page{data.untrackedPages.length === 1 ? '' : 's'} cannot be measured</strong>
          {' '}- no tracker is served on {data.untrackedPages.join(', ')}. Visits there are missing
          from every number above.
        </div>
      )}

      {data.campaigns.length > 0 && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold">What each campaign produced</div>
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Source</th><th>Campaign</th>
                  <th className="text-end">Signed up</th>
                  <th className="text-end">Account</th>
                  <th className="text-end">In the CRM</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr key={`${c.utm_source ?? '-'}|${c.utm_campaign ?? '-'}`} data-testid="funnel-campaign-row">
                    <td>{c.utm_source ?? <span className="text-muted">untagged</span>}</td>
                    <td className="small"><code>{c.utm_campaign ?? '-'}</code></td>
                    <td className="text-end fw-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.signups}</td>
                    <td className="text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.accounts}</td>
                    <td className="text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {c.in_crm}
                      {c.signups > 0 && <span className="text-muted small ms-1">{PCT(c.in_crm, c.signups)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.pages.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">Each landing page</div>
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Page</th>
                  <th className="text-end">Visitors</th>
                  <th className="text-end">Read it</th>
                  <th className="text-end">Clicked</th>
                  <th className="text-end">Known</th>
                  <th className="text-end">From ads</th>
                  {/* Loads last, and labelled, because it is the biggest number and the least useful. */}
                  <th className="text-end text-muted">Loads</th>
                </tr>
              </thead>
              <tbody>
                {data.pages.map((p) => (
                  <tr key={`${p.brand_slug ?? '-'}/${p.slug}`} data-testid="funnel-page-row">
                    <td>
                      <div>{p.slug}</div>
                      <div className="text-muted" style={{ fontSize: '.72rem' }}>
                        {p.brand_slug ?? 'no brand'}
                        {!p.site_slug && <span className="text-warning"> · not measurable</span>}
                      </div>
                    </td>
                    <td className="text-end fw-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.visitors}</td>
                    <td className="text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.engaged_visitors}</td>
                    <td className="text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.cta_clickers}</td>
                    <td className="text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.identified_leads}</td>
                    <td className="text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.ad_clicks}</td>
                    <td className="text-end text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

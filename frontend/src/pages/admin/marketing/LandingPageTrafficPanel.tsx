import { useEffect, useState } from 'react';
import { fetchLandingPageTraffic, type LandingPageTrafficRow } from '../../../services/landingPageApi';

/**
 * Who and how many are landing on each landing page.
 *
 * WHY IT EXISTS. Ali, 2026-10-15: "how do we see who and how many are landing on the landing
 * pages? where is that?" Nowhere - the tracker had been recording every view for weeks and no
 * screen in the product showed any of it.
 *
 * PEOPLE FIRST, LOADS LAST. The live page measured 11 visitors, 24 sessions and 192 views over
 * thirty days. All three are true and only the first answers "how many people". A dashboard that
 * leads with 192 is not wrong so much as misleading, so visitors is the big number and views is
 * the quiet one beside it.
 *
 * AN UNMEASURABLE PAGE SAYS SO. A hosted page with no `site_slug` carries no tracker at all - the
 * renderer omits it - so its zeros mean "cannot be measured", not "nobody came". Showing those as
 * a plain 0 would be a lie of omission, and the operator would reasonably conclude the campaign
 * failed. Three of the four hosted pages are in that state today.
 */

function Metric({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div className="text-center px-2">
      <div className={`fw-bold ${muted ? 'fs-6 text-muted' : 'fs-4'}`} style={{ lineHeight: 1.1 }}>
        {value.toLocaleString()}
      </div>
      <div className="text-muted" style={{ fontSize: '.7rem' }}>{label}</div>
    </div>
  );
}

function when(iso: string | null): string {
  if (!iso) return '—';
  // Central, like every other time this team reads.
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function LandingPageTrafficPanel({ days = 30 }: { days?: number }) {
  const [rows, setRows] = useState<LandingPageTrafficRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchLandingPageTraffic(days)
      .then((r) => { if (live) setRows(r.traffic); })
      .catch(() => { if (live) setError('Could not load traffic.'); });
    return () => { live = false; };
  }, [days]);

  if (error) return <p className="small text-danger mb-0">{error}</p>;
  if (!rows) return <p className="small text-muted mb-0">Loading traffic…</p>;
  if (rows.length === 0) return <p className="small text-muted mb-0">No hosted landing pages yet.</p>;

  return (
    <>
      <p className="small text-muted mb-3">
        Last {days} days. <strong>Visitors</strong> is people, <strong>visits</strong> is sessions,
        <strong> loads</strong> counts refreshes too.
      </p>

      <div className="d-flex flex-column gap-2">
        {rows.map((r) => {
          const untracked = !r.site_slug;
          return (
            <div key={`${r.brand_slug}/${r.slug}`} className="border rounded p-3">
              <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                <div style={{ minWidth: '14rem' }}>
                  <div className="fw-semibold">{r.slug}</div>
                  <div className="text-muted small">
                    {r.brand_slug ?? 'no brand'}
                    {' · '}
                    <span className={r.status === 'published' ? 'text-success' : ''}>{r.status}</span>
                  </div>
                  {r.last_seen && (
                    <div className="text-muted" style={{ fontSize: '.7rem' }}>
                      last visit {when(r.last_seen)} CT
                    </div>
                  )}
                </div>

                {untracked ? (
                  // Not "0 visitors". This page has no tracker, so the number is unknowable
                  // rather than zero, and the fix is a different one.
                  <div className="small text-warning-emphasis bg-warning-subtle border border-warning-subtle rounded px-3 py-2">
                    <strong>Not measurable.</strong> This page has no site tag, so views are not
                    recorded. Publishing it through the normal flow sets one.
                  </div>
                ) : (
                  <div className="d-flex align-items-center flex-wrap">
                    <Metric value={r.visitors} label="visitors" />
                    <Metric value={r.sessions} label="visits" />
                    <Metric value={r.identified_leads} label="known leads" />
                    <Metric value={r.ad_clicks} label="from ads" muted />
                    <Metric value={r.views} label="loads" muted />
                  </div>
                )}
              </div>

              {!untracked && r.visitors > 0 && r.ad_clicks === 0 && (
                <div className="text-muted mt-2" style={{ fontSize: '.72rem' }}>
                  No ad clicks recorded yet. Traffic arriving from a Meta ad carries an{' '}
                  <code>fbclid</code> and will be counted here automatically.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

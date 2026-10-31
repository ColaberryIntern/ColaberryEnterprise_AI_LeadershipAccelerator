import React, { useEffect, useState } from 'react';
import { fetchAcquisitionFunnel, type AcquisitionFunnel } from './acquisitionFunnelApi';
import PerformanceHeader from './performance/PerformanceHeader';
import KpiRow from './performance/KpiRow';
import FunnelChart from './performance/FunnelChart';
import SourceDonut from './performance/SourceDonut';
import CampaignTable from './performance/CampaignTable';
import LandingPagesTable from './performance/LandingPagesTable';
import { takeawaySentence } from './performance/performanceMetrics';
import type { MarketingDataState } from './marketingTrust';
import './performance/marketingPerformance.css';

/**
 * What happened to the people who clicked - the Marketing Performance report.
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
 * them into a tidy descending shape would hide exactly that gap, so the bars are drawn against
 * the widest stage and an increase is labelled rather than smoothed.
 *
 * ── THIS COMPONENT ONLY COMPOSES ──
 *
 * One request feeds the whole report. The arithmetic lives in `performance/performanceMetrics.ts`
 * where it is tested, the presentation in the sibling components, and nothing here changes a
 * backend calculation: the redesign is a presentation change, start to finish.
 */
export default function AcquisitionFunnelPanel({
  days = 30,
  onDataState,
}: {
  days?: number;
  /**
   * Report what this panel knows to the page's trust badge.
   *
   * Before 2026-10-30 this panel reported nothing, so the badge above it read "Unverified"
   * over a report that had loaded perfectly — and once the sibling tab had been opened, it
   * showed THAT tab's state instead. Optional, so every existing mount is unaffected.
   */
  onDataState?: (state: MarketingDataState) => void;
}) {
  const [data, setData] = useState<AcquisitionFunnel | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * When the fetch RESOLVED, not when this component mounted.
   *
   * Recorded here because the endpoint sends no timestamp. This is NOT the defect
   * `marketingTrust` was written to replace — that was `new Date()` inside a mount-time
   * `useMemo`, which reported the render and never moved on a refetch. This is set exactly
   * once per successful fetch and cleared when a new one starts.
   */
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    setFetchedAt(null);
    fetchAcquisitionFunnel(days)
      .then((d) => { if (live) { setData(d); setFetchedAt(new Date().toISOString()); } })
      .catch(() => { if (live) setError('The funnel could not be loaded.'); });
    return () => { live = false; };
  }, [days]);

  const loading = !data && !error;
  const failed = error !== null;

  /**
   * UNTRACKED PAGES ARE THIS TAB'S COMPLETENESS GAP.
   *
   * The panel already shows them — "{n} page(s) cannot be measured" — and they are exactly
   * what `unavailable` means: something the report cannot compute, with a reason. Reporting
   * `[]` while that warning is on screen would let the badge read "live" over a report that
   * is openly admitting it is missing traffic.
   */
  useEffect(() => {
    if (!onDataState) return;

    onDataState({
      // No `surface` here on purpose: the page owns the tab's name because the page owns the
      // labels, and two sources for one name drift the first time either is renamed.
      loading,
      error: failed,
      fetchedAt,
      unavailable: data
        ? data.untrackedPages.map((page) => ({
            key: `marketing.landing_page_traffic:${page}`,
            name: `Traffic on ${page}`,
            reason:
              'No tracker is served on this page, so visits to it are missing from every ' +
              'number on this tab.',
          }))
        : undefined,
    });
  }, [onDataState, loading, failed, fetchedAt, data]);
  const stages = data?.stages ?? [];
  const campaigns = data?.campaigns ?? [];
  const pages = data?.pages ?? [];

  return (
    <div className="mp" data-testid="acquisition-funnel">
      <PerformanceHeader windowDays={data?.windowDays ?? (loading ? null : days)} />

      {/*
        The error banner keeps its old testid and its old words, and sits ABOVE the report rather
        than replacing it. Returning a single line on failure, as this did before, collapses the
        page and then jumps it back to full height when a retry succeeds.
      */}
      {failed && (
        <div className="alert alert-danger py-2 small mb-0" data-testid="funnel-error">{error}</div>
      )}

      {data?.empty ? (
        <p className="text-muted mb-0" data-testid="funnel-empty">
          Nothing recorded in this window. This counts landing-page traffic and signups, so it
          stays empty until a page is published and someone visits it.
        </p>
      ) : (
        <>
          <p className="mp-take">
            {loading
              ? <span className="mp-skeleton">Ads drove 0,000 sessions and 000 signups.</span>
              : takeawaySentence(stages)}
          </p>

          <KpiRow stages={stages} loading={loading} />

          <div className="mp-row">
            <section className="mp-card" aria-labelledby="mp-funnel-title">
              <h3 className="mp-card__title" id="mp-funnel-title">Conversion funnel</h3>
              <p className="mp-card__note">
                Each stage measured independently, drawn against the widest.
              </p>
              <FunnelChart stages={stages} loading={loading} error={failed} />
            </section>

            <section className="mp-card" aria-labelledby="mp-source-title">
              <h3 className="mp-card__title" id="mp-source-title">Signups by source</h3>
              <p className="mp-card__note">Where the people who signed up came from.</p>
              <SourceDonut campaigns={campaigns} loading={loading} error={failed} />
            </section>
          </div>

          {data && data.untrackedPages.length > 0 && (
            /* Named rather than shown as zeros: a page with no tracker cannot be measured, and
               averaging it into a conversion rate would understate every other page. */
            <div className="alert alert-warning py-2 small mb-0" data-testid="funnel-untracked">
              <strong>
                {data.untrackedPages.length} page{data.untrackedPages.length === 1 ? '' : 's'}
                {' '}cannot be measured
              </strong>
              {' '}- no tracker is served on {data.untrackedPages.join(', ')}. Visits there are
              missing from every number above.
            </div>
          )}

          <section className="mp-card" aria-labelledby="mp-campaigns-title">
            <h3 className="mp-card__title" id="mp-campaigns-title">What each campaign produced</h3>
            <p className="mp-card__note">
              A campaign that signs people up without reaching the CRM has produced nothing
              admissions can act on.
            </p>
            <CampaignTable campaigns={campaigns} loading={loading} error={failed} />
          </section>

          <section className="mp-card" aria-labelledby="mp-pages-title">
            <h3 className="mp-card__title" id="mp-pages-title">Each landing page</h3>
            <p className="mp-card__note">
              Busiest first. Page loads last, and labelled, because it is the biggest number and
              the least useful.
            </p>
            <LandingPagesTable pages={pages} loading={loading} error={failed} />
          </section>
        </>
      )}
    </div>
  );
}

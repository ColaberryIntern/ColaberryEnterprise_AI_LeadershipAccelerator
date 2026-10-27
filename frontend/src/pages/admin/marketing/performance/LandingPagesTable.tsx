import React from 'react';
import type { FunnelPageRow } from '../acquisitionFunnelApi';
import { formatCount, isMeasurable, pagesByTraffic } from './performanceMetrics';

/**
 * Each landing page, busiest first.
 *
 * ── TWO KINDS OF ZERO, AND THEY MUST NOT LOOK ALIKE ──
 *
 * A page with a tracker and no visitors genuinely had no visitors. A page with `site_slug: null`
 * carries no tracker at all, so its zeros mean "not measured" - and reading them as "no traffic"
 * is how a working page gets blamed for a reporting gap. The untracked case gets the explicit
 * tag; the tracked-but-quiet case is merely muted.
 *
 * `data-testid="funnel-page-row"` is load-bearing - existing tests select rows by it.
 */
export default function LandingPagesTable({
  pages, loading, error,
}: {
  pages: FunnelPageRow[];
  loading?: boolean;
  error?: boolean;
}) {
  const sorted = pagesByTraffic(pages);
  const widest = sorted.reduce((max, p) => (p.visitors > max ? p.visitors : max), 0);

  if (error) {
    return <div className="mp-fail" data-testid="funnel-page-error">Failed to load</div>;
  }

  if (!loading && sorted.length === 0) {
    return (
      <div className="mp-fail" data-testid="funnel-page-empty">
        No landing page recorded traffic in this window
      </div>
    );
  }

  const rows: (FunnelPageRow | null)[] = loading && sorted.length === 0
    ? Array.from({ length: 5 }, () => null)
    : sorted;

  return (
    <div className="mp-tableWrap">
      <table className="mp-table">
        <thead>
          <tr>
            <th scope="col">Page</th>
            <th scope="col">Visitors</th>
            <th scope="col">Read it</th>
            <th scope="col">Clicked</th>
            <th scope="col">Known</th>
            <th scope="col">From ads</th>
            <th scope="col">Page loads</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            if (row === null) {
              return (
                <tr key={`skeleton-${i}`}>
                  {Array.from({ length: 7 }, (unused, c) => (
                    <td key={c}><span className="mp-skeleton">0,000</span></td>
                  ))}
                </tr>
              );
            }

            const measurable = isMeasurable(row);
            const quiet = row.visitors === 0;
            const barWidth = widest > 0 ? (row.visitors / widest) * 90 : 0;

            return (
              <tr
                key={`${row.brand_slug ?? 'none'}/${row.slug}`}
                data-testid="funnel-page-row"
                className={quiet ? 'mp-table__zero' : undefined}
              >
                <td>
                  {row.slug}
                  {row.brand_slug && <span className="mp-sub">{row.brand_slug}</span>}
                  {!measurable && (
                    <span className="mp-tag" title="This page carries no tracker, so its zeros mean &quot;not measured&quot;">
                      not measurable
                    </span>
                  )}
                  {measurable && quiet && <span className="mp-tag">no traffic</span>}
                </td>
                <td>
                  <span className="mp-cellbar">
                    <span
                      className="mp-cellbar__bar"
                      style={{
                        width: `${barWidth}px`,
                        background: 'var(--chart-1)',
                        visibility: row.visitors > 0 ? 'visible' : 'hidden',
                      }}
                    />
                    <span>{formatCount(row.visitors)}</span>
                  </span>
                </td>
                <td>{formatCount(row.engaged_visitors)}</td>
                <td>{formatCount(row.cta_clickers)}</td>
                <td>{formatCount(row.identified_leads)}</td>
                <td>{formatCount(row.ad_clicks)}</td>
                <td>{formatCount(row.views)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

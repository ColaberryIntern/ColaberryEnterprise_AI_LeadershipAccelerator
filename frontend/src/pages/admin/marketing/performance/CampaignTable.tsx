import React from 'react';
import type { FunnelCampaignRow } from '../acquisitionFunnelApi';
import {
  crmSyncRate, formatCount, formatPct, isCrmSyncHealthy, sourceLabel,
} from './performanceMetrics';

/**
 * What each campaign produced.
 *
 * THE CRM SYNC COLUMN IS THE POINT OF THIS TABLE. A campaign that signs people up and fails to
 * hand them to GoHighLevel has produced nothing admissions can act on, and that failure is
 * invisible in the signup count alone. 99% is the threshold the spec sets; below it reads amber.
 *
 * `data-testid="funnel-campaign-row"` is load-bearing - existing tests select rows by it.
 */
export default function CampaignTable({
  campaigns, loading, error,
}: {
  campaigns: FunnelCampaignRow[];
  loading?: boolean;
  error?: boolean;
}) {
  const widest = campaigns.reduce((max, r) => (r.signups > max ? r.signups : max), 0);

  if (error) {
    return <div className="mp-fail" data-testid="funnel-campaign-error">Failed to load</div>;
  }

  if (!loading && campaigns.length === 0) {
    return (
      <div className="mp-fail" data-testid="funnel-campaign-empty">
        No campaign produced a signup in this window
      </div>
    );
  }

  const rows: (FunnelCampaignRow | null)[] = loading && campaigns.length === 0
    ? Array.from({ length: 5 }, () => null)
    : campaigns;

  return (
    <div className="mp-tableWrap">
      <table className="mp-table">
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Campaign</th>
            <th scope="col">Signed up</th>
            <th scope="col">Account</th>
            <th scope="col">In the CRM</th>
            <th scope="col">CRM sync</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            if (row === null) {
              return (
                <tr key={`skeleton-${i}`}>
                  {Array.from({ length: 6 }, (unused, c) => (
                    <td key={c}><span className="mp-skeleton">0,000</span></td>
                  ))}
                </tr>
              );
            }

            const syncRate = crmSyncRate(row);
            const barWidth = widest > 0 ? (row.signups / widest) * 90 : 0;

            return (
              <tr
                key={`${row.utm_source ?? 'none'}-${row.utm_campaign ?? 'none'}-${i}`}
                data-testid="funnel-campaign-row"
              >
                <td>{sourceLabel(row.utm_source)}</td>
                <td>{row.utm_campaign || <span className="text-muted">Untagged</span>}</td>
                <td>
                  <span className="mp-cellbar">
                    <span
                      className="mp-cellbar__bar"
                      style={{
                        width: `${barWidth}px`,
                        background: `var(--chart-${(i % 8) + 1})`,
                        visibility: row.signups > 0 ? 'visible' : 'hidden',
                      }}
                    />
                    <span>{formatCount(row.signups)}</span>
                  </span>
                </td>
                <td>{formatCount(row.accounts)}</td>
                <td>{formatCount(row.in_crm)}</td>
                <td className={syncRate == null ? undefined : (isCrmSyncHealthy(syncRate) ? 'mp-ok' : 'mp-warn')}>
                  {formatPct(syncRate, 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

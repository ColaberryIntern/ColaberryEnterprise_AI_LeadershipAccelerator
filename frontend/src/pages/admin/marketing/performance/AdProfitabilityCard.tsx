import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdProfitability, type AdProfitability, type ProfitRow } from '../../../../services/adSpendApi';
import { formatCount } from './performanceMetrics';
import {
  campaignTitle, coverageWarnings, monthsLabel, profitTakeaway, roasLabel, signedUsd, splitLabel, usd, verdictLabel,
} from './adProfitabilityFormat';

/**
 * Are the ads paying for themselves?
 *
 * Spend per campaign (typed, imported from Ads Manager, or pulled from Meta) set against the people
 * who signed up through that campaign in the same window, and what they have paid since. Its own
 * window, defaulting to 90 days, because a 30-day view judges ads before their Explorers have had
 * time to pay. The funnel above keeps its fixed 30 days; the chips on each say which applies.
 *
 * Every number is in the table as well as the tiles, every rate that has no denominator yet reads
 * "—", and every way the spend record could be incomplete is said in words above the numbers.
 */

const WINDOWS = [30, 90, 180] as const;

function Kpis({ d }: { d: AdProfitability }) {
  const t = d.totals;
  const tiles = [
    { key: 'spend', label: 'Ad spend', value: usd(t.spend), note: `${d.windowStart} to ${d.windowEnd}`, accent: 'var(--chart-1)' },
    { key: 'collected', label: 'Collected', value: usd(t.collected), note: `From ${formatCount(t.payers)} paying of ${formatCount(t.signups)} ad signups.`, accent: 'var(--chart-3)' },
    { key: 'roas', label: 'Return on spend', value: roasLabel(t.roas), note: 'Cash collected ÷ spend, to date.', accent: 'var(--chart-6)' },
    { key: 'cac', label: 'Cost per payer', value: usd(t.cac), note: `${usd(t.costPerSignup, true)} per signup.`, accent: 'var(--chart-5)' },
    {
      key: 'profit', label: 'Ahead / behind', value: signedUsd(t.profit),
      note: t.profit >= 0 ? 'Collected minus spend.' : `Payback ${monthsLabel(t.paybackMonths)} at ${usd(t.mrr)}/mo.`,
      accent: t.profit >= 0 ? 'var(--status-success)' : 'var(--status-danger)', critical: t.profit < 0,
    },
  ];
  return (
    <div className="mp-kpis" role="list">
      {tiles.map((k) => (
        <div key={k.key} role="listitem" className={`mp-kpi${k.critical ? ' mp-kpi--critical' : ''}`} style={{ '--mp-kpi-accent': k.accent } as React.CSSProperties}>
          <span className="mp-kpi__label">{k.label}</span>
          <span className="mp-kpi__value">{k.value}</span>
          <span className="mp-kpi__note">{k.note}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ r }: { r: ProfitRow }) {
  const v = verdictLabel(r);
  const muted = r.verdict === 'no_spend';
  return (
    <>
      <tr data-testid="profit-row" className={muted ? 'mp-table__zero' : undefined}>
        <td>
          {campaignTitle(r)}
          {r.campaignName && r.campaignRef && <span className="mp-sub">{r.campaignRef}</span>}
        </td>
        <td>{r.spend > 0 ? usd(r.spend) : '—'}</td>
        <td>{formatCount(r.signups)}</td>
        <td>{usd(r.costPerSignup, true)}</td>
        <td className={r.payers ? 'mp-ok' : undefined}>{formatCount(r.payers)}</td>
        <td>{usd(r.cac)}</td>
        <td>{usd(r.mrr)}</td>
        <td>{usd(r.collected)}</td>
        <td>{roasLabel(r.roas)}</td>
        <td><span className={`mp-verdict mp-verdict--${v.tone}`} title={v.hint}>{v.text}</span></td>
      </tr>
      {r.bySource.length > 1 && r.bySource.map((s) => (
        <tr key={`${r.key}-${s.utmSource ?? 'none'}`} className="mp-table__sub">
          <td><span className="mp-sub">↳ {splitLabel(s.utmSource)}</span></td>
          <td>{s.spend != null ? usd(s.spend) : ''}</td>
          <td>{formatCount(s.signups)}</td>
          <td>{s.costPerSignup != null ? usd(s.costPerSignup, true) : ''}</td>
          <td>{formatCount(s.payers)}</td>
          <td />
          <td>{usd(s.mrr)}</td>
          <td>{usd(s.collected)}</td>
          <td />
          <td />
        </tr>
      ))}
    </>
  );
}

export default function AdProfitabilityCard() {
  const [days, setDays] = useState<number>(90);
  const [data, setData] = useState<AdProfitability | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    getAdProfitability(days)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) { setData(null); setError('Ad profitability could not be loaded. Nothing below is shown as zero in its place.'); } });
    return () => { live = false; };
  }, [days]);

  const noSpend = !!data && data.totals.spend <= 0;
  const warnings = data ? coverageWarnings(data) : [];

  return (
    <section className="mp-card" aria-labelledby="mp-profit-title" data-testid="ad-profitability">
      <div className="mp-head" style={{ borderBottom: 0, paddingBottom: 0 }}>
        <div>
          <h3 className="mp-card__title" id="mp-profit-title">Are the ads paying for themselves?</h3>
          <p className="mp-card__note mb-0">
            Spend per campaign against the people who signed up through it in the same days, and what they have paid since.
          </p>
        </div>
        <div className="mp-chips" role="group" aria-label="Window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className={`mp-chip mp-chip--button${days === w ? ' mp-chip--on' : ''}`}
              aria-pressed={days === w}
              onClick={() => setDays(w)}
            >
              <b>{w}</b> days
            </button>
          ))}
          <Link to="/admin/marketing/ad-spend" className="mp-chip mp-chip--button">Record spend</Link>
        </div>
      </div>

      {error && <div className="mp-fail" role="alert">{error}</div>}
      {!data && !error && <div className="mp-fail" aria-busy="true">Loading</div>}

      {data && noSpend && (
        <div className="mp-empty" data-testid="ad-profitability-empty">
          <p className="mb-2"><b>No ad spend recorded for {data.windowStart} to {data.windowEnd}.</b></p>
          <p className="mb-2">
            {formatCount(data.rows.reduce((t, r) => t + r.signups, 0))} people signed up in these days.
            Record what the ads cost and this card shows cost per signup, cost per payer, return and payback for each campaign.
          </p>
          <p className="mb-0">
            <Link to="/admin/marketing/ad-spend">Record spend</Link> by hand, import an Ads Manager export
            {data.sync.meta.configured ? ', or sync from Meta.' : '. Pulling it from Meta automatically needs a token set up first.'}
          </p>
        </div>
      )}

      {data && !noSpend && (
        <div className="mp" style={{ gap: 16, marginTop: 14 }}>
          <p className="mp-take mb-0">{profitTakeaway(data)}</p>
          {warnings.map((w) => (
            <div key={w} className="alert alert-warning py-2 small mb-0">{w}</div>
          ))}
          <Kpis d={data} />
          <div className="mp-tableWrap">
            <table className="mp-table" aria-label="Spend and return by campaign">
              <thead>
                <tr>
                  <th scope="col">Campaign</th>
                  <th scope="col">Spend</th>
                  <th scope="col">Signups</th>
                  <th scope="col" title="Spend ÷ signups">Per signup</th>
                  <th scope="col" title="On a paid period running today">Paying</th>
                  <th scope="col" title="Spend ÷ paying">Per payer</th>
                  <th scope="col">MRR</th>
                  <th scope="col" title="Memberships + deposits − refunds, per person">Collected</th>
                  <th scope="col" title="Collected ÷ spend">Return</th>
                  <th scope="col">Payback</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => <Row key={r.key} r={r} />)}
              </tbody>
            </table>
          </div>
          <p className="mp-card__note mb-0">
            Paying uses the Revenue page rule (paid period running today). Collected is memberships plus deposits minus refunds
            for each person, the same money as the Revenue page&rsquo;s cash. Payback target {data.paybackTargetMonths} months.
            Matched on utm_campaign = the campaign id or name.
            {data.existingCustomers > 0 && ` ${formatCount(data.existingCustomers)} people who were already paying before they filled in a form are not counted as ad signups.`}
            {data.sync.lastSync ? ` Meta last synced ${data.sync.lastSync.finishedAt ? new Date(data.sync.lastSync.finishedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'just now'} (${data.sync.lastSync.outcome}).` : ''}
          </p>
        </div>
      )}
    </section>
  );
}

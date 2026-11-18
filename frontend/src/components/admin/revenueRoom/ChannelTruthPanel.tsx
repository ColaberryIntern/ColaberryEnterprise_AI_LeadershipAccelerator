import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { SectionCard } from '../shell';
import { StatusChip, type TileStatus } from '../commercialization/statusVocabulary';

/**
 * R19 — where the people who pay us actually came from.
 *
 * THE JOB OF THIS PANEL IS THAT A CHANNEL WE SPENT ON AND GOT NOBODY FROM CANNOT BE SCROLLED
 * PAST, and that a channel we never measured is not quietly reported as free. Measured on
 * production 2026-11-17: the open house produced 16 of the 26 paying members, CCPP alumni and
 * winback 5 each, and paid ads produced none against $3,894.80 of recorded spend.
 *
 * TWO CHIPS PER ROW, because the member count and the cost fail independently. A channel can
 * have a perfectly good member count and no knowable cost (nothing was ever recorded against
 * it), and it can have exact spend and no knowable cost (nobody paid, so the ratio has no
 * denominator). One chip would silently pick one of those and hide the other - the same reason
 * the Revenue Room keeps status and verdict apart on a hypothesis card.
 *
 * A BLANK SPEND CELL MEANS NOT RECORDED. It is rendered as an em dash with its reason in the
 * row note, never as $0, because "we spent nothing on the open house" is a claim nobody
 * measured.
 */

export interface ChannelRow {
  key: string;
  label: string;
  leads: number;
  payingMembers: number;
  mrrCents: number;
  spendCents: number | null;
  costPerPayingMemberCents: number | null;
  status: TileStatus;
  costStatus: TileStatus;
  note: string;
}

export interface ChannelTruth {
  asOf: string;
  rows: ChannelRow[];
  totals: { payingMembers: number; mrrCents: number; recordedSpendCents: number };
  caveats: string[];
}

/** Whole dollars. These are comparison figures, and cents on a $20,000 column are noise. */
const usd = (cents: number | null): string => (
  cents === null ? '—' : `$${Math.round(cents / 100).toLocaleString('en-US')}`
);

const count = (n: number): string => n.toLocaleString('en-US');

/**
 * The table, exported as the test seam.
 *
 * `renderToStaticMarkup` never runs effects, so a test of the default export can only ever
 * reach the loading state. The invariants that matter here - a blank spend cell rather than
 * $0, a chip beside a cost that is not knowable, no blended total - are properties of how a
 * row renders, so they have to be reachable without a fetch or they are asserted only by
 * reading the source. Same seam `AdminRevenueRoomPage` exports for `InitiativeCardView`.
 */
export function ChannelTable({ report }: { report: ChannelTruth }) {
  if (report.rows.length === 0) {
    return (
      <p className="text-muted small m-3 mb-0" data-testid="channel-empty">
        No channel carries a lead or a paying member. That is a failure to measure rather than a
        business with no customers, so nothing is claimed here.
      </p>
    );
  }

  return (
    <>
      <div className="table-responsive">
        <table className="table table-hover mb-0 align-middle" data-testid="channel-table">
          <thead className="table-light">
            <tr>
              <th scope="col">Channel</th>
              <th scope="col" className="text-end">Paying</th>
              <th scope="col" className="text-end">MRR</th>
              <th scope="col" className="text-end">Leads</th>
              <th scope="col" className="text-end">Spend</th>
              <th scope="col" className="text-end">Per paying member</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.key} data-testid={`channel-row-${r.key}`}>
                <td>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="fw-semibold" style={{ color: 'var(--text-primary)' }}>
                      {r.label}
                    </span>
                    <StatusChip status={r.status} />
                  </div>
                  <div className="small text-muted mt-1" style={{ maxWidth: '52ch' }}>
                    {r.note}
                  </div>
                </td>
                <td className="text-end fw-semibold">{count(r.payingMembers)}</td>
                <td className="text-end">{usd(r.mrrCents)}</td>
                <td className="text-end">{count(r.leads)}</td>
                <td className="text-end" data-testid={`channel-spend-${r.key}`}>
                  {usd(r.spendCents)}
                </td>
                <td className="text-end" data-testid={`channel-cost-${r.key}`}>
                  <div>{usd(r.costPerPayingMemberCents)}</div>
                  {r.costStatus !== 'live' && (
                    <div className="mt-1"><StatusChip status={r.costStatus} /></div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="table-light">
            <tr>
              <th scope="row">Total</th>
              <th className="text-end">{count(report.totals.payingMembers)}</th>
              <th className="text-end">{usd(report.totals.mrrCents)}</th>
              <th />
              <th className="text-end">{usd(report.totals.recordedSpendCents)}</th>
              {/* Deliberately blank. A blended cost per member across channels where one side
                  was never recorded is the single most misleading number this panel could
                  print, so it prints none. */}
              <th className="text-end small fw-normal text-muted" data-testid="channel-no-blend">
                Not blended on purpose
              </th>
            </tr>
          </tfoot>
        </table>
      </div>

      {report.caveats.length > 0 && (
        <ul className="small text-muted m-3 mb-0" data-testid="channel-caveats">
          {report.caveats.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
    </>
  );
}

export default function ChannelTruthPanel() {
  const [report, setReport] = useState<ChannelTruth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.get('/api/admin/commercialization/channel-truth')
      .then((res) => {
        if (!alive) return;
        const data = res?.data?.data;
        // A shape we did not expect is a failed load, not a business with no channels.
        if (!data || !Array.isArray(data.rows)) throw new Error('unexpected shape');
        setReport(data);
      })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.error || 'Could not read the channel panel.');
      });
    return () => { alive = false; };
  }, []);

  return (
    <SectionCard
      title="Where the paying members came from"
      subtitle="Per acquisition channel: who pays, what they pay, and what was spent to get them"
      icon="route-line"
      className="mt-4"
      padded={false}
    >
      {error && (
        <div className="alert alert-warning m-3 mb-0" role="alert" data-testid="channel-error">
          {error}
        </div>
      )}
      {!error && !report && (
        <p className="text-muted small m-3 mb-0">Reading the acquisition channels…</p>
      )}
      {report && <ChannelTable report={report} />}
    </SectionCard>
  );
}

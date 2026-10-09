import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { listOfferPolicies } from '../../services/growthJourneyInspectApi';
import type { OfferPolicyRow } from '../../services/growthJourneyInspectApi';
import { safeText } from './journeyText';
import {
  JourneyPagingFooter, JourneyEmpty, JourneyFilterBar, JourneySelect, PAGE_LIMIT,
} from './journeyPaging';
import ContentRulesTable from './ContentRulesTable';

/**
 * Content: which offers a brand may speak about, and which assets are approved
 * (Phase 6, T614).
 *
 * ── `decision` IS A STORED VALUE, NOT A VERDICT FOR THIS REQUEST ────────────
 *
 * A policy row's `decision` is `allow` or `deny` as recorded on the row. It is NOT
 * the eligibility engine's answer for a particular subject - that lives behind
 * `contentEligibility` and is not this read. Labelling the column "Verdict" would
 * invite someone to read a row as a live decision about a person, so it is labelled
 * as the policy's own setting and the caption says so.
 *
 * ── THE ONE PER-LIST CUT ON THIS WHOLE SURFACE ──────────────────────────────
 *
 * `approved_landing_pages` is capped at 25 items server-side while
 * `approved_landing_pages_total` carries the true length. When they differ the list
 * on screen is a floor, and this is the only place on the nine reads where that can
 * happen - `total` everywhere else is a real `COUNT(*)`. So the row says "showing 25
 * of N" rather than letting 25 read as all of them. This is the same class of defect
 * T608 was docked for and T613 spent two attempts defending on the health panel.
 *
 * ── THE COPY ITSELF IS NEVER SERVED, AND THAT IS THE DESIGN ─────────────────
 *
 * `claims_count` and `ctas_count` are counts; the approved claim and CTA text is not
 * returned, and the policy row's operator `notes` column is never even requested. So
 * this tab can say how many approved claims exist but not what they say - which is
 * correct for a screen whose job is governance rather than copy review, and is
 * stated in the caption so a reader does not think the text failed to load.
 *
 * The approved-content-rules half lives in `ContentRulesTable.tsx`: a second
 * endpoint with its own filter contract, split out when this file reached 273 lines
 * against T614's 260-line budget.
 */

const DECISIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'allow and deny' },
  { value: 'allow', label: 'allow' },
  { value: 'deny', label: 'deny' },
];

const STATUSES: readonly { value: string; label: string }[] = [
  { value: '', label: 'any status' },
  { value: 'active', label: 'active' },
  { value: 'paused', label: 'paused' },
  { value: 'retired', label: 'retired' },
];

interface Props {
  brandName?: string | null;
  unseeded?: boolean;
}

function LandingPages({ row }: { row: OfferPolicyRow }) {
  const shown = row.approved_landing_pages.length;
  const cut = row.approved_landing_pages_total > shown;
  if (row.approved_landing_pages_total === 0) {
    return <span className="text-muted">none approved</span>;
  }
  return (
    <>
      <span>{shown === row.approved_landing_pages_total
        ? `${shown} approved`
        : `showing ${shown} of ${row.approved_landing_pages_total}`}
      </span>
      {cut && (
        <span className="badge bg-warning text-dark ms-1">
          list cut at the server cap
        </span>
      )}
    </>
  );
}

export default function ContentTab({ brandName, unseeded }: Props) {
  const [decision, setDecision] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [offset, setOffset] = React.useState(0);

  const policies = useGrowthJourneyData(
    () => listOfferPolicies({
      decision: (decision || undefined) as 'allow' | 'deny' | undefined,
      status: status || undefined,
      limit: PAGE_LIMIT,
      offset,
    }),
    `policies:${decision}:${status}:${offset}`,
  );

  return (
    <section>
      <h2 className="h5 mb-3">What may be said, and which assets are approved</h2>
      <JourneyFilterBar
        right={(
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={policies.reload}>
            Reload
          </button>
        )}
      >
        <JourneySelect
          label="Policy decision"
          value={decision}
          options={DECISIONS}
          onChange={(v) => { setDecision(v); setOffset(0); }}
        />
        <JourneySelect
          label="Policy status"
          value={status}
          options={STATUSES}
          onChange={(v) => { setStatus(v); setOffset(0); }}
        />
      </JourneyFilterBar>

      <AsyncPanel state={policies} onRetry={policies.reload}>
        {(data) => (
          data.rows.length === 0 ? (
            <JourneyEmpty noun="offer policies" brandName={brandName} unseeded={unseeded} />
          ) : (
            <>
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span className="fw-semibold">Offer policies</span>
                  <span className="small text-muted">
                    scope applied: brand <code>{data.scope.brand_id ?? 'all in scope'}</code>
                  </span>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table table-hover mb-0 align-middle">
                      <caption className="small text-muted">
                        <code>decision</code> is the policy&rsquo;s own stored setting, not a
                        verdict computed for a particular {' '}
                        subject. Claim and CTA text is never served to this screen — the
                        counts are deliberate, not a failed load.
                      </caption>
                      <thead className="table-light">
                        <tr>
                          <th scope="col">Offer family</th>
                          <th scope="col">Policy</th>
                          <th scope="col">Status</th>
                          <th scope="col">Landing pages</th>
                          <th scope="col">Claims</th>
                          <th scope="col">CTAs</th>
                          <th scope="col">Effective</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => (
                          <tr key={row.id}>
                            <th scope="row" className="fw-normal">
                              <code>{safeText(row.offer_family)}</code>
                            </th>
                            <td>
                              <span className={`badge ${row.decision === 'allow' ? 'bg-success' : 'bg-danger'}`}>
                                {safeText(row.decision)}
                              </span>
                            </td>
                            <td><span className="badge bg-light text-dark border">{safeText(row.status)}</span></td>
                            <td><LandingPages row={row} /></td>
                            <td>{row.claims_count}</td>
                            <td>{row.ctas_count}</td>
                            <td>
                              <span className="small text-muted">
                                {row.effective_from}
                                {row.effective_to ? ` → ${row.effective_to}` : ' (open-ended)'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <JourneyPagingFooter page={data} onOffset={setOffset} noun="offer policies" />
            </>
          )
        )}
      </AsyncPanel>

      <ContentRulesTable brandName={brandName} unseeded={unseeded} />
    </section>
  );
}

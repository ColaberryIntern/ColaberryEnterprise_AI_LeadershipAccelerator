import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { listContentRules } from '../../services/growthJourneyInspectApi';
import { safeText } from './journeyText';
import {
  JourneyEmpty, JourneyFilterBar, JourneyTextFilter, MaskedValue, PAGE_LIMIT,
} from './journeyPaging';

/**
 * The approved-content-rules half of the content tab (Phase 6, T614).
 *
 * Split out of `ContentTab.tsx` because that file reached 273 lines against this
 * task's 260-line budget, and the two halves are two different endpoints with two
 * different filter contracts - so the seam was already there.
 *
 * ── `approval_status` IS NOT AN ENUM, AND THE FILTER MUST NOT PRETEND ───────
 *
 * The column is a bare STRING(16) with no CHECK constraint and the API accepts any
 * free string of 1..16 characters. The only documented value is the default
 * `draft`. A closed dropdown would hide whatever else is actually in the table, so
 * this is a text input with `draft` as a placeholder hint - and the empty state says
 * that a filter matching nothing is not proof the value is absent elsewhere.
 *
 * ── TWO FIELDS ARE DELIBERATELY NOT SERVED ──────────────────────────────────
 *
 * `source_evidence` (a JSONB array of pasted reviewer evidence) is never requested,
 * and the backend's access test asserts the key is absent from the response.
 * `approved_by` comes through `safeField` with an `approved_by_redacted` companion,
 * so "redacted" and "not recorded" are distinguishable rather than both reading as
 * blank.
 */

export default function ContentRulesTable({
  brandName, unseeded,
}: { brandName?: string | null; unseeded?: boolean }) {
  const [approvalStatus, setApprovalStatus] = React.useState('');
  const rules = useGrowthJourneyData(
    () => listContentRules({ approval_status: approvalStatus || undefined, limit: PAGE_LIMIT, offset: 0 }),
    `rules:${approvalStatus}`,
  );

  return (
    <>
      <h3 className="h6 mt-4 mb-2">Approved content rules</h3>
      <JourneyFilterBar>
        <JourneyTextFilter
          label="Approval status"
          value={approvalStatus}
          placeholder="draft"
          onCommit={setApprovalStatus}
        />
      </JourneyFilterBar>
      <AsyncPanel state={rules} onRetry={rules.reload}>
        {(data) => (
          data.rows.length === 0 ? (
            <JourneyEmpty
              noun="content rules"
              brandName={brandName}
              unseeded={unseeded}
              hint="The approval status is a free-text column server-side, so a filter that matches nothing is not proof the value does not exist elsewhere in the table."
            />
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-hover mb-0 align-middle">
                    <caption className="small text-muted">
                      <code>approved_by</code> is masked by the API, which reports which
                      happened: &ldquo;redacted&rdquo; means it held an address,
                      &ldquo;not recorded&rdquo; means it was empty. Reviewer evidence is
                      never served to this screen.
                    </caption>
                    <thead className="table-light">
                      <tr>
                        <th scope="col">Collection</th>
                        <th scope="col">Version</th>
                        <th scope="col">Approval</th>
                        <th scope="col">Approved by</th>
                        <th scope="col">Claims</th>
                        <th scope="col">Access tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => (
                        <tr key={row.id}>
                          <th scope="row" className="fw-normal">
                            <code>{safeText(row.collection_key ?? row.offer_family)}</code>
                          </th>
                          <td>{row.version}</td>
                          <td>
                            <span className="badge bg-light text-dark border">
                              {safeText(row.approval_status)}
                            </span>
                          </td>
                          <td><MaskedValue value={row.approved_by} redacted={row.approved_by_redacted} /></td>
                          <td>{row.claims_count}</td>
                          <td>
                            {row.access_tier
                              ? safeText(row.access_tier)
                              : <span className="text-muted">none</span>}
                          </td>
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

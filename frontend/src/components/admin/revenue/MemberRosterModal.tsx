import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTenureBucketRoster, TenureRosterRow } from '../../../services/subscriptionAnalyticsApi';
import { money, fmtDate } from './format';
import PlanTag from './PlanTag';

interface Props {
  monthIndex: number; // 1-based; 5 means "Month 5+"
  bucketLabel: string;
  onClose: () => void;
}

/** Drill-down roster behind a paying-member tenure bucket ("Month 1", "Month
 *  2", ... "Month 5+") — mirrors ExplorerRosterModal's pattern, but for
 *  members who've already converted to a plan. */
export default function MemberRosterModal({ monthIndex, bucketLabel, onClose }: Props) {
  const [rows, setRows] = useState<TenureRosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTenureBucketRoster(monthIndex);
      setRows(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [monthIndex]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.payer_name.toLowerCase().includes(q) || r.payer_email.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${bucketLabel} roster`}
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header">
            <div>
              <h6 className="modal-title fw-semibold mb-0">{bucketLabel} ({rows.length})</h6>
              <p className="small text-muted mb-0">Subscribers currently {monthIndex === 5 ? 'in their 5th month or later' : `in their ${monthIndex === 1 ? '1st' : monthIndex === 2 ? '2nd' : monthIndex === 3 ? '3rd' : '4th'} month`}.</p>
            </div>
            <button className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          <div className="px-3 pt-3">
            <input
              className="form-control form-control-sm"
              placeholder="Search name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="modal-body pt-2">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading…</span></div>
              </div>
            ) : error ? (
              <div className="text-center py-4">
                <p className="text-danger mb-3">{error}</p>
                <button className="btn btn-sm btn-outline-primary" onClick={load}>Try again</button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Member</th><th>Plan</th><th className="text-end">Amount</th><th>Member since</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-muted py-4">No members match that search.</td></tr>
                    ) : filtered.map((r) => (
                      <tr key={r.enrollment_id}>
                        <td>
                          <div className="fw-medium">{r.payer_name}</div>
                          <div className="small text-muted"><code>{r.payer_email}</code></div>
                        </td>
                        <td><PlanTag plan={r.plan} /></td>
                        <td className="text-end fw-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {r.plan === 'comp' ? '—' : `${money(r.monthly_amount)}/mo`}
                        </td>
                        <td className="small text-muted text-nowrap">{fmtDate(r.member_since)}</td>
                        <td className="text-end">
                          <Link
                            to={`/admin/accelerator?enrollment=${r.enrollment_id}&name=${encodeURIComponent(r.payer_name)}`}
                            className="btn btn-sm btn-outline-secondary"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

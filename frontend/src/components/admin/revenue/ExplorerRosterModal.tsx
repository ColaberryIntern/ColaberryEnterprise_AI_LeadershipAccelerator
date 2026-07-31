import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../shell';
import { getExplorerRoster, ExplorerRosterRow } from '../../../services/explorerRosterApi';
import { fmtDate } from './format';

interface Props {
  onClose: () => void;
}

const LEVEL_TONE: Record<number, 'neutral' | 'info' | 'success' | 'primary'> = {
  1: 'neutral', // Apprentice
  2: 'info', // Builder
  3: 'success', // Architect
  4: 'primary', // Principal
};

/** Drill-down roster behind the "Explorer" tenure bucket — everyone still in
 *  free trial, ranked by their existing points/level, each linking through to
 *  their full Person 360 activity history for the real drill-through detail. */
export default function ExplorerRosterModal({ onClose }: Props) {
  const [rows, setRows] = useState<ExplorerRosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExplorerRoster();
      setRows(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load explorers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Explorer roster"
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header">
            <div>
              <h6 className="modal-title fw-semibold mb-0">Explorers ({rows.length})</h6>
              <p className="small text-muted mb-0">Free-trial signups, ranked by engagement level — for re-engagement campaign targeting.</p>
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
                      <th>Explorer</th><th>Level</th><th className="text-end">Points</th><th>Signed up</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-muted py-4">No explorers match that search.</td></tr>
                    ) : filtered.map((r) => (
                      <tr key={r.enrollment_id}>
                        <td>
                          <div className="fw-medium">{r.full_name}</div>
                          <div className="small text-muted"><code>{r.email}</code></div>
                        </td>
                        <td><StatusBadge label={r.level_name} tone={LEVEL_TONE[r.level] || 'neutral'} /></td>
                        <td className="text-end fw-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.points}</td>
                        <td className="small text-muted text-nowrap">{fmtDate(r.signed_up_at)}</td>
                        <td className="text-end">
                          <Link
                            to={`/admin/accelerator?enrollment=${r.enrollment_id}&name=${encodeURIComponent(r.full_name)}`}
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

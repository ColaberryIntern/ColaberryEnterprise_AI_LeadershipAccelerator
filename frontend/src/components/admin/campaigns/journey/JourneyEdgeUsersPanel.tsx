/**
 * The people behind one band.
 *
 * Calls the existing `graph/edge-users` endpoint — the same drill-down the force
 * graph used — so selecting a ribbon still answers "who are these leads" with real
 * records rather than a count.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { getGraphEdgeUsers, type GraphUserRecord } from '../../../../services/intelligenceApi';

interface Props {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  onClose: () => void;
}

const PAGE_SIZE = 50;

export default function JourneyEdgeUsersPanel({
  from,
  to,
  fromLabel,
  toLabel,
  onClose,
}: Props): React.ReactElement {
  const [users, setUsers] = useState<GraphUserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError('');
      try {
        const res = await getGraphEdgeUsers(from, to, targetPage, PAGE_SIZE);
        setUsers(res.data.users ?? []);
        setTotal(res.data.total ?? 0);
        setPage(res.data.page ?? targetPage);
      } catch (err: any) {
        // Surfaced, not swallowed: an empty list and a failed request look
        // identical to the reader unless the failure says so.
        setError(
          err?.response?.data?.error ||
            'Could not load the leads on this path. The request failed rather than returning nobody.',
        );
        setUsers([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [from, to],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom d-flex align-items-start justify-content-between gap-2">
        <div>
          <div className="fw-semibold small">
            {fromLabel} → {toLabel}
          </div>
          <div className="text-muted" style={{ fontSize: '0.7rem' }}>
            {loading ? 'Loading leads…' : `${total.toLocaleString()} leads took this path`}
          </div>
        </div>
        <button
          type="button"
          className="btn-close"
          aria-label="Close path details"
          onClick={onClose}
        />
      </div>

      <div className="flex-grow-1 overflow-auto p-2">
        {loading && (
          <div className="text-center py-4">
            <div className="spinner-border spinner-border-sm text-primary" role="status">
              <span className="visually-hidden">Loading</span>
            </div>
          </div>
        )}

        {!loading && error && <div className="alert alert-warning small mb-0">{error}</div>}

        {!loading && !error && users.length === 0 && (
          <div className="text-muted small">No lead records returned for this path.</div>
        )}

        {!loading && !error && users.length > 0 && (
          <table className="table table-sm mb-0">
            <thead>
              <tr>
                <th scope="col" style={{ fontSize: '0.7rem' }}>
                  Lead
                </th>
                <th scope="col" style={{ fontSize: '0.7rem' }}>
                  Source
                </th>
                <th scope="col" style={{ fontSize: '0.7rem' }}>
                  Stage
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontSize: '0.72rem' }}>
                    <div className="fw-medium">{u.name || u.email}</div>
                    <div className="text-muted">{u.email}</div>
                    {u.company && <div className="text-muted">{u.company}</div>}
                  </td>
                  <td className="text-muted" style={{ fontSize: '0.72rem' }}>
                    {u.source || u.source_category || '—'}
                  </td>
                  <td className="text-muted" style={{ fontSize: '0.72rem' }}>
                    {u.pipeline_stage || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="p-2 border-top d-flex align-items-center justify-content-between">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
          >
            Previous
          </button>
          <span className="text-muted" style={{ fontSize: '0.7rem' }}>
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={page >= pages || loading}
            onClick={() => load(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

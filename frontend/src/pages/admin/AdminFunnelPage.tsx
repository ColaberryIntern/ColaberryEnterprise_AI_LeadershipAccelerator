import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

interface PageFunnel {
  page_path: string;
  visitors: number;
  pageviews: number;
  scrolled: number;
  scrolled_pct: number;
  clicked: number;
  clicked_pct: number;
  cta_clicked: number;
  cta_clicked_pct: number;
  modal_opened: number;
  modal_opened_pct: number;
  booked: number;
  booked_pct: number;
  heartbeats: number;
}

const DAY_OPTIONS = [1, 7, 14, 30];

export default function AdminFunnelPage() {
  const [days, setDays] = useState(7);
  const [pages, setPages] = useState<PageFunnel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get('/api/admin/visitor-analytics/page-funnel', { params: { days } })
      .then(res => {
        if (!cancelled) setPages(res.data?.pages || []);
      })
      .catch(err => {
        if (!cancelled) setError(err?.response?.data?.error || 'Failed to load funnel');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const cellPct = (n: number, pct: number) => (
    <td className="text-center">
      <div className="fw-semibold">{n.toLocaleString()}</div>
      <small className="text-muted">{pct}%</small>
    </td>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="fw-semibold mb-1">Funnel Drop-off by Page</h4>
          <p className="text-muted small mb-0">Where visitors land, engage, and drop off across the public site.</p>
        </div>
        <div className="btn-group btn-group-sm" role="group">
          {DAY_OPTIONS.map(d => (
            <button
              key={d}
              type="button"
              className={`btn ${days === d ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setDays(d)}
            >
              {d === 1 ? '24h' : `${d} days`}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th style={{ minWidth: 220 }}>Page</th>
                <th className="text-center">Visitors</th>
                <th className="text-center">Scrolled</th>
                <th className="text-center">Clicked</th>
                <th className="text-center">CTA Click</th>
                <th className="text-center">Modal Opened</th>
                <th className="text-center">Booked</th>
                <th className="text-center" title="Time-on-page indicator">Heartbeats</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" role="status"><span className="visually-hidden">Loading…</span></div></td></tr>
              )}
              {!loading && pages.length === 0 && (
                <tr><td colSpan={8} className="text-center py-4 text-muted">No page traffic in this window.</td></tr>
              )}
              {!loading && pages.map((p) => (
                <tr key={p.page_path}>
                  <td>
                    <code className="small">{p.page_path}</code>
                    {p.booked > 0 && <span className="badge bg-success ms-2">Converting</span>}
                    {p.visitors > 5 && p.modal_opened === 0 && p.booked === 0 && <span className="badge bg-warning text-dark ms-2">Leaky</span>}
                  </td>
                  <td className="text-center fw-semibold">{p.visitors}</td>
                  {cellPct(p.scrolled, p.scrolled_pct)}
                  {cellPct(p.clicked, p.clicked_pct)}
                  {cellPct(p.cta_clicked, p.cta_clicked_pct)}
                  {cellPct(p.modal_opened, p.modal_opened_pct)}
                  {cellPct(p.booked, p.booked_pct)}
                  <td className="text-center text-muted">{p.heartbeats.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 small text-muted">
        <strong>How to read this:</strong> Each column shows the count and the % of visitors who reached that step. A page with high visitors but low CTA-click % is a copy/positioning problem. A page with high CTA-click but low Modal-Opened is a button/UX problem. High Modal-Opened but low Booked is a form/friction problem. <span className="badge bg-warning text-dark ms-1">Leaky</span> flags pages with 5+ visitors and 0 conversions; <span className="badge bg-success ms-1">Converting</span> flags pages that produced bookings.
      </div>
    </div>
  );
}

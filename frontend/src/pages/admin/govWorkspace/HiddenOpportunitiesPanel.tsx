import React, { useCallback, useState } from 'react';
import { listHiddenGovOpportunities, restoreGovOpportunity, type HiddenGovOpportunity } from '../../../services/factoryApi';

const REASONS: Record<string, string> = {
  ai_not_a_fit: 'AI says not a fit',
  auto_fit_below_threshold: 'Fit under 60',
  auto_off_target: 'Off-target title',
};
const reasonLabel = (h: HiddenGovOpportunity): string => (h.reason && REASONS[h.reason]) || 'Dismissed by a person';

/**
 * Every row hidden from the team's board, with why, and a way back. The sweep hides rows on its own, so this is how a
 * person checks its work. Restoring sticks: the sweep never hides a restored row again. Loads when opened.
 */
export default function HiddenOpportunitiesPanel({ count, onRestored }: { count: number; onRestored: () => void | Promise<void> }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<HiddenGovOpportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { hidden } = await listHiddenGovOpportunities();
      setRows(Array.isArray(hidden) ? hidden : []);
    } catch (err: any) {
      setRows([]);
      setError(err?.response?.data?.error ?? 'Could not load the hidden list.');
    }
  }, []);

  const toggle = (): void => {
    if (!open) void load();
    setOpen((v) => !v);
  };

  const restore = async (key: string): Promise<void> => {
    setError(null);
    setRestoring(key);
    try {
      await restoreGovOpportunity(key);
      setRows((prev) => (prev ?? []).filter((r) => r.opportunityKey !== key));
      await onRestored();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not restore that opportunity. Please try again.');
    } finally {
      setRestoring(null);
    }
  };

  if (count <= 0 && !open) return null;
  return (
    <div className="w-100">
      <button type="button" className="btn btn-link btn-sm p-0 text-decoration-none" aria-expanded={open} onClick={toggle}>
        <i className="ri-eye-off-line me-1" aria-hidden="true" />Hidden ({count}) {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="alert alert-secondary py-2 mt-2" role="region" aria-label="Hidden opportunities">
          {error && <div className="text-danger small mb-1" role="alert">{error}</div>}
          {rows === null && <div className="small text-secondary">Loading…</div>}
          {rows !== null && rows.length === 0 && !error && <div className="small text-secondary">Nothing is hidden.</div>}
          {rows && rows.length > 0 && (
            <ul className="list-unstyled mb-0">
              {rows.map((h) => (
                <li key={h.opportunityKey} className="d-flex justify-content-between align-items-center gap-2 py-1">
                  <span className="small">
                    <span className="fw-semibold">{h.title || h.opportunityKey}</span>
                    {h.agency && <span className="text-secondary"> · {h.agency}</span>}
                    <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2">{reasonLabel(h)}</span>
                  </span>
                  <button type="button" className="btn btn-outline-secondary btn-sm" disabled={restoring === h.opportunityKey} onClick={() => void restore(h.opportunityKey)}>
                    <i className="ri-arrow-go-back-line me-1" aria-hidden="true" />Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

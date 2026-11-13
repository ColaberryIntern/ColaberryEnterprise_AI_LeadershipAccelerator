import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../../utils/api';

/**
 * ArchivedProjectsPanel - the reveal switch, and the only place archived projects are shown.
 *
 * IT FETCHES NOTHING UNTIL IT IS OPENED. That is deliberate rather than a performance choice: a
 * panel that loads archived projects on every page view puts removed work back on screen for
 * everyone who opens the delivery board, which is the thing archiving exists to prevent. The
 * switch is the consent.
 *
 * It reads its own endpoint (`/api/admin/projects/archived`) rather than passing a flag to the
 * normal delivery query, for the same reason the backend route is separate: a flag defaults to
 * false in one place and is forgotten in the next, and the failure is archived projects
 * reappearing in an ordinary view.
 */

export interface ArchivedProject {
  id: string;
  name: string | null;
  enrollment_id: string | null;
  archived_at: string;
  archived_by: string | null;
  archived_reason: string | null;
  student_name: string | null;
  student_email: string | null;
  task_count: number;
}

interface Props {
  /** Called after a successful restore so the live board can refetch. */
  onRestored?: () => void;
}

const when = (iso: string): string => {
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return iso; }
};

const ArchivedProjectsPanel: React.FC<Props> = ({ onRestored }) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ArchivedProject[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.get('/api/admin/projects/archived');
      setRows(res.data?.projects ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load archived projects.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (open && rows === null) void load(); }, [open, rows, load]);

  const restore = async (p: ArchivedProject) => {
    // A restore puts a project back on every surface and can change which build a student is
    // pointed at, so it asks first. The archive itself already asked for a reason.
    const ok = window.confirm(
      `Restore "${p.name ?? p.id}"?\n\n`
      + `It returns to every listing with its ${p.task_count} task(s) intact.`,
    );
    if (!ok) return;
    setRestoring(p.id);
    setError(null);
    try {
      await api.post(`/api/admin/projects/${p.id}/restore`);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== p.id));
      onRestored?.();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Restore failed.');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white d-flex align-items-center gap-2">
        <div className="form-check form-switch mb-0">
          <input
            className="form-check-input"
            type="checkbox"
            id="show-archived-projects"
            checked={open}
            onChange={(e) => setOpen(e.target.checked)}
          />
          <label className="form-check-label small fw-semibold" htmlFor="show-archived-projects">
            Show deleted projects
          </label>
        </div>
        {open && rows !== null && (
          <span className="badge bg-secondary ms-auto">{rows.length}</span>
        )}
      </div>

      {open && (
        <div className="card-body">
          <p className="text-muted small mb-3">
            Deleted projects are hidden from every listing, including this board and the student&apos;s
            own portal. Nothing is erased: the tasks, verified stories and awarded points are intact
            and come back on restore.
          </p>

          {busy && <div className="text-muted small">Loading…</div>}
          {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}

          {!busy && rows !== null && rows.length === 0 && (
            <div className="text-muted small">Nothing has been deleted.</div>
          )}

          {rows !== null && rows.length > 0 && (
            <div className="table-responsive">
              <table className="table table-hover table-sm mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Project</th>
                    <th>Student</th>
                    <th>Deleted</th>
                    <th>By</th>
                    <th>Reason</th>
                    <th className="text-end">Tasks</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="fw-medium">{p.name ?? <span className="text-muted">unnamed</span>}</td>
                      <td className="small">
                        {p.student_name ?? <span className="text-muted">unknown</span>}
                        {p.student_email && <div className="text-muted">{p.student_email}</div>}
                      </td>
                      <td className="small text-muted">{when(p.archived_at)}</td>
                      <td className="small text-muted">
                        {p.archived_by ?? <span title="Deleted by the student, or before this was recorded">—</span>}
                      </td>
                      <td className="small">
                        {p.archived_reason ?? <span className="text-muted">not recorded</span>}
                      </td>
                      <td className="text-end small">{p.task_count}</td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          disabled={restoring === p.id}
                          onClick={() => restore(p)}
                        >
                          {restoring === p.id ? 'Restoring…' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ArchivedProjectsPanel;

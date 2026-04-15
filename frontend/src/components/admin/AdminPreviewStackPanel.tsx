import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';

interface PreviewStack {
  id: string;
  project_id: string;
  slug: string;
  status: string;
  frontend_port: number | null;
  backend_port: number | null;
  repo_url: string | null;
  repo_commit_sha: string | null;
  last_accessed_at: string | null;
  last_started_at: string | null;
  last_stopped_at: string | null;
  failure_reason: string | null;
  updated_at: string;
}

interface PreviewEvent {
  id: string;
  event_type: string;
  detail: any;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--color-accent)',
  stopped: 'var(--color-text-light)',
  provisioning: 'var(--color-primary-light)',
  failed: 'var(--color-secondary)',
  tearing_down: 'var(--color-warning)',
  archived: '#9ca3af',
};

interface Props {
  projectId: string;
}

export default function AdminPreviewStackPanel({ projectId }: Props) {
  const [stack, setStack] = useState<PreviewStack | null>(null);
  const [events, setEvents] = useState<PreviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [destroyConfirm, setDestroyConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/admin/preview-stacks/${projectId}`);
      setStack(res.data.stack);
      setEvents(res.data.events || []);
      setError(null);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setStack(null);
        setEvents([]);
        setError(null);
      } else {
        setError(err.response?.data?.error || 'Failed to load preview stack');
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const run = async (action: string, opts: { method?: string; confirm?: string } = {}) => {
    setBusy(action);
    setError(null);
    try {
      const method = opts.method || 'post';
      const url = opts.confirm
        ? `/api/admin/preview-stacks/${projectId}${action ? '/' + action : ''}?confirm=${opts.confirm}`
        : `/api/admin/preview-stacks/${projectId}${action ? '/' + action : ''}`;
      if (method === 'delete') {
        await api.delete(url);
      } else {
        await api.post(url);
      }
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || `${action} failed`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="small text-muted"><div className="spinner-border spinner-border-sm me-2"></div>Loading preview stack…</div>;
  }

  return (
    <div className="card border-0 shadow-sm mt-3">
      <div className="card-header bg-white fw-semibold d-flex align-items-center justify-content-between" style={{ color: 'var(--color-primary)' }}>
        <span><i className="bi bi-hdd-stack me-2"></i>Preview Stack</span>
        {stack && (
          <span className="badge" style={{ background: STATUS_COLORS[stack.status] || '#6b7280', color: '#fff', fontSize: 10 }}>
            {stack.status.toUpperCase()}
          </span>
        )}
      </div>
      <div className="card-body">
        {error && <div className="alert alert-danger py-2 small mb-2">{error}</div>}

        {!stack ? (
          <div>
            <p className="text-muted small mb-2">No preview stack provisioned for this project yet.</p>
            <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => run('provision')}>
              {busy === 'provision' ? <><span className="spinner-border spinner-border-sm me-2"></span>Provisioning…</> : <><i className="bi bi-play-circle me-1"></i>Provision</>}
            </button>
          </div>
        ) : (
          <>
            <dl className="row mb-2 small">
              <dt className="col-sm-4 text-muted fw-normal">Slug</dt>
              <dd className="col-sm-8"><code>{stack.slug}</code></dd>

              <dt className="col-sm-4 text-muted fw-normal">Preview URL</dt>
              <dd className="col-sm-8">
                <a href={`/preview/${stack.slug}/`} target="_blank" rel="noopener noreferrer">
                  /preview/{stack.slug}/ <i className="bi bi-box-arrow-up-right ms-1"></i>
                </a>
              </dd>

              <dt className="col-sm-4 text-muted fw-normal">Ports</dt>
              <dd className="col-sm-8">frontend {stack.frontend_port ?? '—'} · backend {stack.backend_port ?? '—'}</dd>

              <dt className="col-sm-4 text-muted fw-normal">Repo commit</dt>
              <dd className="col-sm-8">
                {stack.repo_commit_sha ? <code>{stack.repo_commit_sha.slice(0, 12)}</code> : '—'}
              </dd>

              <dt className="col-sm-4 text-muted fw-normal">Last accessed</dt>
              <dd className="col-sm-8">{stack.last_accessed_at ? new Date(stack.last_accessed_at).toLocaleString() : 'never'}</dd>

              {stack.failure_reason && (
                <>
                  <dt className="col-sm-4 text-muted fw-normal">Failure</dt>
                  <dd className="col-sm-8 text-danger small">{stack.failure_reason}</dd>
                </>
              )}
            </dl>

            <div className="d-flex gap-2 flex-wrap">
              <button className="btn btn-sm btn-outline-primary" disabled={!!busy} onClick={() => run('rebuild')}>
                {busy === 'rebuild' ? 'Rebuilding…' : <><i className="bi bi-arrow-clockwise me-1"></i>Rebuild</>}
              </button>
              {stack.status === 'running' && (
                <button className="btn btn-sm btn-outline-secondary" disabled={!!busy} onClick={() => run('stop')}>
                  {busy === 'stop' ? 'Stopping…' : <><i className="bi bi-pause-circle me-1"></i>Stop</>}
                </button>
              )}
              {(stack.status === 'stopped' || stack.status === 'failed') && (
                <button className="btn btn-sm btn-outline-primary" disabled={!!busy} onClick={() => run('boot')}>
                  {busy === 'boot' ? 'Booting…' : <><i className="bi bi-play-circle me-1"></i>Boot</>}
                </button>
              )}
              <button className="btn btn-sm btn-outline-warning" disabled={!!busy} onClick={() => run('archive')}>
                {busy === 'archive' ? 'Archiving…' : <><i className="bi bi-archive me-1"></i>Archive</>}
              </button>
              <button
                className="btn btn-sm btn-outline-danger"
                disabled={!!busy}
                onClick={() => {
                  if (!destroyConfirm) { setDestroyConfirm(true); return; }
                  run('', { method: 'delete', confirm: 'delete-data' });
                  setDestroyConfirm(false);
                }}
              >
                {busy === '' ? 'Destroying…' : destroyConfirm ? 'Click again to confirm destructive teardown' : <><i className="bi bi-trash me-1"></i>Destroy (data loss)</>}
              </button>
            </div>

            <div className="mt-3">
              <button className="btn btn-link btn-sm p-0" onClick={() => setShowEvents(s => !s)}>
                <i className={`bi bi-chevron-${showEvents ? 'up' : 'down'} me-1`}></i>
                {showEvents ? 'Hide' : 'Show'} events ({events.length})
              </button>
              {showEvents && (
                <div className="table-responsive mt-2">
                  <table className="table table-sm">
                    <thead className="table-light">
                      <tr><th style={{ fontSize: 11 }}>When</th><th style={{ fontSize: 11 }}>Event</th><th style={{ fontSize: 11 }}>Detail</th></tr>
                    </thead>
                    <tbody>
                      {events.map(ev => (
                        <tr key={ev.id} style={{ fontSize: 11 }}>
                          <td className="text-muted">{new Date(ev.created_at).toLocaleString()}</td>
                          <td><span className="badge bg-secondary">{ev.event_type}</span></td>
                          <td><code style={{ fontSize: 10 }}>{JSON.stringify(ev.detail || {})}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

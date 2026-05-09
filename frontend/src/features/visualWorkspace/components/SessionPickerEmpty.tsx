/**
 * SessionPickerEmpty — landing state when no session is open.
 *
 * Lets the user pick a recent session OR start a new one with a target
 * URL. Designed to feel calm and direct.
 */
import React, { useState } from 'react';

interface SessionStub {
  id: string;
  page_route: string;
  status: string;
  opened_at: string;
}

interface Props {
  recent: SessionStub[];
  onPick: (id: string) => void;
  onCreate: (route: string, origin: string) => Promise<void>;
  loading: boolean;
}

const SessionPickerEmpty: React.FC<Props> = ({ recent, onPick, onCreate, loading }) => {
  const [origin, setOrigin] = useState('http://localhost:8888');
  const [route, setRoute] = useState('/');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!route) return;
    setSubmitting(true);
    try {
      await onCreate(route, origin);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      maxWidth: 720,
      margin: '4rem auto',
      padding: '0 1rem',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <i className="bi bi-bullseye" style={{ fontSize: 40, color: 'var(--color-primary)' }}></i>
        <h2 style={{
          fontSize: 22,
          fontWeight: 600,
          color: 'var(--color-primary)',
          marginTop: 12,
          marginBottom: 6,
          letterSpacing: '-0.01em',
        }}>Visual Engineering Workspace</h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-light)' }}>
          Pin critique on any page · compile a prompt · hand off to Blueprint · verify · ship.
        </div>
      </div>

      <div className="card border-0 shadow-sm" style={{ marginBottom: 16 }}>
        <div className="card-header bg-white" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600 }}>
          Start a new review
        </div>
        <div className="card-body">
          <div className="row g-2 mb-2">
            <div className="col-md-7">
              <label className="form-label small fw-medium">Preview origin</label>
              <input
                className="form-control form-control-sm font-monospace"
                placeholder="http://localhost:8888"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </div>
            <div className="col-md-5">
              <label className="form-label small fw-medium">Page route</label>
              <input
                className="form-control form-control-sm font-monospace"
                placeholder="/portal/project/blueprint"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleCreate}
            disabled={submitting || !route.trim()}
          >
            <i className="bi bi-plus-lg me-1"></i>
            {submitting ? 'Opening…' : 'Open visual workspace'}
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600 }}>
          Recent reviews
        </div>
        <div className="card-body" style={{ fontSize: 13 }}>
          {loading && <div className="text-muted">Loading…</div>}
          {!loading && recent.length === 0 && (
            <div className="text-muted">No reviews yet. Start one above.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recent.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                style={{
                  background: 'white',
                  border: '1px solid var(--color-border)',
                  borderRadius: 4,
                  padding: '0.5rem 0.75rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-primary)' }}>{s.page_route}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 2 }}>
                    opened {new Date(s.opened_at).toLocaleString()}
                  </div>
                </div>
                <span className={`badge bg-${s.status === 'open' || s.status === 'active' ? 'primary' : 'secondary'}`} style={{ fontSize: 10 }}>
                  {s.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionPickerEmpty;

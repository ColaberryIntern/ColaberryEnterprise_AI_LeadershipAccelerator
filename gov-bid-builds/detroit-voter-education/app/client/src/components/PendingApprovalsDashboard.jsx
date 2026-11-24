import { useEffect, useRef, useState } from 'react';

// STORY-026: same admin-key + WebSocket pattern as STORY-025's
// SystemHealthDashboard (both connect to a dedicated /admin/* channel on
// server.js's shared WebSocket server after validating the key over a
// plain REST fetch first). Reuses coordinatorAgent.listPendingReview()
// (STORY-011) as the data source and the existing
// POST /api/summary-reviews/:subjectId/decision endpoint (STORY-011) for
// the inline approve/reject actions -- no new backend decision logic.
function getWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_WS_HOST || `${window.location.hostname}:3001`;
  return `${proto}//${host}${path}`;
}

export default function PendingApprovalsDashboard() {
  const [adminKey, setAdminKey] = useState('');
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | unauthorized | error
  const [pending, setPending] = useState([]);
  const [decidingId, setDecidingId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const wsRef = useRef(null);

  useEffect(() => () => wsRef.current?.close(), []);

  const connect = async () => {
    setStatus('connecting');
    try {
      const res = await fetch('/api/summary-reviews/pending', { headers: { 'x-admin-key': adminKey } });
      if (res.status === 401) {
        setStatus('unauthorized');
        return;
      }
      if (!res.ok) throw new Error('Failed to load pending approvals');
      setPending(await res.json());

      const ws = new WebSocket(getWsUrl(`/admin/pending-approvals?key=${encodeURIComponent(adminKey)}`));
      wsRef.current = ws;
      ws.onopen = () => setStatus('connected');
      ws.onerror = () => setStatus('error');
      ws.onclose = () => setStatus((prev) => (prev === 'connected' ? 'error' : prev));
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'PENDING_APPROVALS_UPDATE') setPending(msg.data);
      };
    } catch {
      setStatus('error');
    }
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('idle');
  };

  const decide = async (subjectId, decision) => {
    setDecidingId(subjectId);
    try {
      const res = await fetch(`/api/summary-reviews/${subjectId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ decision, adminId: 'city-content-admin', notes: noteDrafts[subjectId] || '' }),
      });
      if (!res.ok) throw new Error('Failed to record decision');
      // The list itself updates via the next WS push (within 5s); optimistically
      // remove it now so the admin gets immediate feedback rather than a stale row.
      setPending((prev) => prev.filter((item) => item.subject_id !== subjectId));
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <section className="pending-approvals-dashboard" aria-label="Pending content approvals dashboard">
      <h2>Pending Approvals — City Content Admin</h2>
      <p>Rehearsal-only: authenticates with a shared admin key, not real per-admin login. See STORY-025/026 decision records.</p>

      <div className="field">
        <label htmlFor="approvals-admin-key">Admin key</label>
        <input
          id="approvals-admin-key"
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          autoComplete="off"
        />
      </div>

      {status === 'connected' ? (
        <button type="button" onClick={disconnect}>Disconnect</button>
      ) : (
        <button type="button" onClick={connect} disabled={!adminKey || status === 'connecting'}>
          {status === 'connecting' ? 'Connecting…' : 'Connect'}
        </button>
      )}

      {status === 'unauthorized' && <p className="error" role="alert">Invalid admin key.</p>}
      {status === 'error' && <p className="error" role="alert">Connection lost — reconnect to resume live updates.</p>}

      {(status === 'connected' || status === 'error') && pending.length === 0 && (
        <p className="hint">No pending approvals right now.</p>
      )}

      {pending.length > 0 && (
        <ul className="pending-approvals-dashboard__list" aria-live="polite">
          {pending.map((item) => (
            <li key={item.subject_id} className="pending-approvals-dashboard__item">
              <div className="pending-approvals-dashboard__meta">
                <strong>{item.name}</strong> — {item.office} · {item.jurisdiction}
              </div>
              <p>{item.summary_text}</p>
              <p className="hint">Authored by {item.authored_by} · {Math.round(item.coverage_pct * 100)}% coverage</p>

              <div className="pending-approvals-dashboard__actions">
                <label htmlFor={`notes-${item.subject_id}`}>Notes (required to reject)</label>
                <input
                  id={`notes-${item.subject_id}`}
                  type="text"
                  value={noteDrafts[item.subject_id] || ''}
                  onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [item.subject_id]: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => decide(item.subject_id, 'approve')}
                  disabled={decidingId === item.subject_id}
                >
                  {decidingId === item.subject_id ? 'Working…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="pending-approvals-dashboard__reject"
                  onClick={() => decide(item.subject_id, 'reject')}
                  disabled={decidingId === item.subject_id || !(noteDrafts[item.subject_id] || '').trim()}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';

// STORY-027: same REST-then-WebSocket pattern as STORY-025/026, but this
// dashboard is gated by the data_steward role (STORY-024), not the
// general admin key -- the audit trail is more sensitive than other admin
// data, and a bulk "recent actions" feed is at least as sensitive as the
// single-entry lookup STORY-024 already restricted. The field below is
// deliberately labeled "Data steward key," not "Admin key," so that
// distinction is visible in the UI, not just the code -- pasting the
// general admin key here will correctly be rejected.
function getWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_WS_HOST || `${window.location.hostname}:3001`;
  return `${proto}//${host}${path}`;
}

const SIGNATURE_LABEL = { valid: 'Signature valid', invalid: 'Signature INVALID', unsigned: 'Unsigned (legacy)' };

export default function RecentActionsDashboard() {
  const [stewardKey, setStewardKey] = useState('');
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | unauthorized | error
  const [actions, setActions] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => () => wsRef.current?.close(), []);

  const connect = async () => {
    setStatus('connecting');
    try {
      const res = await fetch('/api/audit-log/recent', { headers: { 'x-admin-key': stewardKey } });
      if (res.status === 401) {
        setStatus('unauthorized');
        return;
      }
      if (!res.ok) throw new Error('Failed to load recent actions');
      setActions(await res.json());

      const ws = new WebSocket(getWsUrl(`/admin/recent-actions?key=${encodeURIComponent(stewardKey)}`));
      wsRef.current = ws;
      ws.onopen = () => setStatus('connected');
      ws.onerror = () => setStatus('error');
      ws.onclose = () => setStatus((prev) => (prev === 'connected' ? 'error' : prev));
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'RECENT_ACTIONS_UPDATE') setActions(msg.data);
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

  return (
    <section className="recent-actions-dashboard" aria-label="Recent actions dashboard">
      <h2>Recent Actions — Data Steward</h2>
      <p>Rehearsal-only: authenticates with a shared data-steward key, not real per-admin login. See STORY-024/027 decision records.</p>

      <div className="field">
        <label htmlFor="steward-key">Data steward key</label>
        <input
          id="steward-key"
          type="password"
          value={stewardKey}
          onChange={(e) => setStewardKey(e.target.value)}
          autoComplete="off"
        />
      </div>

      {status === 'connected' ? (
        <button type="button" onClick={disconnect}>Disconnect</button>
      ) : (
        <button type="button" onClick={connect} disabled={!stewardKey || status === 'connecting'}>
          {status === 'connecting' ? 'Connecting…' : 'Connect'}
        </button>
      )}

      {status === 'unauthorized' && <p className="error" role="alert">Invalid data steward key.</p>}
      {status === 'error' && <p className="error" role="alert">Connection lost — reconnect to resume live updates.</p>}

      {(status === 'connected' || status === 'error') && actions.length === 0 && (
        <p className="hint">No recent actions yet.</p>
      )}

      {actions.length > 0 && (
        <ul className="recent-actions-dashboard__list" aria-live="polite">
          {actions.map((entry) => (
            <li key={entry.id} className="recent-actions-dashboard__item">
              <div className="recent-actions-dashboard__meta">
                <strong>{entry.action}</strong> · {new Date(entry.created_at).toLocaleString()}
              </div>
              <p className={`recent-actions-dashboard__signature recent-actions-dashboard__signature--${entry.signatureStatus}`}>
                {SIGNATURE_LABEL[entry.signatureStatus] || entry.signatureStatus}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';

// STORY-025: admin-only, same shared-admin-key rehearsal pattern as
// STORY-022's AdminFeedbackDashboard -- see decision-record-STORY-025.md.
// Connects to a real-time WebSocket channel scoped to /admin/health (not
// the shared resident-facing channel UserInputForm uses) after first
// validating the key over a plain REST fetch, so an invalid key gives a
// clear message instead of a silent WebSocket close.
function getWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_WS_HOST || `${window.location.hostname}:3001`;
  return `${proto}//${host}${path}`;
}

const STATUS_LABEL = { healthy: 'Healthy', degraded: 'Degraded', down: 'Down' };

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SystemHealthDashboard() {
  const [adminKey, setAdminKey] = useState('');
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | unauthorized | error
  const [health, setHealth] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => () => wsRef.current?.close(), []);

  const connect = async () => {
    setStatus('connecting');
    try {
      const res = await fetch('/api/system-health', { headers: { 'x-admin-key': adminKey } });
      if (res.status === 401) {
        setStatus('unauthorized');
        return;
      }
      if (!res.ok) throw new Error('Failed to load system health');
      setHealth(await res.json());

      const ws = new WebSocket(getWsUrl(`/admin/health?key=${encodeURIComponent(adminKey)}`));
      wsRef.current = ws;
      ws.onopen = () => setStatus('connected');
      ws.onerror = () => setStatus('error');
      ws.onclose = () => setStatus((prev) => (prev === 'connected' ? 'error' : prev));
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'HEALTH_UPDATE') setHealth(msg.health);
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
    <section className="system-health-dashboard" aria-label="System health dashboard">
      <h2>System Health — City Content Admin</h2>
      <p>Rehearsal-only: authenticates with a shared admin key, not real per-admin login. See STORY-025 decision record.</p>

      <div className="field">
        <label htmlFor="health-admin-key">Admin key</label>
        <input
          id="health-admin-key"
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

      {health && (
        <div className="system-health-dashboard__panel" role="status" aria-live="polite">
          <div className={`system-health-dashboard__badge system-health-dashboard__badge--${health.status}`}>
            {STATUS_LABEL[health.status] || health.status}
          </div>

          <dl className="system-health-dashboard__metrics">
            <dt>Uptime</dt>
            <dd>{Math.floor(health.uptimeSeconds / 60)}m {health.uptimeSeconds % 60}s</dd>

            <dt>Database</dt>
            <dd>{health.database.status === 'up' ? `Up (${health.database.latencyMs}ms)` : 'Down'}</dd>

            <dt>Memory (heap used)</dt>
            <dd>{formatBytes(health.memory.heapUsed)}</dd>

            <dt>Recent errors ({health.recentErrors.windowMinutes}m window)</dt>
            <dd>{health.recentErrors.count}</dd>
          </dl>

          <p className="hint">Last updated {new Date(health.timestamp).toLocaleTimeString()}</p>
        </div>
      )}
    </section>
  );
}

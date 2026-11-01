import { useEffect, useRef, useState } from 'react';

// STORY-028: same REST-then-WebSocket + data_steward-key pattern as
// STORY-027's RecentActionsDashboard -- see decision-record-STORY-028.md
// for why this is a real, rule-based detector over existing signals
// (circuit breaker escalations, repeated access denials, degraded system
// health) rather than an external monitoring-tool integration.
function getWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_WS_HOST || `${window.location.hostname}:3001`;
  return `${proto}//${host}${path}`;
}

const SEVERITY_LABEL = { high: 'High', medium: 'Medium' };

export default function AnomaliesDashboard() {
  const [stewardKey, setStewardKey] = useState('');
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | unauthorized | error
  const [anomalies, setAnomalies] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => () => wsRef.current?.close(), []);

  const connect = async () => {
    setStatus('connecting');
    try {
      const res = await fetch('/api/audit-log/anomalies', { headers: { 'x-admin-key': stewardKey } });
      if (res.status === 401) {
        setStatus('unauthorized');
        return;
      }
      if (!res.ok) throw new Error('Failed to load anomalies');
      setAnomalies(await res.json());

      const ws = new WebSocket(getWsUrl(`/admin/anomalies?key=${encodeURIComponent(stewardKey)}`));
      wsRef.current = ws;
      ws.onopen = () => setStatus('connected');
      ws.onerror = () => setStatus('error');
      ws.onclose = () => setStatus((prev) => (prev === 'connected' ? 'error' : prev));
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'ANOMALIES_UPDATE') setAnomalies(msg.data);
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
    <section className="anomalies-dashboard" aria-label="System anomalies dashboard">
      <h2>Anomalies — Data Steward</h2>
      <p>Rehearsal-only: authenticates with a shared data-steward key, not real per-admin login. Rule-based over existing signals, not an external monitoring-tool integration — see STORY-028 decision record.</p>

      <div className="field">
        <label htmlFor="anomalies-steward-key">Data steward key</label>
        <input
          id="anomalies-steward-key"
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

      {(status === 'connected' || status === 'error') && anomalies.length === 0 && (
        <p className="hint">No anomalies detected right now.</p>
      )}

      {anomalies.length > 0 && (
        <ul className="anomalies-dashboard__list" aria-live="polite">
          {anomalies.map((entry) => (
            <li key={`${entry.type}-${entry.detectedAt}`} className="anomalies-dashboard__item">
              <div className={`anomalies-dashboard__severity anomalies-dashboard__severity--${entry.severity}`}>
                {SEVERITY_LABEL[entry.severity] || entry.severity}
              </div>
              <p>{entry.detail}</p>
              <p className="hint">Detected {new Date(entry.detectedAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

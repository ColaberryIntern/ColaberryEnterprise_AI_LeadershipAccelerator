import { useEffect, useRef, useState } from 'react';

// STORY-029: same REST-then-WebSocket + shared admin-key pattern as
// SystemHealthDashboard (STORY-025). Governance score is a content-quality
// metric, not audit-log-derived security data, so this stays gated by the
// general ADMIN_API_KEY -- matching the existing GET /api/governance/score
// route's requireAdminKey gate (STORY-013) -- rather than the stronger
// data_steward role used by the audit-log-derived dashboards
// (STORY-024/027/028). See decision-record-STORY-029.md.
function getWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_WS_HOST || `${window.location.hostname}:3001`;
  return `${proto}//${host}${path}`;
}

function pct(fraction) {
  return `${Math.round(fraction * 100)}%`;
}

export default function GovernanceScoreDashboard() {
  const [adminKey, setAdminKey] = useState('');
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | unauthorized | error
  const [score, setScore] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => () => wsRef.current?.close(), []);

  const connect = async () => {
    setStatus('connecting');
    try {
      const res = await fetch('/api/governance/score', { headers: { 'x-admin-key': adminKey } });
      if (res.status === 401) {
        setStatus('unauthorized');
        return;
      }
      if (!res.ok) throw new Error('Failed to load governance score');
      setScore(await res.json());

      const ws = new WebSocket(getWsUrl(`/admin/governance?key=${encodeURIComponent(adminKey)}`));
      wsRef.current = ws;
      ws.onopen = () => setStatus('connected');
      ws.onerror = () => setStatus('error');
      ws.onclose = () => setStatus((prev) => (prev === 'connected' ? 'error' : prev));
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'GOVERNANCE_UPDATE') setScore(msg.data);
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
    <section className="governance-score-dashboard" aria-label="Governance score dashboard">
      <h2>Governance Score — City Content Admin</h2>
      <p>
        Rehearsal-only: authenticates with a shared admin key, not real per-admin login. Score reflects
        STORY-013&apos;s transparent heuristic (source-grounding accuracy + loaded-language bias), not an
        external certification — see STORY-029 decision record.
      </p>

      <div className="field">
        <label htmlFor="governance-admin-key">Admin key</label>
        <input
          id="governance-admin-key"
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

      {score && (
        <div className="governance-score-dashboard__panel" role="status" aria-live="polite">
          <div className="governance-score-dashboard__headline">
            <span className="governance-score-dashboard__headline-value">
              {score.evaluatedCount === 0 ? 'N/A' : pct(score.passRatePct)}
            </span>
            <span className="governance-score-dashboard__headline-label">Governance score</span>
          </div>
          <p className="hint">
            {score.evaluatedCount === 0
              ? 'No summaries evaluated yet.'
              : `${score.passingCount} of ${score.evaluatedCount} evaluated summaries meet the accuracy/bias threshold.`}
          </p>

          <dl className="governance-score-dashboard__metrics">
            <dt>Evaluation coverage</dt>
            <dd>{pct(score.evaluationCoveragePct)} ({score.evaluatedCount} of {score.totalWithContent})</dd>

            <dt>Passing</dt>
            <dd>{score.passingCount}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}

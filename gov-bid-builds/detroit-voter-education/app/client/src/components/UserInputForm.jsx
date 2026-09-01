import { useState, useEffect, useRef } from 'react';

const CIVIC_ISSUES = [
  'Healthcare',
  'Education',
  'Transportation',
  'Housing',
  'Public Safety',
  'Environment',
];

const ZIP_RE = /^\d{5}$/;

function getWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_WS_HOST || `${window.location.hostname}:3001`;
  return `${proto}//${host}`;
}

export default function UserInputForm({ onJurisdictionResolved }) {
  const [zipCode, setZipCode] = useState('');
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [savedData, setSavedData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  // STORY-007: separate from savedData/errorMsg (WS-driven preference save)
  // -- this is an independent HTTP call to STORY-006's jurisdiction API,
  // triggered by the same successful save but not part of that protocol.
  const [jurisdiction, setJurisdiction] = useState(null);
  const [jurisdictionStatus, setJurisdictionStatus] = useState('idle'); // idle | loading | loaded | error

  const wsRef = useRef(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  // STORY-007: resolves the ZIP just saved into a real jurisdiction (city/
  // county/state/congressional district) via STORY-006's API, and surfaces
  // it both locally (resident sees where they were resolved to) and to the
  // parent (SummaryList filters by it). A failed lookup degrades to
  // unfiltered summaries -- same behavior as before this story -- rather
  // than breaking the page.
  async function resolveJurisdiction(zip) {
    setJurisdictionStatus('loading');
    try {
      const res = await fetch(`/api/jurisdictions/${zip}`);
      if (!res.ok) throw new Error('Jurisdiction lookup failed');
      const data = await res.json();
      setJurisdiction(data);
      setJurisdictionStatus('loaded');
      onJurisdictionResolved?.(data.local?.city ?? null);
    } catch {
      setJurisdiction(null);
      setJurisdictionStatus('error');
      onJurisdictionResolved?.(null);
    }
  }

  useEffect(() => {
    setWsStatus('connecting');
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => setWsStatus('connected');
    ws.onclose = () => setWsStatus('disconnected');
    ws.onerror = () => setWsStatus('error');

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'PREFERENCES_UPDATED' && msg.sessionId === sessionIdRef.current) {
        setSavedData({ zipCode: msg.zipCode, issues: msg.issues, timestamp: msg.timestamp });
        setWsStatus('saved');
        setErrorMsg('');
        resolveJurisdiction(msg.zipCode);
      }
      if (msg.type === 'ERROR') {
        setErrorMsg(msg.error);
        setWsStatus('connected');
      }
    };

    return () => ws.close();
  }, []);

  const toggleIssue = (issue) => {
    setSelectedIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue],
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'SET_PREFERENCES',
        sessionId: sessionIdRef.current,
        zipCode,
        issues: selectedIssues,
      }),
    );
  };

  const zipValid = ZIP_RE.test(zipCode);
  const canSubmit = zipValid && selectedIssues.length > 0 && wsStatus === 'connected';

  return (
    <section className="user-input-form" aria-label="Voter preference form">
      <h2>Get Personalized Voter Information</h2>
      <p>Enter your Detroit ZIP code and the issues you care about.</p>

      <div className={`ws-badge ws-badge--${wsStatus}`} aria-live="polite">
        Connection: <strong>{wsStatus}</strong>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="zip">ZIP Code</label>
          <input
            id="zip"
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="48201"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            aria-describedby="zip-hint"
            aria-invalid={zipCode.length > 0 && !zipValid}
          />
          <span id="zip-hint" className="hint" role="alert">
            {zipCode.length > 0 && !zipValid ? 'Must be exactly 5 digits' : ''}
          </span>
        </div>

        <fieldset className="field">
          <legend>Civic Issues</legend>
          <div className="issues-grid">
            {CIVIC_ISSUES.map((issue) => (
              <label key={issue} className="checkbox-label">
                <input
                  type="checkbox"
                  value={issue}
                  checked={selectedIssues.includes(issue)}
                  onChange={() => toggleIssue(issue)}
                />
                {issue}
              </label>
            ))}
          </div>
        </fieldset>

        {errorMsg && (
          <p className="error" role="alert">{errorMsg}</p>
        )}

        <button type="submit" disabled={!canSubmit}>
          Save My Preferences
        </button>
      </form>

      {savedData && (
        <div className="confirmation" role="status">
          <strong>Saved.</strong> ZIP: {savedData.zipCode} · Issues: {savedData.issues.join(', ')}
          <br />
          <small>
            Stored securely with encryption. Audit log updated at{' '}
            {new Date(savedData.timestamp).toLocaleTimeString()}.
          </small>
        </div>
      )}

      {jurisdictionStatus === 'loading' && <p className="hint">Resolving your jurisdiction…</p>}
      {jurisdictionStatus === 'error' && (
        <p className="hint">Couldn't resolve your jurisdiction — showing all officials and candidates.</p>
      )}
      {jurisdictionStatus === 'loaded' && jurisdiction && (
        <div className="confirmation" role="status">
          <strong>Your jurisdiction:</strong> {jurisdiction.local?.city}, {jurisdiction.local?.county},{' '}
          {jurisdiction.state?.abbreviation} · Congressional District {jurisdiction.federal?.congressionalDistrict}
        </div>
      )}
    </section>
  );
}

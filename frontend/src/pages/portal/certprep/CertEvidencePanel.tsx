import React, { useCallback, useEffect, useState } from 'react';
import {
  CertEvidenceMap,
  getCertEvidence,
  refreshCertEvidence,
} from '../../../services/certPrepApi';

/**
 * CertEvidencePanel — which exam objectives the student's real builds already
 * demonstrate, and what to build for the ones they do not.
 *
 * THREE THINGS THIS SCREEN REFUSES TO DO:
 *
 *   1. It never lets a student mark their own evidence verified. Verification is
 *      an instructor action; readiness counts verified rows only, and a
 *      credential someone can award themselves is worth nothing. "Pending" is
 *      shown honestly as awaiting review, not as a half-win.
 *   2. It never routes a gap to a reading list. The exam is scenario-based and
 *      assumes hands-on work, so a missing objective points at a build.
 *   3. It does not hide the gaps. A student with 4 of 30 objectives evidenced
 *      sees that, because the number is the point of the screen.
 */

const CertEvidencePanel: React.FC = () => {
  const [map, setMap] = useState<CertEvidenceMap | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [lastScan, setLastScan] = useState<string>('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await getCertEvidence();
      setMap(res.data);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rescan = async () => {
    setRefreshing(true);
    try {
      const res = await refreshCertEvidence();
      if (res.data.map) setMap(res.data.map);
      setLastScan(
        res.data.proposed === 0
          ? `Checked ${res.data.considered} artifact${res.data.considered === 1 ? '' : 's'} — nothing new to review.`
          : `Found ${res.data.proposed} new candidate${res.data.proposed === 1 ? '' : 's'} for your instructor to review.`,
      );
    } catch {
      setLastScan('That scan did not complete. Try again in a moment.');
    } finally {
      setRefreshing(false);
    }
  };

  if (state === 'loading') {
    return <div className="cp-skeleton" aria-busy="true" aria-label="Loading your evidence map"><span /><span /></div>;
  }
  if (state === 'error' || !map) {
    return (
      <section className="cp-empty" role="alert">
        <p>We could not load your evidence map.</p>
        <button type="button" className="cp-btn cp-btn--ghost" onClick={() => void load()}>Try again</button>
      </section>
    );
  }

  const missing = map.objectives.filter((o) => o.state === 'missing');
  const pending = map.objectives.filter((o) => o.state === 'pending');
  const verified = map.objectives.filter((o) => o.state === 'verified');

  return (
    <section className="cp-evidence" aria-label="Build evidence">
      <div className="cp-evidence-head">
        <div className="cp-ev-counts">
          <div><b>{map.verified}</b><span>Verified</span></div>
          <div><b>{map.pending}</b><span>Awaiting review</span></div>
          <div><b>{map.total}</b><span>Objectives total</span></div>
        </div>
        <button type="button" className="cp-btn cp-btn--ghost" onClick={rescan} disabled={refreshing}>
          {refreshing ? 'Scanning…' : 'Re-scan my work'}
        </button>
      </div>

      {lastScan && <p className="cp-note" role="status">{lastScan}</p>}

      <p className="cp-evidence-explain">
        Evidence is confirmed by an instructor, not claimed. Anything below marked
        <b> awaiting review</b> does not count toward readiness yet.
      </p>

      {verified.length > 0 && (
        <div className="cp-ev-group">
          <h3>Verified</h3>
          <ul className="cp-ev-list">
            {verified.map((o) => (
              <li key={o.objective_id} className="is-verified">
                <span className="cp-obj-id">{o.objective_id}</span>
                <span className="cp-ev-label">{o.label}</span>
                <span className="cp-ev-state">Verified</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pending.length > 0 && (
        <div className="cp-ev-group">
          <h3>Awaiting review</h3>
          <ul className="cp-ev-list">
            {pending.map((o) => (
              <li key={o.objective_id} className="is-pending">
                <span className="cp-obj-id">{o.objective_id}</span>
                <span className="cp-ev-label">
                  {o.label}
                  {o.sources[0]?.rationale && (
                    <em className="cp-ev-why">{o.sources[0].rationale}</em>
                  )}
                </span>
                <span className="cp-ev-state">Pending</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cp-ev-group">
        <h3>Not yet evidenced ({missing.length})</h3>
        {missing.length === 0 ? (
          <p className="cp-note">Every objective has evidence. That is unusual and good.</p>
        ) : (
          <ul className="cp-ev-list">
            {missing.map((o) => (
              <li key={o.objective_id} className="is-missing">
                <span className="cp-obj-id">{o.objective_id}</span>
                <span className="cp-ev-label">
                  {o.label}
                  {o.recommended_action && (
                    <em className="cp-ev-why">{o.recommended_action.detail}</em>
                  )}
                </span>
                <span className="cp-ev-state">Build it</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default CertEvidencePanel;

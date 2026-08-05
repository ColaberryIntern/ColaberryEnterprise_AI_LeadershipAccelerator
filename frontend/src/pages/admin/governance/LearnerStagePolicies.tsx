import React, { useEffect, useMemo, useState } from 'react';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';
import {
  fetchLifecycleModePolicies, fetchLifecycleModePolicyHistory, updateLifecycleModeMix,
  LifecycleModePolicy, LifecycleMode,
} from '../../../services/capeApi';

/**
 * LearnerStagePolicies — CAPE Phase 6 (design doc §10 "Lifecycle mixes", §12
 * "Learner-stage policies"). View + versioned edit of the recommended mix
 * percentage per lifecycle mode. Reuses the 5 modes Phase 5's
 * `capeLifecycleModeService` already classifies learners into — this panel
 * does not reclassify anyone; it only stores/edits the recommended split for
 * each mode. NOT yet consumed by live ranking (execution-contract.md
 * Out-of-scope) — a governable, versioned surface, safe to edit without
 * changing anything live today.
 */

const MODE_LABELS: Record<LifecycleMode, string> = {
  foundation: 'Foundation',
  experienced_cold_start: 'Experienced Cold Start',
  active_builder: 'Builder',
  architect_track: 'Architect',
  returning_after_absence: 'Returning',
};

const MODE_ORDER: LifecycleMode[] = ['foundation', 'experienced_cold_start', 'active_builder', 'architect_track', 'returning_after_absence'];

function categoryLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ModeCard({ policy, onSaved }: { policy: LifecycleModePolicy; onSaved: (next: LifecycleModePolicy) => void }) {
  const [mix, setMix] = useState<Record<string, number>>(policy.mix);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<LifecycleModePolicy[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  useEffect(() => { setMix(policy.mix); }, [policy.mix]);

  const categories = useMemo(() => Object.keys(policy.mix), [policy.mix]);
  const sum = useMemo(() => Object.values(mix).reduce((acc, v) => acc + (Number(v) || 0), 0), [mix]);
  const sumOk = Math.abs(sum - 1) < 0.001;
  const dirty = categories.some((k) => Number(mix[k]) !== policy.mix[k]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const result = await updateLifecycleModeMix(policy.mode, mix, reason || null);
      onSaved(result.policy);
      setMsg(result.versioned ? `Saved — version ${result.policy.version}` : 'No changes to save');
      setReason('');
    } catch {
      setMsg('Could not save — mix must sum to 100%');
    } finally {
      setBusy(false);
    }
  };

  const toggleHistory = async () => {
    if (history) { setHistory(null); return; }
    setHistoryBusy(true);
    try {
      const h = await fetchLifecycleModePolicyHistory(policy.mode);
      setHistory(h);
    } catch {
      setMsg('Could not load history');
    } finally {
      setHistoryBusy(false);
    }
  };

  return (
    <div className="col-lg-6 mb-3">
      <div className="border rounded p-3 h-100">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h3 className="h6 mb-0">{MODE_LABELS[policy.mode]}</h3>
          <StatusBadge label={sumOk ? 'SUMS TO 100%' : `SUM = ${Math.round(sum * 100)}%`} tone={sumOk ? 'success' : 'warning'} />
        </div>
        {categories.map((cat) => (
          <div className="mb-2" key={cat}>
            <div className="d-flex justify-content-between small">
              <label htmlFor={`${policy.mode}-${cat}`}>{categoryLabel(cat)}</label>
              <span className="text-muted">{Math.round((Number(mix[cat]) || 0) * 100)}%</span>
            </div>
            <input
              id={`${policy.mode}-${cat}`}
              type="range"
              min={0}
              max={100}
              value={Math.round((Number(mix[cat]) || 0) * 100)}
              onChange={(e) => setMix((m) => ({ ...m, [cat]: (parseInt(e.target.value, 10) || 0) / 100 }))}
              className="form-range"
            />
          </div>
        ))}
        <div className="mb-2">
          <label className="form-label small" htmlFor={`${policy.mode}-reason`}>Reason (optional, recorded in history)</label>
          <input
            id={`${policy.mode}-reason`}
            className="form-control form-control-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="d-flex gap-2 align-items-center">
          <button type="button" className="btn btn-sm btn-primary" disabled={!sumOk || !dirty || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={toggleHistory} disabled={historyBusy}>
            {history ? 'Hide history' : 'Show history'}
          </button>
          <span className="text-muted small">v{policy.version}</span>
        </div>
        {msg && <div className="form-text">{msg}</div>}
        {history && (
          <div className="table-responsive mt-2">
            <table className="table table-sm">
              <thead><tr><th>Version</th><th>Mix</th><th>By</th><th>When</th><th>Reason</th></tr></thead>
              <tbody>
                {history.slice().reverse().map((h) => (
                  <tr key={h.id} className={h.is_current ? 'table-active' : ''}>
                    <td>{h.version}{h.is_current ? ' (current)' : ''}</td>
                    <td>{Object.entries(h.mix).map(([k, v]) => `${categoryLabel(k)}: ${Math.round(v * 100)}%`).join(', ')}</td>
                    <td>{h.created_by ?? '—'}</td>
                    <td>{new Date(h.created_at).toLocaleString()}</td>
                    <td>{h.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const LearnerStagePolicies: React.FC = () => {
  const [policies, setPolicies] = useState<LifecycleModePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchLifecycleModePolicies();
        if (!cancelled) setPolicies(result);
      } catch {
        if (!cancelled) setError('Could not load learner-stage policies right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onSaved = (next: LifecycleModePolicy) => {
    setPolicies((prev) => prev.map((p) => (p.mode === next.mode ? next : p)));
  };

  const ordered = useMemo(
    () => MODE_ORDER.map((m) => policies.find((p) => p.mode === m)).filter((p): p is LifecycleModePolicy => !!p),
    [policies]
  );

  return (
    <SectionCard
      title="Learner-Stage Policies"
      subtitle="Recommended content mix per lifecycle mode (design doc §10). Not yet wired into live ranking — a versioned, governable surface you can start tuning now, safely."
      icon="user-settings-line"
    >
      {error && <div className="alert alert-danger">{error}</div>}
      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : (
        <div className="row">
          {ordered.map((p) => <ModeCard key={p.mode} policy={p} onSaved={onSaved} />)}
        </div>
      )}
    </SectionCard>
  );
};

export default LearnerStagePolicies;

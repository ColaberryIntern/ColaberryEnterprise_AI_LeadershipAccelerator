import React, { useEffect, useMemo, useState } from 'react';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';
import api from '../../../utils/api';
import { fetchGovernancePolicy, updateGovernancePolicy, GovernancePolicy, UpdateGovernancePolicyInput } from '../../../services/capeApi';

/**
 * PacingControls — CAPE Phase 6 (design doc §12 "Pacing controls"). Two
 * separate, explicitly-saved sub-panels, because they're two different
 * backend resources with different versioning semantics:
 *
 * 1. Stage-4 rerank caps + Today Plan pacing knobs — the NEW governance
 *    policy this phase introduces (T002/T004/T005), versioned-insert on save.
 * 2. Exploration reserve (`explorationPct`) — the EXISTING global Feed
 *    Control policy (Phase 4-era `feedConfigService`), read/written directly
 *    via `api.get/put('/api/admin/feed-control/policy', ...)` — the SAME
 *    endpoint `FeedControlTab.tsx` already calls (reused, not duplicated;
 *    that file has no separate typed client of its own to import from, so
 *    this matches its own established inline-call convention).
 *
 * Every field here is currently LIVE in production (behind
 * CAPE_LEARNING_VALUE_RANKER_ENABLED / CAPE_TODAY_PLAN_ENABLED) — reading
 * this panel never changes anything; only clicking Save does, and every
 * governance-policy save is versioned/auditable.
 */

const GOV_FIELDS: Array<{ key: keyof UpdateGovernancePolicyInput; label: string; help: string; min: number; max: number; step: number }> = [
  { key: 'same_type_max_streak', label: 'Same-type max streak', help: 'No more than this many of the same card type in a row.', min: 1, max: 10, step: 1 },
  { key: 'passive_max_streak', label: 'Passive max streak', help: 'No more than this many passive items before an active one.', min: 1, max: 10, step: 1 },
  { key: 'crowd_out_max_per_skill', label: 'Crowd-out max per skill', help: 'Max items touching one skill in the crowd-out window.', min: 1, max: 10, step: 1 },
  { key: 'crowd_out_window', label: 'Crowd-out / stretch-cap window', help: 'How many leading positions the crowd-out and stretch-cap rules watch.', min: 1, max: 20, step: 1 },
  { key: 'stretch_cap_first_five', label: 'Stretch cap in window', help: 'Max stretch items allowed inside that window after a recent failure.', min: 0, max: 5, step: 1 },
  { key: 'daily_plan_target_minutes', label: 'Daily plan target (minutes)', help: 'Trims trailing Today Plan slots (review, then AI Pulse, then practice) past this. next_best/foundation are never dropped.', min: 1, max: 999, step: 1 },
  { key: 'review_slot_share', label: 'Review slot share', help: '0 = never show the review slot; >0 = attempt to fill it.', min: 0, max: 1, step: 0.05 },
  { key: 'ai_pulse_slot_share', label: 'AI Pulse slot share', help: '0 = never show the AI Pulse slot; >0 = attempt to fill it.', min: 0, max: 1, step: 0.05 },
];

const PacingControls: React.FC = () => {
  const [policy, setPolicy] = useState<GovernancePolicy | null>(null);
  const [form, setForm] = useState<UpdateGovernancePolicyInput>({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [explorationPct, setExplorationPct] = useState<number | null>(null);
  const [explorationBusy, setExplorationBusy] = useState(false);
  const [explorationMsg, setExplorationMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [gov, fc] = await Promise.all([
          fetchGovernancePolicy(),
          api.get<{ ok: boolean; policy: { explorationPct: number } }>('/api/admin/feed-control/policy'),
        ]);
        if (cancelled) return;
        setPolicy(gov);
        setForm({});
        setExplorationPct(fc.data.policy.explorationPct);
      } catch {
        if (!cancelled) setError('Could not load pacing controls right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const currentValue = (key: keyof UpdateGovernancePolicyInput): number =>
    form[key] !== undefined ? Number(form[key]) : (policy ? Number((policy as any)[key]) : 0);

  const dirty = useMemo(() => Object.keys(form).length > 0, [form]);

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await updateGovernancePolicy({ ...form, reason: reason || null });
      setPolicy(result.policy);
      setForm({});
      setMsg(result.versioned ? `Saved — version ${result.policy.version}` : 'No changes to save');
      setReason('');
    } catch {
      setMsg('Could not save — please check the values and try again');
    } finally {
      setBusy(false);
    }
  };

  const saveExploration = async () => {
    if (explorationPct === null) return;
    setExplorationBusy(true);
    setExplorationMsg(null);
    try {
      const r = await api.put<{ ok: boolean; policy: { explorationPct: number } }>('/api/admin/feed-control/policy', { explorationPct });
      setExplorationPct(r.data.policy.explorationPct);
      setExplorationMsg('Saved');
    } catch {
      setExplorationMsg('Could not save');
    } finally {
      setExplorationBusy(false);
    }
  };

  if (loading) return <SectionCard title="Pacing Controls" icon="speed-line"><div className="text-muted">Loading…</div></SectionCard>;
  if (error) return <SectionCard title="Pacing Controls" icon="speed-line"><div className="alert alert-danger">{error}</div></SectionCard>;
  if (!policy) return null;

  return (
    <>
      <SectionCard
        title="Pacing Controls"
        subtitle="Stage-4 rerank caps and Today Plan pacing knobs. Live in production right now — defaults preserve current behavior exactly; only Save changes anything."
        icon="speed-line"
        actions={<StatusBadge label={`v${policy.version}`} tone="neutral" />}
      >
        <div className="row g-3">
          {GOV_FIELDS.map((f) => (
            <div className="col-md-6" key={f.key}>
              <label className="form-label" htmlFor={`gov-${f.key}`}>{f.label}</label>
              <input
                id={`gov-${f.key}`}
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                className="form-control"
                value={currentValue(f.key)}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
              />
              <div className="form-text">{f.help}</div>
            </div>
          ))}
        </div>
        <div className="row g-3 mt-1">
          <div className="col-md-8">
            <label className="form-label" htmlFor="gov-reason">Reason (optional, recorded in version history)</label>
            <input id="gov-reason" className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="col-md-4 d-flex align-items-end">
            <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>
              {busy ? 'Saving…' : 'Save pacing controls'}
            </button>
          </div>
        </div>
        {msg && <div className="form-text mt-2">{msg}</div>}
      </SectionCard>

      <SectionCard
        title="Exploration reserve"
        subtitle="The existing global Feed Control policy's explorationPct — reused here, not duplicated. Fraction of slots reserved for fresh/exploratory items."
        icon="compass-3-line"
      >
        {explorationPct !== null && (
          <>
            <label className="form-label" htmlFor="exploration-pct">
              Exploration ({Math.round(explorationPct * 100)}%)
            </label>
            <input
              id="exploration-pct"
              type="range"
              min={0}
              max={100}
              className="form-range"
              value={Math.round(explorationPct * 100)}
              onChange={(e) => setExplorationPct((parseInt(e.target.value, 10) || 0) / 100)}
            />
            <button type="button" className="btn btn-primary btn-sm mt-2" disabled={explorationBusy} onClick={saveExploration}>
              {explorationBusy ? 'Saving…' : 'Save exploration reserve'}
            </button>
            {explorationMsg && <div className="form-text">{explorationMsg}</div>}
          </>
        )}
      </SectionCard>
    </>
  );
};

export default PacingControls;

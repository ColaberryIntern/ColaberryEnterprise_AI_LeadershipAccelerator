import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, StatusBadge } from '../../components/admin/shell';
import {
  fetchSkillDefinitions, updateSkillDefinition, fetchEvidenceBandWeights, updateEvidenceBandWeights,
  SkillDefinition, EvidenceBandWeights,
} from '../../services/capeApi';

/**
 * AdminCapeSettingsPage — the "Phase 0-1 minimal settings panel" (design doc
 * §12): view/edit the 10 skill definitions (name, description, order) and the 4
 * evidence-band weights. This is deliberately NOT the full Feed Control
 * governance board (heatmap, learner-stage policies, pacing controls,
 * explanation simulator) — that is Phase 6 scope. Every save is versioned
 * server-side (never a silent overwrite of historical computed proficiency).
 */

type WeightKey = 'claim_weight' | 'knowledge_weight' | 'application_weight' | 'judgment_weight';
const WEIGHT_FIELDS: Array<{ key: WeightKey; label: string }> = [
  { key: 'claim_weight', label: 'Claim' },
  { key: 'knowledge_weight', label: 'Knowledge' },
  { key: 'application_weight', label: 'Application' },
  { key: 'judgment_weight', label: 'Judgment' },
];

function SkillDefinitionRow({ def, onSaved }: { def: SkillDefinition; onSaved: (next: SkillDefinition) => void }) {
  const [name, setName] = useState(def.name);
  const [description, setDescription] = useState(def.description ?? '');
  const [axisOrder, setAxisOrder] = useState(def.axis_order);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = name !== def.name || description !== (def.description ?? '') || axisOrder !== def.axis_order;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const result = await updateSkillDefinition(def.skill_id, { name, description, axis_order: axisOrder });
      onSaved(result.definition);
      setMsg(result.versioned ? `Saved — version ${result.definition.version}` : 'No changes to save');
    } catch {
      setMsg('Could not save — please try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td className="text-nowrap"><code>{def.skill_id}</code></td>
      <td style={{ minWidth: 160 }}>
        <label className="visually-hidden" htmlFor={`name-${def.skill_id}`}>Name for {def.skill_id}</label>
        <input
          id={`name-${def.skill_id}`}
          className="form-control form-control-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td style={{ minWidth: 260 }}>
        <label className="visually-hidden" htmlFor={`desc-${def.skill_id}`}>Description for {def.skill_id}</label>
        <textarea
          id={`desc-${def.skill_id}`}
          className="form-control form-control-sm"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </td>
      <td style={{ width: 90 }}>
        <label className="visually-hidden" htmlFor={`order-${def.skill_id}`}>Axis order for {def.skill_id}</label>
        <input
          id={`order-${def.skill_id}`}
          type="number"
          min={0}
          className="form-control form-control-sm"
          value={axisOrder}
          onChange={(e) => setAxisOrder(Number(e.target.value))}
        />
      </td>
      <td className="text-nowrap">v{def.version}</td>
      <td className="text-nowrap">
        <button type="button" className="btn btn-sm btn-primary" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg && <div className="form-text">{msg}</div>}
      </td>
    </tr>
  );
}

function EvidenceBandWeightsPanel({
  current, history, onSaved,
}: {
  current: EvidenceBandWeights | null;
  history: EvidenceBandWeights[];
  onSaved: (next: EvidenceBandWeights) => void;
}) {
  const [weights, setWeights] = useState<Record<WeightKey, number>>({
    claim_weight: current?.claim_weight ?? 0.2,
    knowledge_weight: current?.knowledge_weight ?? 0.25,
    application_weight: current?.application_weight ?? 0.35,
    judgment_weight: current?.judgment_weight ?? 0.2,
  });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    setWeights({
      claim_weight: current.claim_weight, knowledge_weight: current.knowledge_weight,
      application_weight: current.application_weight, judgment_weight: current.judgment_weight,
    });
  }, [current]);

  const sum = useMemo(
    () => WEIGHT_FIELDS.reduce((acc, f) => acc + (Number(weights[f.key]) || 0), 0),
    [weights]
  );
  const sumOk = Math.abs(sum - 1) < 0.001;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const result = await updateEvidenceBandWeights({ ...weights, reason: reason || null });
      onSaved(result.weights);
      setMsg(result.versioned ? `Saved — version ${result.weights.version}` : 'No changes to save');
      setReason('');
    } catch {
      setMsg('Could not save — weights must sum to 1.0');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Evidence-band weights"
      subtitle="Claim / knowledge / application / judgment — must sum to 1.0. Default 20/25/35/20. Every change is versioned; nothing is overwritten."
      icon="scales-3-line"
      actions={<StatusBadge label={sumOk ? 'SUMS TO 1.0' : `SUM = ${sum.toFixed(3)}`} tone={sumOk ? 'success' : 'warning'} />}
    >
      <div className="row g-3">
        {WEIGHT_FIELDS.map((f) => (
          <div className="col-md-3" key={f.key}>
            <label className="form-label" htmlFor={`weight-${f.key}`}>{f.label}</label>
            <input
              id={`weight-${f.key}`}
              type="number"
              min={0}
              max={1}
              step={0.01}
              className="form-control"
              value={weights[f.key]}
              onChange={(e) => setWeights((w) => ({ ...w, [f.key]: Number(e.target.value) }))}
            />
          </div>
        ))}
      </div>
      <div className="row g-3 mt-1">
        <div className="col-md-8">
          <label className="form-label" htmlFor="weights-reason">Reason (optional, recorded in the version history)</label>
          <input
            id="weights-reason"
            className="form-control"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="col-md-4 d-flex align-items-end">
          <button type="button" className="btn btn-primary" disabled={!sumOk || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save weights'}
          </button>
        </div>
      </div>
      {msg && <div className="form-text mt-2">{msg}</div>}

      {history.length > 0 && (
        <div className="mt-4">
          <h3 className="h6">Version history</h3>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Version</th><th>Claim</th><th>Knowledge</th><th>Application</th><th>Judgment</th>
                  <th>Changed by</th><th>When</th><th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().map((h) => (
                  <tr key={h.id} className={h.is_current ? 'table-active' : ''}>
                    <td>{h.version}{h.is_current ? ' (current)' : ''}</td>
                    <td>{h.claim_weight}</td>
                    <td>{h.knowledge_weight}</td>
                    <td>{h.application_weight}</td>
                    <td>{h.judgment_weight}</td>
                    <td>{h.created_by ?? '—'}</td>
                    <td>{new Date(h.created_at).toLocaleString()}</td>
                    <td>{h.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

const AdminCapeSettingsPage: React.FC = () => {
  const [defs, setDefs] = useState<SkillDefinition[]>([]);
  const [weightsCurrent, setWeightsCurrent] = useState<EvidenceBandWeights | null>(null);
  const [weightsHistory, setWeightsHistory] = useState<EvidenceBandWeights[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, w] = await Promise.all([fetchSkillDefinitions(), fetchEvidenceBandWeights()]);
      setDefs(d.sort((a, b) => a.axis_order - b.axis_order));
      setWeightsCurrent(w.current);
      setWeightsHistory(w.history);
    } catch {
      setError('Could not load CAPE settings right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDefSaved = (next: SkillDefinition) => {
    setDefs((prev) => prev.map((d) => (d.skill_id === next.skill_id ? next : d)).sort((a, b) => a.axis_order - b.axis_order));
  };
  const onWeightsSaved = (next: EvidenceBandWeights) => {
    setWeightsCurrent(next);
    setWeightsHistory((prev) => [...prev, next]);
  };

  return (
    <div className="admin-page">
      <PageHeader
        title="Architecture Skills"
        subtitle="The Phase 0-1 minimal settings panel for CAPE — skill definitions and evidence-band weights. The full Feed Control governance board ships in a later phase."
        icon="radar-line"
      />

      {error && <div className="alert alert-danger">{error}</div>}
      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : (
        <>
          <SectionCard
            title="Skill definitions"
            subtitle="The 10 canonical Architecture Skill axes (name, description, radar order). Each edit is versioned."
            icon="list-settings-line"
          >
            <div className="table-responsive">
              <table className="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Skill id</th><th>Name</th><th>Description</th><th>Order</th><th>Version</th><th>Save</th>
                  </tr>
                </thead>
                <tbody>
                  {defs.map((d) => <SkillDefinitionRow key={d.skill_id} def={d} onSaved={onDefSaved} />)}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <EvidenceBandWeightsPanel current={weightsCurrent} history={weightsHistory} onSaved={onWeightsSaved} />
        </>
      )}
    </div>
  );
};

export default AdminCapeSettingsPage;

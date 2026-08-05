import React, { useEffect, useState } from 'react';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';
import api from '../../../utils/api';
import { fetchGovernancePersonas, lookupGovernanceEnrollment, PersonaMatch, SimulatorPersonaSlug } from '../../../services/capeApi';

/**
 * ExplanationSimulator — CAPE Phase 6 (design doc §12 "Explanation simulator",
 * §17 AC 9: "Feed Control can simulate a specific learner and explain every
 * inclusion, exclusion, score, and rerank"). READ-ONLY — every call here is a
 * GET; nothing this panel does ever mutates the looked-up student's data or
 * production ranking.
 *
 * Reuses the EXISTING `GET /api/admin/feed-control/simulate` endpoint (Phase
 * 4), not a new ranking endpoint — with the new `use_cape_ranker=1` param
 * (T014's small, additive, backward-compatible route addition) to force real
 * CAPE-ranked output for the explanation view regardless of the global
 * `CAPE_LEARNING_VALUE_RANKER_ENABLED` flag's current state.
 */

const PERSONA_LABELS: Record<SimulatorPersonaSlug, string> = {
  new_no_resume: 'New learner, no resume',
  new_experienced_resume: 'New learner, experienced resume',
  active_week5_learner: 'Active Week 5 learner',
  returning_learner: 'Returning learner',
  near_architect_learner: 'Near-Architect learner',
};
const PERSONA_ORDER: SimulatorPersonaSlug[] = [
  'new_no_resume', 'new_experienced_resume', 'active_week5_learner', 'returning_learner', 'near_architect_learner',
];

interface SimExcluded { ref: string; reason: string; }
interface SimItem {
  type: string; student_label?: string; title: string | null; score?: number;
  reasons?: string[]; components?: Record<string, number>; render_band?: string; week?: number | null;
}
interface SimResult { items: SimItem[]; excluded?: SimExcluded[]; ranker?: 'legacy' | 'cape'; context?: any; }

const ExplanationSimulator: React.FC = () => {
  const [personas, setPersonas] = useState<PersonaMatch[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);

  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [studentLabel, setStudentLabel] = useState<string | null>(null);

  const [sim, setSim] = useState<SimResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPersonasLoading(true);
      try {
        const result = await fetchGovernancePersonas();
        if (!cancelled) setPersonas(result);
      } catch {
        /* non-fatal — personas panel just shows nothing */
      } finally {
        if (!cancelled) setPersonasLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const runLookup = async () => {
    if (!lookupQuery.trim()) return;
    setLookupBusy(true);
    setLookupError(null);
    setSim(null);
    try {
      const result = await lookupGovernanceEnrollment(lookupQuery.trim());
      if (!result) {
        setLookupError('No enrollment matches that email or ID.');
        setEnrollmentId(null);
        setStudentLabel(null);
        return;
      }
      setEnrollmentId(result.enrollment_id);
      setStudentLabel(result.email);
    } catch {
      setLookupError('Lookup failed — please try again.');
    } finally {
      setLookupBusy(false);
    }
  };

  const pickPersona = (p: PersonaMatch) => {
    setSim(null);
    setLookupError(null);
    if (!p.enrollment_id) {
      setEnrollmentId(null);
      setStudentLabel(null);
      setLookupError(`No matching account for "${PERSONA_LABELS[p.persona]}" in this environment.`);
      return;
    }
    setEnrollmentId(p.enrollment_id);
    setStudentLabel(p.email);
  };

  const runSimulation = async () => {
    if (!enrollmentId) return;
    setSimBusy(true);
    setSimError(null);
    try {
      const r = await api.get<{ ok: boolean; items: SimItem[]; excluded?: SimExcluded[]; ranker?: 'legacy' | 'cape'; context?: any }>(
        '/api/admin/feed-control/simulate',
        { params: { enrollment_id: enrollmentId, limit: 14, use_cape_ranker: '1' } }
      );
      setSim({ items: r.data.items || [], excluded: r.data.excluded || [], ranker: r.data.ranker, context: r.data.context });
    } catch (e: any) {
      setSimError(e?.response?.data?.error || 'Simulation failed — please try again.');
    } finally {
      setSimBusy(false);
    }
  };

  return (
    <SectionCard
      title="Explanation Simulator"
      subtitle="Look up a real student or pick a persona, then run a READ-ONLY simulation of their current Today feed — placement, exclusions, score breakdown, and final rank. Nothing here writes to the student's data or affects production ranking."
      icon="search-eye-line"
    >
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="sim-lookup">Look up a student (email or enrollment ID)</label>
          <div className="input-group">
            <input
              id="sim-lookup"
              className="form-control"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runLookup(); }}
              placeholder="student@example.com"
            />
            <button type="button" className="btn btn-outline-primary" disabled={lookupBusy} onClick={runLookup}>
              {lookupBusy ? 'Looking up…' : 'Look up'}
            </button>
          </div>
          {lookupError && <div className="form-text text-danger">{lookupError}</div>}
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="sim-persona">Or pick a persona</label>
          <select
            id="sim-persona"
            className="form-select"
            disabled={personasLoading}
            defaultValue=""
            onChange={(e) => {
              const p = personas.find((x) => x.persona === e.target.value);
              if (p) pickPersona(p);
            }}
          >
            <option value="" disabled>{personasLoading ? 'Loading personas…' : 'Choose a persona…'}</option>
            {PERSONA_ORDER.map((slug) => {
              const p = personas.find((x) => x.persona === slug);
              return (
                <option key={slug} value={slug} disabled={!p?.enrollment_id}>
                  {PERSONA_LABELS[slug]}{p && !p.enrollment_id ? ' — no match in this environment' : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {enrollmentId && (
        <div className="d-flex align-items-center gap-2 mb-3">
          <StatusBadge label={`Student: ${studentLabel || enrollmentId}`} tone="info" />
          <button type="button" className="btn btn-primary btn-sm" disabled={simBusy} onClick={runSimulation}>
            {simBusy ? 'Simulating…' : 'Run simulation'}
          </button>
        </div>
      )}

      {simError && <div className="alert alert-danger">{simError}</div>}

      {sim && (
        <div>
          <div className="mb-2">
            <StatusBadge
              label={sim.ranker === 'cape' ? 'CAPE RANKER (Stages 1-5)' : 'LEGACY RANKER'}
              tone={sim.ranker === 'cape' ? 'success' : 'neutral'}
            />
          </div>

          {sim.excluded && sim.excluded.length > 0 && (
            <div className="mb-3">
              <h3 className="h6">Excluded (Stage 2 — hard eligibility)</h3>
              <ul className="small">
                {sim.excluded.map((ex) => <li key={ex.ref}>{ex.ref} — {ex.reason}</li>)}
              </ul>
            </div>
          )}

          <h3 className="h6">Ranked feed (final order = Stage 4 rerank of the Stage 3 scores below)</h3>
          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead>
                <tr><th>#</th><th>Type</th><th>Title</th><th>Score</th><th>Why (Stage 3)</th><th>Score breakdown</th></tr>
              </thead>
              <tbody>
                {sim.items.map((item, idx) => (
                  <tr key={`${item.type}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>{item.student_label || item.type}</td>
                    <td>{item.title || '—'}</td>
                    <td>{item.score !== undefined ? item.score.toFixed(3) : '—'}</td>
                    <td>{(item.reasons || []).join('; ') || '—'}</td>
                    <td className="small">
                      {item.components
                        ? Object.entries(item.components).map(([k, v]) => `${k}: ${Number(v).toFixed(2)}`).join(', ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted small">
            Stage 4 (policy rerank — diversity caps, exploration, crowd-out, review-due
            pull-forward) reorders this list from its Stage 3 score order; it does not
            attach its own per-item reason string today, so the rerank's effect is
            visible as this list's final position order, not a separate label.
          </p>
        </div>
      )}
    </SectionCard>
  );
};

export default ExplanationSimulator;

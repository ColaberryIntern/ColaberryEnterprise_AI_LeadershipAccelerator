import React, { useEffect, useState } from 'react';
import { getGovBuildPlanAI, type GovBuildPlanAI } from '../../../services/factoryApi';
import { GovBuildGantt } from './GovBuildGantt';

/**
 * GovBuildPlanAIPanel — the Build step's rich, dated build-plan preview. On demand, it asks the backend
 * (which reuses the student build engine) to decompose the established requirements + the AI build spec
 * into releases and stories, scheduled to real dates against the submission deadline, and renders them as
 * a Gantt with expandable per-story detail — the surface Ali inspects before authorizing the build.
 *
 * ADVISORY only: it sets no gate, authors no requirement-cited story (the deterministic Solution build
 * track below stays the record), and creates no build. The last result is kept in localStorage so a
 * revisit does not re-run the (expensive) decomposition; a "Re-run" stays available.
 */
export function GovBuildPlanAIPanel({ canonical, requirements, title, buyer, deadline }: {
  canonical: string;
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
  deadline?: string | null;
}): React.ReactElement {
  const storeKey = `govBuildPlanAI:${canonical}`;
  const [result, setResult] = useState<GovBuildPlanAI | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey); if (raw) setResult(JSON.parse(raw) as GovBuildPlanAI); } catch { /* storage may be unavailable */ }
  }, [storeKey]);
  const run = async (): Promise<void> => {
    setBusy(true); setErr(null);
    // Best-effort: feed the already-generated build spec as the expansion document (grounding stays the requirements).
    let buildSpec: string | null = null;
    try { const raw = localStorage.getItem(`govBuildSpec:${canonical}`); if (raw) { const s = JSON.parse(raw); buildSpec = [s?.spec, s?.research].filter(Boolean).join('\n\n') || null; } } catch { /* ignore */ }
    try {
      const r = await getGovBuildPlanAI(canonical, { requirements, title: title ?? null, buyer: buyer ?? null, buildSpec, deadline: deadline ?? null });
      setResult(r);
      try { localStorage.setItem(storeKey, JSON.stringify(r)); } catch { /* ignore */ }
    } catch { setErr('Could not generate the build plan right now.'); }
    finally { setBusy(false); }
  };
  const plan = result?.plan ?? null;
  return (
    <div className="mb-2">
      <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || requirements.length === 0} onClick={() => { void run(); }}>
        <i className="ri-flow-chart me-1" aria-hidden="true" />{busy ? 'Generating the plan…' : plan ? 'Re-run build plan' : 'Generate build plan (AI)'}
      </button>
      {requirements.length === 0 && <div className="small text-secondary mt-1">Establish the cited requirements first — the plan is built from them.</div>}
      {busy && <div className="small text-secondary mt-1">Decomposing into releases &amp; stories and scheduling to the deadline — this can take up to a minute.</div>}
      {err && <div className="alert alert-warning py-2 mt-2 mb-0 small" role="status">{err}</div>}
      {plan && (
        <div className="mt-2">
          <GovBuildGantt plan={plan} verdict={result?.verdict ?? ''} />
          <div className="small text-secondary mt-2"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI build plan — advisory, generated from the established requirements; it authors no requirement-cited story (the Solution build track below is the record) and changes no gate. Review the stories before authorizing the build.</div>
        </div>
      )}
    </div>
  );
}

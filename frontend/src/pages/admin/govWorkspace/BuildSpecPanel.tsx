import React, { useEffect, useState } from 'react';
import { getGovBuildSpec, type GovBuildSpec } from '../../../services/factoryApi';

/**
 * BuildSpecPanel — the post-approval Build step's AI read: a lengthy build SPEC (the capabilities and
 * functionality we would build) plus advisory buyer-system RESEARCH (the platform(s) the buyer likely
 * runs, so "connect to their system" becomes a concrete integration target).
 *
 * Advisory only: generated from the ESTABLISHED requirement statements + the opportunity context, it
 * changes no gate and authors no requirement-cited story (that stays deterministic). The research is
 * LLM-knowledge-based (no live web search), so it is clearly labelled "verify". The last result is kept
 * in localStorage (per-viewer convenience) so a revisit does not force a re-run; a "Re-run" stays available.
 */
export function BuildSpecPanel({ canonical, requirements, title, buyer, daysLeft }: {
  canonical: string;
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
  daysLeft?: number | null;
}): React.ReactElement {
  const storeKey = `govBuildSpec:${canonical}`;
  const [spec, setSpec] = useState<GovBuildSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey); if (raw) setSpec(JSON.parse(raw) as GovBuildSpec); } catch { /* storage may be unavailable */ }
  }, [storeKey]);
  const run = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const s = await getGovBuildSpec(canonical, { requirements, title: title ?? null, buyer: buyer ?? null, daysLeft: daysLeft ?? null });
      setSpec(s);
      try { localStorage.setItem(storeKey, JSON.stringify(s)); } catch { /* ignore */ }
    } catch { setErr('Could not generate the build spec right now.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-3">
      <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || requirements.length === 0} onClick={() => { void run(); }}>
        <i className="ri-sparkling-2-line me-1" aria-hidden="true" />{busy ? 'Generating…' : spec ? 'Re-run build spec + research' : 'Generate build spec + research (AI)'}
      </button>
      {requirements.length === 0 && <div className="small text-secondary mt-1">Establish the cited requirements first — the spec reads from them.</div>}
      {err && <div className="alert alert-warning py-2 mt-2 mb-0 small" role="status">{err}</div>}
      {spec && (spec.spec || spec.research) && (
        <div className="row g-3 mt-1">
          {spec.spec && (
            <div className="col-12">
              <div className="border rounded p-3 h-100">
                <div className="fw-semibold small mb-1"><i className="ri-tools-line me-1" aria-hidden="true" />Build spec — capabilities &amp; functionality</div>
                <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{spec.spec}</div>
              </div>
            </div>
          )}
          {spec.research && (
            <div className="col-12">
              <div className="border rounded p-3 h-100">
                <div className="fw-semibold small mb-1"><i className="ri-search-eye-line me-1" aria-hidden="true" />Buyer-system research <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1">advisory — verify</span></div>
                <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{spec.research}</div>
              </div>
            </div>
          )}
          <div className="col-12"><div className="small text-secondary"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI build spec — advisory, grounded only in the established requirements; the buyer-system research is the model&apos;s best guess (no live web search), so confirm it before relying on it. Nothing here authors a story or changes a gate.</div></div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
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
 *
 * The spec can be long, so it is CLAMPED by default with a measured "Show more / Show less" toggle — the
 * toggle appears only when the content actually overflows the clamp, so a short spec shows no pointless button.
 */
const CLAMP_PX = 340;

/**
 * SpecBody — render the AI build spec as scannable sections. The model writes capability blocks as
 * "Heading: prose…" separated by blank lines; we bold each heading and mark it with an icon, so the spec
 * reads as a list of capabilities rather than a wall of text.
 */
function SpecBody({ text }: { text: string }): React.ReactElement {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="small">
      {blocks.map((b, i) => {
        const m = b.match(/^([A-Z][A-Za-z0-9 &/,'()-]{1,48}?):\s+([\s\S]+)$/);
        if (m) {
          return (
            <div key={i} className="mb-2">
              <div className="fw-semibold"><i className="ri-focus-3-line me-1 text-primary" aria-hidden="true" />{m[1]}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m[2]}</div>
            </div>
          );
        }
        return <p key={i} className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>{b}</p>;
      })}
    </div>
  );
}

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
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey); if (raw) setSpec(JSON.parse(raw) as GovBuildSpec); } catch { /* storage may be unavailable */ }
  }, [storeKey]);
  // Measure whether the rendered content exceeds the clamp, so the toggle shows only when it is needed.
  // scrollHeight reports the full content height even while the container is clamped (overflow hidden).
  useEffect(() => {
    const el = contentRef.current;
    setOverflowing(!!spec && !!el && el.scrollHeight > CLAMP_PX + 8);
  }, [spec]);
  const run = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const s = await getGovBuildSpec(canonical, { requirements, title: title ?? null, buyer: buyer ?? null, daysLeft: daysLeft ?? null });
      setSpec(s);
      setExpanded(false);
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
        <div className="mt-1">
          <div ref={contentRef} style={!expanded ? { maxHeight: CLAMP_PX, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, #000 78%, transparent)', maskImage: 'linear-gradient(to bottom, #000 78%, transparent)' } : undefined}>
            <div className="row g-3">
              {spec.spec && (
                <div className="col-12">
                  <div className="border rounded p-3 h-100">
                    <div className="fw-semibold small mb-1"><i className="ri-tools-line me-1" aria-hidden="true" />Build spec — capabilities &amp; functionality</div>
                    <SpecBody text={spec.spec} />
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
            </div>
          </div>
          {overflowing && (
            <button type="button" className="btn btn-link btn-sm px-0 mt-1 text-decoration-none" onClick={() => setExpanded((e) => !e)}>
              <i className={`me-1 ${expanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} aria-hidden="true" />{expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <div className="small text-secondary mt-1"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI build spec — advisory, grounded only in the established requirements; the buyer-system research is the model&apos;s best guess (no live web search), so confirm it before relying on it. Nothing here authors a story or changes a gate.</div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import portalApi from '../../utils/portalApi';
import CapabilityDetail from './CapabilityDetail';
import AIFeatureBuilder from './AIFeatureBuilder';
import {
  bpPillars,
  bpKindLabel,
  bpBuiltness,
  domainBuildBreakdown,
  domainBuildSummary,
  type BPLikeSignal,
} from '../../utils/bpSignals';

interface RequirementNode { id: string; key: string; text: string; status: string; is_active: boolean; github_file_paths: string[]; confidence_score: number; }
interface FeatureNode { id: string; name: string; description: string; success_criteria: string; status: string; priority: string; completion_pct: number; total_active: number; completed_active: number; requirements: RequirementNode[]; }
interface CapabilityNode { id: string; name: string; description: string; status: string; priority: string; source: string; completion_pct: number; total_active: number; completed_active: number; features: FeatureNode[]; }

export default function CapabilityGrid() {
  const [caps, setCaps] = useState<CapabilityNode[]>([]);
  const [bpsById, setBpsById] = useState<Map<string, BPLikeSignal>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const load = () => {
    // Fetch capabilities AND business-processes in parallel so each
    // capability card can be grounded in the real build signal from its
    // paired BP (same id) — usable / is_complete / pillar statuses. The
    // "0 of 0 active requirements" math is honest but misleading on its
    // own; the BP-side signal tells the truth about what's shipped.
    // Honest Build Signal Sprint, 2026-05-15.
    Promise.all([
      portalApi.get('/api/portal/project/capabilities').then(r => r.data as CapabilityNode[]).catch(() => [] as CapabilityNode[]),
      portalApi.get('/api/portal/project/business-processes').then(r => r.data as BPLikeSignal[] & { id: string }[]).catch(() => [] as (BPLikeSignal & { id: string })[]),
    ])
      .then(([capRows, bpRows]) => {
        setCaps(capRows);
        const map = new Map<string, BPLikeSignal>();
        for (const b of bpRows as (BPLikeSignal & { id: string })[]) map.set(b.id, b);
        setBpsById(map);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggle = async (type: string, id: string, active: boolean) => {
    try { const r = await portalApi.post('/api/portal/project/capabilities/scope', { type, id, active }); setCaps(r.data); } catch {}
  };

  if (loading) return <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>;

  if (caps.length === 0) return (
    <div className="card border-0 shadow-sm">
      <div className="card-body text-center py-4">
        <i className="bi bi-grid-3x3-gap d-block mb-2" style={{ fontSize: 28, color: 'var(--color-text-light)' }}></i>
        <p className="text-muted small mb-2">No capabilities yet. Activate your project with a requirements document to generate the capability hierarchy.</p>
        <button className="btn btn-sm btn-primary" onClick={() => setShowBuilder(true)}><i className="bi bi-plus-lg me-1"></i>Add Feature with AI</button>
        {showBuilder && <AIFeatureBuilder onCreated={load} onClose={() => setShowBuilder(false)} />}
      </div>
    </div>
  );

  const totalActive = caps.reduce((s, c) => s + c.total_active, 0);
  const completedActive = caps.reduce((s, c) => s + c.completed_active, 0);
  const overallPct = totalActive > 0 ? Math.round((completedActive / totalActive) * 100) : 0;

  // Build-side truth, derived from the paired BPs. When no requirements
  // have been extracted yet (the common bootstrap case), the
  // requirements-based completion is 0/0 and reads as misleading red 0%.
  // Surface what the system actually knows about what's shipped instead.
  const buildBreakdown = useMemo(() => {
    const bps: BPLikeSignal[] = [];
    for (const c of caps) {
      const b = bpsById.get(c.id);
      if (b) bps.push(b);
    }
    return domainBuildBreakdown(bps);
  }, [caps, bpsById]);
  const noRequirementsExtracted = totalActive === 0;
  const buildSummary = domainBuildSummary(buildBreakdown);

  return (
    <div>
      {/* Overall — when no requirements have been extracted, lead with
          the build-side truth (what the system actually knows is shipped)
          instead of a misleading "0%" badge. */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div>
              <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: 14 }}>
                <i className="bi bi-speedometer2 me-2"></i>
                {noRequirementsExtracted ? 'Build composition' : 'Project Completion'}
              </h6>
              <span className="text-muted small">
                {noRequirementsExtracted
                  ? (buildSummary || 'No capabilities discovered yet')
                  : `${completedActive}/${totalActive} active requirements`}
              </span>
            </div>
            {noRequirementsExtracted ? (
              <span title="Capabilities built end-to-end (usable or complete)" style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-accent)' }}>
                {buildBreakdown.built}
                <span style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 500, marginLeft: 4 }}>built</span>
              </span>
            ) : (
              <span className="fw-bold" style={{ fontSize: 24, color: overallPct >= 75 ? 'var(--color-accent)' : overallPct >= 40 ? '#f59e0b' : 'var(--color-secondary)' }}>{overallPct}%</span>
            )}
          </div>
          {noRequirementsExtracted ? (
            <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
              No requirements have been extracted yet, so the requirements-coverage score (0/0) is not meaningful. The numbers above come from each capability's paired BP — what the discovery engine sees as actually wired in the repo.
            </div>
          ) : (
            <div className="progress" style={{ height: 8 }}><div className="progress-bar" style={{ width: `${overallPct}%`, background: overallPct >= 75 ? 'var(--color-accent)' : overallPct >= 40 ? '#f59e0b' : 'var(--color-secondary)' }} /></div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: 14 }}><i className="bi bi-grid-3x3-gap me-2"></i>Capabilities ({caps.length})</h6>
        <button className="btn btn-sm btn-outline-primary" onClick={() => setShowBuilder(true)}><i className="bi bi-plus-lg me-1"></i>Add Feature</button>
      </div>

      {/* Cards */}
      <div className="row g-3 mb-4">
        {caps.map(cap => {
          // Pull the build signal from the paired BP (same id). When the
          // requirements-based completion is 0/0 (the common bootstrap
          // case), the BP signal is what tells the operator whether the
          // capability is actually shipped.
          const bp = bpsById.get(cap.id);
          const builtness = bp ? bpBuiltness(bp) : null;
          const kind = bp ? bpKindLabel(bp) : null;
          const pillars = bp ? bpPillars(bp) : null;
          // Border + accent colored by build truth (when known) — green
          // for Built, blue for Wired, amber for Partial/Foundation, muted
          // for Not built yet. Falls back to legacy completion-% color
          // when no BP signal is available.
          const buildColor = builtness === 'Built' ? 'var(--color-accent)'
            : builtness === 'Wired' ? 'var(--color-primary-light)'
            : builtness === 'Partial' || builtness === 'Foundation' ? '#f59e0b'
            : builtness === 'Not built yet' ? '#9ca3af'
            : cap.completion_pct >= 75 ? 'var(--color-accent)'
            : cap.completion_pct >= 40 ? '#f59e0b'
            : 'var(--color-primary-light)';
          const color = cap.status === 'disabled' ? '#9ca3af' : buildColor;
          return (
            <div key={cap.id} className="col-md-6 col-lg-4">
              <div className="card border-0 shadow-sm h-100" style={{ borderLeft: `4px solid ${color}`, opacity: cap.status === 'disabled' ? 0.6 : 1, cursor: 'pointer' }} onClick={() => setExpanded(expanded === cap.id ? null : cap.id)}>
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="fw-semibold small d-flex align-items-center gap-2" style={{ color: 'var(--color-primary)', flexWrap: 'wrap' }}>
                        <span>{cap.name}</span>
                        {kind && (
                          <span title={`${kind} BP`} style={{
                            fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em',
                            color: 'var(--color-text-light)', background: 'var(--color-bg-alt)',
                            padding: '1px 6px', borderRadius: 3, fontWeight: 600,
                          }}>{kind}</span>
                        )}
                      </div>
                      <div className="text-muted" style={{ fontSize: 11 }}>{cap.description}</div>
                    </div>
                    <div className="form-check form-switch" onClick={e => e.stopPropagation()}>
                      <input className="form-check-input" type="checkbox" checked={cap.status === 'active'} onChange={e => toggle('capability', cap.id, e.target.checked)} style={{ cursor: 'pointer' }} />
                    </div>
                  </div>

                  {/* Build pillars — B / F / A status. Honest reading of
                      what the discovery engine actually sees in the repo. */}
                  {pillars && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }} title="Backend · Frontend · Agent build status">
                      {pillars.map(p => (
                        <span key={p.label} title={p.description} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: 9.5, fontWeight: 600, color: p.tone.fg,
                          background: p.tone.bg, padding: '1px 5px', borderRadius: 3,
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          opacity: p.status === 'na' ? 0.4 : 1,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }}></span>
                          {p.label[0].toUpperCase()}
                        </span>
                      ))}
                      {builtness && (
                        <span style={{
                          fontSize: 10.5, color: buildColor, fontWeight: 600, marginLeft: 6,
                        }}>{builtness}</span>
                      )}
                    </div>
                  )}

                  <div className="d-flex justify-content-between small text-muted" style={{ fontSize: 11 }}>
                    <span>{cap.features.length} feature{cap.features.length === 1 ? '' : 's'}</span>
                    {cap.total_active > 0 ? (
                      <span className="fw-medium" title="Requirements matched">{cap.completed_active}/{cap.total_active} reqs</span>
                    ) : (
                      <span style={{ fontStyle: 'italic' }} title="No requirements extracted to score against — the build signal above tells the real story">scoring inactive</span>
                    )}
                  </div>
                  {cap.source === 'ai_generated' && <span className="badge bg-info bg-opacity-10 text-info mt-1" style={{ fontSize: 9 }}><i className="bi bi-stars me-1"></i>AI</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {expanded && <CapabilityDetail capability={caps.find(c => c.id === expanded)!} onToggle={toggle} onClose={() => setExpanded(null)} />}
      {showBuilder && <AIFeatureBuilder capabilities={caps} onCreated={load} onClose={() => setShowBuilder(false)} />}
    </div>
  );
}

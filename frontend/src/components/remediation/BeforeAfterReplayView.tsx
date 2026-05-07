import React from 'react';
import type { ReplayManifest } from '../../hooks/useBeforeAfterReplay';

export interface BeforeAfterReplayViewProps {
  manifest: ReplayManifest;
  onClose?: () => void;
}

const STATUS_BG: Record<string, string> = {
  resolved: 'rgba(34, 197, 94, 0.18)',
  unresolved: 'rgba(245, 158, 11, 0.18)',
  regressed: 'rgba(239, 68, 68, 0.20)',
};

const STATUS_BORDER: Record<string, string> = {
  resolved: '#16a34a',
  unresolved: '#f59e0b',
  regressed: '#dc2626',
};

export function BeforeAfterReplayView({ manifest, onClose }: BeforeAfterReplayViewProps) {
  return (
    <div className="modal show d-block" role="dialog" aria-modal="true" style={{ background: 'rgba(15, 23, 42, 0.55)' }}>
      <div className="modal-dialog modal-xl modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h6 className="modal-title fw-bold mb-1" style={{ fontSize: 14 }}>Before / After replay</h6>
              <div className="text-muted" style={{ fontSize: 11 }}>{manifest.summary}</div>
            </div>
            {onClose && (
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
            )}
          </div>
          <div className="modal-body">
            <div className="row g-3 mb-3">
              <div className="col-6">
                <div className="text-muted mb-1" style={{ fontSize: 11 }}>Before</div>
                <ReplaySurface url={manifest.before_url} regions={manifest.overlay_regions} variant="before" />
              </div>
              <div className="col-6">
                <div className="text-muted mb-1" style={{ fontSize: 11 }}>After</div>
                <ReplaySurface url={manifest.after_url} regions={manifest.overlay_regions} variant="after" />
              </div>
            </div>
            <DeltaTable manifest={manifest} />
            {manifest.notes.length > 0 && (
              <ul className="mt-2 mb-0" style={{ fontSize: 11, color: '#64748b' }}>
                {manifest.notes.map((n, i) => (<li key={i}>{n}</li>))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplaySurface({ url, regions, variant }: { url: string | null; regions: ReplayManifest['overlay_regions']; variant: 'before' | 'after' }) {
  if (!url) {
    return (
      <div className="d-flex align-items-center justify-content-center text-muted" style={{ height: 280, background: '#f8fafc', borderRadius: 6, border: '1px dashed #e2e8f0', fontSize: 11 }}>
        {variant === 'before' ? 'No before-snapshot was captured.' : 'No after-snapshot is available yet.'}
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <img src={url} alt={variant === 'before' ? 'Before remediation' : 'After remediation'} style={{ width: '100%', display: 'block' }} />
      {regions.map((r, i) => r.bbox && (
        <div
          key={i}
          title={r.note}
          style={{
            position: 'absolute',
            left: r.bbox.x,
            top: r.bbox.y,
            width: r.bbox.width,
            height: r.bbox.height,
            background: STATUS_BG[r.status] || 'transparent',
            border: `2px solid ${STATUS_BORDER[r.status] || '#94a3b8'}`,
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        ></div>
      ))}
    </div>
  );
}

function DeltaTable({ manifest }: { manifest: ReplayManifest }) {
  const d = manifest.delta_summary;
  return (
    <div className="table-responsive">
      <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
        <thead className="table-light">
          <tr><th>Dimension</th><th>Delta</th></tr>
        </thead>
        <tbody>
          <tr><td>Issues resolved</td><td>{d.issues_resolved_count}</td></tr>
          <tr><td>Issues regressed</td><td>{d.issues_regressed_count}</td></tr>
          <tr><td>Cognition</td><td>{fmtDelta(d.cognition_delta)}</td></tr>
          <tr><td>UX debt</td><td>{fmtDelta(d.ux_debt_delta)}</td></tr>
          <tr><td>Behavioral</td><td>{fmtDelta(d.behavioral_delta)}</td></tr>
          <tr><td>Workflow friction</td><td>{fmtDelta(d.friction_delta)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function fmtDelta(v: number | null): string {
  if (v == null) return '—';
  return v >= 0 ? `+${v}` : `${v}`;
}

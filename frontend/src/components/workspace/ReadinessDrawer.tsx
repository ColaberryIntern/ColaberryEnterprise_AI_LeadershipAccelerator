/**
 * ReadinessDrawer — explains the Readiness tile.
 * Renders state.readiness.breakdown as a sparkline-style bar chart with
 * dimension labels. Reads only from useUnifiedProjectState.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Drawer from './Drawer';
import { useUnifiedProjectState, type ReadinessBand } from '../../hooks/useUnifiedProjectState';

interface Props { open: boolean; onClose: () => void; }

const BAND_LABEL: Record<ReadinessBand, string> = { red: 'Needs attention', amber: 'On track', green: 'Healthy' };
const BAND_COLOR: Record<ReadinessBand, string> = {
  red: 'var(--color-danger)',
  amber: 'var(--color-warning)',
  green: 'var(--color-success)',
};

const DIMENSIONS: Array<{ key: keyof ReturnType<typeof useUnifiedProjectState>['state'] extends infer T ? T extends null ? never : T extends { readiness: { breakdown: infer B } } ? keyof B : never : never; label: string; helper: string }> = [
  // The casts above are for type-narrowing; concrete keys below.
] as any;

const DIM_META: Array<{ key: string; label: string; helper: string }> = [
  { key: 'artifact_completion',    label: 'Artifact completion',   helper: 'Submitted vs required artifacts' },
  { key: 'requirements_coverage',  label: 'Requirements coverage', helper: 'Requirements with implementation' },
  { key: 'github_health',          label: 'GitHub health',         helper: 'Repo activity + file count' },
  { key: 'portfolio_quality',      label: 'Portfolio quality',     helper: 'Avg quality score across deliverables' },
  { key: 'workflow_progress',      label: 'Workflow progress',     helper: 'Stage advancement through the build' },
];

const ReadinessDrawer: React.FC<Props> = ({ open, onClose }) => {
  const { state } = useUnifiedProjectState();
  if (!state) {
    return (
      <Drawer open={open} onClose={onClose} eyebrow="READINESS" title="Loading…">
        <div style={{ color: 'var(--color-text-light)', fontSize: 13 }}>Waiting for unified state.</div>
      </Drawer>
    );
  }

  const r = state.readiness;
  const bandColor = BAND_COLOR[r.band];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="READINESS · how prepared the project is"
      title={`${r.score}% — ${BAND_LABEL[r.band]}`}
      titleBadge={{ text: r.band, tone: r.band === 'green' ? 'good' : r.band === 'amber' ? 'warn' : 'info' }}
      subtitle={r.reasons[0] || 'Composite score across 5 dimensions.'}
    >
      <section style={{ marginBottom: 18 }}>
        <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 10 }}>
          5-dimension breakdown
        </h6>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DIM_META.map(d => {
            const v = (r.breakdown as any)[d.key] as number;
            const color = v >= 80 ? 'var(--color-success)' : v >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
            return (
              <div key={d.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{d.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{d.helper}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{v}%</div>
                </div>
                <div style={{ height: 6, background: 'var(--color-bg-alt)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${v}%`, height: '100%', background: color, transition: 'width 280ms ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {r.reasons.length > 1 && (
        <section style={{ marginBottom: 18 }}>
          <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 8 }}>
            Why this band
          </h6>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--color-text)' }}>
            {r.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
          </ul>
        </section>
      )}

      <section style={{
        background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
        borderRadius: 5, padding: '0.7rem 0.85rem', fontSize: 12, color: 'var(--color-text-light)',
      }}>
        <strong style={{ color: '#FB2832' }}>Want to improve readiness?</strong>{' '}
        Open <Link to="/portal/visual-workspace" onClick={onClose} style={{ color: '#C20E1E' }}>Critique</Link> to spot missing pieces, or hand off Cory's <Link to="/portal/project/blueprint" onClick={onClose} style={{ color: '#C20E1E' }}>next action</Link>.
      </section>
    </Drawer>
  );
};

export default ReadinessDrawer;

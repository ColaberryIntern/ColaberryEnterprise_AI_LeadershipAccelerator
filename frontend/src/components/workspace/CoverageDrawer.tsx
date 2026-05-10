/**
 * CoverageDrawer — explains the Coverage tile.
 * Shows requirements matched/total, the percentage breakdown, and notes
 * about what's still uncovered. Reads only from useUnifiedProjectState.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Drawer from './Drawer';
import { useUnifiedProjectState } from '../../hooks/useUnifiedProjectState';

interface Props { open: boolean; onClose: () => void; }

const CoverageDrawer: React.FC<Props> = ({ open, onClose }) => {
  const { state } = useUnifiedProjectState();
  if (!state) {
    return (
      <Drawer open={open} onClose={onClose} eyebrow="COVERAGE" title="Loading…">
        <div style={{ color: 'var(--color-text-light)', fontSize: 13 }}>Waiting for unified state.</div>
      </Drawer>
    );
  }

  const c = state.coverage;
  const hasReqs = c.requirements_total > 0;
  const tone = c.score >= 80 ? 'good' : c.score >= 50 ? 'warn' : 'info';
  const color = c.score >= 80 ? 'var(--color-success)' : c.score >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
  const uncovered = c.requirements_total - c.requirements_matched;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="COVERAGE · requirements with implementation"
      title={hasReqs ? `${c.score}%` : '— no requirements'}
      titleBadge={hasReqs ? { text: `${c.requirements_matched}/${c.requirements_total}`, tone } : undefined}
      subtitle={hasReqs
        ? `${c.requirements_matched} of ${c.requirements_total} requirements have a linked artifact + working implementation.`
        : 'Upload a requirements document to start tracking coverage.'}
    >
      {hasReqs && (
        <>
          <section style={{ marginBottom: 18 }}>
            <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 10 }}>
              Coverage gauge
            </h6>
            <div style={{
              height: 14, background: 'var(--color-bg-alt)', borderRadius: 7,
              overflow: 'hidden', position: 'relative', border: '1px solid var(--color-border)',
            }}>
              <div style={{
                width: `${c.score}%`, height: '100%', background: color,
                transition: 'width 280ms ease', borderRadius: 7,
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-light)', marginTop: 5 }}>
              <span>0 reqs</span>
              <span>target: 100% to ship</span>
              <span>{c.requirements_total} reqs</span>
            </div>
          </section>

          <section style={{ marginBottom: 18 }}>
            <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 10 }}>
              The numbers
            </h6>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <div style={{ background: 'var(--color-bg-alt)', borderRadius: 5, padding: '0.7rem 0.85rem' }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-success)', lineHeight: 1.1 }}>{c.requirements_matched}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>covered</div>
              </div>
              <div style={{ background: 'var(--color-bg-alt)', borderRadius: 5, padding: '0.7rem 0.85rem' }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: uncovered > 0 ? 'var(--color-warning)' : 'var(--color-text-light)', lineHeight: 1.1 }}>{uncovered}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>still uncovered</div>
              </div>
            </div>
          </section>

          {c.bps_total > 0 && (
            <section style={{ marginBottom: 18 }}>
              <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 8 }}>
                Business processes
              </h6>
              <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
                <strong>{c.bps_complete}</strong> / {c.bps_total} BPs complete
              </div>
            </section>
          )}
        </>
      )}

      <section style={{
        background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
        borderRadius: 5, padding: '0.7rem 0.85rem', fontSize: 12, color: 'var(--color-text-light)',
      }}>
        <strong style={{ color: 'var(--color-primary)' }}>To raise coverage:</strong>{' '}
        Cory's queue prioritizes uncovered requirements. Open <Link to="/portal/project/system-v2?tab=bps" onClick={onClose} style={{ color: 'var(--color-primary-light)' }}>System &gt; BPs</Link> to inspect, or run the next action via <Link to="/portal/project/blueprint" onClick={onClose} style={{ color: 'var(--color-primary-light)' }}>Blueprint</Link>.
      </section>
    </Drawer>
  );
};

export default CoverageDrawer;

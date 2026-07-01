/**
 * WhyThisNextDrawer — explains the priority card.
 *
 * Reinforces trust in Cory's authority by transparently surfacing what
 * signals influenced the choice: requirement key, action type, files
 * suggested, scoring breakdown (status × dependency × system rule
 * weights — the 3 multipliers from requirementPriorityService).
 *
 * Reads only from useUnifiedProjectState. No new endpoints.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Drawer from './Drawer';
import { useUnifiedProjectState } from '../../hooks/useUnifiedProjectState';

interface Props { open: boolean; onClose: () => void; }

const WhyThisNextDrawer: React.FC<Props> = ({ open, onClose }) => {
  const { state } = useUnifiedProjectState();
  if (!state) {
    return <Drawer open={open} onClose={onClose} eyebrow="WHY THIS NEXT" title="Loading…"><div /></Drawer>;
  }

  const next = state.next_action;
  if (!next) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        eyebrow="WHY THIS NEXT"
        title="Caught up — nothing queued"
      >
        <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6 }}>
          Cory has no pending action right now. That's a good place to be — open Critique to spot improvements, or check the queue when something appears.
        </p>
      </Drawer>
    );
  }

  const meta = next.metadata || {};
  const reqKey = meta.requirement_key as string | undefined;
  const actionType = meta.action_type as string | undefined;
  const files = (meta.files_suggested as string[] | undefined) || [];
  const scoring = (meta.scoring as { status_weight?: number; dependency_weight?: number; system_rule_weight?: number } | undefined) || {};

  const blastTone = next.blast_radius.band === 'high' ? 'warn' : next.blast_radius.band === 'medium' ? 'info' : 'good';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="WHY THIS NEXT · Cory's reasoning"
      title={next.title}
      titleBadge={{ text: `${next.blast_radius.band} blast`, tone: blastTone }}
      subtitle={next.reason}
      footer={
        <>
          <Link to="/portal/project/blueprint" onClick={onClose} className="btn btn-sm" style={{ fontSize: 12, background: '#FB2832', color: '#fff', border: 'none' }}>
            <i className="bi bi-arrow-right me-1"></i>Open in Blueprint
          </Link>
        </>
      }
    >
      <section style={{ marginBottom: 18 }}>
        <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 8 }}>
          Signals that influenced this
        </h6>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--color-text)' }}>
          {reqKey && (
            <li><strong>Requirement</strong>: <code style={{ fontSize: 11, color: '#C20E1E', background: 'var(--color-bg-alt)', padding: '0.05rem 0.35rem', borderRadius: 3 }}>{reqKey}</code> has no linked artifact yet</li>
          )}
          {actionType && (
            <li><strong>Action type</strong>: <code style={{ fontSize: 11, color: '#C20E1E', background: 'var(--color-bg-alt)', padding: '0.05rem 0.35rem', borderRadius: 3 }}>{actionType}</code></li>
          )}
          <li><strong>Estimated time</strong>: {next.time_est_minutes ? `~${next.time_est_minutes} min` : 'not estimated'}</li>
          <li><strong>Blast radius</strong>: {next.blast_radius.band}{next.blast_radius.reason ? ` — ${next.blast_radius.reason}` : ''}</li>
          <li><strong>Confidence</strong>: {next.confidence_score}% — Cory is reasonably sure this is the right next step</li>
        </ul>
      </section>

      {(scoring.status_weight !== undefined || scoring.dependency_weight !== undefined || scoring.system_rule_weight !== undefined) && (
        <section style={{ marginBottom: 18 }}>
          <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 8 }}>
            Score breakdown
          </h6>
          <div style={{
            background: 'var(--color-bg-alt)', borderRadius: 5, padding: '0.7rem 0.85rem',
            fontSize: 12, fontFamily: 'var(--font-mono, "Consolas", monospace)', color: 'var(--color-text)',
          }}>
            priority = status_weight × dependency_weight × system_rule_weight
            <br />
            <span style={{ color: 'var(--color-text-light)' }}>          = </span>
            <strong>{scoring.status_weight ?? '—'}</strong>
            <span style={{ color: 'var(--color-text-light)' }}> × </span>
            <strong>{scoring.dependency_weight ?? '—'}</strong>
            <span style={{ color: 'var(--color-text-light)' }}> × </span>
            <strong>{scoring.system_rule_weight ?? '—'}</strong>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 6, lineHeight: 1.55 }}>
            <strong>status_weight</strong>: 3 = unmatched requirement · 2 = partial.&nbsp;
            <strong>dependency_weight</strong>: 1 + (childCount × 0.5).&nbsp;
            <strong>system_rule_weight</strong>: 1.5 if requirement tokens overlap ≥20% with system docs, else 1.0.
          </div>
        </section>
      )}

      {files.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 8 }}>
            Suggested files ({files.length})
          </h6>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {files.slice(0, 8).map(f => (
              <li key={f}>
                <code style={{ fontSize: 11, color: '#C20E1E', background: 'var(--color-bg-alt)', padding: '0.15rem 0.5rem', borderRadius: 3, display: 'inline-block', wordBreak: 'break-all' }}>{f}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{
        background: 'var(--color-info-bg)', border: '1px solid rgba(59,130,246,0.25)',
        borderLeft: '4px solid var(--color-info)',
        borderRadius: 5, padding: '0.7rem 0.85rem', fontSize: 12, color: 'var(--color-text)',
      }}>
        <strong style={{ color: 'var(--color-info)' }}>What completing this unlocks:</strong>{' '}
        once the artifact is created and the requirement is matched, Cory will queue the next-most-blocked requirement. Each completion measurably raises Coverage.
      </section>
    </Drawer>
  );
};

export default WhyThisNextDrawer;

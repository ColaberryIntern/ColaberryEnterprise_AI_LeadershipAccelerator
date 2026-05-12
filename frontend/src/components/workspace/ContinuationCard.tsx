/**
 * ContinuationCard — "Continue where you left off" affordance on Home.
 *
 * Continuity + Resume Flow Sprint, 2026-05-12.
 *
 * One calm row, one continuation. Dismissible (per-session, sessionStorage).
 * Never a list. Never a feed. Hidden when:
 *   - the active path hook returned null (genuinely no continuation), or
 *   - the operator has dismissed it this session, or
 *   - the continuation target IS the current page
 *
 * Visual: low-key row, light primary accent stripe on the left, icon +
 * "You were working on …" eyebrow + verb-led action + one-line context +
 * tiny dismiss × on the right. No buttons inside — the whole row is the
 * clickable target.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActivePath } from '../../hooks/useActivePath';

interface Props {
  path: ActivePath | null;
}

const DISMISS_KEY = 'continuationCard:dismissed';

const ContinuationCard: React.FC<Props> = ({ path }) => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY); } catch { return null; }
  });

  // Reset dismissal when the path KIND changes (new continuation deserves a chance).
  useEffect(() => {
    if (!path) return;
    const sig = `${path.kind}:${path.target_route}`;
    if (dismissed && dismissed !== sig) {
      try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
      setDismissed(null);
    }
  }, [path, dismissed]);

  if (!path) return null;
  const signature = `${path.kind}:${path.target_route}`;
  if (dismissed === signature) return null;

  const onClick = () => navigate(path.target_route);
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { sessionStorage.setItem(DISMISS_KEY, signature); } catch { /* ignore */ }
    setDismissed(signature);
  };

  const accent = path.freshness === 'fresh' ? 'var(--color-accent)' : 'var(--color-primary-light)';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={path.freshness === 'fresh' ? 'ws-delta-rise' : undefined}
      title="Click to continue"
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
        padding: '0.65rem 0.95rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        transition: 'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 4px 14px ${path.freshness === 'fresh' ? 'rgba(56,161,105,0.10)' : 'rgba(43,108,176,0.08)'}`;
        e.currentTarget.style.borderColor = accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = 'var(--color-border)';
      }}
    >
      <i className={`bi ${path.icon}`} style={{ fontSize: 18, color: accent, flexShrink: 0 }} aria-hidden="true"></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--color-text-light)', fontWeight: 600,
        }}>
          You were working on…
        </div>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--color-text)',
          marginTop: 2, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {path.label}
        </div>
        {path.detail && (
          <div style={{
            fontSize: 11.5, color: 'var(--color-text-light)', marginTop: 2,
            fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {path.detail}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss continuation"
        title="Dismiss for this session"
        style={{
          background: 'transparent',
          border: 'none',
          padding: '0.2rem 0.4rem',
          color: 'var(--color-text-light)',
          opacity: 0.55,
          cursor: 'pointer',
          fontSize: 14,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.55'; }}
      >
        ×
      </button>
    </div>
  );
};

export default ContinuationCard;

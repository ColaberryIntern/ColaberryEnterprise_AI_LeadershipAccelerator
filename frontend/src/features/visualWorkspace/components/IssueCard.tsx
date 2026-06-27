/**
 * IssueCard — sidebar list item.
 */
import React from 'react';
import type { CritiqueSeverity } from '../types';

interface Props {
  index: number;
  title: string;
  kind: string;
  severity: CritiqueSeverity;
  region_label?: string;
  active: boolean;
  resolved?: boolean;
  onSelect: () => void;
}

const SEVERITY_LABEL: Record<CritiqueSeverity, { bg: string; fg: string }> = {
  high: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)' },
  medium: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)' },
  low: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)' },
};

const IssueCard: React.FC<Props> = ({ index, title, kind, severity, region_label, active, resolved, onSelect }) => {
  const colors = SEVERITY_LABEL[severity];
  return (
    <button
      type="button"
      onClick={onSelect}
      className="vw-issue-card"
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: active ? 'var(--color-bg-alt)' : 'white',
        border: `1px solid ${active ? '#C20E1E' : 'var(--color-border)'}`,
        borderLeft: `3px solid ${active ? '#FB2832' : colors.fg}`,
        borderRadius: 4,
        padding: '0.5rem 0.65rem',
        marginBottom: 6,
        cursor: 'pointer',
        opacity: resolved ? 0.65 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{
          background: colors.fg,
          color: 'white',
          fontSize: 10,
          fontWeight: 600,
          width: 18,
          height: 18,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>{index}</span>
        <span style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          background: colors.bg,
          color: colors.fg,
          padding: '0.05rem 0.4rem',
          borderRadius: 3,
          fontWeight: 600,
        }}>{kind}</span>
        {resolved && <span style={{
          fontSize: 10,
          color: 'var(--color-success)',
          fontWeight: 600,
          marginLeft: 'auto',
        }}>✓ resolved</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', lineHeight: 1.35 }}>
        {title || <em style={{ color: 'var(--color-text-light)' }}>(no title)</em>}
      </div>
      {region_label && (
        <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 2 }}>
          {region_label}
        </div>
      )}
    </button>
  );
};

export default IssueCard;

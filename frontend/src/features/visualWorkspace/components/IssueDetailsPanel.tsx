/**
 * IssueDetailsPanel — right rail.
 *
 * Shows the selected critique + its AI-generated suggestions + decision
 * controls + action buttons (mark resolved, generate prompt for this one,
 * send to Build Center).
 */
import React from 'react';
import type { CritiqueSeverity } from '../types';

interface SuggestionLite {
  id: string;
  title: string;
  body: string;
  expected_ux_impact?: number;
}

interface DecisionLite {
  suggestion_id?: string | null;
  critique_id?: string | null;
  verdict: 'accepted' | 'rejected' | 'deferred';
}

interface CritiqueLite {
  id: string;
  index: number;
  title?: string;
  description: string;
  kind: string;
  severity: CritiqueSeverity;
  target_selector?: string | null;
  expected_outcome?: string | null;
  region?: { x: number; y: number; width: number; height: number } | null;
}

interface Props {
  critique: CritiqueLite | null;
  suggestions: SuggestionLite[];
  decisions: DecisionLite[];
  onAcceptSuggestion: (id: string) => void;
  onRejectSuggestion: (id: string) => void;
  onDeferSuggestion: (id: string) => void;
  onMarkResolved: () => void;
  /** Hands the compiled prompt off to Blueprint (the execution surface). */
  onSendToBuildCenter: () => void;
  onGenerateForThisOne: () => void;
  /** 2026-05-21: close the panel + free the stage. */
  onClose?: () => void;
}

const SEVERITY_COLORS: Record<CritiqueSeverity, { bg: string; fg: string }> = {
  high: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)' },
  medium: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)' },
  low: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)' },
};

const IssueDetailsPanel: React.FC<Props> = ({
  critique, suggestions, decisions,
  onAcceptSuggestion, onRejectSuggestion, onDeferSuggestion,
  onMarkResolved, onSendToBuildCenter, onGenerateForThisOne,
  onClose,
}) => {
  // 2026-05-21: when no issue selected, render nothing. The parent grid
  // collapses the right column to 0 width so the stage gets the freed
  // space. The "click Annotate to start" instructions previously here
  // duplicated what's on the action bar and ate ~400px of stage room
  // for no value.
  if (!critique) return null;

  const decisionsBySuggestion = new Map<string, string>();
  decisions.forEach(d => { if (d.suggestion_id) decisionsBySuggestion.set(d.suggestion_id, d.verdict); });

  const acceptedCount = suggestions.filter(s => decisionsBySuggestion.get(s.id) === 'accepted').length;
  const colors = SEVERITY_COLORS[critique.severity];

  return (
    <aside className="vw-details-panel" style={{ position: 'relative' }}>
      {/* 2026-05-21: prominent close button at the panel's top-right
          corner, OUT of the header row's content flow so it can't be
          crowded out by the kind/severity chips. Hover state makes it
          obvious it's clickable. */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          title="Close panel — frees the stage"
          aria-label="Close issue details panel"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 28, height: 28,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'white',
            color: 'var(--color-text-light)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            cursor: 'pointer',
            zIndex: 2,
            transition: 'background 120ms ease, color 120ms ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg-alt)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'white';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-light)';
          }}
        >
          <i className="bi bi-x-lg" style={{ fontSize: 14 }}></i>
        </button>
      )}
      <div className="vw-details-header" style={{ paddingRight: 44 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{
            background: colors.fg,
            color: 'white',
            fontSize: 11,
            fontWeight: 600,
            width: 22, height: 22,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>{critique.index}</span>
          <span style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: colors.bg,
            color: colors.fg,
            padding: '0.1rem 0.45rem',
            borderRadius: 3,
            fontWeight: 600,
          }}>{critique.kind}</span>
          <span style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: colors.fg,
            fontWeight: 600,
            marginLeft: 'auto',
          }}>{critique.severity}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-primary)', lineHeight: 1.35 }}>
          {critique.title || critique.description.split('.')[0].slice(0, 80)}
        </div>
      </div>

      <div className="vw-details-body">
        <section className="vw-details-section">
          <h6 className="vw-details-label">Issue</h6>
          <div className="vw-details-text">{critique.description}</div>
        </section>

        {critique.expected_outcome && (
          <section className="vw-details-section">
            <h6 className="vw-details-label">Expected improvement</h6>
            <div className="vw-details-text">{critique.expected_outcome}</div>
          </section>
        )}

        {critique.target_selector && (
          <section className="vw-details-section">
            <h6 className="vw-details-label">Target selector</h6>
            <code style={{
              display: 'block',
              fontSize: 11,
              background: 'var(--color-bg-alt)',
              padding: '0.4rem 0.55rem',
              borderRadius: 3,
              border: '1px solid var(--color-border)',
              color: 'var(--color-primary)',
              wordBreak: 'break-all',
            }}>{critique.target_selector}</code>
          </section>
        )}

        {critique.region && (
          <section className="vw-details-section">
            <h6 className="vw-details-label">Pinned region</h6>
            <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontFamily: 'var(--font-mono)' }}>
              x={(critique.region.x * 100).toFixed(1)}%
              &nbsp;·&nbsp; y={(critique.region.y * 100).toFixed(1)}%
            </div>
          </section>
        )}

        <section className="vw-details-section">
          <h6 className="vw-details-label">
            AI suggestions
            <span style={{ marginLeft: 6, color: 'var(--color-text-light)', fontWeight: 400 }}>
              ({suggestions.length}{acceptedCount > 0 ? `, ${acceptedCount} accepted` : ''})
            </span>
          </h6>
          {suggestions.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontStyle: 'italic', padding: '0.5rem 0' }}>
              Backend has not generated suggestions for this issue yet.
            </div>
          )}
          {suggestions.map(s => {
            const verdict = decisionsBySuggestion.get(s.id);
            return (
              <div key={s.id} className="vw-suggestion-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <strong style={{ fontSize: 13, color: 'var(--color-text)' }}>{s.title}</strong>
                  {typeof s.expected_ux_impact === 'number' && (
                    <span style={{
                      fontSize: 10,
                      background: 'var(--color-info-bg)',
                      color: 'var(--color-info)',
                      padding: '0.1rem 0.4rem',
                      borderRadius: 3,
                      fontWeight: 600,
                    }}>+{s.expected_ux_impact} UX</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-light)', lineHeight: 1.5 }}>
                  {s.body}
                </div>
                {!verdict && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    <button className="btn btn-sm btn-success" style={{ fontSize: 11 }}
                      onClick={() => onAcceptSuggestion(s.id)}>Accept</button>
                    <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }}
                      onClick={() => onRejectSuggestion(s.id)}>Reject</button>
                    <button className="btn btn-sm btn-outline-warning" style={{ fontSize: 11 }}
                      onClick={() => onDeferSuggestion(s.id)}>Defer</button>
                  </div>
                )}
                {verdict && (
                  <div style={{ marginTop: 8 }}>
                    <span className={`badge bg-${verdict === 'accepted' ? 'success' : verdict === 'rejected' ? 'secondary' : 'warning text-dark'}`}>
                      {verdict}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>

      <div className="vw-details-actions">
        <button
          type="button"
          className="btn btn-sm btn-outline-primary w-100 mb-2"
          onClick={onGenerateForThisOne}
        >
          <i className="bi bi-lightning me-1"></i>Compile prompt for this issue
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary w-100 mb-2"
          onClick={onSendToBuildCenter}
        >
          <i className="bi bi-rocket me-1"></i>Send to Blueprint
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-success w-100"
          onClick={onMarkResolved}
        >
          <i className="bi bi-check2 me-1"></i>Mark resolved
        </button>
      </div>
    </aside>
  );
};

export default IssueDetailsPanel;

/**
 * OperatorFocusCard — "where you are shaping the system" orientation block.
 *
 * Operator Orientation Sprint, 2026-05-14.
 *
 * A deliberately minimal, calm block on Cory Home. It answers three
 * questions, in order, each as one plain sentence:
 *   1. Where is your attention?  ("You are currently shaping Lead Intelligence.")
 *   2. What does that influence?  ("Your work here flows into Marketing and Reporting.")
 *   3. Did anything move?         ("While you were shaping …, readiness strengthened.")
 *
 * Not clickable, no buttons, no metrics, no badges. Orientation, not
 * analytics — it reflects a signal the operator produced themselves by
 * engaging a domain on the System surface. Renders nothing when there is
 * no focus signal (genuine first visit / never opened a domain).
 */
import React from 'react';
import type { OperatorFocus } from '../../hooks/useOperatorFocus';
import type { OperationalMomentum } from '../../hooks/useOperationalMomentum';
import {
  orientationSentence,
  flowsIntoSentence,
  impactSentence,
} from '../../utils/operatorOrientationLanguage';

interface Props {
  focus: OperatorFocus;
  momentum: OperationalMomentum;
}

const OperatorFocusCard: React.FC<Props> = ({ focus, momentum }) => {
  const orient = orientationSentence(focus);
  if (!orient || !focus.domain) return null; // no focus signal — render nothing

  const flows = flowsIntoSentence(focus);
  const impact = impactSentence(focus, momentum);

  return (
    <div
      aria-label="Your operational focus"
      style={{
        background: 'var(--color-bg-alt)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '0.85rem 1rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <i
        className={`bi ${focus.domain.icon}`}
        aria-hidden="true"
        style={{ fontSize: 18, color: 'var(--color-primary-light)', flexShrink: 0, marginTop: 2, opacity: 0.85 }}
      ></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 3,
        }}>
          Your operational focus
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.4 }}>
          {orient}
        </div>
        {flows && (
          <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 4, lineHeight: 1.55 }}>
            {flows}
          </div>
        )}
        {impact && (
          <div style={{ fontSize: 12, color: 'var(--color-primary-light)', marginTop: 4, lineHeight: 1.55, fontStyle: 'italic' }}>
            {impact}
          </div>
        )}
      </div>
    </div>
  );
};

export default OperatorFocusCard;

import React from 'react';
import './AutofillButton.css';

/**
 * The signature "auto-fill / regenerate" control for the whole app.
 *
 * A twin-spark glyph on a warm cherry→amber gradient — the standout mark that
 * says "let the system fill this in for you." Reused everywhere we automate a
 * field, a section, or a whole document, from the smallest input up.
 *
 * `AutofillIcon` is the raw glyph (inherits `currentColor`) for inline use;
 * `AutofillButton` is the round action button with a busy (spinning) state.
 */

export const AutofillIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    {/* primary 4-point spark */}
    <path d="M11.6 2.6c.55 4.6 2.55 6.6 7.15 7.15-4.6.55-6.6 2.55-7.15 7.15-.55-4.6-2.55-6.6-7.15-7.15 4.6-.55 6.6-2.55 7.15-7.15Z" />
    {/* secondary spark */}
    <path d="M18.4 14.1c.28 1.9 1.05 2.67 2.95 2.95-1.9.28-2.67 1.05-2.95 2.95-.28-1.9-1.05-2.67-2.95-2.95 1.9-.28 2.67-1.05 2.95-2.95Z" />
  </svg>
);

interface Props {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
  size?: number;          // icon size (px); the button scales around it
  label?: string;         // optional text next to the glyph (pill form)
}

const AutofillButton: React.FC<Props> = ({ onClick, busy, disabled, title, size = 18, label }) => (
  <button
    type="button"
    className={`af-btn${busy ? ' busy' : ''}${label ? ' af-pill' : ''}`}
    style={{ ['--af-icon' as any]: `${size}px` }}
    onClick={onClick}
    disabled={disabled || busy}
    title={title || 'Auto-fill the other fields'}
    aria-label={title || 'Auto-fill the other fields'}
  >
    <span className="af-glyph"><AutofillIcon size={size} /></span>
    {label && <span className="af-label">{busy ? 'Working…' : label}</span>}
  </button>
);

export default AutofillButton;

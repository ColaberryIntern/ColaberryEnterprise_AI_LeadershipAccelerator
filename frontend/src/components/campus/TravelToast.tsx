import React from 'react';
import './campusPeek.css';

/**
 * "Walking to Library…" while you walk (WP-3; the prototype's #tt, D:1316, D:1779) and "Running to" when late (C46: no rides), with Skip, which stands you at the door at once. Polite live region; never shown with reduce motion (no
 * walk happens then).
 */
export default function TravelToast({ text, onSkip }: { text: string | null; onSkip: () => void }): React.ReactElement {
  return (
    <div className={`cm-tt${text ? ' is-on' : ''}`} role="status" aria-live="polite" data-testid="cm-travel">
      {text && <><span data-testid="cm-travel-text">{text}</span><button type="button" onClick={onSkip} data-testid="cm-travel-skip">Skip</button></>}
    </div>
  );
}

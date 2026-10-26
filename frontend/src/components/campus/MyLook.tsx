import React, { useRef } from 'react';
import type { CampusLook } from './campusApi';
import { useCardFocus } from './useCardFocus';
import LockerGrid from './LockerGrid';

/**
 * The "My look" locker card (Colaberry Campus C9), shown on the full map. WP-7: the items are the prototype's locker tiles
 * (LockerGrid, shared with the Me panel). Every item is EARNED with points, never bought (C46: gear
 * only, no rides).
 */
export interface MyLookProps {
  look: CampusLook | null;
  lookError: boolean;
  onSave: (equipped: Record<string, string | null>) => Promise<unknown>;
  onClose: () => void;
}

export default function MyLook({ look, lookError, onSave, onClose }: MyLookProps): React.ReactElement {
  const heading = useRef<HTMLHeadingElement | null>(null);
  useCardFocus(heading); // C11: focus the heading on open, hand it back to the "My look" button on close
  return (
    <section className="cm-card cm-look" aria-labelledby="cm-look-h" data-testid="cm-look">
      <button type="button" className="cm-card-x" onClick={onClose} aria-label="Close My look">×</button>
      <h2 id="cm-look-h" className="cm-card-title" tabIndex={-1} ref={heading}>My look</h2>
      {!look && lookError && <p className="cm-who-note" role="status" data-testid="cm-look-broken">We can't load your look right now.</p>}
      {!look && !lookError && <p className="cm-who-note">Loading...</p>}
      {look && (
        <>
          <p className="cm-who-note" data-testid="cm-look-points">{look.rung_name ? `${look.rung_name} · ` : ''}{look.points} points. Gear is earned with points, never bought.</p>
          <LockerGrid look={look} onSave={onSave} />
        </>
      )}
    </section>
  );
}

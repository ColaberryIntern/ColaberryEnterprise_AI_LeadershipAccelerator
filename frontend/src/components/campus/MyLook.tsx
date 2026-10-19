import React, { useEffect, useRef, useState } from 'react';
import type { CampusLook, LookItem } from './campusApi';
import { SLOT_LABEL, SLOT_ORDER } from './campusGear';

/**
 * The "My look" locker (Colaberry Campus C9), shown on the full map. Every item is EARNED with points, never bought: an unlocked
 * item can be worn (one per slot; clicking what you wear takes it off), a locked one says the points it is earned at. Each change
 * saves the complete set to the server, which re-checks the points; a refused or failed save keeps the previous look and says why.
 * A ride shows only on your own avatar, and only while you travel.
 */
export interface MyLookProps {
  look: CampusLook | null;
  lookError: boolean;
  onSave: (equipped: Record<string, string | null>) => Promise<unknown>;
  onClose: () => void;
}

export default function MyLook({ look, lookError, onSave, onClose }: MyLookProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  const toggle = async (item: LookItem) => {
    if (!look || busy || !item.unlocked) return;
    const next: Record<string, string | null> = { ...look.equipped };
    next[item.slot] = look.equipped[item.slot] === item.id ? null : item.id;
    setBusy(true);
    setError(null);
    try { await onSave(next); } catch (e) { setError((e as Error).message || 'We could not save your look. Try again.'); } finally { setBusy(false); }
  };

  return (
    <section className="cm-card cm-look" aria-labelledby="cm-look-h" data-testid="cm-look">
      <button type="button" className="cm-card-x" onClick={onClose} aria-label="Close My look">×</button>
      <h2 id="cm-look-h" className="cm-card-title" tabIndex={-1} ref={heading}>My look</h2>
      {!look && lookError && <p className="cm-who-note" role="status" data-testid="cm-look-broken">We can't load your look right now.</p>}
      {!look && !lookError && <p className="cm-who-note">Loading...</p>}
      {look && (
        <>
          <p className="cm-who-note" data-testid="cm-look-points">{look.rung_name ? `${look.rung_name} · ` : ''}{look.points} points. Gear is earned with points, never bought.</p>
          {error && <p className="cm-look-error" role="alert" data-testid="cm-look-error">{error}</p>}
          {SLOT_ORDER.map((slot) => {
            const items = look.catalog.filter((i) => i.slot === slot);
            if (!items.length) return null;
            return (
              <div key={slot} className="cm-look-slot">
                <h3 className="cm-card-h">{SLOT_LABEL[slot]}{slot === 'ride' ? ' (only you see it, while you travel)' : ''}</h3>
                <ul className="cm-look-items">
                  {items.map((i) => {
                    const worn = look.equipped[slot] === i.id;
                    return (
                      <li key={i.id}>
                        <button type="button" className={`cm-look-item${worn ? ' is-worn' : ''}`} aria-pressed={worn} disabled={!i.unlocked || busy}
                          data-testid={`cm-look-item-${i.id}`} onClick={() => toggle(i)}>
                          <span className="cm-look-name">{i.name}</span>
                          <small>{i.unlocked ? (worn ? 'Wearing' : 'Wear it') : `Earned at ${i.threshold} points`}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

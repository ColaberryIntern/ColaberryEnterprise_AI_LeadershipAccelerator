import React, { useState } from 'react';
import type { CampusLook, LookItem } from './campusApi';
import { GEAR_ICON } from './campusGear';
import './campusPanels.css';

/**
 * The locker as the prototype's tile grid (WP-7, E M6; D:3209-3210): four columns, each item its icon, name and state:
 * "✓ Wearing" (green), "Wear it", "Ride it" (a ride), or "🔒 n pts" (greyed, the points it is earned at). Every item is EARNED with
 * points, never bought. Pressing an unlocked item wears it (one per slot); pressing what you wear takes it off. Each change saves
 * the complete set to the server, which re-checks the points; a refused or failed save keeps the previous look and says why.
 * Used by the Me panel and the map's "My look" card, so the two never disagree.
 */
export function useLockerSave(look: CampusLook | null, onSave: (equipped: Record<string, string | null>) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async (item: LookItem) => {
    if (!look || busy || !item.unlocked) return;
    const next: Record<string, string | null> = { ...look.equipped };
    next[item.slot] = look.equipped[item.slot] === item.id ? null : item.id;
    setBusy(true);
    setError(null);
    try { await onSave(next); } catch (e) { setError((e as Error).message || 'We could not save your look. Try again.'); } finally { setBusy(false); }
  };
  return { busy, error, toggle };
}

export function tileState(item: LookItem, worn: boolean): string {
  if (!item.unlocked) return `🔒 ${item.threshold.toLocaleString('en-US')} pts`;
  if (worn) return '✓ Wearing';
  return item.slot === 'ride' ? 'Ride it' : 'Wear it';
}

export default function LockerGrid({ look, onSave }: { look: CampusLook; onSave: (equipped: Record<string, string | null>) => Promise<unknown> }): React.ReactElement {
  const { busy, error, toggle } = useLockerSave(look, onSave);
  const items = [...look.catalog].sort((a, b) => a.threshold - b.threshold);
  return (
    <>
      {error && <p className="cm-look-error" role="alert" data-testid="cm-look-error">{error}</p>}
      <ul className="cm-locker" data-testid="cm-locker">
        {items.map((i) => {
          const worn = look.equipped[i.slot] === i.id;
          return (
            <li key={i.id}>
              <button type="button" className={`cm-lk${worn ? ' is-worn' : ''}${i.unlocked ? '' : ' is-locked'}`} aria-pressed={worn} disabled={!i.unlocked || busy}
                data-testid={`cm-look-item-${i.id}`} onClick={() => toggle(i)}
                aria-label={`${i.name}: ${i.unlocked ? (worn ? 'wearing, press to take it off' : i.slot === 'ride' ? 'ride it' : 'wear it') : `earned at ${i.threshold} points`}`}>
                <span className="cm-lk-ic" aria-hidden="true">{GEAR_ICON[i.id] ?? '✨'}</span>
                <b>{i.name}</b>
                <small aria-hidden="true">{tileState(i, worn)}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

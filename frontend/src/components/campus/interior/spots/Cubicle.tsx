import React from 'react';
import { sp } from './spotParts';
import type { SpotKind } from '../roomSpots';

/**
 * A cubicle down the left side of a work room (C25, v6 D2): partitions, a desk, a monitor and a chair, matching the room (the
 * Studio's and the Internship Office's desk cubicle, the Library's wooden carrel, Cert Prep's grey booth). Occupied: the monitor is
 * lit (its person stands at it, drawn by the room); empty: the monitor dark and the chair empty. Decorative (aria-hidden).
 */
const LOOK: Record<'desk' | 'carrel' | 'booth', { wall: string; side: string; top: string }> = {
  desk: { wall: 'cub-desk', side: 'cub-desk-side', top: 'wood' },
  carrel: { wall: 'carrel', side: 'carrel-side', top: 'carrel-in' },
  booth: { wall: 'booth', side: 'booth-side', top: 'booth-desk' },
};

export default function Cubicle({ kind, occupied }: { kind: SpotKind; occupied: boolean }): React.ReactElement {
  const l = LOOK[kind === 'carrel' ? 'carrel' : kind === 'booth' ? 'booth' : 'desk'];
  return (
    <svg viewBox="0 0 120 110" width="100%" height="100%" aria-hidden="true">
      <rect x="6" y="8" width="108" height="56" rx="4" fill={sp(l.wall)} />
      <rect x="2" y="8" width="10" height="84" rx="3" fill={sp(l.side)} />
      <rect x="108" y="8" width="10" height="84" rx="3" fill={sp(l.side)} />
      <rect x="14" y="60" width="92" height="10" rx="2" fill={sp(l.top)} />
      <rect x="18" y="70" width="6" height="26" fill={sp('stand')} />
      <rect x="96" y="70" width="6" height="26" fill={sp('stand')} />
      <rect x="44" y="26" width="32" height="22" rx="2" fill={sp('monitor')} />
      <rect x="46" y="28" width="28" height="18" rx="1" fill={occupied ? sp('cub-lit') : sp('dark-screen')} className={occupied ? 'scr is-lit' : 'scr'} />
      <rect x="58" y="48" width="4" height="12" fill={sp('stand')} />
      <rect x="44" y="78" width="32" height="8" rx="3" fill={sp('chair-seat')} />
      <rect x="57" y="86" width="6" height="16" fill={sp('chair')} />
    </svg>
  );
}

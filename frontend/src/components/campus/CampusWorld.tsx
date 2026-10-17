import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampusPresence } from './campusApi';
import CampusWorldMap from './CampusWorldMap';
import BuildingCard from './BuildingCard';
import type { BuildingId, CampusAudience, CampusBuilding } from './campusMap';
import { buildingAccess } from './campusAccess';

/**
 * Map + building card, with the keyboard contract (Campus C2):
 *  - Tab moves across buildings, Enter/Space walks there and opens the card;
 *  - Esc with a card open closes ONLY the card and returns focus to its building;
 *  - Esc with no card open calls onExit (the overlay closes).
 */
export interface CampusWorldProps {
  buildings: CampusBuilding[];
  audience: CampusAudience;
  hasFullAccess: boolean;
  workplaceNames: boolean;
  reduceMotion: boolean;
  initialTarget?: BuildingId | null;
  onExit: () => void;
  onNavigate: () => void;
  /** C4: live presence by building id. `undefined` = presence not wired (no counts, no Who's here). */
  presence?: CampusPresence | null;
  presenceError?: boolean;
  /** C3: zoom through the open building's door to a route, from that building's on-screen rect. */
  onEnterRoom?: (route: string, from: DOMRect | null) => void;
}

export default function CampusWorld({ buildings, audience, hasFullAccess, workplaceNames, reduceMotion, initialTarget, onExit, onNavigate, presence, presenceError = false, onEnterRoom }: CampusWorldProps): React.ReactElement {
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    if (presence) for (const [id, a] of Object.entries(presence)) out[id] = a.count;
    return out;
  }, [presence]);
  const [open, setOpen] = useState<BuildingId | null>(null);
  const els = useRef(new Map<BuildingId, SVGGElement>());
  const accessOf = useCallback((b: CampusBuilding) => buildingAccess(b, audience, hasFullAccess), [audience, hasFullAccess]);
  const registerEl = useCallback((id: BuildingId, el: SVGGElement | null) => { if (el) els.current.set(id, el); else els.current.delete(id); }, []);

  const closeCard = useCallback(() => {
    const id = open;
    setOpen(null);
    if (id) els.current.get(id)?.focus();
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (open) closeCard(); else onExit();
  };

  // On phones the map is wider than the screen (campus.css); start centered on the quad.
  const world = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = world.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);

  const b = open ? buildings.find((x) => x.id === open) : undefined;
  return (
    <div className="cm-world" onKeyDown={onKeyDown} ref={world}>
      <CampusWorldMap buildings={buildings} accessOf={accessOf} workplaceNames={workplaceNames} reduceMotion={reduceMotion}
        initialTarget={initialTarget} onArrive={setOpen} buildingRef={registerEl} counts={presenceError ? undefined : counts} />
      {b && <BuildingCard building={b} access={accessOf(b)} workplaceNames={workplaceNames} onClose={closeCard} onNavigate={onNavigate}
        onEnterRoom={onEnterRoom ? (route) => onEnterRoom(route, els.current.get(b.id)?.getBoundingClientRect() ?? null) : undefined}
        whoIsHere={presence === undefined && !presenceError ? undefined
          : { presence: presence?.[b.id], error: presenceError, loading: presence === null && !presenceError }} />}
    </div>
  );
}

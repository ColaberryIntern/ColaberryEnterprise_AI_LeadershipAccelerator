import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampusPresence } from './campusApi';
import CampusWorldMap from './CampusWorldMap';
import BuildingCard from './BuildingCard';
import type { BuildingId, CampusAudience, CampusBuilding } from './campusMap';
import { buildingAccess } from './campusAccess';
import PersonCard from './PersonCard';
import type { PersonCardTarget } from './CampusContext';
import type { StaffDesk } from './campusPeopleApi';
import { tokensFor, desksForBuilding } from './campusPeople';
import { buildingName } from './campusMap';

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
  /** C5: AI staff desks, the open person card and its controls. Absent = C4 behavior. */
  staffDesks?: StaffDesk[];
  personCard?: PersonCardTarget | null;
  onOpenPerson?: (t: PersonCardTarget) => void;
  onClosePerson?: () => void;
}

export default function CampusWorld({ buildings, audience, hasFullAccess, workplaceNames, reduceMotion, initialTarget, onExit, onNavigate, presence, presenceError = false, onEnterRoom, staffDesks, personCard, onOpenPerson, onClosePerson }: CampusWorldProps): React.ReactElement {
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

  const [walkRequest, setWalkRequest] = useState<{ id: BuildingId; seq: number } | null>(null);
  const people = useMemo(() => {
    if (!presence || presenceError || !onOpenPerson) return undefined;
    const out: Record<string, ReturnType<typeof tokensFor>> = {};
    for (const [id, a] of Object.entries(presence)) { const t = tokensFor(a); if (t.shown.length) out[id] = t; }
    return out;
  }, [presence, presenceError, onOpenPerson]);
  const pickPerson = useCallback((p: PersonCardTarget['person'], buildingId: BuildingId) => { setOpen(null); onOpenPerson?.({ person: p, buildingId }); }, [onOpenPerson]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (personCard) onClosePerson?.(); else if (open) closeCard(); else onExit();
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
        initialTarget={initialTarget} onArrive={setOpen} buildingRef={registerEl} counts={presenceError ? undefined : counts}
        people={people} onPickPerson={onOpenPerson ? pickPerson : undefined} walkRequest={walkRequest} />
      {personCard && (() => {
        const pb = buildings.find((x) => x.id === personCard.buildingId);
        return <PersonCard person={personCard.person} buildingLabel={pb ? buildingName(pb, workplaceNames) : 'the campus'} onClose={() => onClosePerson?.()}
          onMessaged={onNavigate}
          onWalkOver={() => { const id = personCard.buildingId; onClosePerson?.(); setWalkRequest((w) => ({ id, seq: (w?.seq ?? 0) + 1 })); }} />;
      })()}
      {b && !personCard && <BuildingCard building={b} access={accessOf(b)} workplaceNames={workplaceNames} onClose={closeCard} onNavigate={onNavigate}
        onEnterRoom={onEnterRoom ? (route) => onEnterRoom(route, els.current.get(b.id)?.getBoundingClientRect() ?? null) : undefined}
        desks={staffDesks ? desksForBuilding(staffDesks, b.id, audience) : undefined}
        whoIsHere={presence === undefined && !presenceError ? undefined
          : { presence: presence?.[b.id], error: presenceError, loading: presence === null && !presenceError,
            onPick: onOpenPerson ? (p) => pickPerson(p, b.id) : undefined }} />}
    </div>
  );
}

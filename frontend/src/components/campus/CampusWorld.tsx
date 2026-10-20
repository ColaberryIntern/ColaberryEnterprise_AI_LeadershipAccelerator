import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampusPresence } from './campusApi';
import CampusWorldMap from './CampusWorldMap';
import BuildingCard from './BuildingCard';
import type { BuildingId, CampusAudience, CampusBuilding } from './campusMap';
import { buildingState } from './campusAccess';
import type { ExplorerAccess } from './campusMap';
import PersonCard from './PersonCard';
import type { PersonCardTarget } from './CampusContext';
import type { StaffDesk } from './campusPeopleApi';
import { tokensFor, desksForBuilding } from './campusPeople';
import { buildingName } from './campusMap';
import ExplorerPath from './ExplorerPath';
import { explorerPath } from './campusPath';
import type { Equipped } from './campusGear';

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
  /** C6: each building's state from the pages' own signals (useCampusView). Absent (tests, older callers): derived from the
   *  audience with no staff, which is how the page paywall treats a learner without a staff role. */
  accessOf?: (b: CampusBuilding) => ExplorerAccess;
  /** C6: the portal's is_explorer; shows the path to enrolling in the Main Gate card. */
  isExplorer?: boolean;
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
  /** C8: buildings whose room is on air now. */
  onAir?: Set<string>;
  /** C8: today's plan route (building ids in order). */
  route?: BuildingId[];
  /** C7: a tour in progress: walk to `target` whenever it changes, show `card` instead of the building card, Esc ends the tour. */
  tour?: { target: BuildingId | null; card: React.ReactNode; onEnd: () => void };
  /** C9: a panel shown instead of the building card (the My look locker); Esc closes it. */
  panel?: { card: React.ReactNode; onClose: () => void };
  /** C9: the learner's own equipped set, drawn on their pin. */
  ownGear?: Equipped;
}

export default function CampusWorld({ buildings, audience, hasFullAccess, accessOf: accessOfProp, isExplorer = false, workplaceNames, reduceMotion, initialTarget, onExit, onNavigate, presence, presenceError = false, onEnterRoom, staffDesks, personCard, onOpenPerson, onClosePerson, onAir, route, tour, panel, ownGear }: CampusWorldProps): React.ReactElement {
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    if (presence) for (const [id, a] of Object.entries(presence)) out[id] = a.count;
    return out;
  }, [presence]);
  const [open, setOpen] = useState<BuildingId | null>(null);
  const els = useRef(new Map<BuildingId, SVGGElement>());
  const accessOf = useCallback((b: CampusBuilding) => (accessOfProp
    ? accessOfProp(b)
    : buildingState(b, { isStaff: false, hasFullAccess, isExplorer: audience === 'explorer' })), [accessOfProp, audience, hasFullAccess]);
  const registerEl = useCallback((id: BuildingId, el: SVGGElement | null) => { if (el) els.current.set(id, el); else els.current.delete(id); }, []);
  // C11: on phones the map is wider than the screen; bring the destination into view (instantly with reduce motion).
  // On wide screens nothing overflows, so this is a no-op there.
  const revealBuilding = useCallback((id: BuildingId) => {
    els.current.get(id)?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [reduceMotion]);

  const closeCard = useCallback(() => {
    const id = open;
    setOpen(null);
    if (id) els.current.get(id)?.focus();
  }, [open]);

  const [walkRequest, setWalkRequest] = useState<{ id: BuildingId; seq: number } | null>(null);
  const tourTarget = tour?.target ?? null;
  useEffect(() => {
    if (tourTarget) { setOpen(null); revealBuilding(tourTarget); setWalkRequest((w) => ({ id: tourTarget, seq: (w?.seq ?? 0) + 1 })); }
  }, [tourTarget]); // runs per tour step only (revealBuilding is stable for a given reduceMotion)
  const touring = !!tour;
  const onArrive = useCallback((id: BuildingId) => { revealBuilding(id); if (!touring) setOpen(id); }, [touring, revealBuilding]);
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
    if (tour) tour.onEnd(); else if (panel) panel.onClose(); else if (personCard) onClosePerson?.(); else if (open) closeCard(); else onExit();
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
        initialTarget={initialTarget} onArrive={onArrive} buildingRef={registerEl} counts={presenceError ? undefined : counts}
        people={people} onPickPerson={onOpenPerson ? pickPerson : undefined} walkRequest={walkRequest} onAir={onAir} route={route} ownGear={ownGear} />
      {tour && tour.card}
      {!tour && panel && panel.card}
      {!tour && !panel && personCard && (() => {
        const pb = buildings.find((x) => x.id === personCard.buildingId);
        return <PersonCard person={personCard.person} buildingLabel={pb ? buildingName(pb, workplaceNames) : 'the campus'} onClose={() => onClosePerson?.()}
          onMessaged={onNavigate}
          onWalkOver={() => { const id = personCard.buildingId; onClosePerson?.(); setWalkRequest((w) => ({ id, seq: (w?.seq ?? 0) + 1 })); }} />;
      })()}
      {!tour && !panel && b && !personCard && <BuildingCard building={b} access={accessOf(b)} workplaceNames={workplaceNames} onClose={closeCard} onNavigate={onNavigate}
        onEnterRoom={onEnterRoom ? (route) => onEnterRoom(route, els.current.get(b.id)?.getBoundingClientRect() ?? null) : undefined}
        desks={staffDesks ? desksForBuilding(staffDesks, b.id, audience) : undefined}
        children={b.id === 'gate' && isExplorer ? <ExplorerPath onNavigate={onNavigate}
          model={explorerPath(buildings, accessOf, workplaceNames, !!staffDesks?.some((d) => d.id === 'maya' && d.on_duty))} /> : undefined}
        whoIsHere={presence === undefined && !presenceError ? undefined
          : { presence: presence?.[b.id], error: presenceError, loading: presence === null && !presenceError,
            onPick: onOpenPerson ? (p) => pickPerson(p, b.id) : undefined }} />}
    </div>
  );
}

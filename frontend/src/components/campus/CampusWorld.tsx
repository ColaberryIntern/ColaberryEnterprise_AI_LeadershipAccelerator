import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { CampusPresence } from './campusApi';
import CampusWorldMap from './CampusWorldMap';
import type { BuildingId, CampusAudience, CampusBuilding } from './campusMap';
import { buildingState } from './campusAccess';
import type { ExplorerAccess } from './campusMap';
import PersonPop from './PersonPop';
import { useStaffPop } from './StaffPop';
import type { At } from './usePopover';
import type { PersonCardTarget } from './CampusContext';
import type { StaffDesk } from './campusPeopleApi';
import { buildingName } from './campusMap';
import type { Equipped } from './campusGear';
import type { CameraApi, InsetsOf } from './useCampusCamera';
import type { Cam } from './campusCamera';
import { GATE } from './art/grounds';
import CampusZoomControls from './CampusZoomControls';
import ArrivalPanel from './ArrivalPanel';
import type { PlanStop } from './campusPlan';
import type { CompleteResult } from './campusPlanApi';
import type { LookFacts } from './campusFacts';
import { useWorldTour } from './useWorldTour';
import type { WorldTour } from './useWorldTour';
import { STATE_TAG } from './tourSteps';
import { useMapStage, useDoorReveal, useReturnRecenter } from './useWorldStage';
import { useMapPeople } from './useMapPeople';
import TravelToast from './TravelToast';
import type { Travel } from './useWalk';
import type { Me } from './art/AvatarPin';
import type { MapMoments } from './CampusWorldMap';
import type { Framed } from './useWorldStage';
import { openWayfinder } from './wayfinderHost';
import type { CampusLiveNow } from './campusOnAir';
import { marqueeText } from './campusLiveState';

/**
 * Map + cards, with the keyboard contract (Campus C2):
 *  - Tab moves across buildings, Enter/Space walks there and opens the card;
 *  - Esc with a card open closes ONLY the card and returns focus to its building;
 *  - Esc with no card open calls onExit.
 * WP-2: arriving opens the arrival panel (ArrivalPanel) for every building, during a tour too (the tour lives inside it), with
 * today's plan box; the other buildings dim while it is open; the plan is drawn on the map as the prototype's teal route.
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
  /** WP-2: today's plan (drawn on the map; its box in the arrival panel; Mark done). Absent during a tour and while live. */
  plan?: { stops: PlanStop[]; onComplete: (s: PlanStop) => Promise<CompleteResult> } | null;
  /** WP-2: your points, rung and today's plan minutes, for "Happening here". */
  look?: LookFacts;
  /** C7 / WP-2: a tour in progress. Each step walks to its stop, whose arrival panel carries the tour; Esc ends (pauses) it. */
  tour?: WorldTour;
  /** C9: a panel shown instead of the building card (the My look locker); Esc closes it. */
  panel?: { card: React.ReactNode; onClose: () => void };
  /** C9: the learner's own equipped set, drawn on their pin. */
  ownGear?: Equipped;
  /** C11b: screen px the caller's panels cover (the campus home's concierge and top bar), for the camera's whole-campus view. */
  insets?: InsetsOf;
  /** C11b: walk to this building now, from outside the map (the home's pulse, plan and search). A new seq means a new walk. */
  walkTo?: { id: BuildingId; seq: number; instant?: boolean; run?: boolean; flashRoom?: string | null } | null;
  /** WP-4: a building the side panel points at (a Right now row is hovered): lifted on the map. */
  hover?: BuildingId | null;
  /** WP-6: Colaberry Live now (its state and clock): the marquee over its building and the arrival card's live dressing. */
  liveNow?: CampusLiveNow | null;
  /** WP-1: a handle on the camera for the caller (the home's gate fly-out), where the avatar starts (the building you were last at),
   *  the first camera frame (the gate close-up), and a request to close every card and show the whole campus (a new seq each time). */
  cameraRef?: MutableRefObject<CameraApi | null>;
  startAt?: BuildingId | null;
  startCam?: Cam;
  recenter?: number;
  /** C11b: told whenever a card opens or closes, with the building whose arrival panel is open (null for the others). */
  onCard?: (state: { open: boolean; building: BuildingId | null }) => void;
  /** WP-3: you on the map (initials from your name, photo, level, account colour); a member's time badges and urgent building;
   *  whether nobody else is on campus (the night look). */
  me?: Me | null;
  moments?: MapMoments;
  quiet?: boolean;
}

const NO_LOOK: LookFacts = { points: null, rung: null, planMinutes: null };

export default function CampusWorld(p: CampusWorldProps): React.ReactElement {
  const { buildings, audience, workplaceNames, reduceMotion, presence, presenceError = false, onOpenPerson, onClosePerson, personCard, tour, panel } = p;
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    if (presence) for (const [id, a] of Object.entries(presence)) out[id] = a.count;
    return out;
  }, [presence]);
  const [open, setOpen] = useState<BuildingId | null>(null);
  const els = useRef(new Map<BuildingId, SVGGElement>());
  const { accessOf: accessOfProp, hasFullAccess } = p;
  const accessOf = useCallback((b: CampusBuilding) => (accessOfProp
    ? accessOfProp(b)
    : buildingState(b, { isStaff: false, hasFullAccess, isExplorer: audience === 'explorer' })), [accessOfProp, audience, hasFullAccess]);
  const registerEl = useCallback((id: BuildingId, el: SVGGElement | null) => { if (el) els.current.set(id, el); else els.current.delete(id); }, []);
  // C11: on phones the map is wider than the screen; bring the destination into view (instantly with reduce motion).
  const revealBuilding = useCallback((id: BuildingId) => {
    els.current.get(id)?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [reduceMotion]);
  const openRef = useRef(open);
  openRef.current = open;
  const closeCard = useCallback(() => { const id = openRef.current; setOpen(null); if (id) els.current.get(id)?.focus(); }, []);

  const [walkRequest, setWalkRequest] = useState<{ id: BuildingId; seq: number; instant?: boolean; run?: boolean } | null>(null);
  const walk = useCallback((id: BuildingId, instant?: boolean, run?: boolean) => setWalkRequest((w) => ({ id, seq: (w?.seq ?? 0) + 1, instant, run })), []);
  const [travel, setTravel] = useState<Travel | null>(null);
  const t = useWorldTour(tour, closeCard, walk, revealBuilding);
  const onArrive = useCallback((id: BuildingId) => { revealBuilding(id); setOpen(id); }, [revealBuilding]);
  // WP-5: a person's card is a popover where you pressed, over the arrival panel (which stays open), as the prototype's openCard
  const pickPerson = useCallback((pp: PersonCardTarget['person'], buildingId: BuildingId, at?: At) => { onOpenPerson?.({ person: pp, buildingId, at }); }, [onOpenPerson]);
  const pp = useMapPeople({ presence, presenceError, audience, buildings, workplaceNames, staffDesks: p.staffDesks, onPerson: onOpenPerson ? pickPerson : undefined, walk });
  const staff = useStaffPop({ desks: p.staffDesks, audience, buildings, workplace: workplaceNames, hereId: open, walk, onMessaged: p.onNavigate });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (pp.peekOpen) pp.closePeek(); else if (staff.open) staff.close(); else if (personCard) onClosePerson?.(); else if (t.arrival) t.arrival.onEnd(); else if (panel) panel.onClose(); else if (open) closeCard(); else p.onExit();
  };

  // C11b staging: the camera, the desks and your initials for the map, and the door reveal (useWorldStage).
  const framedRef = useRef<Framed>(null);
  const { camApi, camera, mapDesks, meInitials } = useMapStage(p.staffDesks, audience, p.insets, { camRef: p.cameraRef, framedRef, startCam: p.startCam });
  const door = useDoorReveal(p.onEnterRoom, reduceMotion);
  const lastOutside = useRef(0);
  const [flash, setFlash] = useState<{ id: BuildingId; route: string } | null>(null); // WP-4: the room a Wayfinder pick flashes
  const [fromDoor, setFromDoor] = useState(false); // WP-5: back out of a page (Step outside): walk from the room's door to your seat
  const { walkTo } = p;
  useEffect(() => {
    if (!walkTo || walkTo.seq === lastOutside.current) return;
    lastOutside.current = walkTo.seq; setOpen(null); setFlash(walkTo.flashRoom ? { id: walkTo.id, route: walkTo.flashRoom } : null); setFromDoor(!!walkTo.instant);
    walk(walkTo.id, walkTo.instant, walkTo.run);
  }, [walkTo, walk]);

  // "Go somewhere else": close the card and put the caret in the campus search (the home's top bar, or a page banner).
  const elsewhere = useCallback(() => { setOpen(null); if (!openWayfinder()) document.querySelector<HTMLInputElement>('.cm-whereto-input')?.focus(); }, []);
  const b = open && !panel ? buildings.find((x) => x.id === open) : undefined;
  const anyCard = !!tour || !!panel || !!b; // the peek, person and staff cards are light popovers: they neither move the camera nor tuck the panel
  const cardBuilding = b ? b.id : null;
  // WP-1: the building a resize keeps framed (the open card's); every return to the campus recenters (useReturnRecenter).
  framedRef.current = b ? (b.kind === 'gate' ? { ...GATE, h: 50 } : { x: b.pos.x, y: b.pos.y, h: b.pos.h }) : null;
  useReturnRecenter(camApi, anyCard, p.recenter, () => { setOpen(null); if (personCard) onClosePerson?.(); });
  // WP-1 R10 with WP-5's popover: a person card closing is a return to the campus too (when no other card is open)
  const hadPerson = useRef(false);
  useEffect(() => { if (hadPerson.current && !personCard && !anyCard) camApi.current?.recenter(); hadPerson.current = !!personCard; }, [personCard, anyCard, camApi]);
  const onCardRef = useRef(p.onCard); onCardRef.current = p.onCard;
  useEffect(() => { onCardRef.current?.({ open: anyCard, building: cardBuilding }); }, [anyCard, cardBuilding]);
  // The tour's STOP badges on the map (an Explorer's say what each stop is: "3 · OPEN"), the current stop green.
  const tourBadges = tour ? tour.model.stops.map((s, i) => ({ id: s.buildingId, text: tour.model.audience === 'explorer' && s.state ? `${i + 1} · ${STATE_TAG[s.state].toUpperCase()}` : `STOP ${i + 1}`, live: i === tour.index })) : undefined;
  return (
    <div className={`cm-world${anyCard ? ' has-card' : ''}`} onKeyDown={onKeyDown}>
      <CampusWorldMap buildings={buildings} accessOf={accessOf} workplaceNames={workplaceNames} reduceMotion={reduceMotion}
        initialTarget={p.initialTarget} onArrive={onArrive} buildingRef={registerEl} counts={presenceError ? undefined : counts}
        people={pp.people} yours={pp.yours} onPeek={pp.openPeek} presenceDown={presenceError && presence !== undefined} walkRequest={walkRequest} onTravel={setTravel}
        onAir={p.onAir} plan={p.plan?.stops} ownGear={p.ownGear} showOpen={audience === 'explorer'} camera={camera} desks={mapDesks}
        me={p.me ?? (meInitials ? { initials: meInitials } : null)} hover={p.hover} startAt={p.startAt}
        liveMark={p.liveNow ? { state: p.liveNow.state, text: marqueeText(p.liveNow.b, p.liveNow.now) } : null} tourBadges={tourBadges} dimExcept={cardBuilding} moments={p.moments} quiet={p.quiet} />
      <CampusZoomControls apiRef={camApi} />
      <TravelToast text={travel ? `${travel.verb} to ${buildingName(buildings.find((x) => x.id === travel.id) ?? buildings[0], workplaceNames)}…` : null}
        onSkip={() => { if (travel) walk(travel.id, true); }} />
      {pp.peek}
      {panel && panel.card}
      {staff.node}
      {personCard && <PersonPopFor t={personCard} buildings={buildings} workplace={workplaceNames} audience={audience} here={open === personCard.buildingId}
        reese={!!p.staffDesks?.some((d) => d.id === 'reese' && d.on_duty)} onClose={() => onClosePerson?.()} onMessaged={p.onNavigate}
        onWalkOver={() => { const id = personCard.buildingId; onClosePerson?.(); walk(id); }} />}
      {b && <ArrivalPanel b={b} buildings={buildings} audience={audience} isExplorer={!!p.isExplorer} accessOf={accessOf} workplaceNames={workplaceNames}
        reduceMotion={reduceMotion} presence={presence} presenceError={presenceError} count={presence ? counts[b.id] ?? 0 : null} onAir={!!p.onAir?.has(b.id)}
        staffDesks={p.staffDesks} going={door.going} look={p.look ?? NO_LOOK} tour={t.arrival} plan={p.plan} flashRoute={flash?.id === b.id ? flash.route : undefined}
        onClose={closeCard} onNavigate={p.onNavigate} onElsewhere={elsewhere}
        onEnterRoom={p.onEnterRoom ? (r) => door.enter(r, b.id, doorRect() ?? els.current.get(b.id)?.getBoundingClientRect() ?? null) : undefined} fromDoor={fromDoor}
        live={p.liveNow && p.liveNow.building === b.id ? p.liveNow : null}
        onPickPerson={onOpenPerson ? (x, at) => pickPerson(x, b.id, at) : undefined} onMore={(at) => pp.openPeek(b.id, at.x, at.y)} />}
    </div>
  );
}

/** The prototype's goThroughDoor zooms from the room's own back door, not the building on the map. */
const doorRect = (): DOMRect | null => document.querySelector('[data-testid="cm-inside-door"] rect')?.getBoundingClientRect() ?? null;

function PersonPopFor({ t, buildings, workplace, audience, here, reese, onClose, onWalkOver, onMessaged }: {
  t: PersonCardTarget; buildings: CampusBuilding[]; workplace: boolean; audience: CampusAudience; here: boolean; reese: boolean;
  onClose: () => void; onWalkOver: () => void; onMessaged: () => void;
}): React.ReactElement {
  const pb = buildings.find((x) => x.id === t.buildingId);
  return <PersonPop key={t.person.enrollment_id} person={t.person} at={t.at} place={pb ? buildingName(pb, workplace) : 'the campus'} here={here} audience={audience}
    reeseOnDuty={reese} onClose={onClose} onWalkOver={onWalkOver} onMessaged={onMessaged} />;
}

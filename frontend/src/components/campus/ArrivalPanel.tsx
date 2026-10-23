import React, { useEffect, useState } from 'react';
import BuildingCard from './BuildingCard';
import CampusInside from './interior/CampusInside';
import ExplorerPath from './ExplorerPath';
import PlanBox from './PlanBox';
import { TourStopCard, TourNav } from './TourInCard';
import type { Tour } from './tourSteps';
import type { BuildingId, CampusAudience, CampusBuilding, ExplorerAccess } from './campusMap';
import { buildingName } from './campusMap';
import type { CampusPerson, CampusPresence } from './campusApi';
import type { StaffDesk } from './campusPeopleApi';
import { desksForBuilding } from './campusPeople';
import { explorerPath } from './campusPath';
import { happeningAt, kickerOf, subOf, zoneLabelOf } from './campusArrival';
import { factsAt, loadArrival, urgentAt } from './campusFacts';
import type { ArrivalData, LookFacts } from './campusFacts';
import type { PlanStop } from './campusPlan';
import type { CompleteResult } from './campusPlanApi';
import type { At } from './usePopover';
import { openStaffCard } from './staffCard';
import { useRoomWall } from './interior/useRoomWall';
import LiveStage from './LiveStage';
import type { CampusLiveNow } from './campusOnAir';
import { roomRoute } from './campusOnAir';
import { LIVE_STATES, liveSub } from './campusLiveState';
import { enrollCta } from './campusAccess';

/**
 * Arriving at a building (C11b; WP-2): the room behind, and the arrival panel in front, as the prototype's arrive() builds it:
 * the hero (kicker for this arrival, name, one line), the tour stop while touring, today's plan box when your next step is here,
 * "Happening here" from real facts, the main action (or what starts here within 15 minutes), who is here (the staff first), rooms,
 * and the tour nav. WP-5: the room's walls show real facts (useRoomWall); its desk bubble opens the staff card; the arcade's
 * cabinets open the Game Room. Split out of CampusWorld so that component stays about the map and its cards.
 */
export interface ArrivalTour {
  model: Tour;
  index: number;
  onNext: () => void;
  onBack: () => void;
  onEnd: () => void;
}
export interface ArrivalPanelProps {
  b: CampusBuilding;
  buildings: CampusBuilding[];
  audience: CampusAudience;
  isExplorer: boolean;
  accessOf: (b: CampusBuilding) => ExplorerAccess;
  workplaceNames: boolean;
  reduceMotion: boolean;
  presence?: CampusPresence | null;
  presenceError: boolean;
  count: number | null;
  onAir: boolean;
  staffDesks?: StaffDesk[];
  going: string | null;
  look: LookFacts;
  tour?: ArrivalTour | null;
  plan?: { stops: PlanStop[]; onComplete: (s: PlanStop) => Promise<CompleteResult> } | null;
  onClose: () => void;
  onNavigate: () => void;
  onElsewhere: () => void;
  onEnterRoom?: (route: string) => void;
  onPickPerson?: (p: CampusPerson, at: At) => void;
  /** WP-5: "+N more" in Who's here opens the peek; you came back out of a page (walk from the door to your seat). */
  onMore?: (at: At) => void;
  fromDoor?: boolean;
  /** WP-4: the room a Wayfinder pick flashes in the card (the prototype's flashRoom). */
  flashRoute?: string;
  /** WP-6: Colaberry Live is in this building now (its state and clock): the card dresses for it (the prototype's dressLivePanel). */
  live?: CampusLiveNow | null;
}

/** The portal facts for the open building, read when it opens (campusFacts caches each source for a minute). */
function useArrivalFacts(id: BuildingId, audience: CampusAudience, open: boolean): ArrivalData {
  const [data, setData] = useState<ArrivalData>({});
  useEffect(() => {
    let alive = true;
    setData({});
    loadArrival(id, audience, open).then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [id, audience, open]);
  return data;
}

export default function ArrivalPanel(p: ArrivalPanelProps): React.ReactElement {
  const { b, audience, workplaceNames: wp, tour, plan } = p;
  const access = p.accessOf(b);
  const data = useArrivalFacts(b.id, audience, access === 'open');
  const now = Date.now();
  const tourIdx = tour ? tour.index : -1;
  const isStop = !!tour && tour.model.stops[tourIdx]?.buildingId === b.id;
  const nextB = tour && isStop ? p.buildings.find((x) => x.id === tour.model.stops[tourIdx + 1]?.buildingId) : undefined;
  // The plan box: your next unfinished step in this building (never during a tour, as in the prototype).
  const stepIdx = plan && !tour ? plan.stops.findIndex((s) => !s.done && s.buildingId === b.id) : -1;
  const open = (r: string) => p.onEnterRoom?.(r);
  const desks = p.staffDesks ? desksForBuilding(p.staffDesks, b.id, audience) : undefined;
  const desk = desks?.find((d) => d.on_duty) ?? null;
  const wall = useRoomWall(b.id, audience, data, plan ? plan.stops : null);
  // WP-6: the live building's main action joins the live room (audio and Q&A), as the prototype's per-state CTA
  const live = p.live ?? null;
  const liveRoute = live ? roomRoute(live.b) : null;
  const liveCta = live && liveRoute && live.state !== 'replay' ? { label: live.state === 'live' ? 'Join the live room · audio & Q&A' : 'Join the live room', route: liveRoute } : null;
  return (
    <>
      <CampusInside building={b} buildingName={buildingName(b, wp)} audience={audience} access={access}
        presence={p.presenceError ? undefined : p.presence} onAir={p.onAir} reduceMotion={p.reduceMotion} onStepOutside={p.onClose} going={p.going}
        onPickPerson={p.onPickPerson} desk={desk} onDesk={desk ? (at) => openStaffCard(desk.id, at) : undefined} wall={wall} workplace={wp} fromDoor={p.fromDoor}
        onGame={p.onEnterRoom ? (g) => open(`/portal/game-room?game=${g}`) : undefined} />
      <BuildingCard key={b.id} building={b} access={access} workplaceNames={wp} onClose={p.onClose} onNavigate={p.onNavigate} audience={audience}
        kicker={live && !isStop ? `${LIVE_STATES[live.state].chip} · Colaberry Live` : kickerOf({ zone: zoneLabelOf(b, wp), access, audience, tour: isStop ? { name: tour!.model.name, n: tourIdx + 1, of: tour!.model.stops.length } : null })}
        line={subOf(b, audience, wp)} onElsewhere={p.onElsewhere} urgent={liveCta ?? urgentAt(b.id, data, now)} flashRoute={p.flashRoute}
        heroClass={live ? `is-live is-${live.state}` : undefined} stage={live ? <LiveStage live={live} audience={audience} enrollTo={enrollCta(b).to} /> : undefined}
        happening={happeningAt(b.id, { onAir: p.onAir, count: p.count, presenceError: p.presenceError, facts: factsAt(b.id, data, p.look, now),
          live: live ? { state: live.state, title: live.b.title, sub: liveSub(live.b, live.now) } : null })}
        onEnterRoom={p.onEnterRoom} desks={desks}
        tourTop={isStop ? <TourStopCard tour={tour!.model} index={tourIdx} /> : undefined}
        planBox={stepIdx >= 0 ? <PlanBox stop={plan!.stops[stepIdx]} index={stepIdx} total={plan!.stops.length} onOpen={open} onDone={plan!.onComplete} /> : undefined}
        tourNav={tour ? <TourNav tour={tour.model} index={tourIdx} hereStop={isStop} nextName={nextB ? buildingName(nextB, wp) : null}
          onNext={tour.onNext} onBack={tour.onBack} onEnd={tour.onEnd} /> : undefined}
        children={b.id === 'gate' && p.isExplorer ? <ExplorerPath onNavigate={p.onNavigate}
          model={explorerPath(p.buildings, p.accessOf, wp, !!p.staffDesks?.some((d) => d.id === 'maya' && d.on_duty))} /> : undefined}
        whoIsHere={p.presence === undefined && !p.presenceError ? undefined
          : { presence: p.presence?.[b.id], error: p.presenceError, loading: p.presence === null && !p.presenceError, onPick: p.onPickPerson, onMore: p.onMore }} />
    </>
  );
}

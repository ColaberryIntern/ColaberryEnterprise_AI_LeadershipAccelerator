import React from 'react';
import type { CampusWorldProps } from './CampusWorld';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { useCampusOnAir } from './campusOnAir';
import { routeBuildings } from './campusPlan';
import { tourFor } from './tourSteps';
import type { Tour } from './tourSteps';
import { explorerPath } from './campusPath';
import CampusTour from './CampusTour';
import CampusTourEnd from './CampusTourEnd';
import MyLook from './MyLook';

/**
 * Everything CampusWorld needs from the campus state, assembled once (C11b). The map overlay (CampusLayers) and the campus home
 * (/portal/campus) render the same world from it, so the tour, the locker, the desks, the plan route and the on-air buildings can
 * never differ between the two. `onExit` / `onNavigate` are the caller's: the overlay closes itself, the home stays.
 */
export interface CampusWorldModel {
  props: CampusWorldProps;
  tour: Tour | null;
  /** The tour step on screen (null when no tour is running). */
  touring: number | null;
}

export function useCampusWorldProps(onExit: () => void, onNavigate: () => void, initialTarget: CampusWorldProps['initialTarget'] = null): CampusWorldModel {
  const { settings, presence, presenceError, enterThroughDoor, staffDesks, personCard, openPersonCard, closePersonCard, planStops,
    tourIndex, setTourIndex, endTour, look, lookError, saveLook, lockerOpen, closeLocker } = useCampus();
  const { audience, hasFullAccess, buildings, accessOf, isExplorer } = useCampusView();
  const { buildings: onAir } = useCampusOnAir();
  const route = planStops ? routeBuildings(planStops) : undefined;
  // C7: the guided tour for THIS viewer's campus (null for staff). The end card walks to the Main Gate where it exists (Maya's desk).
  const tour = tourFor(audience, buildings, accessOf, settings.workplaceNames);
  const touring = tour && tourIndex !== null ? Math.min(tourIndex, tour.stops.length) : null;
  const tourTarget = tour && touring !== null
    ? (touring < tour.stops.length ? tour.stops[touring].buildingId : (buildings.some((x) => x.id === 'gate') ? 'gate' : tour.stops[tour.stops.length - 1]?.buildingId ?? null))
    : null;
  const props: CampusWorldProps = {
    buildings, audience, hasFullAccess, accessOf, isExplorer, workplaceNames: settings.workplaceNames, reduceMotion: settings.reduceMotion,
    initialTarget, onExit, onNavigate, presence, presenceError, staffDesks, personCard, onOpenPerson: openPersonCard, onClosePerson: closePersonCard,
    onAir, route, ownGear: look?.equipped,
    // The path's "Ask Maya at her desk below" line is for the Main Gate card; the tour card has no desk below it, so it is off here.
    tour: tour && touring !== null ? { target: tourTarget, onEnd: endTour, card: <CampusTour tour={tour} index={touring} onIndex={setTourIndex} onEnd={endTour}
      explorerEnd={<CampusTourEnd pathModel={explorerPath(buildings, accessOf, settings.workplaceNames, false)} onNavigate={onNavigate} />} /> } : undefined,
    panel: lockerOpen ? { onClose: closeLocker, card: <MyLook look={look} lookError={lookError} onSave={saveLook} onClose={closeLocker} /> } : undefined,
    onEnterRoom: (r, from) => enterThroughDoor(r, from ? { left: from.left, top: from.top, width: from.width, height: from.height } : null),
  };
  return { props, tour, touring };
}

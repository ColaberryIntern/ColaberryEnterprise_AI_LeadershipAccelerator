import { useEffect, useRef } from 'react';
import type { BuildingId } from './campusMap';
import type { Tour } from './tourSteps';
import type { ArrivalTour } from './ArrivalPanel';

/**
 * The guided tour on the map (WP-2; the prototype's startTour / finishTour / data-tour clicks): each step walks to its stop, whose
 * arrival panel then carries the tour card and nav. Next walks on (or finishes on the last stop), "Back to the tour" walks back to
 * the current stop after a detour, End tour pauses it (CampusTour state keeps the stop for Resume). Ending or finishing closes the
 * panel, so the map recenters on the whole campus (WP-1).
 */
export interface WorldTour { model: Tour; index: number; onIndex: (i: number) => void; onEnd: () => void; onFinish: () => void }

export function useWorldTour(tour: WorldTour | undefined, closeCard: () => void, walk: (id: BuildingId) => void, reveal: (id: BuildingId) => void): {
  arrival: ArrivalTour | null; target: BuildingId | null;
} {
  const target = tour ? tour.model.stops[Math.min(tour.index, tour.model.stops.length - 1)]?.buildingId ?? null : null;
  const fns = useRef({ closeCard, walk, reveal });
  fns.current = { closeCard, walk, reveal };
  // A new stop: close the panel you are in and walk to the stop (the panel opens on arrival).
  useEffect(() => {
    if (!target) return;
    fns.current.closeCard(); fns.current.reveal(target); fns.current.walk(target);
  }, [target]);
  if (!tour || !target) return { arrival: null, target: null };
  const last = tour.index >= tour.model.stops.length - 1;
  return {
    target,
    arrival: {
      model: tour.model,
      index: Math.min(tour.index, tour.model.stops.length - 1),
      onNext: () => { if (last) { closeCard(); tour.onFinish(); } else tour.onIndex(tour.index + 1); },
      onBack: () => walk(target),
      onEnd: () => { closeCard(); tour.onEnd(); },
    },
  };
}

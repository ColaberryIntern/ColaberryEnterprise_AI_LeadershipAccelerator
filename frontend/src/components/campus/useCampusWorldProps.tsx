import React, { useCallback, useState } from 'react';
import type { CampusWorldProps } from './CampusWorld';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { useCampusOnAir } from './campusOnAir';
import { tourFor } from './tourSteps';
import type { Tour } from './tourSteps';
import { explorerPath } from './campusPath';
import MyLook from './MyLook';
import UnlockSheet from './UnlockSheet';
import { cheer } from './campusCheerBus';
import { stopDetail } from './campusPlan';
import type { PlanStop } from './campusPlan';
import { buildingName } from './campusMap';

/**
 * Everything CampusWorld needs from the campus state, assembled once (C11b). The campus home renders the world from it, so the
 * tour, the locker, the desks, the plan and the on-air buildings come from one place. `onExit` / `onNavigate` are the caller's.
 *
 * WP-2: the tour runs inside the arrival panels (CampusWorld + useWorldTour); finishing marks it taken, and an Explorer's finish
 * opens the unlock sheet (`extra`, rendered by the caller) with a short word from the welcome desk. The plan is drawn and boxed
 * only when no tour is running and nothing is on air (the prototype hides it then).
 */
export interface CampusWorldModel {
  props: CampusWorldProps;
  tour: Tour | null;
  /** The tour step on screen (null when no tour is running). */
  touring: number | null;
  /** The Explorer's unlock sheet, while open. */
  extra: React.ReactNode;
}

export function useCampusWorldProps(onExit: () => void, onNavigate: () => void, initialTarget: CampusWorldProps['initialTarget'] = null): CampusWorldModel {
  const { settings, presence, presenceError, enterThroughDoor, staffDesks, personCard, openPersonCard, closePersonCard, planStops, planMinutes,
    completePlanStop, tourIndex, setTourIndex, endTour, finishTour, look, lookError, saveLook, lockerOpen, closeLocker, openMap } = useCampus();
  const { audience, hasFullAccess, buildings, accessOf, isExplorer } = useCampusView();
  const { buildings: onAir } = useCampusOnAir();
  // C7: the guided tour for THIS viewer's campus (null for staff).
  const tour = tourFor(audience, buildings, accessOf, settings.workplaceNames);
  const touring = tour && tourIndex !== null ? Math.min(tourIndex, tour.stops.length - 1) : null;
  const [unlock, setUnlock] = useState(false);
  const onFinish = useCallback(() => {
    finishTour();
    if (audience !== 'explorer') return;
    setUnlock(true);
    cheer({ big: '👋', title: 'Maya · welcome desk', detail: 'You made it round the whole campus. Ask me anything about enrolling.', ms: 5200 });
  }, [finishTour, audience]);
  // Mark done (the prototype's completePlan): the points cheer, then "Next: <step> · <building> [Go]" (Go walks there), or all done.
  const onComplete = useCallback(async (s: PlanStop) => {
    const r = await completePlanStop(s);
    if (!r.ok) return r;
    cheer(r.points > 0 ? { title: `+${r.points} pts`, detail: s.title, ms: 2600 } : { title: '✓ Done', detail: s.title, ms: 2200 });
    const nx = (planStops ?? []).find((x) => !x.done && x.key !== s.key && x.buildingId);
    const nb = nx ? buildings.find((b) => b.id === nx.buildingId) : undefined;
    if (nx && nb) cheer({ big: '🗺', title: `Next: ${nx.title}`, detail: [buildingName(nb, settings.workplaceNames), stopDetail(nx)].filter(Boolean).join(' · '), action: { label: 'Go', run: () => openMap(nb.id) }, ms: 4600 });
    else cheer({ big: '🎉', title: 'All done for today', detail: 'Nice work.', ms: 3600 });
    return r;
  }, [completePlanStop, planStops, buildings, settings.workplaceNames, openMap]);
  const props: CampusWorldProps = {
    buildings, audience, hasFullAccess, accessOf, isExplorer, workplaceNames: settings.workplaceNames, reduceMotion: settings.reduceMotion,
    initialTarget, onExit, onNavigate, presence, presenceError, staffDesks, personCard, onOpenPerson: openPersonCard, onClosePerson: closePersonCard,
    onAir, ownGear: look?.equipped,
    plan: planStops && touring === null && onAir.size === 0 ? { stops: planStops, onComplete } : null,
    look: { points: look?.points ?? null, rung: look?.rung_name || null, planMinutes, stops: planStops },
    tour: tour && touring !== null ? { model: tour, index: touring, onIndex: setTourIndex, onEnd: endTour, onFinish } : undefined,
    panel: lockerOpen ? { onClose: closeLocker, card: <MyLook look={look} lookError={lookError} onSave={saveLook} onClose={closeLocker} /> } : undefined,
    onEnterRoom: (r, from) => enterThroughDoor(r, from ? { left: from.left, top: from.top, width: from.width, height: from.height } : null),
  };
  const extra = unlock
    ? <UnlockSheet pathModel={explorerPath(buildings, accessOf, settings.workplaceNames, false)} onNavigate={onNavigate} onClose={() => setUnlock(false)} />
    : null;
  return { props, tour, touring, extra };
}

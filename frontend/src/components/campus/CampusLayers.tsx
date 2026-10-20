import React, { useEffect, useRef } from 'react';
import CampusWorld from './CampusWorld';
import CampusDoorTransition from './CampusDoorTransition';
import CampusDmToast from './CampusDmToast';
import { useCampusOnAir } from './campusOnAir';
import CampusTour from './CampusTour';
import CampusTourEnd from './CampusTourEnd';
import { tourFor } from './tourSteps';
import { explorerPath } from './campusPath';
import MyLook from './MyLook';
import CampusMapBarActions from './CampusMapBarActions';
import { trapTab } from './focusTrap';
import { useReturnFocus } from './useReturnFocus';
import CampusListView from './CampusListView';
import './campusLook.css';
import './campusTour.css';
import { routeBuildings } from './campusPlan';
import './campusPeople.css';
import './campusAudiences.css';
import './campus.css';
import './campusLive.css';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';

/**
 * The full-screen campus layers (Campus C2): the walkable map and the list view. Rendered once
 * by PortalShell when the campus is active, opened from the side nav, the phone tab bar or the
 * list view. Both are dialogs: focus moves in on open and returns to the opener on close. The list view lives in
 * CampusListView.tsx (C11), re-exported here for existing callers.
 */
export { CampusListView };
export function CampusMapOverlay(): React.ReactElement | null {
  const { layer, mapFocus, settings, closeLayer, openList, presence, presenceError, enterThroughDoor,
    staffDesks, personCard, openPersonCard, closePersonCard, planStops, tourIndex, startTour, setTourIndex, endTour, look, lookError, saveLook, lockerOpen, openLocker, closeLocker } = useCampus();
  const { audience, hasFullAccess, buildings, accessOf, isExplorer } = useCampusView();
  const { buildings: onAir } = useCampusOnAir();
  const route = planStops ? routeBuildings(planStops) : undefined;
  // C7: the guided tour for THIS viewer's campus (null for staff). The end card walks to the Main Gate where it exists (Maya's desk).
  const tour = tourFor(audience, buildings, accessOf, settings.workplaceNames);
  const touring = tour && tourIndex !== null ? Math.min(tourIndex, tour.stops.length) : null;
  const tourTarget = tour && touring !== null
    ? (touring < tour.stops.length ? tour.stops[touring].buildingId : (buildings.some((x) => x.id === 'gate') ? 'gate' : tour.stops[tour.stops.length - 1]?.buildingId ?? null))
    : null;
  // The path's "Ask Maya at her desk below" line is for the Main Gate card; the tour card has no desk below it, so it is off here.
  const open = layer === 'map';
  const dialog = useRef<HTMLDivElement | null>(null);
  useReturnFocus(open);
  // C7: opening straight into a tour leaves focus on the tour card's heading (CampusTour focuses it; this parent effect runs after).
  const touringRef = useRef(false);
  touringRef.current = tourIndex !== null || lockerOpen; // C9: the locker focuses its own heading too
  useEffect(() => { if (open && !touringRef.current) dialog.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="cm-layer" role="dialog" aria-modal="true" aria-label="Campus map" tabIndex={-1} ref={dialog} data-testid="cm-overlay"
      onKeyDown={(e) => { if (e.key === 'Escape') closeLayer(); else trapTab(e); }}>
      <div className="cm-layer-bar">
        <strong>Colaberry Campus</strong>
        <span className="cm-layer-hint">Pick a building, or press Tab to move between them.</span>
        {presenceError && <span className="cm-layer-warn" role="status" data-testid="cm-presence-broken">We can't load who's online right now.</span>}
        <CampusMapBarActions showTour={!!tour && touring === null} showLook={!lockerOpen && touring === null}
          onTour={startTour} onLook={openLocker} onList={openList} />
        <button type="button" className="cm-btn is-secondary" onClick={closeLayer} aria-label="Close campus map">Close</button>
      </div>
      <CampusWorld buildings={buildings} audience={audience} hasFullAccess={hasFullAccess} accessOf={accessOf} isExplorer={isExplorer} workplaceNames={settings.workplaceNames}
        reduceMotion={settings.reduceMotion} initialTarget={mapFocus} onExit={closeLayer} onNavigate={closeLayer}
        presence={presence} presenceError={presenceError}
        staffDesks={staffDesks} personCard={personCard} onOpenPerson={openPersonCard} onClosePerson={closePersonCard} onAir={onAir} route={route}
        tour={tour && touring !== null ? { target: tourTarget, onEnd: endTour, card: <CampusTour tour={tour} index={touring} onIndex={setTourIndex} onEnd={endTour}
          explorerEnd={<CampusTourEnd pathModel={explorerPath(buildings, accessOf, settings.workplaceNames, false)} onNavigate={closeLayer} />} /> } : undefined}
        panel={lockerOpen ? { onClose: closeLocker, card: <MyLook look={look} lookError={lookError} onSave={saveLook} onClose={closeLocker} /> } : undefined}
        ownGear={look?.equipped}
        onEnterRoom={(route, from) => enterThroughDoor(route, from ? { left: from.left, top: from.top, width: from.width, height: from.height } : null)} />
    </div>
  );
}

export default function CampusLayers(): React.ReactElement {
  return <><CampusMapOverlay /><CampusListView /><CampusDoorTransition /><CampusDmToast /></>;
}

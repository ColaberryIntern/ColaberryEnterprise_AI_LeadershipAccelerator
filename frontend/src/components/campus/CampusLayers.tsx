import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CampusWorld from './CampusWorld';
import CampusDoorTransition from './CampusDoorTransition';
import CampusDmToast from './CampusDmToast';
import { useCampusOnAir } from './campusOnAir';
import CampusTour from './CampusTour';
import CampusTourEnd from './CampusTourEnd';
import { tourFor } from './tourSteps';
import { explorerPath } from './campusPath';
import MyLook from './MyLook';
import './campusLook.css';
import './campusTour.css';
import { routeBuildings } from './campusPlan';
import './campusPeople.css';
import './campusAudiences.css';
import './campus.css';
import './campusLive.css';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { accessLabel } from './campusAccess';
import { buildingName } from './campusMap';

/**
 * The full-screen campus layers (Campus C2): the walkable map and the list view. Rendered once
 * by PortalShell when the campus is active, opened from the side nav, the phone tab bar or the
 * list view. Both are dialogs: focus moves in on open and returns to the opener on close.
 */
// Declared before the dialog's own focus effect, so it records the opener before focus moves in.
function useReturnFocus(open: boolean): void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) opener.current = document.activeElement as HTMLElement | null;
    if (!open && wasOpen.current) opener.current?.focus?.();
    wasOpen.current = open;
  }, [open]);
}

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
      onKeyDown={(e) => { if (e.key === 'Escape') closeLayer(); }}>
      <div className="cm-layer-bar">
        <strong>Colaberry Campus</strong>
        <span className="cm-layer-hint">Pick a building, or press Tab to move between them.</span>
        {presenceError && <span className="cm-layer-warn" role="status" data-testid="cm-presence-broken">We can't load who's online right now.</span>}
        {tour && touring === null && <button type="button" className="cm-link" onClick={startTour} data-testid="cm-tour-start-bar">Take the tour</button>}
        {!lockerOpen && touring === null && <button type="button" className="cm-link" onClick={openLocker} data-testid="cm-look-open-bar">My look</button>}
        <button type="button" className="cm-link" onClick={openList}>List view</button>
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

export function CampusListView(): React.ReactElement | null {
  const { layer, settings, closeLayer } = useCampus();
  const { buildings, accessOf } = useCampusView();
  const [q, setQ] = useState('');
  const open = layer === 'list';
  const input = useRef<HTMLInputElement | null>(null);
  useReturnFocus(open);
  useEffect(() => { if (open) { setQ(''); input.current?.focus(); } }, [open]);
  if (!open) return null;
  const needle = q.trim().toLowerCase();
  const shown = buildings.filter((b) => b.id !== 'gate').map((b) => {
    const name = buildingName(b, settings.workplaceNames);
    const rooms = b.rooms.filter((r) => !needle || name.toLowerCase().includes(needle) || r.label.toLowerCase().includes(needle));
    return { b, name, rooms };
  }).filter((x) => !needle || x.name.toLowerCase().includes(needle) || x.rooms.length > 0);
  return (
    <div className="cm-layer cm-list" role="dialog" aria-modal="true" aria-label="Campus directory" data-testid="cm-list"
      onKeyDown={(e) => { if (e.key === 'Escape') closeLayer(); }}>
      <div className="cm-layer-bar">
        <strong>Campus directory</strong>
        <input ref={input} className="cm-filter" placeholder="Filter buildings and rooms" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter buildings and rooms" />
        <button type="button" className="cm-btn is-secondary" onClick={closeLayer} aria-label="Close campus directory">Close</button>
      </div>
      <div className="cm-list-body">
        {shown.map(({ b, name, rooms }) => {
          const chip = accessLabel(accessOf(b));
          return (
            <section key={b.id} className="cm-list-bld" data-building={b.id}>
              <h3>{name}{chip && <small className="cm-nav-chip">{chip}</small>}</h3>
              <ul>
                {rooms.map((r) => (
                  <li key={r.route}>
                    {r.planned ? <span aria-disabled="true">{r.label} (opening soon)</span>
                      : <Link to={r.route} onClick={closeLayer}>{r.label}</Link>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {shown.length === 0 && <p className="cm-empty">No building or room matches "{q}".</p>}
      </div>
    </div>
  );
}

export default function CampusLayers(): React.ReactElement {
  return <><CampusMapOverlay /><CampusListView /><CampusDoorTransition /><CampusDmToast /></>;
}

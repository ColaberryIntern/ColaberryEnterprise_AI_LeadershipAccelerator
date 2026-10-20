import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { useCampusOnAir } from './campusOnAir';
import { accessLabel } from './campusAccess';
import { buildingName, roomLabel } from './campusMap';
import type { CampusBuilding } from './campusMap';
import { routeBuildings } from './campusPlan';
import { desksForBuilding } from './campusPeople';
import { explorerPath } from './campusPath';
import { tourFor } from './tourSteps';
import { useIsMgmt } from './campusMgmt';
import WhoIsHere from './WhoIsHere';
import StaffDesk from './StaffDesk';
import ExplorerPath from './ExplorerPath';
import AdminLink from './AdminLink';
import CampusSettingsPanel from './CampusSettingsPanel';
import { trapTab } from './focusTrap';
import { useReturnFocus } from './useReturnFocus';

/**
 * The campus as a list (C2; C11 parity): everything the map tells you about a building, without the map. For each building:
 * its name and access, on air now, its stop number on today's plan, who is here (count and named people), the AI staff
 * desks, and its rooms (admin rooms by the same rule as the card). The Main Gate is listed too, with the Explorer's path to
 * enrolling. The bar offers the tour, My look and Settings, as the map's bar does. A filter narrows buildings and rooms and
 * announces the count.
 */
export default function CampusListView(): React.ReactElement | null {
  const { layer, settings, closeLayer, presence, presenceError, staffDesks, planStops, startTour, openLocker } = useCampus();
  const { buildings, accessOf, audience, isExplorer } = useCampusView();
  const { buildings: onAir } = useCampusOnAir();
  const isMgmt = useIsMgmt();
  const [q, setQ] = useState('');
  const open = layer === 'list';
  const input = useRef<HTMLInputElement | null>(null);
  useReturnFocus(open);
  useEffect(() => { if (open) { setQ(''); input.current?.focus(); } }, [open]);
  if (!open) return null;

  const wp = settings.workplaceNames;
  const route = planStops ? routeBuildings(planStops) : [];
  const hasTour = !!tourFor(audience, buildings, accessOf, wp);
  const needle = q.trim().toLowerCase();
  const shown = buildings.map((b) => {
    const name = buildingName(b, wp);
    const rooms = b.rooms.filter((r) => !needle || name.toLowerCase().includes(needle) || roomLabel(r, wp).toLowerCase().includes(needle));
    return { b, name, rooms };
  }).filter((x) => !needle || x.name.toLowerCase().includes(needle) || x.rooms.length > 0);

  const facts = (b: CampusBuilding) => {
    const stop = route.indexOf(b.id);
    return (
      <>
        {onAir.has(b.id) && <p className="cm-list-fact is-live" data-testid={`cm-list-onair-${b.id}`}>On air now</p>}
        {stop >= 0 && <p className="cm-list-fact" data-testid={`cm-list-stop-${b.id}`}>Today's plan: stop {stop + 1}</p>}
      </>
    );
  };

  return (
    <div className="cm-layer cm-list" role="dialog" aria-modal="true" aria-label="Campus directory" data-testid="cm-list" tabIndex={-1}
      onKeyDown={(e) => { if (e.key === 'Escape') closeLayer(); else trapTab(e); }}>
      <div className="cm-layer-bar">
        <strong>Campus directory</strong>
        <input ref={input} className="cm-filter" placeholder="Filter buildings and rooms" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter buildings and rooms" />
        {hasTour && <button type="button" className="cm-link" onClick={startTour} data-testid="cm-list-tour">Take the tour</button>}
        <button type="button" className="cm-link" onClick={openLocker} data-testid="cm-list-look">My look</button>
        <CampusSettingsPanel variant="bar" />
        <button type="button" className="cm-btn is-secondary" onClick={closeLayer} aria-label="Close campus directory">Close</button>
      </div>
      {presenceError && <p className="cm-layer-warn cm-list-warn" role="status">We can't load who's online right now.</p>}
      <div className="cm-list-body">
        {shown.map(({ b, name, rooms }) => {
          const chip = accessLabel(accessOf(b));
          const desks = desksForBuilding(staffDesks, b.id, audience);
          return (
            <section key={b.id} className={`cm-list-bld cm-b-${b.id}`} data-building={b.id} aria-labelledby={`cm-list-h-${b.id}`}>
              <h2 id={`cm-list-h-${b.id}`}>{name}{chip && <small className="cm-nav-chip">{chip}</small>}</h2>
              {facts(b)}
              <WhoIsHere presence={presence?.[b.id]} error={presenceError} loading={presence === null && !presenceError} />
              {rooms.length > 0 && (
                <ul>
                  {rooms.map((r) => (
                    <li key={r.route}>
                      {r.admin ? <AdminLink label={roomLabel(r, wp)} route={r.route} className="cm-list-room" isMgmt={isMgmt} />
                        : r.planned ? <span aria-disabled="true">{roomLabel(r, wp)} (opening soon)</span>
                          : <Link to={r.route} onClick={closeLayer}>{roomLabel(r, wp)}</Link>}
                    </li>
                  ))}
                </ul>
              )}
              {desks.length > 0 && <div className="cm-desks">{desks.map((d) => <StaffDesk key={d.id} desk={d} onMessaged={closeLayer} />)}</div>}
              {b.id === 'gate' && isExplorer && (
                <ExplorerPath onNavigate={closeLayer} model={explorerPath(buildings, accessOf, wp, desks.some((d) => d.id === 'maya' && d.on_duty))} />
              )}
            </section>
          );
        })}
        {shown.length === 0 && <p className="cm-empty">No building or room matches "{q}".</p>}
        {/* C11: the filter result is announced, as Where to already does. */}
        <span className="cm-sr-only" aria-live="polite" data-testid="cm-list-count">
          {needle ? `${shown.length} ${shown.length === 1 ? 'building' : 'buildings'} match` : ''}
        </span>
      </div>
    </div>
  );
}

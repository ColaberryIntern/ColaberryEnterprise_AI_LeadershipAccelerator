import React from 'react';
import { Link } from 'react-router-dom';
import CampusMiniMap from './CampusMiniMap';
import './campus.css';
import './campusPageChrome.css';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { accessLabel } from './campusAccess';
import { buildingForPath, buildingName, roomLabel } from './campusMap';
import AdminLink from './AdminLink';
import { useIsMgmt } from './campusMgmt';

/**
 * The campus in the portal's left column (Campus C2), in place of nav.te-nav when the campus
 * is active: a compact map (pick a building to open the full map there), the rooms of the building you are in, and every
 * building as a one-click link to its main page.
 *
 * C16 (round 3 §2.4): nothing else. "Open campus map" is the location bar's Campus map and the card's Full map; the tour is the
 * rail's; My look and the classic menu are in the Me panel; the list view is the home's. An Explorer keeps "Your path" here
 * (it used to sit in the old banner).
 */
export default function CampusNav({ active }: { active: string }): React.ReactElement {
  const { settings, openMap } = useCampus();
  const { buildings, accessOf, isExplorer } = useCampusView();
  const here = buildingForPath(active);
  const isMgmt = useIsMgmt();
  return (
    <nav className="cm-nav" aria-label="Campus">
      <div className="cm-nav-map">
        {/* WP-3: the prototype's side map (campusMapSVG): tinted blocks with icons, locked grey, where you are outlined with a pin */}
        <CampusMiniMap variant="side" buildings={buildings} here={here ? here.id : null} accessOf={accessOf} workplaceNames={settings.workplaceNames}
          reduceMotion={settings.reduceMotion} onPick={(id) => openMap(id)} />
        <div className="cm-nav-map-cap"><span aria-hidden="true">Tap a building to walk there</span>
          <button type="button" className="cm-link" onClick={() => openMap()} data-testid="cm-open-map">Full map</button></div>
      </div>
      {isExplorer && buildings.some((b) => b.id === 'gate') && (
        <button type="button" className="cm-link cm-nav-tour" onClick={() => openMap('gate')} data-testid="cm-your-path">Your path to enrolling</button>
      )}
      {/* C11b: the rooms of the building you are in (the prototype's left side on a page) */}
      {here && here.rooms.some((r) => !r.admin && !r.planned) && (
        <section className="cm-nav-rooms" aria-label={`In ${buildingName(here, settings.workplaceNames)}`} data-testid="cm-page-side">
          <div className="grp">In {buildingName(here, settings.workplaceNames)}</div>
          <ul className="cm-nav-list">
            {here.rooms.filter((r) => !r.admin && !r.planned).map((r) => (
              <li key={r.route}><Link className={`cm-nav-item${active === r.route ? ' active' : ''}`} to={r.route} aria-current={active === r.route ? 'page' : undefined}>
                <span className="lb">{roomLabel(r, settings.workplaceNames)}</span></Link></li>
            ))}
          </ul>
        </section>
      )}
      <div className="grp">Buildings</div>
      <ul className="cm-nav-list">
        {buildings.filter((b) => b.id !== 'gate').map((b) => {
          const chip = accessLabel(accessOf(b));
          const planned = b.rooms.find((r) => r.route === b.primary.route)?.planned;
          const name = buildingName(b, settings.workplaceNames);
          const isHere = here?.id === b.id;
          const inner = <><span className={`cm-dot cm-b-${b.id}`} aria-hidden="true" /><span className="lb">{name}</span>{chip && <small className="cm-nav-chip">{chip}</small>}</>;
          return (
            <li key={b.id}>
              {/* C11: an admin building (the Staff Office) follows the card's rule: a new tab through the bridge, or disabled. */}
              {b.primary.admin
                ? <AdminLink label={name} route={b.primary.route} className="cm-nav-item" isMgmt={isMgmt}>{inner}</AdminLink>
                : planned
                ? <span className="cm-nav-item is-disabled" aria-disabled="true">{inner}<small className="cm-nav-chip">Soon</small></span>
                : <Link className={`cm-nav-item${isHere ? ' active' : ''}`} to={b.primary.route} aria-current={isHere ? 'page' : undefined}>{inner}</Link>}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

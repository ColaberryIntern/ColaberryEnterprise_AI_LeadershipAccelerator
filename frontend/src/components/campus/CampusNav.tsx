import React from 'react';
import { Link } from 'react-router-dom';
import CampusWorldMap from './CampusWorldMap';
import './campus.css';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { accessLabel } from './campusAccess';
import { buildingForPath, buildingName } from './campusMap';

/**
 * The campus in the portal's left column (Campus C2), in place of nav.te-nav when the campus
 * is active: a compact map (pick a building to open the full map there), every building as a
 * one-click link to its main page, and the way back to the classic menu.
 */
export default function CampusNav({ active }: { active: string }): React.ReactElement {
  const { settings, openMap, openList, updateSettings, presence, presenceError } = useCampus();
  const { buildings, accessOf } = useCampusView();
  const here = buildingForPath(active);
  const counts: Record<string, number> = {};
  if (presence && !presenceError) for (const [id, a] of Object.entries(presence)) counts[id] = a.count;
  return (
    <nav className="cm-nav" aria-label="Campus">
      <div className="cm-nav-map">
        <CampusWorldMap buildings={buildings} accessOf={accessOf}
          workplaceNames={settings.workplaceNames} reduceMotion={settings.reduceMotion} compact onArrive={(id) => openMap(id)} counts={counts} />
      </div>
      <button type="button" className="cm-btn cm-nav-open" onClick={() => openMap()} data-testid="cm-open-map">Open campus map</button>
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
              {planned
                ? <span className="cm-nav-item is-disabled" aria-disabled="true">{inner}<small className="cm-nav-chip">Soon</small></span>
                : <Link className={`cm-nav-item${isHere ? ' active' : ''}`} to={b.primary.route} aria-current={isHere ? 'page' : undefined}>{inner}</Link>}
            </li>
          );
        })}
      </ul>
      <div className="cm-nav-foot">
        <button type="button" className="cm-link" onClick={openList}>List view</button>
        <button type="button" className="cm-link" onClick={() => updateSettings({ nav: 'classic' })} data-testid="cm-use-classic">Use classic menu</button>
      </div>
    </nav>
  );
}

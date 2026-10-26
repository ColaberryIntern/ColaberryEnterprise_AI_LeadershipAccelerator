import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCampus } from '../../../components/campus/CampusContext';
import { useCampusView } from '../../../components/campus/useCampusView';
import { buildingName } from '../../../components/campus/campusMap';
import type { CampusBuilding, ExplorerAccess } from '../../../components/campus/campusMap';
import AskMaya from '../../../components/campus/AskMaya';

/**
 * Today as the Explorer's home base (C54, v13 T6): three small additions to the Today page, for an Explorer on the campus only
 * (members and the classic portal see Today unchanged).
 *  - the kicker above the greeting: EXPLORER - YOUR HOME BASE;
 *  - "Your explorer pass": what is open to them and what they can peek inside, from the same access table the campus draws its
 *    badges with (campusAccess via useCampusView, never a hard-coded list), and Ask Maya about enrolling (her chat, as at her desk,
 *    while her desk is on duty);
 *  - "Explore the campus": Take the tour opens the campus and starts the Explorer tour.
 */
export function useExplorerHomeBase(): boolean {
  const { active } = useCampus();
  const { audience } = useCampusView();
  return active && audience === 'explorer';
}

export function ExplorerKicker(): React.ReactElement {
  return <div className="crumb te-explorer-kicker" data-testid="te-explorer-kicker">EXPLORER &middot; YOUR HOME BASE</div>;
}

/** Pure: the pass's two lists (the Main Gate is the way in, not a place on the pass). */
export function passLists(buildings: CampusBuilding[], accessOf: (b: CampusBuilding) => ExplorerAccess, workplace: boolean): { open: string[]; peek: string[] } {
  const places = buildings.filter((b) => b.id !== 'gate');
  return {
    open: places.filter((b) => accessOf(b) === 'open').map((b) => buildingName(b, workplace)),
    peek: places.filter((b) => accessOf(b) !== 'open').map((b) => buildingName(b, workplace)),
  };
}

export function ExplorerRailCards(): React.ReactElement {
  const navigate = useNavigate();
  const { settings, staffDesks, startTour } = useCampus();
  const { buildings, accessOf } = useCampusView();
  const { open, peek } = passLists(buildings, accessOf, settings.workplaceNames);
  const mayaOn = !!staffDesks?.some((d) => d.id === 'maya' && d.on_duty);
  const tour = () => { navigate('/portal/campus'); startTour(); };
  return (
    <>
      <div className="te-card te-scard te-explorer-pass" data-testid="te-explorer-pass">
        <h3><span aria-hidden="true">🎟</span> Your explorer pass</h3>
        {open.length > 0 && <><div className="te-stat"><span className="lab">Open to you</span></div><p className="te-muted" data-testid="te-pass-open">{open.join(' · ')}</p></>}
        {peek.length > 0 && <><div className="te-stat"><span className="lab">Peek inside</span></div><p className="te-muted" data-testid="te-pass-peek">{peek.join(' · ')}</p></>}
        {mayaOn && <AskMaya className="te-btn berry sm te-pass-maya" />}
      </div>
      <div className="te-card te-scard" data-testid="te-explore-campus">
        <h3><span aria-hidden="true">🧭</span> Explore the campus</h3>
        <p className="te-muted">A 3-minute walk through what&rsquo;s open to you and what unlocks when you enroll.</p>
        <button type="button" className="te-btn ghost sm te-pass-tour" onClick={tour} data-testid="te-take-tour">Take the tour</button>
      </div>
    </>
  );
}

import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CampusDoorTransition from './CampusDoorTransition';
import CampusDmToast from './CampusDmToast';
import CampusListView from './CampusListView';
import BookCallHost from './admissions/BookCallHost';
import MeetingSheetHost from './hallway/MeetingSheet';
import CommunityBoardHost from './board/CommunityBoard';
import CabinetHost from './games/CabinetModal'; // C36: the room's cabinets open the play window on any page
import OrderSheetHost from './chow/OrderSheet'; // C39: Chow Hall's order sheet
import './campusLook.css';
import './campusTour.css';
import './campusPeople.css';
import './campusAudiences.css';
import './campus.css';
import './campusLive.css';
import { useCampus } from './CampusContext';

/**
 * The campus layers a page mounts (Campus C2): the list view, the door transition and the message toast. Rendered once by
 * PortalShell (and CampusScopedChrome) when the campus is active. The list view lives in CampusListView.tsx (C11), re-exported
 * here for existing callers.
 *
 * WP-1, one map: no second map is drawn over a page any more. Every "go to the map" (the mini-map, the trail, Where to, the tab
 * bar, a tour start, My look, Step outside) goes to the campus home, /portal/campus, where the same map, top bar and side panel
 * always are. The home reads the request (which building; walk there or stand inside it) from the campus state and acknowledges it.
 */
export const CAMPUS_HOME = '/portal/campus';
export { CampusListView };

/** Sends a pending map request to the campus home. Renders nothing. */
export function CampusMapRoute(): null {
  const { layer, active } = useCampus();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => { if (active && layer === 'map' && pathname !== CAMPUS_HOME) navigate(CAMPUS_HOME); }, [active, layer, pathname, navigate]);
  return null;
}

export default function CampusLayers(): React.ReactElement {
  // C20: the booking sheet's host, so "Talk to a person" (Where to?, the rail's help desk) opens it on any page; C29: the meeting
  // rooms sheets' host, likewise; C30: the Community Board's host (on a page it opens in place: there is no map to walk)
  return <><CampusMapRoute /><CampusListView /><CampusDoorTransition /><CampusDmToast /><BookCallHost /><MeetingSheetHost /><CommunityBoardHost reduceMotion /><CabinetHost /><OrderSheetHost /></>;
}

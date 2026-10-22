import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CampusDoorTransition from './CampusDoorTransition';
import CampusDmToast from './CampusDmToast';
import CampusListView from './CampusListView';
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
  return <><CampusMapRoute /><CampusListView /><CampusDoorTransition /><CampusDmToast /></>;
}

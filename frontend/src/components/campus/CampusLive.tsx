import React from 'react';
import BroadcastWatchButton from '../portal/BroadcastWatchButton';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { buildingName } from './campusMap';
import { useCampusOnAir, headlineBroadcast, roomRoute, LIVE_ROOM_BUILDING } from './campusOnAir';

/**
 * The "On air" strip in the campus banner (Colaberry Campus C8): the title, the portal's own Watch button (unchanged; it renders
 * only when the viewer may watch and is not already watching), and "Go to the room" through the campus door.
 *
 * The crowd line is the building's live head count from campus presence (C4), labelled as exactly that ("3 in the Collab Cafe
 * now"). Nothing in the portal counts people heading to a room, so nothing is invented; unknown or zero shows nothing.
 */
export default function CampusLive(): React.ReactElement | null {
  const { broadcasts } = useCampusOnAir();
  const { presence, presenceError, enterThroughDoor, settings } = useCampus();
  const { buildings } = useCampusView();
  const b = headlineBroadcast(broadcasts);
  if (!b) return null;
  const route = roomRoute(b);
  const building = buildings.find((x) => x.id === LIVE_ROOM_BUILDING);
  const count = route && presence && !presenceError ? presence[LIVE_ROOM_BUILDING]?.count ?? 0 : 0;
  return (
    <div className="cm-live" role="status" data-testid="cm-live">
      <span className="cm-onair-dot" aria-hidden="true" />
      <span className="cm-live-text"><strong>On air:</strong> {b.title}</span>
      {count > 0 && building && (
        <span className="cm-live-crowd" data-testid="cm-live-crowd">{count} in the {buildingName(building, settings.workplaceNames)} now</span>
      )}
      <BroadcastWatchButton roomId={b.room_id} className="cm-btn is-secondary" />
      {route && (
        <button type="button" className="cm-btn" data-testid="cm-live-go" onClick={() => enterThroughDoor(route, null)}>Go to the room</button>
      )}
    </div>
  );
}

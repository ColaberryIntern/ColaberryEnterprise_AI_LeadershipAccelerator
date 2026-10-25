import { postCampusHere, isReadOnlySession } from './campusApi';
import { buildingForPath } from './campusMap';
import { readCampusSettings } from './campusSettings';
import { getParticipantToken } from '../../utils/participantToken';
import { roomIdOfPath } from './campusRoomKind';

/**
 * C13 (round 3): record the building for the page this learner is on, for EVERY signed-in learner (not only campus pilot accounts),
 * alongside the portal's own presence heartbeat (PortalShell, every 60 s; the campus counts a row fresh for 90 s). Before this,
 * only pilot accounts were recorded, so the campus said "👥 0" while the People panel said 13.
 *
 * Respects "Show which building I'm in" (off: the server is asked to forget the building), never writes from a read-only "view as"
 * session, and does nothing on a page that belongs to no building. Fire-and-forget: a failed write is not the page's problem.
 */
export function pingCampusBuilding(path: string = window.location.pathname): void {
  try {
    if (!getParticipantToken() || isReadOnlySession()) return;
    const area = buildingForPath(path)?.id;
    if (!area) return;
    // C28 (v7 R1): on a room page, send the room too: the server counts you in that room's building (an event room is the Events Hall)
    postCampusHere(area, readCampusSettings().shareBuilding, roomIdOfPath(path)).catch(() => undefined);
  } catch {
    // Fire-and-forget beside the portal heartbeat: recording a building must never break the page that asked.
  }
}

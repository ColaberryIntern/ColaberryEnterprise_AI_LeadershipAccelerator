import { useEffect, useState } from 'react';
import type { BuildingId, CampusAudience } from '../campusMap';
import type { ArrivalData } from '../campusFacts';
import type { PlanStop } from '../campusPlan';
import portalApi from '../../../utils/portalApi';
import { fetchGameBoard } from '../games/gameRoomApi';
import { GAME_IDS } from '../games/engine/gameRules';
import type { WallFacts } from './RoomWalls';
import { classroomLine, eventBanner, scheduleRows, sprintOf, weekdayOf } from './roomWallFacts';
import type { ProjectTreeLite } from './roomWallFacts';
import { EVENTS_BUILDING } from '../campusRoomKind';

/**
 * The open building's back-wall facts (WP-5). The Classroom, Schedule and Events Hall reuse the arrival facts already read for the
 * card; the Project Studio reads your active build, the Showcase Gallery the showcased work, the Game Room your bests this week.
 * Each read is its own: one failing (or the build having none) leaves that wall on its plain placeholder, never an invented one.
 * Reads only (GET), so a view-as session is safe. Each request carries an explicit timeout.
 */
const TIMEOUT_MS = 10_000;

export function useRoomWall(id: BuildingId, audience: CampusAudience, data: ArrivalData, stops: PlanStop[] | null): WallFacts {
  const [extra, setExtra] = useState<Pick<WallFacts, 'sprint' | 'screens' | 'best'>>({});
  useEffect(() => {
    let alive = true;
    setExtra({});
    const warn = (event: string) => (e: unknown) => console.warn(JSON.stringify({ event, building: id, error_class: (e as Error)?.name ?? 'Error' }));
    if (id === 'studio' && audience === 'member') {
      portalApi.get('/api/portal/projects/active', { timeout: TIMEOUT_MS })
        .then((r) => { if (alive) setExtra({ sprint: sprintOf(r.data as ProjectTreeLite, true) }); })
        .catch(warn('campus_wall_sprint_failed'));
    } else if (id === 'gallery') {
      portalApi.get('/api/portal/showcases', { timeout: TIMEOUT_MS })
        .then((r) => { const items = Array.isArray(r.data?.items) ? (r.data.items as { title?: string }[]) : []; if (alive) setExtra({ screens: items.map((i) => i.title || '').filter(Boolean).slice(0, 3) }); })
        .catch(warn('campus_wall_showcases_failed'));
    } else if (id === 'arcade' && (audience === 'member' || audience === 'explorer')) {
      Promise.all(GAME_IDS.map((g) => fetchGameBoard(g).then((b) => [g, b.me?.best ?? b.rows.find((r) => r.you)?.score] as const).catch(() => [g, undefined] as const)))
        .then((pairs) => { if (alive) setExtra({ best: Object.fromEntries(pairs.filter(([, v]) => typeof v === 'number')) }); });
    }
    return () => { alive = false; };
  }, [id, audience]);
  const now = new Date();
  return {
    day: weekdayOf(now),
    schedule: id === 'tower' ? scheduleRows({ session: data.session, event: data.event, stops, now }) : undefined,
    classroom: id === 'lecture' ? classroomLine(data.session) : null,
    eventBanner: id === EVENTS_BUILDING ? eventBanner(data.event, now) : null, // C62
    ...extra,
  };
}

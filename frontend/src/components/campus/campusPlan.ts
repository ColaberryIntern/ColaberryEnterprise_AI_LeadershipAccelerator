import { projectWorkspacePath } from '../../pages/portal/today/shellUtils';
import type { TodayPlanItem } from '../../services/capeApi';
import { buildingForPath } from './campusMap';
import type { BuildingId } from './campusMap';

/**
 * Today's plan on the campus (Colaberry Campus C8), as pure data: where each step happens and which one is "Next".
 *
 * WHERE a step happens is exactly where Today opens it (TodayShell.openCard): a project task goes to its workspace
 * (projectWorkspacePath, in the Project Studio); EVERY other step, community posts included, opens in Today's drawer, so its
 * place is /portal/today (the Schedule tower). The plan carries no route of its own, so nothing else is guessed.
 *
 * NEXT is the first step that is not completed AND is not in the building the learner is already in. On Today itself that means
 * Next points only at project tasks (everything else is already on this page); elsewhere it can point back to Today.
 */
export const TODAY_ROUTE = '/portal/today';

export interface PlanStop {
  key: string;
  title: string;
  route: string;
  buildingId: BuildingId | null;
  done: boolean;
}

export function stopRoute(item: Pick<TodayPlanItem, 'project_id' | 'project_task_id'>): string {
  return projectWorkspacePath(item) ?? TODAY_ROUTE;
}

export function planStops(items: TodayPlanItem[]): PlanStop[] {
  return items.map((it, i) => {
    const route = stopRoute(it);
    return {
      key: `${it.ref ?? it.card_id ?? i}`,
      title: it.title || 'Next step',
      route,
      buildingId: (buildingForPath(route)?.id ?? null) as BuildingId | null,
      done: it.status === 'completed',
    };
  });
}

export function nextStop(stops: PlanStop[], currentBuilding: BuildingId | null): PlanStop | null {
  return stops.find((s) => !s.done && s.buildingId !== currentBuilding) ?? null;
}

/** The buildings of the unfinished stops, in plan order, each once: the route drawn on the map. */
export function routeBuildings(stops: PlanStop[]): BuildingId[] {
  const out: BuildingId[] = [];
  for (const s of stops) if (!s.done && s.buildingId && !out.includes(s.buildingId)) out.push(s.buildingId);
  return out;
}

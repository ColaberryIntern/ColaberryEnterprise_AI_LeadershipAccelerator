import { projectWorkspacePath } from '../../pages/portal/today/shellUtils';
import type { TodayPlanItem } from '../../services/capeApi';
import { buildingForPath } from './campusMap';
import type { BuildingId } from './campusMap';

/**
 * Today's plan on the campus (Colaberry Campus C8; WP-2), as pure data: what each step is, where on campus it happens, where
 * "Open the card" goes, and which one is "Next".
 *
 * WHERE a step happens comes from what it IS (its type), as the prototype places a lesson in the Classroom, a knowledge check in
 * the Cert Prep Center and a build in the Project Studio. A type we do not recognize falls back to the building of its route,
 * then to the Schedule tower (today's agenda).
 *
 * WHERE IT OPENS: a curriculum card opens its own page (/portal/runtime/:cardId, the prototype's "Open the card"); a project task
 * opens its workspace; anything else (community posts, ambient items) opens in Today's drawer (/portal/today), as Today does.
 *
 * NEXT is the first step that is not done AND is not in the building the learner is already in.
 */
export const TODAY_ROUTE = '/portal/today';

export interface PlanStop {
  key: string;
  title: string;
  route: string;
  buildingId: BuildingId | null;
  done: boolean;
  /** The item's type slug and its label ("Deep Dive", or the server's own student label). */
  type: string;
  label: string;
  /** Minutes, when the plan says (null for projects, community posts and replays). */
  minutes: number | null;
  /** Points the step is worth (learning + builder + community), 0 when the plan does not say. */
  points: number;
  /** The plan's ref (card:<id>, project:<taskId>, blog:<id> ...) and the curriculum card id, when there is one. */
  ref: string | null;
  cardId: string | null;
}

/** Type slug -> the building it happens in (slugs from todayCategoryFilter and the CAPE plan service). */
const TYPE_BUILDING: Record<string, BuildingId> = {};
const place = (b: BuildingId, types: string[]) => types.forEach((t) => { TYPE_BUILDING[t] = b; });
place('lecture', ['deep_dive', 'warmup', 'reflection', 'announcement', 'live_class', 'lesson', 'video']);
place('testing', ['knowledge_check', 'survey', 'question', 'evaluation', 'certification_exercise']);
place('studio', ['implementation_task', 'project_task', 'build_story', 'setup_lab', 'artifact_submission', 'prompt_lab', 'prompt_challenge']);
place('career', ['internship_activity']);
place('commons', ['community_discussion', 'discussion', 'study_session', 'community_live_session', 'community_post']);
place('amphi', ['event', 'demo_tuesday', 'kes_wednesday', 'marketing_friday']);
place('library', ['blog', 'podcast', 'testimonial', 'build_breakdown', 'mcp_server_spotlight', 'claude_code_technique', 'market_intelligence']);

export function buildingForType(type: string, ref: string | null, route: string): BuildingId | null {
  // What the item IS, by its ref, comes first (a project task, a community post, a class replay); then its type.
  if (ref?.startsWith('project:')) return 'studio';
  if (ref?.startsWith('community:')) return 'commons';
  if (ref?.startsWith('session:')) return 'lecture';
  if (TYPE_BUILDING[type]) return TYPE_BUILDING[type];
  if (type.startsWith('ai_')) return 'library';
  const byRoute = route === TODAY_ROUTE ? null : (buildingForPath(route)?.id ?? null) as BuildingId | null;
  return byRoute ?? 'tower';
}

const LABELS: Record<string, string> = { blog: 'Blog', podcast: 'Podcast', testimonial: 'Testimonial' };
/** Today's own label rule (TodayFeedV2): the server's student label, else the type title-cased. */
export const labelFor = (type: string): string => LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function stopRoute(item: Pick<TodayPlanItem, 'project_id' | 'project_task_id'>): string {
  return projectWorkspacePath(item) ?? TODAY_ROUTE;
}

/** A curriculum card's id, when the item is one (ref card:<id>, or a card_id with no other kind of ref). */
function cardIdOf(it: Pick<TodayPlanItem, 'ref' | 'card_id'>): string | null {
  if (!it.card_id) return null;
  const kind = (it.ref ?? '').split(':')[0];
  return !kind || kind === 'card' ? it.card_id : null;
}

export function planStops(items: TodayPlanItem[]): PlanStop[] {
  return items.map((it, i) => {
    const cardId = cardIdOf(it);
    const route = cardId ? `/portal/runtime/${cardId}` : stopRoute(it);
    const p = it.points ?? null;
    const type = it.type || '';
    return {
      key: `${it.ref ?? it.card_id ?? i}`,
      title: it.title || 'Next step',
      route,
      buildingId: buildingForType(type, it.ref ?? null, route),
      done: it.status === 'completed',
      type,
      label: it.student_label || labelFor(type || 'step'),
      minutes: typeof it.estimated_time === 'number' && it.estimated_time > 0 ? it.estimated_time : null,
      points: p ? (p.learning ?? 0) + (p.builder ?? 0) + (p.community ?? 0) : 0,
      ref: it.ref ?? null,
      cardId,
    };
  });
}

/**
 * C13: what is LEFT of today's plan, in minutes: the sum over steps not done yet (null when none of them carries a time). The server's
 * estimated_total_minutes is the whole day's estimate and never shrinks as steps get done, which is how a 6-minute step read
 * "~96 min waiting".
 */
export function minutesLeft(stops: Pick<PlanStop, 'done' | 'minutes'>[] | null): number | null {
  if (!stops) return null;
  const left = stops.filter((s) => !s.done && s.minutes);
  return left.length ? left.reduce((sum, s) => sum + (s.minutes ?? 0), 0) : null;
}

/** "Video · 18 min · +10 pts": the prototype's step detail, from what the plan really says. */
export function stopDetail(s: Pick<PlanStop, 'label' | 'minutes' | 'points'>, withPoints = false): string {
  return [s.label, s.minutes ? `${s.minutes} min` : null, withPoints && s.points ? `+${s.points} pts` : null].filter(Boolean).join(' · ');
}

/** A step the campus can mark done itself: a curriculum card, or an ambient blog / podcast / testimonial (Today's collect path). */
export function canComplete(s: Pick<PlanStop, 'cardId' | 'ref'>): boolean {
  return !!s.cardId || /^(blog|podcast|testimonial):/.test(s.ref ?? '');
}

/**
 * Steps done on the campus stay on the plan, ticked (WP-2): the server drops a completed step from the next read of the plan, so a
 * re-read would make it vanish instead of showing its tick. Fresh steps come first in the server's order; each step done this session
 * keeps its place (by its index in the previous list) and is marked done.
 */
export function withDone(prev: PlanStop[] | null, fresh: PlanStop[], doneKeys: ReadonlySet<string>): PlanStop[] {
  const out = fresh.map((s) => (doneKeys.has(s.key) ? { ...s, done: true } : s));
  (prev ?? []).forEach((s, i) => {
    if (doneKeys.has(s.key) && !out.some((x) => x.key === s.key)) out.splice(Math.min(i, out.length), 0, { ...s, done: true });
  });
  return out;
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

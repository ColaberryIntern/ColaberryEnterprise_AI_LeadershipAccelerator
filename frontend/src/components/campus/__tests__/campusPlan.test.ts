/**
 * C8 / WP-2 plan stops and Next: each step happens in the building its TYPE belongs to (a lesson in the Classroom, a post in the
 * Community Lounge, a project task in the Studio); a curriculum card opens its own page, a project task its workspace, anything
 * else Today's drawer (TodayShell.openCard); Next is the first unfinished step that is not in the learner's current building.
 */
import fs from 'fs';
import path from 'path';
import { planStops, nextStop, routeBuildings, stopRoute, TODAY_ROUTE } from '../campusPlan';
import type { TodayPlanItem } from '../../../services/capeApi';

const item = (o: Partial<TodayPlanItem>): TodayPlanItem => ({
  position: 0, kind: 'anchored', ref: 'card:x', surface: 'today', type: 'lesson', render_band: 'full', card_id: 'x', title: 'Step',
  subtitle: null, description: null, image: null, video: null, blog: null, content: null, week: null, estimated_time: null,
  status: 'available', interacted: false, slot: 'next_best', chips: { why_this: '', level: '', proof: '' }, ...o,
} as unknown as TodayPlanItem);

const project = item({ ref: 'project:1', title: 'Finish the data pipeline task', project_id: 'p1', project_task_id: 't1' });
const post = item({ ref: 'community:9', title: 'Reply to the cohort thread', community_post_id: '9' });
const lesson = item({ ref: 'card:l1', card_id: 'l1', title: 'Watch the agents lesson' });

describe('where a step happens and where it opens', () => {
  it('a project task goes to its workspace in the Project Studio', () => {
    expect(stopRoute(project)).toBe('/portal/projects/workspace/p1/t1');
    expect(planStops([project])[0]).toMatchObject({ buildingId: 'studio', route: '/portal/projects/workspace/p1/t1' });
  });
  it('a community post happens in the Community Lounge and opens in Today\'s drawer; a lesson card is in the Classroom and opens its own page', () => {
    expect(stopRoute(post)).toBe(TODAY_ROUTE);
    const [p, l] = planStops([post, lesson]);
    expect(p).toMatchObject({ buildingId: 'commons', route: TODAY_ROUTE });
    expect(l).toMatchObject({ buildingId: 'lecture', route: '/portal/runtime/l1', cardId: 'l1' });
  });
  it('pins TodayShell.openCard: only a project workspace navigates away (stamped from Today, so backing out returns there); everything else opens the drawer', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'pages', 'portal', 'today', 'TodayShell.tsx'), 'utf8');
    expect(src).toMatch(/const workspace = projectWorkspacePath\(card\);\s*\n(?:\s*\/\/[^\n]*\n)?\s*if \(workspace\) \{ navigate\(workspace, \{ state: \{ from: '\/portal\/today' \} \}\); return; \}\s*\n\s*setSelectedCard\(card\);/);
  });
});

describe('Next', () => {
  it('the first unfinished step not in the current building', () => {
    const stops = planStops([item({ ...lesson, status: 'completed' }), post, project]);
    expect(nextStop(stops, 'library')?.title).toBe('Reply to the cohort thread');
    expect(nextStop(stops, 'commons')?.title).toBe('Finish the data pipeline task'); // in the Lounge: only what is not here
  });
  it.each([
    ['everything done', [item({ ...project, status: 'completed' })], 'library'],
    ['every unfinished step is in this building', [post, item({ ...post, ref: 'community:10' })], 'commons'],
    ['an empty plan', [], 'tower'],
  ])('none when %s', (_n, items, here) => {
    expect(nextStop(planStops(items as TodayPlanItem[]), here as never)).toBeNull();
  });
  it('never picks a completed step, even outside the current building', () => {
    expect(nextStop(planStops([item({ ...project, status: 'completed' }), post]), 'studio')?.title).toBe('Reply to the cohort thread');
  });
});

describe('the route drawn on the map', () => {
  it('the unfinished stops\' buildings in plan order, each once', () => {
    expect(routeBuildings(planStops([project, post, lesson, item({ ...project, ref: 'project:2' })]))).toEqual(['studio', 'commons', 'lecture']);
    expect(routeBuildings(planStops([item({ ...project, status: 'completed' }), post]))).toEqual(['commons']);
  });
});

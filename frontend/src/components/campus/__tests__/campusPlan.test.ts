/**
 * C8 plan stops and Next: each step happens where Today opens it (TodayShell.openCard), and Next is the first unfinished step
 * that is not in the learner's current building.
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
const lesson = item({ ref: 'card:l1', title: 'Watch the agents lesson' });

describe('where a step happens (TodayShell.openCard exactly)', () => {
  it('a project task goes to its workspace in the Project Studio', () => {
    expect(stopRoute(project)).toBe('/portal/projects/workspace/p1/t1');
    expect(planStops([project])[0].buildingId).toBe('studio');
  });
  it('a community post opens in Today\'s drawer, so it happens on Today (the Schedule tower), like every other step', () => {
    expect(stopRoute(post)).toBe(TODAY_ROUTE);
    expect(stopRoute(lesson)).toBe(TODAY_ROUTE);
    expect(planStops([post, lesson]).map((s) => s.buildingId)).toEqual(['tower', 'tower']);
  });
  it('pins TodayShell.openCard: only a project workspace navigates away; everything else opens the drawer', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'pages', 'portal', 'today', 'TodayShell.tsx'), 'utf8');
    expect(src).toMatch(/const workspace = projectWorkspacePath\(card\);\s*\n\s*if \(workspace\) \{ navigate\(workspace\); return; \}\s*\n\s*setSelectedCard\(card\);/);
  });
});

describe('Next', () => {
  it('the first unfinished step not in the current building', () => {
    const stops = planStops([item({ ...lesson, status: 'completed' }), post, project]);
    expect(nextStop(stops, 'library')?.title).toBe('Reply to the cohort thread'); // elsewhere: back to Today
    expect(nextStop(stops, 'tower')?.title).toBe('Finish the data pipeline task'); // on Today: only what is not here
  });
  it.each([
    ['everything done', [item({ ...project, status: 'completed' })], 'library'],
    ['every unfinished step is in this building', [post, lesson], 'tower'],
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
    expect(routeBuildings(planStops([project, post, lesson, item({ ...project, ref: 'project:2' })]))).toEqual(['studio', 'tower']);
    expect(routeBuildings(planStops([item({ ...project, status: 'completed' }), post]))).toEqual(['tower']);
  });
});

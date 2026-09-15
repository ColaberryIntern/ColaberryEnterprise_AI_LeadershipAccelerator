/**
 * Where a tile actually sends you, what picture it carries, and what it refuses
 * to duplicate.
 *
 * Every case here comes from Ali opening the running page and finding something
 * wrong. None of them threw. "Open workstation" opened a project index, room
 * icons disagreed with the Rooms page, and a project story appeared twice on one
 * screen. A tile that navigates to the wrong place is worse than a tile that
 * errors, because the student assumes they misunderstood the button.
 */
jest.mock('../../../projects/projectReadService', () => ({ getActiveProjectTree: jest.fn() }));
jest.mock('../../../timeline/todayFeedComposer', () => ({ getTodayPage: jest.fn() }));

import { resolveProjectRail } from '../projectRail';
import { resolveTimelineRail } from '../timelineRail';
import { getActiveProjectTree } from '../../../projects/projectReadService';
import { getTodayPage } from '../../../timeline/todayFeedComposer';
import { RailContext } from '../types';

const mTree = getActiveProjectTree as unknown as jest.Mock;
const mToday = getTodayPage as unknown as jest.Mock;

const ctx: RailContext = { enrollmentId: 'e1', cohortId: 'c1', week: 7, isStaff: false };

beforeEach(() => jest.clearAllMocks());

describe('Open workstation opens the workstation', () => {
  it('links to the workstation ROUTE, not the project index', async () => {
    // The bug: /portal/projects?open=<id>&task=<id> is ignored by the Projects
    // page, so the student landed on a list and had to find the story again.
    mTree.mockResolvedValue({
      id: 'p1', name: 'PropertyPulse AI',
      lists: [{ title: 'Release 0', tasks: [{ id: 't1', story_id: 'STORY-001', title: 'Do the thing', status: 'not_started' }] }],
    });
    const rail = await resolveProjectRail(ctx);
    expect(rail?.tiles[0].action?.href).toBe('/portal/projects/workspace/p1/STORY-001');
  });

  it('falls back to the task id when a task has no story', async () => {
    mTree.mockResolvedValue({
      id: 'p1', name: 'P',
      lists: [{ title: 'R0', tasks: [{ id: 't1', story_id: null, title: 'T', status: 'not_started' }] }],
    });
    const rail = await resolveProjectRail(ctx);
    expect(rail?.tiles[0].action?.href).toBe('/portal/projects/workspace/p1/t1');
  });

  /**
   * Ali, 2026-09-13: "For projects, instead of Open Workstation, show the
   * points instead and allow the user to click." The button says what the
   * story PAYS; clicking still opens the workstation, and the figure is the
   * task's own `points` — the same number the Today tile and the Projects page
   * show, all three priced by storyPoints.
   */
  it('says what the story pays, and still opens the workstation', async () => {
    mTree.mockResolvedValue({
      id: 'p1', name: 'P',
      lists: [{ title: 'R0', tasks: [{ id: 't1', story_id: 'STORY-001', title: 'T', status: 'not_started', points: 50 }] }],
    });
    const rail = await resolveProjectRail(ctx);
    expect(rail?.tiles[0].action?.label).toBe('Build · +50 pts');
    expect(rail?.tiles[0].action?.href).toBe('/portal/projects/workspace/p1/STORY-001');
  });

  it('keeps the old label for an unpriced story rather than advertising "+0 pts"', async () => {
    mTree.mockResolvedValue({
      id: 'p1', name: 'P',
      lists: [{ title: 'prep', tasks: [
        { id: 't1', story_id: 'PREP-1', title: 'Rehearse', status: 'not_started', points: null },
        { id: 't2', story_id: 'PREP-2', title: 'Again', status: 'not_started', points: 0 },
        { id: 't3', story_id: 'PREP-3', title: 'Older server', status: 'not_started' },
      ] }],
    });
    const rail = await resolveProjectRail(ctx);
    for (const tile of rail!.tiles) expect(tile.action?.label).toBe('Open workstation');
  });

  /**
   * cab84953 priced demo-prep tasks and gave the Projects page its own verbs;
   * this rail kept saying "Build" over a rehearsal. Same verbs, same ids.
   */
  it('says "Submit" for a demo-prep task and "Demo Day" for the staff-marked one', async () => {
    mTree.mockResolvedValue({
      id: 'p1', name: 'P',
      lists: [{ title: 'prep', tasks: [
        { id: 't1', story_id: 'PREP-2', title: 'Record a run-through', status: 'not_started', points: 40 },
        { id: 't2', story_id: 'PREP-6', title: 'Present at Demo Day', status: 'not_started', points: 60 },
        { id: 't3', story_id: 'STORY-003', title: 'A story', status: 'not_started', points: 50 },
      ] }],
    });
    const rail = await resolveProjectRail(ctx);
    expect(rail?.tiles.map((t) => t.action?.label)).toEqual(['Submit · +40 pts', 'Demo Day · +60 pts', 'Build · +50 pts']);
    expect(rail?.tiles[0].action?.href).toBe('/portal/projects/workspace/p1/PREP-2');
  });

  it('gives every project tile a picture', async () => {
    mTree.mockResolvedValue({
      id: 'p1', name: 'P',
      lists: [{ title: 'R0', tasks: [
        { id: 't1', story_id: 'S1', title: 'A', status: 'not_started' },
        { id: 't2', story_id: 'S2', title: 'B', status: 'in_progress' },
      ] }],
    });
    const rail = await resolveProjectRail(ctx);
    for (const tile of rail!.tiles) expect(tile.image_url).toMatch(/^\/thumbnails\//);
  });
});

describe("Today's plan does not repeat the project rail", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    ref: 'card:1', card_id: 'c1', title: 'A lesson', type: 'video',
    surface: 'class', kind: 'video', estimated_time: 10, status: null, image: null, ...over,
  });

  it('drops project stories — they are already on the page with a better action', async () => {
    mToday.mockResolvedValue({ items: [
      item({ ref: 'a', type: 'project_task', title: 'STORY-001' }),
      item({ ref: 'b', type: 'video', title: 'A lesson' }),
    ] });
    const rail = await resolveTimelineRail(ctx);
    expect(rail?.tiles.map((t) => t.title)).toEqual(['A lesson']);
  });

  it('drops every build type, not only project_task', async () => {
    mToday.mockResolvedValue({ items: [
      item({ ref: 'a', type: 'implementation_task' }),
      item({ ref: 'b', type: 'build_story' }),
      item({ ref: 'c', type: 'artifact_submission' }),
      item({ ref: 'd', type: 'deep_dive', title: 'Kept' }),
    ] });
    const rail = await resolveTimelineRail(ctx);
    expect(rail?.tiles.map((t) => t.title)).toEqual(['Kept']);
  });

  it('drops anything whose owning surface is the project', async () => {
    mToday.mockResolvedValue({ items: [
      item({ ref: 'a', surface: 'project', type: 'something_new' }),
      item({ ref: 'b', surface: 'class', title: 'Kept' }),
    ] });
    const rail = await resolveTimelineRail(ctx);
    expect(rail?.tiles.map((t) => t.title)).toEqual(['Kept']);
  });

  it('disappears entirely when everything was project work', async () => {
    mToday.mockResolvedValue({ items: [item({ type: 'project_task' })] });
    await expect(resolveTimelineRail(ctx)).resolves.toBeNull();
  });

  it('never advances the feed just by being rendered', async () => {
    mToday.mockResolvedValue({ items: [item()] });
    await resolveTimelineRail(ctx);
    expect(mToday).toHaveBeenCalledWith('e1', 0, expect.any(Number), { readOnly: true });
  });

  it("carries the card's own artwork when it has some", async () => {
    mToday.mockResolvedValue({ items: [item({ image: '/thumbnails/curriculum-types/video.jpg' })] });
    const rail = await resolveTimelineRail(ctx);
    expect(rail?.tiles[0].image_url).toBe('/thumbnails/curriculum-types/video.jpg');
  });
});

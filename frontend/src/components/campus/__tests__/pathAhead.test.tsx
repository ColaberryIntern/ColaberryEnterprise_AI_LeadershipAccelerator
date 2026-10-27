/**
 * C78: when today is finished, the path ahead (real data only): your next open lessons with their links, the next locked lesson and
 * the classroom's own reason, the next event; the Schedule's board and the campus plan card both show it; never "free".
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { aheadBoard, pathAhead, todayFinished, AHEAD_MAX } from '../pathAhead';
import { PlanCard } from '../home/ConciergeCards';
import { usePathAhead, clearSummaryCache } from '../interior/usePageSummary';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { PlanStop } from '../campusPlan';
import type { TimelineFeedCard } from '../../timeline/TimelineCard';
import type { ClassroomFeed, SideRow } from '../interior/pageSummary';
import type { OpenHouseView } from '../../../services/onboardingApi';
import portalApi from '../../../utils/portalApi';
import { fetchPublicEvents } from '../../../services/onboardingApi';

jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../../../services/onboardingApi', () => ({ ...jest.requireActual('../../../services/onboardingApi'), fetchPublicEvents: jest.fn() }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date('2026-10-27T15:00:00Z');
const card = (o: Partial<TimelineFeedCard> & Pick<TimelineFeedCard, 'id' | 'title' | 'status'>): TimelineFeedCard =>
  ({ week: 0, order: 1, estimated_time: null, lock_reason: null, community_post_id: null, ...o }) as TimelineFeedCard;
const feed = (cards: TimelineFeedCard[]): ClassroomFeed => ({ buckets: [], cards });
const ev = (o: Partial<OpenHouseView> & Pick<OpenHouseView, 'id' | 'title' | 'starts_at'>): OpenHouseView => ({ is_registered: false, ...o }) as OpenHouseView;
const CARDS = [
  card({ id: 'done1', title: 'Intro', status: 'completed', order: 1 }),
  card({ id: 'c3', title: 'Prompting basics', status: 'available', order: 3, estimated_time: 12 }),
  card({ id: 'c2', title: 'Agents overview', status: 'in_progress', order: 2 }),
  card({ id: 'c4', title: 'Build your first agent', status: 'available', order: 4 }),
  card({ id: 'l5', title: 'Week 1 lab', status: 'locked', week: 1, order: 1, lock_reason: 'Finish the Learn tasks first' }),
  card({ id: 'p1', title: 'A community post', status: 'available', order: 0, community_post_id: 'post-9' }),
];
const EVENTS = [
  ev({ id: 'past', title: 'Last week', starts_at: '2026-10-20T23:00:00Z' }),
  ev({ id: 'oh', title: 'Open House', starts_at: '2026-10-29T23:00:00Z', is_registered: true }),
];

describe('pathAhead (pure)', () => {
  it('next open lessons in the classroom order with their links, then the next locked one with its reason, then the next event', () => {
    expect(pathAhead(feed(CARDS), EVENTS, NOW)).toEqual([
      { label: 'Agents overview', value: 'keep going', route: '/portal/runtime/c2' },
      { label: 'Prompting basics', value: '12 min', route: '/portal/runtime/c3' },
      { label: 'Week 1 lab', value: '🔒 Finish the Learn tasks first' },
      { label: 'Open House', value: expect.stringMatching(/ ✓$/) },
    ]);
  });
  it('community posts are not lessons; a locked lesson without a reason says Locked (never an invented date)', () => {
    const rows = pathAhead(feed([card({ id: 'l', title: 'Later', status: 'locked' }), CARDS[5]]), null, NOW);
    expect(rows).toEqual([{ label: 'Later', value: '🔒 Locked' }]);
  });
  it('boundaries: nothing at all gives no rows; never more than the cap; past events are skipped', () => {
    expect(pathAhead(null, null, NOW)).toEqual([]);
    expect(pathAhead(feed([]), [EVENTS[0]], NOW)).toEqual([]);
    expect(pathAhead(feed(CARDS), EVENTS, NOW).length).toBeLessThanOrEqual(AHEAD_MAX);
  });
  it('the same inputs give the same rows (no hidden state)', () => {
    expect(pathAhead(feed(CARDS), EVENTS, NOW)).toEqual(pathAhead(feed(CARDS), EVENTS, NOW));
  });
  it('todayFinished: every item done or nothing left today; not while one is open; no plan at all is not finished', () => {
    expect(todayFinished([{ done: true }, { done: true }])).toBe(true);
    expect(todayFinished([])).toBe(true);
    expect(todayFinished([{ done: true }, { done: false }])).toBe(false);
    expect(todayFinished(null)).toBe(false);
  });
  it('the Schedule board once today is done: what comes next, Open Today, an empty line, never "free"', () => {
    const b = aheadBoard(pathAhead(feed(CARDS), EVENTS, NOW));
    expect(b).toMatchObject({ title: '✅ Today is done · what comes next', open: 'Open Today', route: '/portal/today' });
    expect(b.note).toContain('You are not finished');
    expect(aheadBoard([]).empty).toBe('Nothing new on your path yet');
    expect(JSON.stringify([b, aheadBoard([])])).not.toMatch(/\bfree\b/i);
  });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); clearSummaryCache(); });
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const stop = (key: string, done: boolean): PlanStop =>
  ({ key, title: `Item ${key}`, route: `/portal/runtime/${key}`, buildingId: 'lecture', done, type: 'deep_dive', label: 'Deep Dive', minutes: null, points: 0, ref: null, cardId: key });
const AHEAD: SideRow[] = [{ label: 'Agents overview', value: 'keep going', route: '/portal/runtime/c2' }, { label: 'Week 1 lab', value: '🔒 Finish the Learn tasks first' }];

describe('the campus plan card', () => {
  const plan = (stops: PlanStop[], ahead: SideRow[] | null, onOpen = jest.fn()) => {
    act(() => { root.render(<PlanCard stops={stops} buildings={[...CAMPUS_BUILDINGS]} workplaceNames={false} onWalk={() => {}} ahead={ahead} onOpen={onOpen} />); });
    return onOpen;
  };
  it('all done: keeps the cheer and adds what comes next; a lesson row opens its page, a locked row is not a link', () => {
    const onOpen = plan([stop('a', true), stop('b', true)], AHEAD);
    expect(q('[data-testid="cm-cc-plan"]')!.textContent).toContain('All done for today');
    expect(q('[data-testid="cm-plan-ahead"]')!.textContent).toContain('You are not finished');
    const links = container.querySelectorAll('[data-testid="cm-plan-ahead-go"]');
    expect(links).toHaveLength(1);
    act(() => { (links[0] as HTMLElement).click(); });
    expect(onOpen).toHaveBeenCalledWith('/portal/runtime/c2');
    expect(q('[data-testid="cm-plan-ahead"]')!.textContent).toContain('Finish the Learn tasks first');
  });
  it('not done yet, or nothing loaded: no path ahead', () => {
    plan([stop('a', true), stop('b', false)], AHEAD);
    expect(q('[data-testid="cm-plan-ahead"]')).toBeNull();
    plan([stop('a', true)], null);
    expect(q('[data-testid="cm-plan-ahead"]')).toBeNull();
    plan([stop('a', true)], []);
    expect(q('[data-testid="cm-plan-ahead"]')).toBeNull();
  });
});

describe('usePathAhead (the loader)', () => {
  let got: SideRow[] | null | undefined;
  function Probe({ on }: { on: boolean }): null { got = usePathAhead(on, 'explorer'); return null; }
  const mount = async (on: boolean) => { await act(async () => { root.render(<Probe on={on} />); await new Promise((r) => setTimeout(r, 0)); }); };
  it('off: never fetches and returns null', async () => {
    await mount(false);
    expect(got).toBeNull();
    expect(portalApi.get).not.toHaveBeenCalled();
  });
  it('on: reads the classroom and the events', async () => {
    (portalApi.get as jest.Mock).mockResolvedValue({ data: feed(CARDS) });
    (fetchPublicEvents as jest.Mock).mockResolvedValue([]);
    await mount(true);
    expect(portalApi.get).toHaveBeenCalledWith('/api/portal/classroom');
    expect(got?.[0]).toEqual({ label: 'Agents overview', value: 'keep going', route: '/portal/runtime/c2' });
  });
  it('one source down: the other still shows; both down: null (the card keeps its own line)', async () => {
    (portalApi.get as jest.Mock).mockRejectedValue(new Error('503'));
    (fetchPublicEvents as jest.Mock).mockResolvedValue([ev({ id: 'x', title: 'Info session', starts_at: '2099-01-01T18:00:00Z' })]);
    await mount(true);
    expect(got?.map((r) => r.label)).toEqual(['Info session']);
    act(() => root.unmount()); root = createRoot(container); clearSummaryCache();
    (fetchPublicEvents as jest.Mock).mockRejectedValue(new Error('down'));
    await mount(true);
    expect(got).toBeNull();
  });
});

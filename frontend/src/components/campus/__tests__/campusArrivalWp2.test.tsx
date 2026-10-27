/**
 * WP-2 pieces of the arrival panel, rendered:
 *  - the plan box: Open the card, Mark done (the server's refusal shown in its own words, nothing ticked), Open only for a project;
 *  - the tour inside the panel: the stop card (number, Explorer tag, "You can" / "While you're here", the tip) and its nav
 *    ("Next: <building> →", the finish per account, "Back to the tour" off the route, End tour);
 *  - the hero: the kicker for this arrival, no access chip, the main action's address with the host, the urgent action;
 *  - the cheer queue and the points burst; the level-up cheer;
 *  - Mark done goes through Today's collect path and fires the points signal.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const mockPosts: string[] = [];
let mockCompleteReply: () => Promise<{ data: unknown }> = () => Promise.resolve({ data: { points_awarded: 10 } });
jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { post: (url: string) => { mockPosts.push(url); return mockCompleteReply(); }, get: () => Promise.resolve({ data: {} }) } }));
jest.mock('../../../pages/portal/runtime/runtimeApi', () => ({ runtimeApi: {
  blogCollect: (id: string) => { mockPosts.push(`blog:${id}`); return Promise.resolve({ points_awarded: 5, already: false }); },
  mediaCollect: (k: string, id: string) => { mockPosts.push(`${k}:${id}`); return Promise.resolve({ points_awarded: 35, already: false, watched_pct: 80 }); },
} }));
jest.mock('../../../pages/portal/today/todayFeedApi', () => ({ todayFeedApi: { interact: (ref: string) => { mockPosts.push(`interact:${ref}`); return Promise.resolve({ ok: true }); } } }));

// eslint-disable-next-line import/first
import PlanBox from '../PlanBox';
// eslint-disable-next-line import/first
import { TourStopCard, TourNav } from '../TourInCard';
// eslint-disable-next-line import/first
import BuildingCard from '../BuildingCard';
// eslint-disable-next-line import/first
import CampusCheer from '../CampusCheer';
// eslint-disable-next-line import/first
import { cheer } from '../campusCheerBus';
// eslint-disable-next-line import/first
import { useLevelCheer } from '../home/useLevelCheer';
// eslint-disable-next-line import/first
import { completeStop } from '../campusPlanApi';
// eslint-disable-next-line import/first
import { emitPointsEarned, onPointsEarned } from '../../../services/pointsFx';
// eslint-disable-next-line import/first
import { tourFor } from '../tourSteps';
// eslint-disable-next-line import/first
import { CAMPUS_BUILDINGS } from '../campusMap';
// eslint-disable-next-line import/first
import type { PlanStop } from '../campusPlan';
// eslint-disable-next-line import/first
import { kickerOf, subOf, zoneLabelOf } from '../campusArrival';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { mockPosts.length = 0; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const render = (el: React.ReactElement) => act(() => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); }); };
const b = (id: string) => CAMPUS_BUILDINGS.find((x) => x.id === id)!;
const STOP: PlanStop = { key: 'card:c1', title: 'Agents in depth', route: '/portal/runtime/c1', buildingId: 'lecture', done: false, type: 'deep_dive', label: 'Deep Dive', minutes: 18, points: 10, ref: 'card:c1', cardId: 'c1' };

describe('the plan box', () => {
  it('step n of N, the detail with points, Open the card and Mark done', async () => {
    const opened: string[] = [];
    const done: string[] = [];
    render(<PlanBox stop={STOP} index={1} total={4} onOpen={(r) => opened.push(r)} onDone={async (s) => { done.push(s.key); return { ok: true, points: 10 }; }} />);
    expect(q('cm-plan-box')!.textContent).toContain('Today’s plan · step 2 of 4');
    expect(q('cm-plan-box')!.textContent).toContain('Deep Dive · 18 min · +10 pts');
    act(() => { q('cm-plan-open')!.click(); });
    await act(async () => { q('cm-plan-done')!.click(); });
    expect(opened).toEqual(['/portal/runtime/c1']);
    expect(done).toEqual(['card:c1']);
    expect(q('cm-plan-why')).toBeNull();
  });
  it('a refusal is shown in the server\'s words', async () => {
    render(<PlanBox stop={STOP} index={0} total={1} onOpen={() => undefined} onDone={async () => ({ ok: false, reason: 'refused', message: 'Watch at least 75% first.' })} />);
    await act(async () => { q('cm-plan-done')!.click(); });
    expect(q('cm-plan-why')!.textContent).toBe('Watch at least 75% first.');
  });
  it('a project task has Open only (it is done where it opens)', () => {
    render(<PlanBox stop={{ ...STOP, cardId: null, ref: 'project:t1' }} index={0} total={1} onOpen={() => undefined} onDone={async () => ({ ok: true, points: 0 })} />);
    expect(q('cm-plan-done')).toBeNull();
    expect(q('cm-plan-open')).not.toBeNull();
  });
});

describe('Mark done through Today\'s collect path', () => {
  it('a card mockPosts to its completion route, fires the points signal, and records the impression', async () => {
    const heard: number[] = [];
    const off = onPointsEarned((d) => heard.push(d.delta));
    const r = await completeStop({ ref: 'card:c1', cardId: 'c1' });
    off();
    expect(r).toEqual({ ok: true, points: 10 });
    expect(mockPosts).toEqual(['/api/portal/classroom/cards/c1/complete', 'interact:card:c1']);
    expect(heard).toEqual([10]);
  });
  it('a blog and a podcast use their own gates', async () => {
    await completeStop({ ref: 'blog:b7', cardId: null });
    await completeStop({ ref: 'podcast:p2', cardId: null });
    expect(mockPosts.filter((x) => !x.startsWith('interact'))).toEqual(['blog:b7', 'podcast:p2']);
  });
  it('a 422 gate is a refusal with its message; nothing else is posted', async () => {
    mockCompleteReply = () => Promise.reject({ response: { status: 422, data: { message: 'Watch 75% first' } } });
    const r = await completeStop({ ref: 'card:c1', cardId: 'c1' });
    mockCompleteReply = () => Promise.resolve({ data: { points_awarded: 10 } });
    expect(r).toEqual({ ok: false, reason: 'refused', message: 'Watch 75% first' });
    expect(mockPosts).toEqual(['/api/portal/classroom/cards/c1/complete']);
  });
});

describe('the tour inside the arrival panel', () => {
  const access = (bb: { id: string }) => (bb.id === 'testing' || bb.id === 'gallery' ? 'locked' : bb.id === 'studio' ? 'demo' : 'open') as never;
  const member = tourFor('member', [...CAMPUS_BUILDINGS], () => 'open' as never, false)!;
  const explorer = tourFor('explorer', [...CAMPUS_BUILDINGS], access, false)!;
  it('the stop card: number, tour name, title, "You can", the tip', () => {
    render(<TourStopCard tour={member} index={0} />);
    expect(q('cm-tour')!.textContent).toContain('What’s in your seat');
    expect(q('cm-tour-title')!.textContent).toBe('Start here: your Schedule');
    expect(q('cm-tour')!.textContent).toContain('You can');
    expect(q('cm-tour-tip')!.textContent).toContain('Today');
    expect(q('cm-tour-tag')).toBeNull();
  });
  it('an Explorer at a locked stop: the Members tag and "While you’re here"', () => {
    const i = explorer.stops.findIndex((s) => s.state === 'locked' && s.can.length > 0);
    render(<TourStopCard tour={explorer} index={i} />);
    expect(q('cm-tour-tag')!.textContent).toBe('Members');
    expect(q('cm-tour')!.textContent).toContain('While you’re here');
  });
  it('C53 + C77: a tour’s first stop (the Schedule) has Open Today, for Explorers and members; later stops do not', () => {
    let opened = 0;
    render(<TourStopCard tour={explorer} index={0} onToday={() => { opened += 1; }} />);
    expect(q('cm-tour-title')!.textContent).toBe('Start here: the Schedule');
    act(() => { q('cm-tour-today')!.click(); });
    expect(opened).toBe(1);
    render(<TourStopCard tour={explorer} index={1} onToday={() => undefined} />);
    expect(q('cm-tour-today')).toBeNull();
    render(<TourStopCard tour={member} index={0} onToday={() => undefined} />);
    expect(q('cm-tour-today')).not.toBeNull();
    render(<TourStopCard tour={member} index={1} onToday={() => undefined} />);
    expect(q('cm-tour-today')).toBeNull();
  });
  it('the nav: Next names the next building; the last stop finishes per account; off the route, back to the tour', () => {
    const calls: string[] = [];
    const nav = (tour = member, index = 0, nextName: string | null = 'Library', hereStop = true) => render(<TourNav tour={tour} index={index} hereStop={hereStop} nextName={nextName}
      onNext={() => calls.push('next')} onBack={() => calls.push('back')} onEnd={() => calls.push('end')} />);
    nav();
    expect(q('cm-tour-next')!.textContent).toBe('Next: Library →');
    expect(q('cm-tour-count')!.getAttribute('aria-label')).toBe('Stop 1 of 10');
    act(() => { q('cm-tour-next')!.click(); q('cm-tour-stop')!.click(); });
    nav(member, 9, null);
    expect(q('cm-tour-next')!.textContent).toBe('Finish tour ✓');
    nav(explorer, explorer.stops.length - 1, null);
    expect(q('cm-tour-next')!.textContent).toBe('Finish · see what you’d unlock →');
    nav(member, 2, null, false);
    expect(q('cm-tour-next')).toBeNull();
    expect(q('cm-tour-back-to')!.textContent).toBe('Back to the tour · stop 3 →');
    act(() => { q('cm-tour-back-to')!.click(); });
    expect(calls).toEqual(['next', 'end', 'back']);
  });
});

describe('the hero', () => {
  it('kickers per arrival; the prototype place names; one line per building and per career face', () => {
    expect(kickerOf({ zone: 'South avenue' })).toBe('You’ve arrived · South avenue');
    expect(kickerOf({ tour: { name: 'What’s in your seat', n: 2, of: 9 } })).toBe('What’s in your seat · stop 2 of 9');
    expect(kickerOf({ audience: 'explorer', access: 'locked' })).toBe('🔒 Members only · you can look inside');
    expect(kickerOf({ audience: 'business', zone: 'North campus' })).toBe('Partner view');
    expect(zoneLabelOf(b('commons'))).toBe('South avenue');
    expect(zoneLabelOf(b('library'), true)).toBe('North side');
    expect(zoneLabelOf(b('studio'))).toBe('Business District');
    expect(subOf(b('lecture'), 'member')).toBe('Classroom, live sessions & check-in');
    expect(subOf(b('lecture'), 'member', true)).toBe('Live sessions & training');
    expect(subOf(b('career'), 'business')).toBe('Your company, team & invites');
  });
  it('no access chip; the address with the host; the urgent action takes over the main one', () => {
    render(<BuildingCard building={b('lecture')} access="preview" workplaceNames={false} onClose={() => undefined} onNavigate={() => undefined}
      kicker="Preview · watch a short sample" urgent={{ label: 'Build Day · go now', route: '/portal/sessions' }} />);
    expect(container.querySelector('.cm-card-chip')).toBeNull();
    expect(q('cm-arrive-kicker')!.textContent).toBe('Preview · watch a short sample');
    expect(q('cm-arrive-cta')!.textContent).toContain('Build Day · go now');
    expect(q('cm-arrive-cta')!.getAttribute('href')).toBe('/portal/sessions');
    expect(container.querySelector('.cm-arrive-route')!.textContent).toBe(`${window.location.host}/portal/sessions`);
  });
});

describe('cheers', () => {
  it('play one at a time, each for its time; an action button runs and closes it', () => {
    jest.useFakeTimers();
    const ran: string[] = [];
    render(<CampusCheer />);
    act(() => { cheer({ title: '+10 pts', detail: 'Agents in depth', ms: 2600 }); cheer({ big: '🗺', title: 'Next: Knowledge check', action: { label: 'Go', run: () => ran.push('go') }, ms: 4600 }); });
    expect(q('cm-cheer')!.textContent).toContain('+10 pts');
    act(() => { jest.advanceTimersByTime(2600 + 350); });
    expect(q('cm-cheer')!.textContent).toContain('Next: Knowledge check');
    act(() => { q('cm-cheer-action')!.click(); });
    expect(ran).toEqual(['go']);
  });
  it('the burst floats from the points pill when points are earned (home only), and not with reduce motion', () => {
    const pill = document.createElement('span');
    pill.setAttribute('data-testid', 'cm-stats-points');
    pill.getBoundingClientRect = () => ({ left: 100, width: 40, bottom: 50, top: 30, right: 140, height: 20, x: 100, y: 30, toJSON: () => ({}) });
    document.body.appendChild(pill);
    render(<CampusCheer burst />);
    act(() => { emitPointsEarned(10); });
    expect(q('cm-pt-burst')!.textContent).toBe('+10 pts');
    render(<CampusCheer burst reduceMotion />);
    act(() => { emitPointsEarned(5); });
    expect(container.querySelectorAll('[data-testid="cm-pt-burst"]').length).toBeLessThanOrEqual(1);
    pill.remove();
  });
  it('a level-up cheer only when the rung rises, never for the first read', () => {
    function Probe({ rung }: { rung: string }) { useLevelCheer(rung); return null; }
    render(<><CampusCheer /><Probe rung="AI Aware II" /></>);
    expect(q('cm-cheer')!.textContent).toBe('');
    render(<><CampusCheer /><Probe rung="AI Enabled I" /></>);
    expect(q('cm-cheer')!.textContent).toContain('Level 3! AI Enabled I');
  });
});

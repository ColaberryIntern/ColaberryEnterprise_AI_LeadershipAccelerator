/**
 * C23 Q1: real classmates walking the campus (DECISIONS.md Q1: "real present people only, never invented walkers"). The rules
 * (campusWalkers.ts) and the layer (art/MapWalkers.tsx): who is drawn, where they stand, and that a walk happens only when a later
 * presence answer lists the same person in another building.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { CampusPerson } from '../campusApi';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { CampusBuilding } from '../campusMap';
import { WALKERS_MAX, pointAt, restSpot, track, walkerPlan } from '../campusWalkers';
import MapWalkers from '../art/MapWalkers';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const B = CAMPUS_BUILDINGS as CampusBuilding[];
const by = (id: string) => B.find((b) => b.id === id) as CampusBuilding;
const person = (id: string, name = `Person ${id}`, avatar_url: string | null = null): CampusPerson => ({ enrollment_id: id, display_name: name, avatar_url });

describe('walkerPlan', () => {
  it('draws only the people the server named, by the building it listed them in', () => {
    const plan = walkerPlan({ library: { shown: [person('a')] }, studio: { shown: [person('b'), person('c')] } }, B);
    expect(plan.map((w) => [w.person.enrollment_id, w.at])).toEqual([['a', 'library'], ['b', 'studio'], ['c', 'studio']]);
  });

  it('draws nobody when presence has nobody (or is not loaded): never an invented walker', () => {
    expect(walkerPlan(undefined, B)).toEqual([]);
    expect(walkerPlan({}, B)).toEqual([]);
    expect(walkerPlan({ library: { shown: [] } }, B)).toEqual([]);
  });

  it('caps at six and keeps the people already on the map first', () => {
    const many = Array.from({ length: 9 }, (_, i) => person(`p${i}`));
    expect(walkerPlan({ library: { shown: many } }, B)).toHaveLength(WALKERS_MAX);
    const kept = walkerPlan({ library: { shown: many } }, B, WALKERS_MAX, new Set(['p8', 'p7']));
    expect(kept.map((w) => w.person.enrollment_id)).toEqual(expect.arrayContaining(['p8', 'p7']));
    expect(kept).toHaveLength(WALKERS_MAX);
  });

  it('draws a person listed in two buildings once', () => {
    const plan = walkerPlan({ library: { shown: [person('a')] }, studio: { shown: [person('a')] } }, B);
    expect(plan).toHaveLength(1);
  });

  it('ignores areas that are not buildings on this map', () => {
    expect(walkerPlan({ nowhere: { shown: [person('a')] } }, B)).toEqual([]);
  });
});

describe('restSpot', () => {
  it('stands beside the door, right then left, stepping outward, never on the same spot', () => {
    const lib = by('library');
    const spots = [0, 1, 2, 3].map((s) => restSpot(lib, s));
    expect(spots[0].x).toBeGreaterThan(lib.pos.x + lib.pos.w / 2);
    expect(spots[1].x).toBeLessThan(lib.pos.x - lib.pos.w / 2);
    expect(spots[2].x).toBeGreaterThan(spots[0].x);
    expect(new Set(spots.map((p) => `${p.x},${p.y}`)).size).toBe(4);
  });

  it('stays inside the drawn campus at the edge', () => {
    for (let s = 0; s < 8; s++) {
      const p = restSpot(by('career'), s);
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThanOrEqual(980);
    }
  });
});

describe('pointAt', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const { lens, total } = track(pts);
  it('walks the polyline and clamps at its ends', () => {
    expect(total).toBe(20);
    expect(pointAt(pts, lens, 5)).toEqual({ x: 5, y: 0 });
    expect(pointAt(pts, lens, 15)).toEqual({ x: 10, y: 5 });
    expect(pointAt(pts, lens, -3)).toEqual({ x: 0, y: 0 });
    expect(pointAt(pts, lens, 99)).toEqual({ x: 10, y: 10 });
  });
});

describe('MapWalkers', () => {
  let container: HTMLDivElement;
  let root: Root;
  let frames: FrameRequestCallback[];
  let now: number;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    frames = [];
    now = 1000;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    jest.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });

  const draw = (people: Parameters<typeof MapWalkers>[0]['people'], reduceMotion = false, onPick?: (p: CampusPerson, at: string) => void) =>
    act(() => { root.render(<svg><MapWalkers people={people} buildings={B} reduceMotion={reduceMotion} onPick={onPick} /></svg>); });
  const walkers = () => Array.from(container.querySelectorAll('[data-testid="cm-walker"]'));
  const xy = (el: Element) => (el.getAttribute('transform') ?? '').match(/-?[\d.]+/g)?.map(Number) ?? [];
  const tick = (ms: number) => act(() => { const due = frames; frames = []; now += ms; due.forEach((f) => f(now)); });

  it('draws nothing when nobody is named', () => {
    draw({ library: { shown: [] } });
    expect(container.querySelector('[data-testid="cm-walkers"]')).toBeNull();
  });

  it('stands each real person by their building, with initials or their photo, and hides the layer from screen readers', () => {
    draw({ library: { shown: [person('a', 'Ada Lovelace'), person('b', 'Bo', 'https://img.example/b.png')] } });
    const [a, b] = walkers();
    const s0 = restSpot(by('library'), 0);
    expect(xy(a)).toEqual([s0.x, s0.y]);
    expect(a.textContent).toContain('AL');
    expect(b.querySelector('image')?.getAttribute('href')).toBe('https://img.example/b.png');
    expect(container.querySelector('[data-testid="cm-walkers"]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('walks the paths when a later poll lists them in another building, and ends at the new spot', () => {
    draw({ library: { shown: [person('a')] } });
    const start = restSpot(by('library'), 0), end = restSpot(by('studio'), 0);
    draw({ studio: { shown: [person('a')] } });
    const el = walkers()[0];
    expect(el.getAttribute('data-at')).toBe('studio');
    expect(xy(el)).toEqual([start.x, start.y]); // not teleported: the walk starts where they stood
    tick(16);
    const mid = xy(el);
    expect(mid).not.toEqual([start.x, start.y]);
    expect(mid).not.toEqual([end.x, end.y]);
    for (let i = 0; i < 400 && frames.length; i++) tick(50);
    expect(xy(walkers()[0])).toEqual([end.x, end.y]);
    expect(frames).toHaveLength(0); // the loop stops when nobody is walking
  });

  it('does not walk anyone whose building did not change', () => {
    draw({ library: { shown: [person('a')] } });
    draw({ library: { shown: [person('a')] }, studio: { shown: [person('b')] } });
    expect(frames).toHaveLength(0);
  });

  it('with reduce motion they are simply in the new place', () => {
    draw({ library: { shown: [person('a')] } }, true);
    draw({ studio: { shown: [person('a')] } }, true);
    const end = restSpot(by('studio'), 0);
    expect(xy(walkers()[0])).toEqual([end.x, end.y]);
    expect(frames).toHaveLength(0);
  });

  it('removes someone the poll no longer lists', () => {
    draw({ library: { shown: [person('a'), person('b')] } });
    draw({ library: { shown: [person('b')] } });
    expect(walkers()).toHaveLength(1);
  });

  it('never draws more than six', () => {
    draw({ library: { shown: Array.from({ length: 10 }, (_, i) => person(`p${i}`)) } });
    expect(walkers()).toHaveLength(WALKERS_MAX);
  });

  it('a press opens that person, at their building', () => {
    const onPick = jest.fn();
    draw({ studio: { shown: [person('a', 'Ada')] } }, false, onPick);
    act(() => { walkers()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ enrollment_id: 'a' }), 'studio');
  });
});

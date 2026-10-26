/** C38 (v10 W5): the view out of each room's window is the real campus to the east: the spec's expected-views table. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { viewFrom, lookingOut, viewTitle, WindowView } from '../weather/windowView';
import { MiniBuilding, MiniLandmark } from '../weather/miniArt';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const names = (id: Parameters<typeof viewFrom>[0]) => viewFrom(id).map((v) => v.name);

it('matches the expected views', () => {
  expect(names('lecture')).toEqual(['Project Studio', 'Events Hall', 'the pond']);
  expect(names('library')).toEqual(['Schedule', 'Classroom', 'the Quad fountain']);
  expect(names('testing')).toEqual(['Library', 'Schedule', 'Meeting Rooms']);
  expect(names('arcade')).toEqual(['Meeting Rooms', 'Schedule', 'the Quad fountain']);
  expect(names('commons')).toEqual(['the Main Gate', 'the Quad fountain', 'the Community Board']);
  expect(names('career')).toEqual([]);
});

it('the sign and the title; near things are bigger; south is to the right', () => {
  const v = viewFrom('lecture');
  expect(lookingOut(v)).toBe('Looking out at Project Studio');
  expect(viewTitle(v)).toBe('you can see Project Studio, Events Hall, the pond');
  expect(lookingOut([])).toBe('Looking out at the city skyline');
  expect(v[0].size).toBeGreaterThan(v[2].size);
  const amphi = v.find((x) => x.name === 'Events Hall')!;
  expect(amphi.left).toBeGreaterThan(50); // the Events Hall is south-east of the Classroom
});

it('draws a mini for each, back to front, with data-view; the east edge draws the skyline', () => {
  const el = document.createElement('div');
  const root = createRoot(el);
  act(() => { root.render(<WindowView items={viewFrom('lecture')} lit={false} />); });
  expect(Array.from(el.querySelectorAll('[data-view]')).map((n) => n.getAttribute('data-view'))).toEqual(['pond', 'amphi', 'studio']);
  act(() => { root.render(<WindowView items={[]} lit />); });
  expect(el.querySelector('[data-view="skyline"]')).not.toBeNull();
  act(() => root.unmount());
});

it('with Workplace names on, the view uses the Workplace names (never a campus-only name)', () => {
  const campus = viewFrom('lecture'), work = viewFrom('lecture', true);
  expect(work.map((i) => i.id)).toEqual(campus.map((i) => i.id));
  for (const i of work) {
    const b = CAMPUS_BUILDINGS.find((x) => x.id === i.id);
    if (b) expect(i.name).toBe(b.workplaceName);
  }
});

it('C45 sanity table: the nearest item in each window (the map decides; Meeting Rooms sees the Main Gate first, nearer than the fountain)', () => {
  const first = (id: Parameters<typeof viewFrom>[0]) => viewFrom(id)[0]?.id ?? 'skyline';
  expect([first('lecture'), first('library'), first('tower'), first('commons'), first('chow'), first('career')]).toEqual(['studio', 'tower', 'lecture', 'gate-lm', 'gate-lm', 'skyline']);
});

it('C45: each neighbour is its own drawing: roof by kind, panes lit at night, landmarks drawn as themselves; buildings keep their map proportions', () => {
  const el = document.createElement('div');
  const root = createRoot(el);
  act(() => { root.render(<WindowView items={viewFrom('library')} lit={false} />); });
  expect(el.querySelector('[data-view="tower"] [data-mini="tower"]')?.getAttribute('data-kind')).toBe('tower');
  expect(el.querySelector('[data-view="fountain"] [data-mini="fountain"]')).not.toBeNull();
  expect(el.querySelector('[data-mini="tower"] rect[rx]')!.getAttribute('fill')).toBe('var(--cm-art-mini-win)');
  act(() => { root.render(<WindowView items={viewFrom('library')} lit />); });
  expect(el.querySelector('[data-mini="tower"] rect[rx]')!.getAttribute('fill')).toBe('var(--cm-art-lit)');
  const tower = viewFrom('library').find((i) => i.id === 'tower')!;
  const b = CAMPUS_BUILDINGS.find((x) => x.id === 'tower')!;
  expect(tower.ratio).toBeCloseTo(b.pos.h / b.pos.w, 5);
  act(() => root.unmount());
});

// C45 (verifier follow-up): every roof family on the map draws its own roof, and the wall colour follows the kind
const KINDS = Array.from(new Set(CAMPUS_BUILDINGS.filter((b) => b.kind !== 'gate').map((b) => b.kind)));
const ROOF: Record<string, [string, number]> = { pediment: ['polygon', 1], gable: ['polygon', 1], tower: ['polygon', 1], dome: ['path', 1], arcade: ['rect', 1], amphi: ['path', 2], flat: ['rect', 1], office: ['rect', 1], pavilion: ['rect', 1] };
const WALL: Record<string, string> = { office: 'mini-glass', pavilion: 'mini-glass', arcade: 'mini-arcade' };
it.each(KINDS)('C45: the %s roof family draws its own roof and wall', (kind) => {
  const el = document.createElement('div');
  const root = createRoot(el);
  const b = CAMPUS_BUILDINGS.find((x) => x.kind === kind)!;
  act(() => { root.render(<MiniBuilding id={b.id} kind={kind} ratio={b.pos.h / b.pos.w} lit={false} />); });
  const svg = el.querySelector(`[data-mini="${b.id}"]`)!;
  expect(svg.getAttribute('data-kind')).toBe(kind);
  const roofs = svg.querySelectorAll('[data-part="roof"]');
  expect([kind, roofs.length, roofs[0].tagName.toLowerCase()]).toEqual([kind, ROOF[kind][1], ROOF[kind][0]]);
  if (kind === 'arcade') expect(roofs[0].getAttribute('stroke')).toBe('var(--cm-art-mini-neon)');
  else expect(roofs[0].getAttribute(kind === 'amphi' ? 'stroke' : 'fill')).toBe(`var(--cm-art-${b.id})`);
  if (kind !== 'amphi') expect(svg.querySelector('[data-part="wall"]')!.getAttribute('fill')).toBe(`var(--cm-art-${WALL[kind] ?? 'mini-wall'})`);
  act(() => root.unmount());
});

it.each(['pond', 'fountain', 'board', 'gate'])('C45: the %s landmark has its own drawing', (kind) => {
  const el = document.createElement('div');
  const root = createRoot(el);
  act(() => { root.render(<MiniLandmark kind={kind} />); });
  expect(el.querySelector(`[data-mini="${kind}"]`)!.children.length).toBeGreaterThan(1);
  act(() => root.unmount());
});

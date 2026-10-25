/** C38 (v10 W5): the view out of each room's window is the real campus to the east: the spec's expected-views table. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { viewFrom, lookingOut, viewTitle, WindowView } from '../weather/windowView';

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

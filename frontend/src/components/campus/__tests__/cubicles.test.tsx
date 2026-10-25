/**
 * C25 (v6 D2): cubicles down the left side of the work rooms (Studio, Internship Office, Library, Cert Prep).
 *  - three cubicles, each matching the room; people present fill them first (monitor lit, their figure at it), the rest stand in
 *    the room's usual places; empty cubicles stay dark;
 *  - acceptance: 2 present in the Studio = 2 occupied + 1 empty; 5 present = 3 in cubicles + 2 standing in the room;
 *  - no cubicles in rooms without a work spot (Lecture Hall's seat, Events Hall, Admissions' meeting table).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../../services/onboardingApi', () => ({ ...jest.requireActual('../../../services/onboardingApi'), fetchPublicEvents: () => Promise.resolve([]) }));
import Room3D from '../interior/room3d/Room3D';
import { spotOf } from '../interior/roomSpots';
import type { BuildingId } from '../campusMap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const you = { key: 'you', name: 'You', initials: 'YO', photo: null, you: true, tone: 'red' };
const crowd = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `p${i}`, name: `Person ${i}`, initials: `P${i}`, photo: null, tone: 'blue' }));
function mount(id: BuildingId | 'admissions', n: number) {
  act(() => {
    root.render(<Room3D id={id as BuildingId} name="Room" people={crowd(n)} you={you} summary={null} spot={spotOf(id)} firstName="ADA" sectionRoute="/portal/x"
      onOpen={() => undefined} reduceMotion />);
  });
}
const cubs = () => Array.from(container.querySelectorAll('[data-testid="cm-cub"]'));
const people = () => container.querySelectorAll('[data-testid="cm-inside-person"]').length;

it('2 present in the Studio: 2 cubicles occupied (monitor lit), 1 empty (dark)', () => {
  mount('studio', 2);
  expect(cubs()).toHaveLength(3);
  expect(cubs().map((c) => c.classList.contains('is-occupied'))).toEqual([true, true, false]);
  expect(cubs()[0].querySelector('.scr.is-lit')).not.toBeNull();
  expect(cubs()[2].querySelector('.scr.is-lit')).toBeNull();
  expect(people()).toBe(2);
});

it('5 present: 3 in cubicles, 2 standing in the room', () => {
  mount('studio', 5);
  expect(cubs().filter((c) => c.classList.contains('is-occupied'))).toHaveLength(3);
  expect(people()).toBe(5);
});

it('the Library, Cert Prep and the Internship Office get cubicles too; rooms without a work spot do not', () => {
  for (const id of ['library', 'testing', 'career'] as const) { mount(id, 0); expect(cubs()).toHaveLength(3); }
  for (const id of ['lecture', 'amphi', 'admissions'] as const) { mount(id, 1); expect(cubs()).toHaveLength(0); }
});

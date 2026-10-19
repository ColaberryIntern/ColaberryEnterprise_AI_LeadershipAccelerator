/**
 * C9 person card: the person's level as a toned pill and the gear they wear by name; never a ride; nothing when unknown.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import type { CampusPerson } from '../campusApi';

jest.mock('../campusPeopleApi', () => ({ postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));

// eslint-disable-next-line import/first
import PersonCard from '../PersonCard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const person = (o: Partial<CampusPerson>): CampusPerson => ({ enrollment_id: 'e1', display_name: 'Mia Lopez', avatar_url: null, can_message: true, ...o });
async function mount(p: CampusPerson): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter><PersonCard person={p} buildingLabel="the Library" onClose={() => undefined} onWalkOver={() => undefined} /></MemoryRouter>); });
}
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

it('shows the rung as a pill in its tone, and the gear by name, never the ride', async () => {
  await mount(person({ rung_name: 'AI Enabled II', gear: { head: 'cap', neck: 'chain', ride: 'cruiser' } }));
  expect(q('cm-person-level')?.textContent).toBe('AI Enabled II');
  expect(q('cm-person-level')?.className).toContain('rung-enabled-2');
  expect(q('cm-person-gear')?.textContent).toBe('Wearing: Cohort cap, Gold chain');
  expect(container.textContent).not.toMatch(/Cruiser|Skateboard/);
});

it('no level or gear known: neither line appears', async () => {
  await mount(person({}));
  expect(q('cm-person-level')).toBeNull();
  expect(q('cm-person-gear')).toBeNull();
});

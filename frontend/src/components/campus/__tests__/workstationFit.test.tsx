/**
 * C40 (Ali, 2026-10-25: "The workstation outline should be much smaller ... getting the content on the screen comfortably"): the frame
 * gets out of the way. Cory has a drawer toggle in the top bar (shown below 1200 px by CSS); it opens and closes the drawer, Esc closes
 * it; the monitors have no necks or stands; the pinned tickets are single-line chips (no note line, no tilt). The width/height share
 * of the card is asserted in a real browser by fidelity view 23-workstation.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../home/useHomeFacts', () => ({ useHomeFacts: () => ({ fullName: 'Ali Muwwakkil', firstName: 'Ali', initials: 'AM' }) }));
// eslint-disable-next-line import/first
import WorkstationShell from '../workstation/WorkstationShell';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s) as HTMLElement | null;

const place = { buildingId: 'studio' as const, section: 'Project Studio', sectionRoute: '/portal/projects', spot: 'Your desk' };
function mount(): void {
  act(() => {
    root.render(<MemoryRouter><WorkstationShell theme="light" place={place as never} cardTitle="STORY-001 · Opportunity Score" pill={<span>In progress</span>}
      bench={[{ key: 'a', tag: 'Deep dive', title: 'Understanding Modern Software', note: 'Queued', state: 'queued', route: '/portal/runtime/a' }] as never}
      left={<div />} mentor={<div data-testid="cory-rail">Cory</div>} status={<span>stats</span>}><p>card</p></WorkstationShell></MemoryRouter>);
  });
}

it('the Cory toggle opens and closes the drawer, and Esc closes it', () => {
  mount();
  const toggle = q('[data-testid="cm-ws-cory-toggle"]')!;
  const cory = q('[data-testid="cm-ws-cory"]')!;
  expect([toggle.getAttribute('aria-expanded'), toggle.getAttribute('aria-controls'), cory.id, cory.classList.contains('is-open')]).toEqual(['false', 'cm-ws-cory', 'cm-ws-cory', false]);
  act(() => { toggle.click(); });
  expect([toggle.getAttribute('aria-expanded'), cory.classList.contains('is-open')]).toEqual(['true', true]);
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(cory.classList.contains('is-open')).toBe(false);
  act(() => { toggle.click(); });
  act(() => { toggle.click(); });
  expect(cory.classList.contains('is-open')).toBe(false);
  expect(q('[data-testid="cory-rail"]')).not.toBeNull(); // Cory is always mounted (the drawer only moves it)
});

it('no monitor necks or stands, and the tickets carry no tilt', () => {
  mount();
  expect(container.querySelectorAll('.cm-ws-mon .neck, .cm-ws-mon .base')).toHaveLength(0);
  expect((q('[data-testid="cm-ws-ticket"]') as HTMLElement).getAttribute('style')).toBeNull();
});

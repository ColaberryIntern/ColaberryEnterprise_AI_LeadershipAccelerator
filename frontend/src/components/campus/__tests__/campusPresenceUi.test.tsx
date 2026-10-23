import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import CampusWorld from '../CampusWorld';
import WhoIsHere, { initialsOf } from '../WhoIsHere';
import { campusBuildingsFor } from '../useCampusView';
import type { CampusPresence } from '../campusApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PRESENCE: CampusPresence = {
  library: { count: 5, people: [
    { enrollment_id: 'e1', display_name: 'Mia Lopez', avatar_url: null },
    { enrollment_id: 'e2', display_name: 'Ana', avatar_url: 'data:image/png;base64,AAAA' },
    { anonymous: true }, { anonymous: true }, { anonymous: true },
  ] },
  lecture: { count: 1, people: [] },
};

let container: HTMLDivElement;
let root: Root;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter>{ui}</MemoryRouter>); });
}
afterEach(() => { act(() => root.unmount()); container.remove(); });

const world = (presence: CampusPresence | null | undefined, presenceError = false) => (
  <CampusWorld buildings={campusBuildingsFor('member')} audience="member" hasFullAccess workplaceNames={false} reduceMotion
    onExit={() => {}} onNavigate={() => {}} presence={presence} presenceError={presenceError} />
);
const openCard = (id: string) => act(() => { container.querySelector(`.cm-bld[data-building="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const chip = (id: string) => container.querySelector(`.cm-bld[data-building="${id}"] .cm-count`);

describe('presence on the map', () => {
  it('shows a count chip only where the real count is above zero', async () => {
    await render(world(PRESENCE));
    expect(chip('library')!.getAttribute('data-count')).toBe('5');
    expect(chip('lecture')!.getAttribute('data-count')).toBe('1');
    expect(chip('studio')).toBeNull();
    expect(container.querySelector('.cm-bld[data-building="library"]')!.getAttribute('aria-label')).toContain('5 here now');
  });

  it('presence failed: every chip reads "—" (unknown, never a stale number or a zero) and opens no peek', async () => {
    await render(world(PRESENCE, true));
    const chips = Array.from(container.querySelectorAll('.cm-count'));
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => c.textContent === '—' && c.getAttribute('class')!.includes('is-down') && !c.hasAttribute('data-count'))).toBe(true);
    expect(container.querySelector('.cm-count.is-peekable')).toBeNull();
  });

  it('presence not wired (C2 behavior): no chips and no Who\'s here section', async () => {
    await render(world(undefined));
    expect(container.querySelector('.cm-count')).toBeNull();
    openCard('library');
    expect(container.querySelector('[data-testid="cm-who"]')).toBeNull();
  });
});

describe("Who's here in the card", () => {
  it('names only the people the server named (first names, WP-5), with a photo only when uploaded, and "+N more" for the rest', async () => {
    await render(world(PRESENCE));
    openCard('library');
    const who = container.querySelector('[data-testid="cm-who"]')!;
    const names = Array.from(who.querySelectorAll('.cm-person-name')).map((n) => n.textContent);
    expect(names).toEqual(['Mia', 'Ana']);
    expect(who.querySelector('[data-enrollment="e1"] img')).toBeNull();
    expect(who.querySelector('[data-enrollment="e1"] .av')!.textContent).toBe('ML');
    expect(who.querySelector('[data-enrollment="e2"] img')!.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(who.querySelector('[data-testid="cm-who-more"]')!.textContent).toBe('+3 more');
    expect(who.querySelectorAll('img').length).toBe(1);
  });

  it('quiet: an empty building says so', async () => {
    await render(world(PRESENCE));
    openCard('studio');
    expect(container.querySelector('[data-testid="cm-who-quiet"]')!.textContent).toBe('Nobody yet. You’re first in.');
  });

  it('loading: before the first read answers, the card says it is checking (unknown is not empty)', async () => {
    await render(world(null, false));
    openCard('library');
    expect(container.querySelector('[data-testid="cm-who-loading"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cm-who-quiet"]')).toBeNull();
  });

  it('broken: the card says presence could not load', async () => {
    await render(world(null, true));
    openCard('library');
    expect(container.querySelector('[data-testid="cm-who-broken"]')).not.toBeNull();
    expect(container.querySelector('.cm-person')).toBeNull();
  });

  it('counted but not listed (only the viewer is here): no names, count shown', async () => {
    await render(world(PRESENCE));
    openCard('lecture');
    const who = container.querySelector('[data-testid="cm-who"]')!;
    expect(who.querySelector('.cm-person')).toBeNull();
    expect(who.textContent).toContain('Who’s here · 1');
    expect(who.querySelector('[data-testid="cm-who-more"]')!.textContent).toBe('+1 more');
  });
});

describe('initialsOf', () => {
  it('uses first and last initials, never invents', () => {
    expect(initialsOf('Mia Lopez')).toBe('ML');
    expect(initialsOf('ana')).toBe('A');
    expect(initialsOf('  Jo  Ann  Smith ')).toBe('JS');
    expect(initialsOf('')).toBe('?');
  });

  it('WhoIsHere counts a private person as "+1 more", never by name', async () => {
    await render(<WhoIsHere presence={{ count: 1, people: [{ anonymous: true }] }} error={false} />);
    expect(container.querySelector('[data-testid="cm-who-more"]')!.textContent).toBe('+1 more');
  });
});

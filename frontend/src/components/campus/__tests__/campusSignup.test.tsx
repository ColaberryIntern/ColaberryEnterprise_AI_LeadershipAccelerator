/**
 * C6 contextual sign-up and "Your path to enrolling": built from the paywall's own copy, the catalog and each building's real
 * state for the viewer; never the word "free"; shown only where it applies.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));

// eslint-disable-next-line import/first
import BuildingCard from '../BuildingCard';
// eslint-disable-next-line import/first
import CampusWorld from '../CampusWorld';
// eslint-disable-next-line import/first
import ExplorerPath from '../ExplorerPath';
// eslint-disable-next-line import/first
import { explorerPath } from '../campusPath';
// eslint-disable-next-line import/first
import { buildingState } from '../campusAccess';
// eslint-disable-next-line import/first
import { campusBuildingsFor } from '../useCampusView';
// eslint-disable-next-line import/first
import { GATED_FEATURES } from '../../paywall/gatedFeatures';
// eslint-disable-next-line import/first
import type { CampusBuilding, ExplorerAccess } from '../campusMap';
// eslint-disable-next-line import/first
import type { StaffDesk } from '../campusPeopleApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const explorerBuildings = campusBuildingsFor('explorer');
const find = (id: string) => explorerBuildings.find((b) => b.id === id)!;
const GATE_OFF = (b: CampusBuilding) => buildingState(b, { isStaff: false, hasFullAccess: true, isExplorer: true });
const GATE_ON = (b: CampusBuilding) => buildingState(b, { isStaff: false, hasFullAccess: false, isExplorer: true });
const FREE = /\bfree\b/i;

let container: HTMLDivElement;
let root: Root | undefined;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter>{ui}</MemoryRouter>); });
}
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); });
const card = (b: CampusBuilding, access: ExplorerAccess) =>
  <BuildingCard building={b} access={access} workplaceNames={false} onClose={() => undefined} onNavigate={() => undefined} />;

describe('contextual sign-up in a building card', () => {
  it('a locked Cert Prep Center shows ITS paywall copy (title, up to 3 benefits) and its call to action', async () => {
    const b = find('testing');
    await render(card(b, 'locked'));
    const copy = GATED_FEATURES['cert-prep'];
    expect(container.querySelector('[data-testid="cm-signup-title"]')?.textContent).toBe(copy.title);
    expect(Array.from(container.querySelectorAll('.cm-signup-benefits li')).map((li) => li.textContent)).toEqual(copy.benefits.slice(0, 3));
    const cta = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === copy.ctaLabel)!;
    expect(cta.getAttribute('href')).toBe(copy.ctaTo);
  });

  it('a locked Project Studio uses the projects copy, not the classroom copy', async () => {
    await render(card(find('studio'), 'locked'));
    expect(container.querySelector('[data-testid="cm-signup-title"]')?.textContent).toBe(GATED_FEATURES.projects.title);
  });

  it('demo and preview say what the Explorer can do there, with the call to action', async () => {
    await render(card(find('studio'), 'demo'));
    expect(container.textContent).toContain('Explore it in demo mode');
    act(() => root!.unmount()); container.remove(); root = undefined;
    await render(card(find('lecture'), 'preview'));
    expect(container.textContent).toContain('You can watch a short preview');
  });

  it('an open building shows no sign-up at all', async () => {
    await render(card(find('library'), 'open'));
    expect(container.querySelector('.cm-card-note')).toBeNull();
  });

  it('no card in any state says "free"', async () => {
    for (const id of ['testing', 'studio', 'lecture', 'gallery']) for (const access of ['locked', 'demo', 'preview'] as ExplorerAccess[]) {
      await render(card(find(id), access));
      expect({ id, access, free: FREE.test(container.textContent || '') }).toEqual({ id, access, free: false });
      act(() => root!.unmount()); container.remove(); root = undefined;
    }
  });
});

describe('your path to enrolling (pure)', () => {
  it('page gate off: try the Classroom preview and Project Studio demo; enrolling opens those two; the paywall CTA', () => {
    const m = explorerPath(explorerBuildings, GATE_OFF, false, false);
    expect(m.steps.map((s) => `${s.label} -> ${s.route}`)).toEqual(['Watch the preview in the Classroom -> /portal/classroom', 'Try the Project Studio in demo mode -> /portal/projects']);
    expect(m.opens).toEqual(['Classroom', 'Project Studio']);
    expect(m.cta).toEqual({ label: GATED_FEATURES.classroom.ctaLabel, to: GATED_FEATURES.classroom.ctaTo });
    expect(m.askMaya).toBe(false);
  });

  it('page gate on: nothing to try (the paywalled pages are locked), and enrolling opens the four paywalled buildings', () => {
    const m = explorerPath(explorerBuildings, GATE_ON, false, true);
    expect(m.steps).toEqual([]);
    expect(m.opens.sort()).toEqual(['Cert Prep Center', 'Classroom', 'Project Studio', 'Showcase Gallery']);
    expect(m.askMaya).toBe(true);
  });

  it('uses Workplace names when that setting is on', () => {
    expect(explorerPath(explorerBuildings, GATE_OFF, true, false).opens).toEqual(['Training Room', 'Project Studio']);
  });
});

describe('your path to enrolling (rendered)', () => {
  it('renders steps as links, the opens line, the CTA, and the Maya line only when she is on duty; never "free"', async () => {
    await render(<ExplorerPath model={explorerPath(explorerBuildings, GATE_OFF, false, true)} onNavigate={() => undefined} />);
    expect(Array.from(container.querySelectorAll('.cm-path-steps a')).map((a) => a.getAttribute('href'))).toEqual(['/portal/classroom', '/portal/projects']);
    expect(container.querySelector('[data-testid="cm-path-opens"]')?.textContent).toBe('Enrolling opens everything in: Classroom, Project Studio.');
    expect(container.querySelector('[data-testid="cm-path-cta"]')?.getAttribute('href')).toBe('/portal/settings?tab=subscription');
    expect(container.querySelector('[data-testid="cm-path-maya"]')).not.toBeNull();
    expect(FREE.test(container.textContent || '')).toBe(false);
  });

  const world = (audience: 'explorer' | 'member', isExplorer: boolean, desks: StaffDesk[] = []) => (
    <CampusWorld buildings={campusBuildingsFor('explorer')} audience={audience} hasFullAccess accessOf={GATE_OFF} isExplorer={isExplorer}
      workplaceNames={false} reduceMotion initialTarget={'gate'} onExit={() => undefined} onNavigate={() => undefined}
      staffDesks={desks} personCard={null} onOpenPerson={() => undefined} onClosePerson={() => undefined} />
  );

  it('appears in the Main Gate card for an Explorer', async () => {
    await render(world('explorer', true));
    expect(container.querySelector('[data-testid="cm-card"]')?.getAttribute('data-building')).toBe('gate');
    expect(container.querySelector('[data-testid="cm-explorer-path"]')).not.toBeNull();
  });

  it('is absent for a viewer who is not an Explorer', async () => {
    await render(world('member', false));
    expect(container.querySelector('[data-testid="cm-explorer-path"]')).toBeNull();
  });
});

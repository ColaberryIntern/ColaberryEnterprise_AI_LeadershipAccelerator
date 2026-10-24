/**
 * C6 wiring of the REAL useCampusView (no campusViewFor shortcut): building locks use PageGate's own staff signal, never the
 * campus's wider staff; demo/preview use is_explorer, never the campus audience. And the banner's "Your path" appears only
 * where the path exists (an Explorer whose campus has the Main Gate).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const mock = { pageStaff: false, full: true, explorer: false, manager: false, mgmt: false };
jest.mock('../../../pages/portal/useEntitlement', () => ({ useEntitlement: () => ({ isStaff: mock.pageStaff, hasFullAccess: mock.full, loading: false }) }));
jest.mock('../../../pages/portal/useIsOrgManager', () => ({ useOrgManager: () => ({ isManager: mock.manager, org: null, loaded: true }) }));
jest.mock('../../../pages/portal/useIsExplorer', () => ({ useIsExplorer: () => mock.explorer }));
jest.mock('../../../pages/portal/useInternshipNav', () => ({ useInternshipNav: () => ({ isIntern: false }) }));
jest.mock('../campusMgmt', () => ({ useIsMgmt: () => mock.mgmt, fetchIsMgmt: () => Promise.resolve(mock.mgmt) }));
let mockOpened: Array<string | undefined> = [];
jest.mock('../CampusContext', () => ({
  useCampus: () => ({ settings: { nav: 'campus', workplaceNames: false, reduceMotion: true }, presence: null, presenceError: false, layer: 'none',
    openMap: (id?: string) => { mockOpened.push(id); }, stepOutside: () => undefined, enterThroughDoor: () => undefined, active: true, staffDesks: [] }),
}));

// eslint-disable-next-line import/first
import { useCampusView, CampusView } from '../useCampusView';
// eslint-disable-next-line import/first
import CampusNav from '../CampusNav';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;
let view: CampusView | null = null;
function Probe(): null { view = useCampusView(); return null; }
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter initialEntries={['/portal/library']}>{ui}</MemoryRouter>); });
}
const set = (o: Partial<typeof mock>) => Object.assign(mock, { pageStaff: false, full: true, explorer: false, manager: false, mgmt: false }, o);
const state = (id: string) => view!.accessOf(view!.buildings.find((b) => b.id === id)!);
beforeEach(() => { mockOpened = []; set({}); });
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); });

describe('useCampusView wiring', () => {
  it('a Management Portal user is campus staff, yet a paywalled building stays LOCKED for them (PageGate\'s staff, not the campus\'s)', async () => {
    set({ mgmt: true, full: false });
    await render(<Probe />);
    expect(view!.audience).toBe('staff');
    expect(state('testing')).toBe('locked');
  });

  it('page staff unlocks it, as PageGate does', async () => {
    set({ pageStaff: true, full: false });
    await render(<Probe />);
    expect(state('testing')).toBe('open');
  });

  it('an org manager on an Explorer account: business campus, and Project Studio is a DEMO (is_explorer, not the audience)', async () => {
    set({ manager: true, explorer: true, full: true });
    await render(<Probe />);
    expect(view!.audience).toBe('business');
    expect(state('studio')).toBe('demo');
    expect(view!.isExplorer).toBe(true);
  });
});

describe('the nav\'s "Your path" link (C16: it moved from the old banner)', () => {
  it('an Explorer sees it, and it opens the map at the Main Gate', async () => {
    set({ explorer: true });
    await render(<CampusNav active="/portal/library" />);
    const btn = container.querySelector('[data-testid="cm-your-path"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    await act(async () => { btn.click(); });
    expect(mockOpened).toEqual(['gate']);
  });

  it('staff do not see it: their campus has the Main Gate, but the path to enrolling is an Explorer's', async () => {
    set({ mgmt: true });
    await render(<CampusNav active="/portal/library" />);
    expect(container.querySelector('[data-testid="cm-your-path"]')).toBeNull();
  });

  it('a member does not see it', async () => {
    await render(<CampusNav active="/portal/library" />);
    expect(container.querySelector('[data-testid="cm-your-path"]')).toBeNull();
  });

  it('a business viewer on an Explorer account does not see it (their campus has no Main Gate, so no path)', async () => {
    set({ manager: true, explorer: true });
    await render(<CampusNav active="/portal/library" />);
    expect(container.querySelector('[data-testid="cm-your-path"]')).toBeNull();
  });
});

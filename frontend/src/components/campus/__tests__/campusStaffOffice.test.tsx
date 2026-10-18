/**
 * C6 Staff Office: its links reach their admin pages through the Management Portal bridge, which honors ONLY three
 * allowlisted destinations (no open redirect); without Management Portal access the links are disabled with the reason.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockPost: () => Promise<unknown> = async () => ({ data: { admin_token: 'admin.jwt', role: 'ops' } });
jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { post: () => mockPost() } }));
let mockIsMgmt = true;
jest.mock('../campusMgmt', () => ({ useIsMgmt: () => mockIsMgmt, fetchIsMgmt: () => Promise.resolve(mockIsMgmt) }));

// eslint-disable-next-line import/first
import PortalMgmtEnterPage from '../../../pages/portal/PortalMgmtEnterPage';
// eslint-disable-next-line import/first
import { allowedMgmtNext, mgmtBridgeTo, MGMT_NEXT_ALLOWLIST } from '../../../pages/portal/mgmtNext';
// eslint-disable-next-line import/first
import BuildingCard from '../BuildingCard';
// eslint-disable-next-line import/first
import { campusBuildingsFor } from '../useCampusView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(ui); });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); window.localStorage.clear(); });

describe('allowedMgmtNext (the bridge allowlist)', () => {
  it.each(MGMT_NEXT_ALLOWLIST.map((p) => [p]))('honors %s', (p) => {
    expect(allowedMgmtNext('?next=' + encodeURIComponent(p))).toBe(p);
    expect(allowedMgmtNext(mgmtBridgeTo(p).split('?')[1] ? '?' + mgmtBridgeTo(p).split('?')[1] : '')).toBe(p);
  });
  it.each([
    ['nothing', ''], ['another admin page', '?next=%2Fadmin%2Fsettings'], ['a protocol-relative URL', '?next=%2F%2Fexample.com'],
    ['an absolute URL', '?next=https%3A%2F%2Fevil.example'], ['a lookalike', '?next=%2Fadmin%2Fpeople%2F..%2Fsettings'],
  ])('ignores %s', (_n, search) => {
    expect(allowedMgmtNext(search)).toBeNull();
  });
});

describe('PortalMgmtEnterPage with next', () => {
  let replaced: string[] = [];
  const realLocation = window.location;
  const visit = async (search: string) => {
    replaced = [];
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, search, replace: (u: string) => { replaced.push(u); } } });
    await render(<PortalMgmtEnterPage />);
  };
  afterEach(() => { Object.defineProperty(window, 'location', { configurable: true, value: realLocation }); });

  it('an allowlisted next lands there once the admin session is open', async () => {
    await visit('?next=' + encodeURIComponent('/admin/people'));
    expect(replaced).toEqual(['/admin/people']);
    expect(window.localStorage.getItem('admin_token')).toBe('admin.jwt');
  });
  it.each([['no next', ''], ['//example.com', '?next=%2F%2Fexample.com'], ['an unlisted admin page', '?next=%2Fadmin%2Fsettings']])('%s lands on the dashboard, as before', async (_n, search) => {
    await visit(search);
    expect(replaced).toEqual(['/admin/dashboard']);
  });
  it('support with no next still lands on students, as before', async () => {
    mockPost = async () => ({ data: { admin_token: 'admin.jwt', role: 'support' } });
    await visit('');
    expect(replaced).toEqual(['/admin/students']);
    mockPost = async () => ({ data: { admin_token: 'admin.jwt', role: 'ops' } });
  });
  it('no management access: no redirect, no token stored', async () => {
    mockPost = async () => ({ data: {} });
    await visit('?next=' + encodeURIComponent('/admin/people'));
    expect(replaced).toEqual([]);
    expect(window.localStorage.getItem('admin_token')).toBeNull();
    mockPost = async () => ({ data: { admin_token: 'admin.jwt', role: 'ops' } });
  });
});

describe('the Staff Office card', () => {
  const office = campusBuildingsFor('staff').find((b) => b.id === 'career')!;
  const card = () => <MemoryRouter><BuildingCard building={office} access="open" workplaceNames={false} onClose={() => undefined} onNavigate={() => undefined} /></MemoryRouter>;

  it('with Management Portal access: every link opens the bridge in a new tab, safely', async () => {
    mockIsMgmt = true;
    await render(card());
    const links = Array.from(container.querySelectorAll('a[data-admin="true"]'));
    expect(links.map((a) => a.textContent)).toEqual(['Open the Management Portal', 'Handoffs', 'People', 'View as a learner']);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('href')!.startsWith('/portal/mgmt-enter')).toBe(true);
    }
    expect(container.querySelector('[data-testid="cm-admin-note"]')?.textContent).toBe('Opens the Management Portal in a new tab.');
  });

  it('without it (staff by role only): the links are disabled, with the reason, never dead links', async () => {
    mockIsMgmt = false;
    await render(card());
    expect(container.querySelectorAll('a[data-admin="true"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-admin="true"][aria-disabled="true"]')).toHaveLength(4);
    expect(container.querySelector('[data-testid="cm-admin-note"]')?.textContent).toBe('Needs Management Portal access.');
  });
});

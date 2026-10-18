/**
 * C6 campus staff = page staff (is_staff) OR the Management Portal bridge's status, in the browser; the cached management read
 * asks once per page load, uses its own request (no redirect interceptor), and fails closed.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

let mockPageStaff = false;
let mockManager = false;
let mockExplorer = false;
jest.mock('../../../pages/portal/useEntitlement', () => ({ useEntitlement: () => ({ isStaff: mockPageStaff, hasFullAccess: true, loading: false }) }));
jest.mock('../../../pages/portal/useIsOrgManager', () => ({ useOrgManager: () => ({ isManager: mockManager, org: null, loaded: true }) }));
jest.mock('../../../pages/portal/useIsExplorer', () => ({ useIsExplorer: () => mockExplorer }));
jest.mock('../../../pages/portal/useInternshipNav', () => ({ useInternshipNav: () => ({ isIntern: false }) }));
let mockGets: string[] = [];
let mockGet: () => Promise<unknown> = async () => ({ data: { is_mgmt: false } });
jest.mock('axios', () => ({ __esModule: true, default: { get: (url: string) => { mockGets.push(url); return mockGet(); } } }));

// eslint-disable-next-line import/first
import { useCampusAudience } from '../useCampusAudience';
// eslint-disable-next-line import/first
import { fetchIsMgmt, __resetMgmtCacheForTests } from '../campusMgmt';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;
let audience = '';
function Probe(): null { audience = useCampusAudience().audience; return null; }
async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<Probe />); });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}
beforeEach(() => {
  __resetMgmtCacheForTests();
  mockGets = []; mockPageStaff = false; mockManager = false; mockExplorer = false;
  mockGet = async () => ({ data: { is_mgmt: false } });
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
});
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); window.localStorage.clear(); });

describe('campus staff in the browser', () => {
  it('a Management Portal user is staff even though the page gate says not staff', async () => {
    mockGet = async () => ({ data: { is_mgmt: true } });
    mockManager = true; mockExplorer = true;
    await mount();
    expect(audience).toBe('staff');
  });

  it('page staff alone is staff; neither is the next audience down', async () => {
    mockPageStaff = true;
    await mount();
    expect(audience).toBe('staff');
    act(() => root!.unmount()); container.remove(); root = undefined;
    mockPageStaff = false; mockManager = true; __resetMgmtCacheForTests();
    await mount();
    expect(audience).toBe('business');
  });

  it('a failed management read is not staff (fail closed)', async () => {
    mockGet = async () => { throw new Error('500'); };
    mockExplorer = true;
    await mount();
    expect(audience).toBe('explorer');
  });
});

describe('fetchIsMgmt', () => {
  it('asks once per page load, at the bridge status endpoint, however many callers', async () => {
    mockGet = async () => ({ data: { is_mgmt: true } });
    await expect(Promise.all([fetchIsMgmt(), fetchIsMgmt(), fetchIsMgmt()])).resolves.toEqual([true, true, true]);
    expect(mockGets).toHaveLength(1);
    expect(mockGets[0]).toMatch(/\/api\/portal\/mgmt\/status$/);
  });

  it('signed out: false without any request', async () => {
    window.localStorage.clear();
    await expect(fetchIsMgmt()).resolves.toBe(false);
    expect(mockGets).toHaveLength(0);
  });

  it('a malformed body is false', async () => {
    mockGet = async () => ({ data: { is_mgmt: 'yes' } });
    await expect(fetchIsMgmt()).resolves.toBe(false);
  });
});

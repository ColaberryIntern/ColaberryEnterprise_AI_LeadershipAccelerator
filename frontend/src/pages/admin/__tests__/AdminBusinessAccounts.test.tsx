import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminBusinessAccountsPage from '../AdminBusinessAccountsPage';
import AdminBusinessAccountDetailPage from '../AdminBusinessAccountDetailPage';
import * as orgApi from '../../../services/adminOrgApi';

jest.mock('../../../services/adminOrgApi');

const api = orgApi as jest.Mocked<typeof orgApi>;

/**
 * The assertion these tests exist for:
 *
 *   A FAILED LOAD AND AN EMPTY RESULT MUST NOT RENDER THE SAME.
 *
 * The admin leads page shipped the collapsed version of this — it caught a
 * failed fetch with `console.error` and nothing else, left its rows at [], and
 * rendered "No leads yet. Click '+ Add Lead' to get started." That message was
 * shown to an operator against 24,244 real lead rows. It is a claim about the
 * database, made when the request had simply failed.
 */

let container: HTMLDivElement;
let root: Root;

function mount(ui: React.ReactElement, path = '/admin/business-accounts'): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
  });
}

/** Flush the mounted component's pending promises. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const text = (): string => container.textContent ?? '';

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  jest.clearAllMocks();
});

const emptyStats = { total: 0, active: 0, suspended: 0, with_cohorts: 0 };

describe('AdminBusinessAccountsPage — broken is not the same as empty', () => {
  it('says the load failed, and does NOT claim there are no accounts', async () => {
    api.listOrganizations.mockRejectedValue({ response: { status: 500 } });
    api.getOrganizationStats.mockResolvedValue(emptyStats);
    api.describeApiError.mockReturnValue('Could not load business accounts (HTTP 500).');

    mount(<AdminBusinessAccountsPage />);
    await settle();

    expect(text()).toContain('Could not load business accounts');
    expect(text()).not.toContain('No business accounts yet');
  });

  it('names an auth failure specifically, so the operator re-authenticates', async () => {
    api.listOrganizations.mockRejectedValue({ response: { status: 401 } });
    api.getOrganizationStats.mockResolvedValue(emptyStats);
    api.describeApiError.mockReturnValue(
      'Your session is not authorized to read business accounts. Sign in again.',
    );

    mount(<AdminBusinessAccountsPage />);
    await settle();

    expect(text()).toContain('Sign in again');
    expect(text()).not.toContain('No business accounts yet');
  });

  it('claims emptiness ONLY when the request actually succeeded with no rows', async () => {
    api.listOrganizations.mockResolvedValue({
      organizations: [], total: 0, page: 1, totalPages: 1,
    });
    api.getOrganizationStats.mockResolvedValue(emptyStats);

    mount(<AdminBusinessAccountsPage />);
    await settle();

    expect(text()).toContain('No business accounts yet');
  });

  it('renders a company row with its owner and rollups', async () => {
    api.listOrganizations.mockResolvedValue({
      organizations: [
        {
          id: 'org-1', name: 'Colaberry', status: 'active', auto_staff_sync: true,
          created_at: '2026-07-21T00:00:00Z', owner_email: 'ali@colaberry.com',
          owner_name: 'Ali Muwwakkil', member_count: 19, active_member_count: 18,
          cohort_count: 2, lead_id: 24491,
        },
      ],
      total: 1, page: 1, totalPages: 1,
    });
    api.getOrganizationStats.mockResolvedValue({
      total: 5, active: 5, suspended: 0, with_cohorts: 1,
    });

    mount(<AdminBusinessAccountsPage />);
    await settle();

    expect(text()).toContain('Colaberry');
    expect(text()).toContain('ali@colaberry.com');
    expect(text()).toContain('19');
    expect(text()).toContain('18 active');
    expect(text()).toContain('#24491');
  });
});

describe('AdminBusinessAccountDetailPage — seats sponsored vs members placed', () => {
  const detail = (over: Partial<orgApi.OrgDetailResponse> = {}): orgApi.OrgDetailResponse => ({
    organization: {
      id: 'org-1', name: 'Colaberry', status: 'active', auto_staff_sync: true,
      created_at: '2026-07-21T00:00:00Z', status_changed_at: null, status_changed_by: null,
    },
    owner: { id: 'e1', email: 'ali@colaberry.com', full_name: 'Ali Muwwakkil' },
    lead: { id: 24491, email: 'ali@colaberry.com', company: 'Colaberry', status: 'new', source: 'website' },
    members: [],
    cohorts: [
      {
        link_id: 'l1', cohort_id: 'c1', name: 'July 2026', start_date: null,
        status: 'open', seats_sponsored: 10, members_placed: 4,
      },
    ],
    stats: {
      member_count: 19, active_member_count: 18, invited_member_count: 1,
      manager_count: 6, cohort_count: 1, members_with_cohort: 4, members_without_cohort: 15,
    },
    ...over,
  });

  const mountDetail = async (d: orgApi.OrgDetailResponse) => {
    api.getOrganization.mockResolvedValue(d);
    api.listCohortsForLinking.mockResolvedValue([]);
    mount(
      <Routes>
        <Route path="/admin/business-accounts/:id" element={<AdminBusinessAccountDetailPage />} />
      </Routes>,
      '/admin/business-accounts/org-1',
    );
    await settle();
  };

  it('shows both numbers and names the shortfall, rather than one blended figure', async () => {
    // Linking a cohort moves nobody into it, so sponsored and placed genuinely
    // differ. The gap IS the unfilled seats; showing a single number hides it.
    await mountDetail(detail());
    expect(text()).toContain('10'); // seats sponsored
    expect(text()).toContain('4'); // members placed
    expect(text()).toContain('6 unfilled');
  });

  it('does not invent a shortfall when no seat count was recorded', async () => {
    const d = detail();
    d.cohorts[0].seats_sponsored = null;
    await mountDetail(d);
    expect(text()).not.toContain('unfilled');
  });

  it('flags members who are in no cohort at all', async () => {
    await mountDetail(detail());
    expect(text()).toContain('15 not placed');
  });

  it('surfaces a load failure instead of rendering an empty company', async () => {
    api.getOrganization.mockRejectedValue({ response: { status: 500 } });
    api.listCohortsForLinking.mockResolvedValue([]);
    api.describeApiError.mockReturnValue('Could not load this business account (HTTP 500).');

    mount(
      <Routes>
        <Route path="/admin/business-accounts/:id" element={<AdminBusinessAccountDetailPage />} />
      </Routes>,
      '/admin/business-accounts/org-1',
    );
    await settle();

    expect(text()).toContain('Could not load this business account');
  });

  it('says plainly when an account has no lead, and why that happens', async () => {
    await mountDetail(detail({ lead: null }));
    expect(text()).toContain('No lead is linked to this account');
  });

  it('shows who suspended an account and when', async () => {
    await mountDetail(
      detail({
        organization: {
          id: 'org-1', name: 'Colaberry', status: 'suspended', auto_staff_sync: false,
          created_at: '2026-07-21T00:00:00Z',
          status_changed_at: '2026-08-15T00:00:00Z',
          status_changed_by: 'ali@colaberry.com',
        },
      }),
    );
    expect(text()).toContain('suspended');
    expect(text()).toContain('ali@colaberry.com');
    expect(text()).toContain('Re-enable account');
  });
});

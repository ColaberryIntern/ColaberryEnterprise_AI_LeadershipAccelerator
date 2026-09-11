import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import api from '../../../../../utils/api';
import ProjectDeliveryView from '../../ProjectDeliveryView';
import WithoutProjectPanel, { intervention, ROW_CAP, WithoutProjectRow } from '../WithoutProjectPanel';

jest.mock('../../../../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

/**
 * The gap this closes: the delivery table is built from projects, so a student
 * who never created one is absent from it entirely. On production 2026-09-10 that
 * was 24 of 49 active July enrollments — 9 of them paying external students who
 * appeared nowhere on the board being used to judge cohort health.
 */

const mockGet = api.get as jest.Mock;
let container: HTMLDivElement;
let root: Root;

const row = (over: Partial<WithoutProjectRow> = {}): WithoutProjectRow => ({
  enrollment_id: 'e1', student_name: 'Sonya Parker', student_email: 'sonya28tx@example.com',
  cohort_name: 'Cohort - July 2026', payment_status: 'paid', tier: 'member',
  amount_paid: '199.00', enrolled_on: '2026-07-07', internal: false, ...over,
});

const summary = (over: Record<string, unknown> = {}) => ({
  active_enrollments: 49, with_project: 25, without_project: 24,
  paid_external_without_project: 9,
  rows: [
    ...Array.from({ length: 9 }, (_, i) => row({ enrollment_id: `p${i}` })),
    ...Array.from({ length: 11 }, (_, i) => row({ enrollment_id: `q${i}`, payment_status: 'pending' })),
    ...Array.from({ length: 4 }, (_, i) => row({ enrollment_id: `r${i}`, internal: true })),
  ],
  ...over,
});

beforeEach(() => {
  mockGet.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

function renderPanel(data: any) {
  act(() => { root.render(<WithoutProjectPanel data={data} />); });
}
function toggle() {
  const btn = container.querySelector('button');
  act(() => { btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('WithoutProjectPanel', () => {
  it('leads with the count and the denominator', () => {
    renderPanel(summary());
    expect(container.textContent).toContain('24 enrolled with no project');
    expect(container.textContent).toContain('25 of 49 active enrollments have one');
  });

  it('separates "paying and holding nothing" from the raw count', () => {
    // 24 is the gap; 9 is the list to act on. Conflating them overstates the
    // intervention by 167%.
    renderPanel(summary());
    expect(container.textContent).toContain('9 paying and holding nothing');
  });

  it('lists only the paying external students when expanded', () => {
    renderPanel(summary());
    toggle();
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(9);
  });

  it('SAYS when it caps the list rather than truncating silently', () => {
    // A silent truncation reads as "that is everyone", which is the one thing it
    // must never imply. Unscoped, this spans 444 rows on production.
    renderPanel(summary({
      without_project: 60,
      rows: Array.from({ length: 60 }, (_, i) => row({ enrollment_id: `x${i}` })),
    }));
    toggle();
    expect(container.querySelectorAll('tbody tr').length).toBe(ROW_CAP);
    expect(container.textContent).toContain(`Showing ${ROW_CAP} of 60`);
    expect(container.textContent).toContain('35 more not listed');
  });

  it('states the all-clear rather than rendering nothing', () => {
    // An absent panel is ambiguous between "everyone has a project" and "this
    // never loaded".
    renderPanel(summary({ without_project: 0, rows: [] }));
    expect(container.textContent).toContain('Every active enrollment in scope has a project');
  });

  it('explains an empty list instead of showing a blank table', () => {
    renderPanel(summary({
      without_project: 4, paid_external_without_project: 0,
      rows: Array.from({ length: 4 }, (_, i) => row({ enrollment_id: `r${i}`, internal: true })),
    }));
    toggle();
    expect(container.textContent).toContain('None of them are paying external students');
  });

  it('renders nothing at all when the data never arrived', () => {
    renderPanel(null);
    expect(container.textContent).toBe('');
  });
});

describe('intervention()', () => {
  it('keeps paying external rows only', () => {
    const rows = [
      row({ enrollment_id: 'keep' }),
      row({ enrollment_id: 'pending', payment_status: 'pending' }),
      row({ enrollment_id: 'internal', internal: true }),
    ];
    expect(intervention(rows).map((r) => r.enrollment_id)).toEqual(['keep']);
  });
});

describe('the panel never takes the board down with it', () => {
  it('renders the delivery table even when the without-project request fails', async () => {
    // The table is the page. A supplementary panel failing must not surface as
    // "Could not load project delivery."
    mockGet.mockImplementation((url: string) => (
      url.includes('without-project')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ data: { projects: [] } })
    ));
    await act(async () => {
      root.render(<MemoryRouter><ProjectDeliveryView /></MemoryRouter>);
    });
    expect(container.textContent).not.toContain('Could not load project delivery');
    expect(container.textContent).toContain('No projects found for this scope');
  });

  it('still surfaces a real delivery failure', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    await act(async () => {
      root.render(<MemoryRouter><ProjectDeliveryView /></MemoryRouter>);
    });
    expect(container.textContent).toContain('Could not load project delivery');
  });
});

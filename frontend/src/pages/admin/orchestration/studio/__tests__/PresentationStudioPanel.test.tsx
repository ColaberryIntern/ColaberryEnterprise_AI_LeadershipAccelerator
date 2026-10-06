import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PresentationStudioPanel from '../PresentationStudioPanel';
import api from '../../../../../utils/api';

jest.mock('../../../../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const mockApi = api as unknown as { get: jest.Mock; post: jest.Mock; put: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

const COHORT = '11111111-2222-4333-8444-555555555555';
const BOOKING = '99999999-2222-4333-8444-555555555555';

const planRow = (over: Record<string, unknown> = {}) => ({
  assignmentId: 'aaaaaaaa-2222-4333-8444-555555555555',
  projectId: 'bbbbbbbb-2222-4333-8444-555555555555',
  storyId: 'PREP-6',
  cohortId: COHORT,
  attemptId: null,
  currentBookingId: null,
  outcome: 'will_map',
  actions: ['Create a cohort_live attempt and point it at this room.'],
  blocked_reason: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/api/admin/cohorts') return Promise.resolve({ data: [{ id: COHORT, cohort_name: 'Nov 2026' }] });
    if (url === '/api/admin/presentation/templates') return Promise.resolve({ data: [{ id: 'demo-day', label: 'Demo Day' }] });
    if (url.endsWith('/required-template')) return Promise.resolve({ data: { template: '' } });
    return Promise.resolve({ data: {} });
  });
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

async function mount() {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<PresentationStudioPanel />);
  });
}

function setSelect(id: string, value: string) {
  const el = container.querySelector(`#${id}`) as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function setInput(id: string, value: string) {
  const el = container.querySelector(`#${id}`) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const buttonSaying = (text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes(text));

describe('the panel is explicit that everything is cohort-scoped', () => {
  it('says so before any control is touched', async () => {
    await mount();
    expect(container.textContent).toContain('scoped to one cohort');
    expect(container.textContent).toContain('legacy presentation and demo instances');
  });

  it('shows no controls until a cohort is chosen', async () => {
    await mount();
    expect(container.querySelector('#ps-template')).toBeNull();
    setSelect('ps-cohort', COHORT);
    expect(container.querySelector('#ps-template')).not.toBeNull();
  });

  // Setting a template is NOT retroactive. An instructor must be told that where the
  // control is, not in a changelog.
  it('states that the override is not retroactive, next to the control', async () => {
    await mount();
    setSelect('ps-cohort', COHORT);
    expect(container.textContent).toContain('not retroactive');
    expect(container.textContent).toContain('this cohort only');
  });

  it('saves the template against that cohort alone', async () => {
    mockApi.put.mockResolvedValue({ data: {} });
    await mount();
    setSelect('ps-cohort', COHORT);
    await act(async () => { setSelect('ps-template', 'demo-day'); });
    expect(mockApi.put).toHaveBeenCalledWith(
      `/api/admin/presentation/cohorts/${COHORT}/required-template`,
      { template: 'demo-day' },
    );
  });
});

/**
 * The guarantee: nothing is written until an instructor has read a plan and pressed
 * commit on it. A single button that both decides and writes is the shape this avoids.
 */
describe('mapping a cohort to a room previews before it writes', () => {
  async function planFor(rows: any[]) {
    mockApi.post.mockResolvedValueOnce({
      data: { dry_run: true, bookingId: BOOKING, cohortId: COHORT, storyId: 'PREP-6', booking_exists: true, rows, summary: {} },
    });
    await mount();
    setSelect('ps-cohort', COHORT);
    setInput('ps-booking', BOOKING);
    await act(async () => { buttonSaying('Preview the change')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }

  it('the preview calls only the plan endpoint — never commit', async () => {
    await planFor([planRow()]);
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockApi.post.mock.calls[0][0]).toBe('/api/admin/presentation/session-map/plan');
  });

  it('shows what would happen to each row, and says nothing is written yet', async () => {
    await planFor([planRow(), planRow({ assignmentId: 'cccccccc-2222-4333-8444-555555555555', outcome: 'already_mapped' })]);
    expect(container.textContent).toContain('Will be mapped');
    expect(container.textContent).toContain('Already in this room');
    expect(container.textContent).toContain('Nothing has been written yet');
  });

  // Moving a student OUT of a room they were already booked into is the most
  // consequential outcome on this screen and must not read like a no-op.
  it('calls a remap a move, in words', async () => {
    await planFor([planRow({ outcome: 'will_remap', currentBookingId: 'dddddddd-2222-4333-8444-555555555555' })]);
    expect(container.textContent).toContain('MOVE from another room');
  });

  it('shows the reason a blocked row is blocked', async () => {
    await planFor([planRow({ outcome: 'blocked_no_booking', blocked_reason: 'That room booking no longer exists.' })]);
    expect(container.textContent).toContain('no longer exists');
  });

  it('refuses to commit when nothing would change', async () => {
    await planFor([planRow({ outcome: 'already_mapped' })]);
    const commit = buttonSaying('Commit');
    expect(commit).toBeTruthy();
    expect((commit as HTMLButtonElement).disabled).toBe(true);
  });

  it('commits the plan it showed, unmodified', async () => {
    await planFor([planRow()]);
    mockApi.post.mockResolvedValueOnce({ data: { dry_run: false, rows: [], summary: { mapped: 1, skipped: 0, failed: 0 } } });
    await act(async () => { buttonSaying('Commit')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const [url, body] = mockApi.post.mock.calls[1];
    expect(url).toBe('/api/admin/presentation/session-map/commit');
    expect(body.plan.rows).toHaveLength(1);
    expect(container.textContent).toContain('Mapped 1');
  });

  it('explains a skipped row rather than leaving a silent discrepancy', async () => {
    await planFor([planRow()]);
    mockApi.post.mockResolvedValueOnce({ data: { dry_run: false, rows: [], summary: { mapped: 0, skipped: 1, failed: 0 } } });
    await act(async () => { buttonSaying('Commit')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('re-proved on');
  });
});

describe('changing cohort does not leave the previous one on screen', () => {
  // Committing a map against the wrong cohort is exactly how this would go wrong.
  it('clears a plan when the cohort changes', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { dry_run: true, bookingId: BOOKING, cohortId: COHORT, storyId: 'PREP-6', booking_exists: true, rows: [planRow()], summary: {} },
    });
    await mount();
    setSelect('ps-cohort', COHORT);
    setInput('ps-booking', BOOKING);
    await act(async () => { buttonSaying('Preview the change')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Will be mapped');

    await act(async () => { setSelect('ps-cohort', ''); });
    expect(container.textContent).not.toContain('Will be mapped');
  });
});

describe('failures say what happened', () => {
  it('a readiness failure is an error, not an empty cohort', async () => {
    await mount();
    setSelect('ps-cohort', COHORT);
    mockApi.get.mockRejectedValueOnce(new Error('boom'));
    await act(async () => { buttonSaying('Check who has started')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain('Could not load readiness');
  });

  it('a 404 is reported as the Studio being switched off, not as a missing cohort', async () => {
    await mount();
    setSelect('ps-cohort', COHORT);
    mockApi.get.mockRejectedValueOnce({ response: { status: 404 } });
    await act(async () => { buttonSaying('Check who has started')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('switched off');
  });
});

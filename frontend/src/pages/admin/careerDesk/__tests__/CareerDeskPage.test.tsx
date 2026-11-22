import React from 'react';
import CareerDeskPage, { DESK_TABS } from '../CareerDeskPage';
import { mountAt, q, unmount } from '../deskTestKit';

/**
 * CP11.1b (kit F9): the desk page at the kit's four routes, the switches as the server reads them (on / off / could not be
 * read), the recruiters (D3: Karthik and Vivek, from the server), the Zoom-permission notice, the Student prep link, and an
 * unknown tab sent to the queue. The tabs are mocked here; each has its own test.
 */
const mockOverview = jest.fn();
jest.mock('../careerDeskApi', () => ({ ...jest.requireActual('../careerDeskApi'), loadOverview: (...a: unknown[]) => mockOverview(...a) }));
jest.mock('../DeskQueueTab', () => () => <p data-testid="tab-queue">queue</p>);
jest.mock('../DeskInboxesTab', () => () => <p data-testid="tab-inboxes">inboxes</p>);
jest.mock('../DeskBookingsTab', () => () => <p data-testid="tab-bookings">bookings</p>);
jest.mock('../DeskFeesTab', () => () => <p data-testid="tab-fees">fees</p>);

const overview = { recruiters: [{ name: 'Karthik' }, { name: 'Vivek' }], switches: { employerMail: 'off', inboxTests: 'unreadable' }, recording: null, heldNote: 'x' };
beforeEach(() => mockOverview.mockReset());
afterEach(unmount);

describe('the interview desk page', () => {
  it.each(DESK_TABS.map((t) => [t.key, t.label]))('/admin/placement/%s shows the %s tab, marked current', async (key, label) => {
    mockOverview.mockResolvedValue(overview);
    const h = await mountAt(`/admin/placement/${key}`, <CareerDeskPage />);
    expect(h.querySelector('h1')?.textContent).toBe(label);
    expect(q(h, `tab-${key}`)).not.toBeNull();
    expect(q(h, `cdesk-tab-${key}`)?.getAttribute('aria-current')).toBe('page');
    expect(h.querySelectorAll('nav[aria-label="Interview desk"] a').length).toBe(4);
  });

  it('the switches, the recruiters and the Student prep link; no recording notice when the server sends none', async () => {
    mockOverview.mockResolvedValue(overview);
    const h = await mountAt('/admin/placement/queue', <CareerDeskPage />);
    expect(q(h, 'cdesk-sw-mail')?.textContent).toBe('Off');
    expect(q(h, 'cdesk-sw-tests')?.textContent).toBe('Could not be read (treated as off)');
    expect(q(h, 'cdesk-recruiters')?.textContent).toBe('Recruiters: Karthik, Vivek');
    expect([...h.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/admin/placement/students')).toBe(true);
    expect(q(h, 'cdesk-recording')).toBeNull();
  });

  it('shows the Zoom-permission notice and an "On" switch as served', async () => {
    mockOverview.mockResolvedValue({ ...overview, switches: { employerMail: 'on', inboxTests: 'off' },
      recording: { status: 'scope_missing', note: 'Recording unavailable: Zoom permission missing', since: '2026-11-21T00:00:00.000Z' } });
    const h = await mountAt('/admin/placement/bookings', <CareerDeskPage />);
    expect(q(h, 'cdesk-recording')?.textContent).toBe('Recording unavailable: Zoom permission missing');
    expect(q(h, 'cdesk-sw-mail')?.textContent).toBe('On');
  });

  it('an unknown tab goes to the review queue', async () => {
    mockOverview.mockResolvedValue(overview);
    const h = await mountAt('/admin/placement/nope', <CareerDeskPage />);
    expect(q(h, 'tab-queue')).not.toBeNull();
  });

  it('a failed overview is an alert; the tab still works', async () => {
    mockOverview.mockRejectedValue({ response: { status: 403 } });
    const h = await mountAt('/admin/placement/fees', <CareerDeskPage />);
    expect(q(h, 'cdesk-overview-error')?.textContent).toContain('You do not have access to Placement.');
    expect(q(h, 'tab-fees')).not.toBeNull();
  });
});

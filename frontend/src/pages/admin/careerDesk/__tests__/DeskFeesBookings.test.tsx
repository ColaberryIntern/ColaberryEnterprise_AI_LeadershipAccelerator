import React from 'react';
import DeskFeesTab from '../DeskFeesTab';
import DeskBookingsTab from '../DeskBookingsTab';
import { click, inboxesOf, mountAt, q, typeInto, unmount } from '../deskTestKit';
import type { DeskBookings, DeskPlacements } from '../careerDeskApi';

/**
 * CP11.1b (kit F9) Placements and fees (KPIs incl. fees pending, the fee rate from the server, invoice status, put forward)
 * and Bookings (Central labels, type and interviewers, the recording note, setting the type), with honest empty states.
 */
const mockPlacements = jest.fn();
const mockInboxes = jest.fn();
const mockBookings = jest.fn();
const mockInvoice = jest.fn();
const mockPut = jest.fn();
const mockType = jest.fn();
jest.mock('../careerDeskApi', () => ({
  ...jest.requireActual('../careerDeskApi'),
  loadPlacements: (...a: unknown[]) => mockPlacements(...a), loadInboxes: (...a: unknown[]) => mockInboxes(...a), loadBookings: (...a: unknown[]) => mockBookings(...a),
  setInvoiceStatus: (...a: unknown[]) => mockInvoice(...a), putForward: (...a: unknown[]) => mockPut(...a), setInterviewType: (...a: unknown[]) => mockType(...a),
}));
const E = '11111111-1111-4111-8111-111111111111';
const C = '33333333-3333-4333-8333-333333333333';
const placements: DeskPlacements = {
  feeRate: { rate: 1.1, label: '110%' },
  kpis: { openOffers: 1, accepted: 1, feesPending: '$115,500', fees: '$118,976', invoiced: '$0', paid: '$0' },
  offers: [
    { offerId: 'o1', enrollmentId: E, learner: 'Ann Lee', client: 'Northgate Logistics', company: 'Northgate Logistics', role: 'AI Operations Associate', pay: '$52.00 an hour, 40 h a week',
      firstYear: '$108,160', feeRate: '110%', fee: '$118,976', feeCents: 11_897_600, status: 'accepted', statusLabel: 'Accepted', startDate: '2026-12-07', sentAt: '2026-11-20T15:00:00.000Z',
      invoice: { id: '9', status: 'not_invoiced', statusLabel: 'Not invoiced' } },
    { offerId: 'o2', enrollmentId: E, learner: 'Ann Lee', client: null, company: 'Orbit Retail', role: 'Analyst', pay: '$105,000 a year', firstYear: '$105,000', feeRate: '110%',
      fee: '$115,500', feeCents: 11_550_000, status: 'sent', statusLabel: 'Sent', startDate: null, sentAt: '2026-11-21T15:00:00.000Z', invoice: null },
  ],
  clients: [{ id: C, name: 'Northgate Logistics', candidates: 1 }],
};
const bookings: DeskBookings = { recording: null, bookings: [{ interviewId: 'b1', enrollmentId: E, learner: 'Ann Lee', company: 'Northwind', position: 'ML Engineer', type: null,
  typeLine: 'Interview, 30 min, with Pat Doe', interviewers: ['Pat Doe'], startsAt: '2026-11-24T20:00:00.000Z', startsLabel: 'Tue, Nov 24, 2:00 PM', minutes: 30, state: 'booked',
  stateLabel: 'Booked', recording: 'Not recorded: someone said no' }] };
beforeEach(() => { [mockPlacements, mockInboxes, mockBookings, mockInvoice, mockPut, mockType].forEach((m) => m.mockReset()); mockInboxes.mockResolvedValue(inboxesOf()); });
afterEach(unmount);

describe('placements and fees', () => {
  it('KPIs: fees earned, fees pending on offers out, the fee rate from the server; a row per offer with its invoice', async () => {
    mockPlacements.mockResolvedValue(placements);
    const h = await mountAt('/admin/placement/fees', <DeskFeesTab />);
    expect(q(h, 'cdesk-kpi-earned')?.textContent).toBe('Accepted · fees earned$118,9761 placement · $0 invoiced · $0 paid');
    expect(q(h, 'cdesk-kpi-pending')?.textContent).toBe('Offers out · fees pending$115,5001 offer');
    expect(q(h, 'cdesk-kpi-rate')?.textContent).toBe('Fee rate110%of first-year salary');
    expect(q(h, 'cdesk-fee-row-o1')?.textContent).toContain('$52.00 an hour, 40 h a week');
    expect(q(h, 'cdesk-fee-row-o2')?.textContent).toContain('Fee applies on acceptance');
    expect(q(h, 'cdesk-fee-row-o2')?.textContent).toContain('Orbit Retail');
  });

  it('changing an invoice status posts it and shows the server message with the audit line', async () => {
    mockPlacements.mockResolvedValue(placements);
    mockInvoice.mockResolvedValue({ ok: true, outcome: 'changed', message: 'Invoice status saved.' });
    const h = await mountAt('/admin/placement/fees', <DeskFeesTab />);
    await typeInto(q(h, 'cdesk-inv-9'), 'invoiced');
    expect(mockInvoice).toHaveBeenCalledWith('9', 'invoiced');
    expect(q(h, 'cdesk-fee-answer-text')?.textContent).toBe('Invoice status saved.');
    expect(q(h, 'cdesk-fee-answer-audit')).not.toBeNull();
  });

  it('put forward waits for a learner, then sends client and learner', async () => {
    mockPlacements.mockResolvedValue(placements);
    mockPut.mockResolvedValue({ ok: true, outcome: 'added', message: 'Put forward: the employer now sees this candidate.' });
    const h = await mountAt('/admin/placement/fees', <DeskFeesTab />);
    const button = () => q(h, `cdesk-pf-${C}`)!.querySelector('button') as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    await typeInto(q(h, `cdesk-pf-pick-${C}`), E);
    await click(button());
    expect(mockPut).toHaveBeenCalledWith(C, E);
  });

  it('empty: no offers and no employer accounts are said plainly', async () => {
    mockPlacements.mockResolvedValue({ ...placements, offers: [], clients: [], kpis: { openOffers: 0, accepted: 0, feesPending: '$0', fees: '$0', invoiced: '$0', paid: '$0' } });
    const h = await mountAt('/admin/placement/fees', <DeskFeesTab />);
    expect(q(h, 'cdesk-fee-empty')?.textContent).toBe('No offer has been made yet.');
    expect(q(h, 'cdesk-pf-empty')?.textContent).toBe('No employer account yet. Employer accounts are added by hand.');
    expect(q(h, 'cdesk-kpi-earned')?.textContent).toContain('0 placements');
  });
});

describe('bookings', () => {
  it('Central label, learner, company, type line with interviewers, state and recording note; setting the type posts it', async () => {
    mockBookings.mockResolvedValue(bookings);
    mockType.mockResolvedValue({ ok: true, outcome: 'changed', message: 'Interview type saved.' });
    const h = await mountAt('/admin/placement/bookings', <DeskBookingsTab />);
    const row = q(h, 'cdesk-bk-row-b1')!.textContent;
    expect(row).toContain('Tue, Nov 24, 2:00 PM');
    expect(q(h, 'cdesk-bk-type-b1')?.textContent).toBe('Interview, 30 min, with Pat Doe');
    expect(row).toContain('Not recorded: someone said no');
    await typeInto(h.querySelector('#cdesk-bk-set-b1'), 'technical');
    expect(mockType).toHaveBeenCalledWith('b1', 'technical');
    expect(q(h, 'cdesk-bk-answer-text')?.textContent).toBe('Interview type saved.');
  });

  it('the recording notice from the server; an empty list is said plainly; a failed load is an alert', async () => {
    mockBookings.mockResolvedValueOnce({ bookings: [], recording: { status: 'scope_missing', note: 'Recording unavailable: Zoom permission missing', since: '2026-11-21T00:00:00.000Z' } });
    let h = await mountAt('/admin/placement/bookings', <DeskBookingsTab />);
    expect(q(h, 'cdesk-bk-recording')?.textContent).toBe('Recording unavailable: Zoom permission missing');
    expect(q(h, 'cdesk-bk-empty')?.textContent).toBe('No interview has a booked time yet.');
    unmount();
    mockBookings.mockRejectedValueOnce({ response: { status: 500 } });
    h = await mountAt('/admin/placement/bookings', <DeskBookingsTab />);
    expect(q(h, 'cdesk-bk-error')?.textContent).toContain('Could not load bookings. Try again.');
  });
});

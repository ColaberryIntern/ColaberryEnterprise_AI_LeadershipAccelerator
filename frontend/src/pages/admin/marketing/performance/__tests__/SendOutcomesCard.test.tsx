import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../../../utils/api').default as { get: jest.Mock };

import SendOutcomesCard, { reasonLabel } from '../SendOutcomesCard';

/**
 * R3: zero reads as zero, cancellations show their reason, and an unexplained cancellation is counted by name.
 * KILLS: a blank where 0 belongs, a card that hides "no reason recorded", or a request for a different window than the funnel.
 */

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); api.get.mockReset(); });

const render = async (days = 30) => { await act(async () => { root.render(<SendOutcomesCard days={days} />); }); };
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

it('asks for the same window as the funnel', async () => {
  api.get.mockResolvedValue({ data: { windowDays: 14, sent: 0, failed: 0, cancelled: 0, cancelledByReason: [] } });
  await render(14);
  expect(api.get).toHaveBeenCalledWith('/api/admin/marketing/funnel/send-outcomes', { params: { days: 14 } });
});

it('production-shaped data: 0 sent reads as "0" with a warning, and each reason is listed, the unexplained ones by name', async () => {
  api.get.mockResolvedValue({ data: { windowDays: 30, sent: 0, failed: 0, cancelled: 19914, cancelledByReason: [
    { reason: 'legacy:brand_no_relationship', count: 19555 }, { reason: 'legacy:kill_switch', count: 345 },
    { reason: 'no_reason_recorded', count: 5 }, { reason: 'sms_opt_out', count: 9 },
  ] } });
  await render();
  expect(q('send-outcomes-sent')?.textContent).toBe('0');
  expect(q('send-outcomes-cancelled')?.textContent).toBe('19,914');
  expect(q('send-outcomes-zero')?.textContent).toContain('Nothing was sent in the last 30 days');
  const text = container.textContent ?? '';
  expect(text).toContain('Brand no relationship');
  expect(text).toContain('No reason recorded');
  expect(text).toContain('19,555');
});

it('a working channel shows no zero warning', async () => {
  api.get.mockResolvedValue({ data: { windowDays: 30, sent: 42, failed: 1, cancelled: 0, cancelledByReason: [] } });
  await render();
  expect(q('send-outcomes-sent')?.textContent).toBe('42');
  expect(q('send-outcomes-zero')).toBeNull();
});

it('a failed request says so instead of showing zeros', async () => {
  api.get.mockRejectedValue(new Error('500'));
  await render();
  expect(q('send-outcomes-error')).not.toBeNull();
  expect(q('send-outcomes-sent')).toBeNull();
});

it('reasonLabel', () => {
  expect(reasonLabel('legacy:brand_no_relationship')).toBe('Brand no relationship');
  expect(reasonLabel('no_reason_recorded')).toBe('No reason recorded');
  expect(reasonLabel('lead_opted_out')).toBe('Lead opted out');
});

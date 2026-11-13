import React from 'react';
import HireHeadlineReview from '../HireHeadlineReview';
import * as api from '../../../services/hireHeadlineAdminApi';
import * as H from '../__fixtures__/domHarness';

/**
 * The admin's "Hire headline changes": today's headline beside the proposed one, approve sends
 * the exact text shown, a stale draft says so, and a mentor (403) sees nothing at all.
 */
jest.mock('../../../services/hireHeadlineAdminApi', () => ({ fetchHeadlineDrafts: jest.fn(), decideHeadline: jest.fn() }));
const m = api as jest.Mocked<typeof api>;

const EID = '22222222-2222-4222-8222-222222222222';
const DRAFT = { enrollmentId: EID, name: 'Ann Lee', slug: 'ann-lee', live: 'Data Analyst', draft: 'AI Systems Architect', updatedAt: '2026-11-13T10:00:00.000Z' };

async function render(): Promise<void> {
  H.mount(<HireHeadlineReview />, '/');
  await H.settle();
}

afterEach(() => { H.unmount(); jest.clearAllMocks(); });

it('shows today\'s headline beside the proposed one, and approves the exact text shown', async () => {
  m.fetchHeadlineDrafts.mockResolvedValueOnce([DRAFT]).mockResolvedValueOnce([]);
  m.decideHeadline.mockResolvedValue(undefined);
  await render();
  expect(H.el(`hire-headline-${EID}`).textContent).toContain('Data Analyst');
  expect(H.el(`hire-headline-${EID}`).textContent).toContain('AI Systems Architect');
  H.click('hire-headline-approve');
  await H.settle();
  expect(m.decideHeadline).toHaveBeenCalledWith(EID, 'approve', 'AI Systems Architect');
  expect(H.text()).toContain('Hire headline is now "AI Systems Architect"');
  expect(H.query(`hire-headline-${EID}`)).toBeNull();
});

it('says what the server said when the draft changed since it was read, and reloads', async () => {
  m.fetchHeadlineDrafts.mockResolvedValue([DRAFT]);
  m.decideHeadline.mockRejectedValue({ response: { status: 409, data: { error: 'This headline changed or was already decided; reload the list' } } });
  await render();
  H.click('hire-headline-reject');
  await H.settle();
  expect(m.decideHeadline).toHaveBeenCalledWith(EID, 'reject', 'AI Systems Architect');
  expect(H.text()).toContain('This headline changed');
  expect(m.fetchHeadlineDrafts).toHaveBeenCalledTimes(2);
});

it('renders nothing for a mentor (403) or when nothing is waiting', async () => {
  m.fetchHeadlineDrafts.mockRejectedValue({ response: { status: 403 } });
  await render();
  expect(H.query('hire-headlines')).toBeNull();
  expect(H.text()).toBe('');
  H.unmount();
  m.fetchHeadlineDrafts.mockReset().mockResolvedValue([]);
  await render();
  expect(H.query('hire-headlines')).toBeNull();
});

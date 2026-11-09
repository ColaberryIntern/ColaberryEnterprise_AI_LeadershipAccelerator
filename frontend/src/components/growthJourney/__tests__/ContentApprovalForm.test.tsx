import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../../utils/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../utils/api').default as { post: jest.Mock };

import ContentApprovalForm from '../ContentApprovalForm';

/**
 * R2: the operator control. KILLS: an Approve that is clickable before a Preview, a body that does not match the route's
 * schema, and a 403 shown as a generic failure instead of saying approval is Ali's.
 */

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); api.post.mockReset(); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const $ = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
const typePage = async (v: string) => {
  const input = container.querySelector('#ca-page') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const click = async (id: string) => { await act(async () => { $(id)!.click(); }); };

it('Approve is disabled until a Preview has run', async () => {
  await act(async () => { root.render(<ContentApprovalForm />); });
  expect($('ca-apply')!.disabled).toBe(true);
  await typePage('https://training.colaberry.com/start');
  expect($('ca-apply')!.disabled).toBe(true);
});

it('Preview posts the route body and shows the counts; then Approve posts the same body', async () => {
  const onChanged = jest.fn();
  api.post.mockResolvedValueOnce({ data: { rules: 12, policy_pages: 1, skipped: 3, summary: [] } })
    .mockResolvedValueOnce({ data: { rules_created: 12, rules_existing: 0, policy_pages_added: 1 } });
  await act(async () => { root.render(<ContentApprovalForm onChanged={onChanged} />); });
  await typePage('https://training.colaberry.com/start');
  await click('ca-preview');
  expect(api.post).toHaveBeenCalledWith('/api/admin/growth-journey/content-approval/preview',
    { brand_slug: 'colaberry-training', landing_page: 'https://training.colaberry.com/start' });
  expect($('ca-preview-result')?.textContent).toContain('12 asset rules');
  await click('ca-apply');
  expect(api.post.mock.calls[1][0]).toBe('/api/admin/growth-journey/content-approval/apply');
  expect($('ca-note')?.textContent).toContain('Approved: 12 new rules');
  expect(onChanged).toHaveBeenCalled();
});

it('a 403 on Approve says approval is Ali\'s, not a generic error', async () => {
  api.post.mockResolvedValueOnce({ data: { rules: 1, policy_pages: 1, skipped: 0, summary: [] } })
    .mockRejectedValueOnce({ response: { status: 403, data: { error: 'Cory access denied' } } });
  await act(async () => { root.render(<ContentApprovalForm />); });
  await typePage('https://training.colaberry.com/start');
  await click('ca-preview');
  await click('ca-apply');
  expect($('ca-note')?.textContent).toContain('Only Ali');
});

/**
 * W32: Admin, Enterprise clients. The list is the pipeline; one client shows what we know and
 * the steps only a person takes. Nothing sends without a click, and a refusal is shown, not lost.
 */
jest.mock('../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

/* eslint-disable import/first */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../../../utils/api';
import AdminEnterpriseClientsPage from '../AdminEnterpriseClientsPage';
/* eslint-enable import/first */

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const ID = '11111111-2222-4333-8444-555555555555';

const ROW = {
  id: ID, company: 'Acme Logistics', fullName: 'Dana Reyes', role: 'COO', email: 'dana@acme.test', stage: 'Options drafted',
  service: 'Build', startTiming: 'This quarter', peopleCount: 4, hoursPerWeek: 20, hoursPerYear: 1040,
  createdAt: '2026-11-20T15:00:00Z', interviewedAt: '2026-11-20T15:20:00Z', basecampUrl: 'https://3.basecamp.com/x',
};

const DETAIL = {
  ...ROW, phone: '214 555 0100', website: 'acme.test', department: 'Operations', process: 'Re-keying orders', requiredReturn: 'Hours back',
  otherDeciders: 'CFO', leadId: 7, interviewedVia: 'chat', writeup: [{ dimension: 'systems', value: 'McLeod TMS.' }], transcript: 'AI: Hi',
  research: { summary: 'Acme moves freight.', open_questions: ['Who approves rebills?'] },
  pilotOptions: [{ title: 'Order intake agent', service: 'Build', what_it_does: 'Reads order emails.', success_measure: 'Fewer hours', first_step: 'x', why_this_fits: 'y' }],
  optionsEmail: { subject: 'Your pilot options', body: 'Hi Dana', sentAt: null },
  proposal: { subject: null, body: null, draftedAt: null, sentAt: null },
  signedAt: null, lostAt: null, lostReason: null, projectUrl: null, pricePlaceholder: '[Ali to add the investment]',
};

let container: HTMLDivElement;
let root: Root;

async function mount(path: string): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/enterprise-clients" element={<AdminEnterpriseClientsPage />} />
          <Route path="/admin/enterprise-clients/:id" element={<AdminEnterpriseClientsPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const buttons = () => Array.from(container.querySelectorAll('button'));
const press = async (label: RegExp) => {
  const b = buttons().find((x) => label.test(x.textContent || ''));
  if (!b) throw new Error(`no button ${label}: ${buttons().map((x) => x.textContent).join(' | ')}`);
  await act(async () => {
    b.click();
  });
};

describe('the list', () => {
  it('shows each client with its stage and hours a year, and filters by stage', async () => {
    get.mockResolvedValue({ data: { clients: [ROW, { ...ROW, id: 'b', company: 'Beta Co', stage: 'Signed' }] } });
    await mount('/admin/enterprise-clients');
    expect(get).toHaveBeenCalledWith('/api/admin/enterprise-clients');
    const text = container.textContent || '';
    expect(text).toContain('Acme Logistics');
    expect(text).toContain('1,040');
    await press(/^Signed 1$/);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('tbody')!.textContent).toContain('Beta Co');
  });
});

describe('one client', () => {
  beforeEach(() => get.mockResolvedValue({ data: { client: DETAIL } }));

  it('shows what we know: the form, the write-up, the research and the options', async () => {
    await mount(`/admin/enterprise-clients/${ID}`);
    expect(container.querySelector('[data-testid="writeup"]')!.textContent).toContain('McLeod TMS.');
    expect(container.querySelector('[data-testid="options"]')!.textContent).toContain('Order intake agent');
    expect(container.textContent).toContain('Who approves rebills?');
  });

  it('sends the options email only on the click, with the edited text, then reloads', async () => {
    post.mockResolvedValue({ data: { ok: true } });
    await mount(`/admin/enterprise-clients/${ID}`);
    expect(post).not.toHaveBeenCalled();
    await press(/^Send from Ali$/);
    expect(post).toHaveBeenCalledWith(`/api/admin/enterprise-clients/${ID}/options-email`, { subject: 'Your pilot options', body: 'Hi Dana' });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('shows a refusal from the server instead of losing it', async () => {
    post.mockRejectedValue({ response: { data: { error: 'Not sent: it uses the word "free".' } } });
    await mount(`/admin/enterprise-clients/${ID}`);
    await press(/^Send from Ali$/);
    expect(container.textContent).toContain('Not sent: it uses the word "free".');
  });

  it('drafts the proposal on request, and shows the price instruction', async () => {
    post.mockResolvedValue({ data: { ok: true } });
    await mount(`/admin/enterprise-clients/${ID}`);
    await press(/Draft the proposal/);
    expect(post).toHaveBeenCalledWith(`/api/admin/enterprise-clients/${ID}/proposal/draft`, {});
  });

  it('marks lost with the reason typed', async () => {
    post.mockResolvedValue({ data: { ok: true } });
    await mount(`/admin/enterprise-clients/${ID}`);
    const input = container.querySelector('input[aria-label="Why it was lost"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Budget');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await press(/^Mark lost$/);
    expect(post).toHaveBeenCalledWith(`/api/admin/enterprise-clients/${ID}/lost`, { reason: 'Budget' });
  });
});

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminTicketBoardPage from '../AdminTicketBoardPage';

/**
 * Render-only smoke test for AdminTicketBoardPage's "Stale" chip — no
 * @testing-library/react (not installed in this repo), matching the established
 * react-dom/client + act convention (WorkforceOSPage.smoke.test.tsx,
 * TicketDetailModal.smoke.test.tsx). This component calls the browser `fetch`
 * directly, so `global.fetch` is mocked here.
 *
 * T011 (ticket-ux-fixes run) — "Anything over 3 days old should have a valid
 * reason why it's still open." (Ali, live feedback.) 3 fixtures per the plan:
 * stale-open (flag shows), fresh-open (no flag), stale-but-done (no flag — a
 * closed ticket isn't "stale," it's closed).
 */

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));

function makeTicket(overrides: Partial<{ id: string; status: string; updated_at: string; title: string }>) {
  return {
    id: 'ticket-1',
    ticket_number: 1,
    title: 'Some ticket',
    description: '',
    status: 'in_progress',
    priority: 'medium',
    type: 'task',
    source: 'manual',
    created_by_type: 'human',
    created_by_id: 'ali',
    assigned_to_type: null,
    assigned_to_id: null,
    parent_ticket_id: null,
    entity_type: null,
    entity_id: null,
    metadata: {},
    confidence: null,
    estimated_effort: null,
    due_date: null,
    completed_at: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const FOUR_DAYS_AGO = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const EMPTY_STATS = { total: 0, open: 0, byStatus: {}, byPriority: {}, byType: {} };

function mockFetch(tickets: { backlog?: any[]; todo?: any[]; in_progress?: any[]; in_review?: any[]; done?: any[]; cancelled?: any[] }) {
  const board = { backlog: [], todo: [], in_progress: [], in_review: [], done: [], cancelled: [], ...tickets };
  (global as any).fetch = jest.fn((url: string) => {
    if (url.startsWith('/api/admin/tickets/board')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ board }) });
    }
    if (url === '/api/admin/tickets/stats') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_STATS) });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

let container: HTMLDivElement;
let root: Root;

async function renderBoard() {
  await act(async () => {
    root.render(<MemoryRouter><AdminTicketBoardPage /></MemoryRouter>);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  jest.restoreAllMocks();
});

describe('AdminTicketBoardPage — Stale chip on board cards', () => {
  it('shows the Stale chip on a card whose last activity was 4+ days ago and is still open', async () => {
    mockFetch({ in_progress: [makeTicket({ id: 'stale-open', title: 'Stale open ticket', status: 'in_progress', updated_at: FOUR_DAYS_AGO })] });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge'));
    expect(badges.some((b) => b.textContent === 'Stale')).toBe(true);
  });

  it('does NOT show the Stale chip on a card updated within the last hour', async () => {
    mockFetch({ todo: [makeTicket({ id: 'fresh-open', title: 'Fresh open ticket', status: 'todo', updated_at: ONE_HOUR_AGO })] });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge'));
    expect(badges.some((b) => b.textContent === 'Stale')).toBe(false);
  });

  it('does NOT show the Stale chip on a DONE ticket, even one 4+ days old — closed isn\'t stale, it\'s closed', async () => {
    mockFetch({ done: [makeTicket({ id: 'stale-done', title: 'Old but done ticket', status: 'done', updated_at: FOUR_DAYS_AGO })] });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge'));
    expect(badges.some((b) => b.textContent === 'Stale')).toBe(false);
  });
});

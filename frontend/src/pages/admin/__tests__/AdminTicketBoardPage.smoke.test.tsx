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
 *
 * Org Chart v5 (2026-08-21) — the Creator filter roster comes from
 * `ticketCreatorApi.ts`, which goes through the shared axios `api` client
 * (utils/api.ts), NOT `global.fetch` — mocking `global.fetch` alone would
 * never intercept it. Mocked as its own module here, same as
 * OrgChartSection.test.tsx already mocks `workforceOrgChartApi`.
 */

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
jest.mock('../../../services/ticketCreatorApi', () => ({ getTicketCreatorOptions: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getTicketCreatorOptions } = require('../../../services/ticketCreatorApi') as { getTicketCreatorOptions: jest.Mock };

function makeTicket(
  overrides: Partial<{
    id: string;
    status: string;
    updated_at: string;
    title: string;
    created_at: string;
    created_by_type: string;
    created_by_id: string;
    created_by_display_name: string | null;
    source: string;
    auto_check: {
      hasAutoCheck: boolean;
      resolverAgentName: string | null;
      nextCheckAt: string | null;
      nextCheckLabel: string | null;
      reason?: string;
    } | null;
  }>,
) {
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
  // Default: empty roster. Tests that care about the Creator dropdown's real
  // options override this explicitly (see "creator filter" describe block).
  getTicketCreatorOptions.mockReset();
  getTicketCreatorOptions.mockResolvedValue([]);
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

// Ticket Board UX fixes (2026-08-17) — the exact reported bug: cory-engine,
// CoryBrain, and bpos_orchestrator all share created_by_type 'cory' and used to
// render as one indistinguishable "Cory" badge (or, for bpos_orchestrator, no
// badge at all, since its source 'bpos_engine' never matched the old
// source.startsWith('cory') check).
describe('AdminTicketBoardPage — real, distinct creator names on cards', () => {
  it('a cory-engine ticket, a CoryBrain ticket, and a bpos_orchestrator ticket each show a DIFFERENT, real creator name — not "Cory" x3, not blank', async () => {
    mockFetch({
      backlog: [
        makeTicket({ id: 'ce-1', title: 'Cory Engine ticket', created_by_type: 'cory', created_by_id: 'cory-engine', source: 'cory_autonomous_cycle', created_by_display_name: 'Cory Engine — Autonomous Operations' }),
        makeTicket({ id: 'cb-1', title: 'CoryBrain ticket', created_by_type: 'cory', created_by_id: 'CoryBrain', source: 'cory:evolution', created_by_display_name: 'Cory Brain — Strategic Initiatives' }),
        makeTicket({ id: 'bpos-1', title: 'BPOS ticket', created_by_type: 'cory', created_by_id: 'bpos_orchestrator', source: 'bpos_engine', created_by_display_name: 'BPOS Orchestrator — Universal Ticket Layer' }),
      ],
    });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge')).map((b) => b.textContent);
    expect(badges).toContain('Cory Engine — Autonomous Operations');
    expect(badges).toContain('Cory Brain — Strategic Initiatives');
    expect(badges).toContain('BPOS Orchestrator — Universal Ticket Layer');
    expect(badges.filter((t) => t === 'Cory')).toHaveLength(0); // the old collapsed literal never appears
  });

  it('a manually-created ticket (source: manual) shows no creator badge, even if a display name were somehow present', async () => {
    mockFetch({
      backlog: [makeTicket({ id: 'manual-1', title: 'Manual ticket', created_by_type: 'human', created_by_id: 'admin-1', source: 'manual', created_by_display_name: 'Ali Muwwakkil' })],
    });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge')).map((b) => b.textContent);
    expect(badges).not.toContain('Ali Muwwakkil');
  });
});

describe('AdminTicketBoardPage — ticket age on the card', () => {
  it('an open ticket shows an "Open ..." age badge', async () => {
    mockFetch({ backlog: [makeTicket({ id: 'aged-1', title: 'Aged ticket', status: 'backlog', created_at: FOUR_DAYS_AGO })] });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge')).map((b) => b.textContent);
    expect(badges.some((t) => t?.startsWith('Open'))).toBe(true);
  });

  it('a done ticket shows no age badge', async () => {
    mockFetch({ done: [makeTicket({ id: 'done-1', title: 'Done ticket', status: 'done', created_at: FOUR_DAYS_AGO })] });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge')).map((b) => b.textContent);
    expect(badges.some((t) => t?.startsWith('Open'))).toBe(false);
  });
});

describe('AdminTicketBoardPage — next-check indicator on the card (honest, never fabricated)', () => {
  it('a ticket with a real auto_check.hasAutoCheck:true shows the real "Next check ~..." label', async () => {
    mockFetch({
      backlog: [
        makeTicket({
          id: 'owned-1',
          title: 'Owned ticket',
          auto_check: { hasAutoCheck: true, resolverAgentName: 'CoryEngineTicketAutoResolver', nextCheckAt: '2026-08-17T18:00:00.000Z', nextCheckLabel: '2h' },
        }),
      ],
    });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge')).map((b) => b.textContent);
    expect(badges.some((t) => t?.includes('Next check') && t.includes('2h'))).toBe(true);
  });

  it('a ticket with auto_check.hasAutoCheck:false shows NO next-check badge — never a fabricated timer', async () => {
    mockFetch({
      backlog: [
        makeTicket({
          id: 'unowned-1',
          title: 'Unowned ticket',
          auto_check: { hasAutoCheck: false, resolverAgentName: null, nextCheckAt: null, nextCheckLabel: null, reason: 'No automated resolver owns this ticket type' },
        }),
      ],
    });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge')).map((b) => b.textContent);
    expect(badges.some((t) => t?.includes('Next check'))).toBe(false);
  });

  it('a ticket with no auto_check field at all (older, not-yet-redeployed backend shape) renders without crashing and shows no next-check badge', async () => {
    mockFetch({ backlog: [makeTicket({ id: 'no-field-1', title: 'No auto_check field' })] });
    await renderBoard();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge')).map((b) => b.textContent);
    expect(badges.some((t) => t?.includes('Next check'))).toBe(false);
  });
});

// Ticket Board UX fixes (2026-08-17) — the 4 KPI stat cards become clickable
// filters, composing with the existing dropdowns rather than a parallel system.
describe('AdminTicketBoardPage — clickable stat cards', () => {
  function statCardButton(label: string): HTMLButtonElement {
    const buttons = Array.from(container.querySelectorAll('.admin-stat-card__button')) as HTMLButtonElement[];
    const match = buttons.find((b) => b.textContent?.includes(label));
    if (!match) throw new Error(`No StatCard button found for label "${label}"`);
    return match;
  }

  async function click(el: Element) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  it('clicking Critical sets the Priority dropdown to "critical" — same state, not a parallel filter', async () => {
    mockFetch({
      backlog: [
        makeTicket({ id: 'crit-1', title: 'Critical one' }),
      ],
    });
    await renderBoard();

    const prioritySelect = container.querySelector('select') as HTMLSelectElement;
    expect(prioritySelect.value).toBe(''); // "All Priorities" initially

    await click(statCardButton('Critical'));

    expect(prioritySelect.value).toBe('critical');
    expect(statCardButton('Critical').classList.contains('admin-stat-card--active')).toBe(false); // active is on the inner .admin-stat-card, not the button itself
    const criticalCard = statCardButton('Critical').querySelector('.admin-stat-card');
    expect(criticalCard?.classList.contains('admin-stat-card--active')).toBe(true);
  });

  it('clicking Done renders ONLY the Done column; clicking Open hides Done and keeps the rest; clicking Total restores all 5 and clears filters', async () => {
    mockFetch({
      backlog: [makeTicket({ id: 'b-1', title: 'Backlog ticket', status: 'backlog' })],
      done: [makeTicket({ id: 'd-1', title: 'Done ticket', status: 'done' })],
    });
    await renderBoard();

    const columnHeaderLabels = () =>
      Array.from(container.querySelectorAll('.rounded-top span'))
        .filter((el) => !el.classList.contains('admin-status-badge')) // exclude the per-column ticket-count badge, keep only the label span
        .map((el) => el.textContent);

    expect(columnHeaderLabels()).toEqual(['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']);

    await click(statCardButton('Done'));
    expect(columnHeaderLabels()).toEqual(['Done']);

    await click(statCardButton('Open'));
    expect(columnHeaderLabels()).toEqual(['Backlog', 'To Do', 'In Progress', 'In Review']);

    await click(statCardButton('Total'));
    expect(columnHeaderLabels()).toEqual(['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']);
  });

  it('Total is active by default (no filters applied); clicking Critical then Total clears the Priority dropdown back to "All"', async () => {
    mockFetch({ backlog: [makeTicket({ id: 'x-1', title: 'X' })] });
    await renderBoard();

    expect(statCardButton('Total').querySelector('.admin-stat-card')?.classList.contains('admin-stat-card--active')).toBe(true);

    await click(statCardButton('Critical'));
    expect(statCardButton('Total').querySelector('.admin-stat-card')?.classList.contains('admin-stat-card--active')).toBe(false);

    await click(statCardButton('Total'));
    const prioritySelect = container.querySelector('select') as HTMLSelectElement;
    expect(prioritySelect.value).toBe('');
    expect(statCardButton('Total').querySelector('.admin-stat-card')?.classList.contains('admin-stat-card--active')).toBe(true);
  });

  it('clicking Done twice toggles it back off (restores all 5 columns)', async () => {
    mockFetch({ done: [makeTicket({ id: 'd-2', title: 'Done again', status: 'done' })] });
    await renderBoard();

    const columnHeaderLabels = () =>
      Array.from(container.querySelectorAll('.rounded-top span'))
        .filter((el) => !el.classList.contains('admin-status-badge')) // exclude the per-column ticket-count badge, keep only the label span
        .map((el) => el.textContent);

    await click(statCardButton('Done'));
    expect(columnHeaderLabels()).toEqual(['Done']);

    await click(statCardButton('Done'));
    expect(columnHeaderLabels()).toEqual(['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']);
  });
});

// Ticket Board Performance fix (2026-08-18) — the board previously loaded every
// ticket ever created (16,000+ rows) on every page open. Defaults to the last 7
// days with an explicit "All time" toggle, composing with the existing
// Priority/Type/Source filters rather than replacing them.
describe('AdminTicketBoardPage — last-7-days default view', () => {
  function boardFetchCalls(): string[] {
    return ((global as any).fetch as jest.Mock).mock.calls
      .map((c: any[]) => c[0])
      .filter((url: string) => url.startsWith('/api/admin/tickets/board'));
  }

  async function click(el: Element) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  it('defaults to "Last 7 Days" active, and the initial board fetch includes a created_after param', async () => {
    mockFetch({ backlog: [makeTicket({ id: 'x-1' })] });
    await renderBoard();

    const calls = boardFetchCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/created_after=/);

    const toggle = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Last 7 Days'));
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking "All Time" re-fetches WITHOUT created_after; clicking "Last 7 Days" again re-adds it', async () => {
    mockFetch({ backlog: [makeTicket({ id: 'x-2' })] });
    await renderBoard();

    const allTimeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'All Time') as HTMLButtonElement;
    await click(allTimeBtn);

    let calls = boardFetchCalls();
    expect(calls[calls.length - 1]).not.toMatch(/created_after=/);
    expect(allTimeBtn.getAttribute('aria-pressed')).toBe('true');

    const recentBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Last 7 Days')) as HTMLButtonElement;
    await click(recentBtn);

    calls = boardFetchCalls();
    expect(calls[calls.length - 1]).toMatch(/created_after=/);
  });

  it('composes with an existing dropdown filter (Priority): both created_after and priority appear in the same fetch', async () => {
    mockFetch({ backlog: [makeTicket({ id: 'x-3' })] });
    await renderBoard();

    const prioritySelect = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      prioritySelect.value = 'critical';
      prioritySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const calls = boardFetchCalls();
    const lastCall = calls[calls.length - 1];
    expect(lastCall).toMatch(/created_after=/);
    expect(lastCall).toMatch(/priority=critical/);
  });

  it('clicking "Clear" does NOT reset the date-range toggle back to "Last 7 Days" after switching to "All Time" — a deliberate view-mode choice, not a filter Clear should undo', async () => {
    mockFetch({ backlog: [makeTicket({ id: 'x-4' })] });
    await renderBoard();

    const allTimeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'All Time') as HTMLButtonElement;
    await click(allTimeBtn);

    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Clear') as HTMLButtonElement;
    await click(clearBtn);

    const calls = boardFetchCalls();
    expect(calls[calls.length - 1]).not.toMatch(/created_after=/);
    expect(allTimeBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the "N older tickets hidden" honesty banner when stats.total exceeds the visible (7-day) board count, with a working "Show all" link', async () => {
    (global as any).fetch = jest.fn((url: string) => {
      if (url.startsWith('/api/admin/tickets/board')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: { backlog: [makeTicket({ id: 'recent-1' })], todo: [], in_progress: [], in_review: [], done: [], cancelled: [] } }) });
      }
      if (url === '/api/admin/tickets/stats') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ total: 16186, open: 5325, byStatus: {}, byPriority: {}, byType: {} }) });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    await renderBoard();

    expect(container.textContent).toContain('16,185 older tickets hidden');

    const showAllLink = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Show all') as HTMLButtonElement;
    expect(showAllLink).toBeDefined();
    await click(showAllLink);

    const allTimeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'All Time') as HTMLButtonElement;
    expect(allTimeBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('does NOT show the honesty banner once "All Time" is active (board and stats.total agree)', async () => {
    mockFetch({ backlog: [makeTicket({ id: 'x-5' })] });
    await renderBoard();

    const allTimeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'All Time') as HTMLButtonElement;
    await click(allTimeBtn);

    expect(container.textContent).not.toContain('older ticket');
  });
});

// Org Chart v4 (2026-08-20) shipped the `?creator=<agent_name>` deep link +
// server-side filtering. Org Chart v5 (2026-08-21, session CC-20260818-x4nk
// continued) replaces the old display-only "Creator: <raw-slug>" badge chip
// (clearable but not changeable, and showing the internal agent_name slug
// instead of a friendly name) with a real, roster-backed <select> — visible,
// showing the friendly display_name, and changeable/clearable in-page like
// every other filter (Priority/Type/Source).
describe('AdminTicketBoardPage — creator filter (real, roster-backed select)', () => {
  const ROSTER = [
    { agent_name: 'cory-engine', display_name: 'Cory Engine — Autonomous Operations' },
    { agent_name: 'MarketingGrowthStrategyArchitect', display_name: 'Marketing & Growth Strategy Architect' },
  ];

  function boardFetchCalls(): string[] {
    return ((global as any).fetch as jest.Mock).mock.calls
      .map((c: any[]) => c[0])
      .filter((url: string) => url.startsWith('/api/admin/tickets/board'));
  }

  function creatorSelect(): HTMLSelectElement {
    return container.querySelector('select[aria-label="Creator"]') as HTMLSelectElement;
  }

  async function selectValue(select: HTMLSelectElement, value: string) {
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      nativeSetter.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  afterEach(() => {
    window.history.pushState({}, '', '/'); // reset the deep-link URL between tests
  });

  it('happy path: ?creator=<agent_name> on load selects the right option, showing the FRIENDLY display_name (fixing the old raw-slug bug), and the board fetch includes creator=<agent_name>', async () => {
    window.history.pushState({}, '', '/admin/tickets?creator=cory-engine');
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-1' })] });
    await renderBoard();

    const select = creatorSelect();
    expect(select).toBeTruthy();
    expect(select.value).toBe('cory-engine');
    const selectedOption = select.options[select.selectedIndex];
    expect(selectedOption.textContent).toBe('Cory Engine — Autonomous Operations'); // not the raw slug

    const calls = boardFetchCalls();
    expect(calls[calls.length - 1]).toMatch(/creator=cory-engine/);
  });

  it('boundary: no ?creator= param -> select defaults to "All Creators", the fetch omits creator= entirely, byte-for-byte unchanged from today', async () => {
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-2' })] });
    await renderBoard();

    expect(creatorSelect().value).toBe('');
    const calls = boardFetchCalls();
    expect(calls[calls.length - 1]).not.toMatch(/creator=/);
  });

  it('adjustable: changing the select to a different agent updates the filter and re-fetches with the new creator=', async () => {
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-3' })] });
    await renderBoard();

    await selectValue(creatorSelect(), 'MarketingGrowthStrategyArchitect');

    expect(boardFetchCalls()[boardFetchCalls().length - 1]).toMatch(/creator=MarketingGrowthStrategyArchitect/);
  });

  it('combinable: setting Creator AND Priority together sends both params in the same board fetch', async () => {
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-combo' })] });
    await renderBoard();

    await selectValue(creatorSelect(), 'cory-engine');
    const prioritySelect = container.querySelector('select:not([aria-label="Creator"])') as HTMLSelectElement;
    await selectValue(prioritySelect, 'critical');

    const lastCall = boardFetchCalls()[boardFetchCalls().length - 1];
    expect(lastCall).toMatch(/creator=cory-engine/);
    expect(lastCall).toMatch(/priority=critical/);
  });

  it('clearable: selecting "All Creators" removes the filter and re-fetches without creator=', async () => {
    window.history.pushState({}, '', '/admin/tickets?creator=cory-engine');
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-4' })] });
    await renderBoard();

    expect(boardFetchCalls()[boardFetchCalls().length - 1]).toMatch(/creator=cory-engine/);

    await selectValue(creatorSelect(), '');

    expect(boardFetchCalls()[boardFetchCalls().length - 1]).not.toMatch(/creator=/);
  });

  it('"Clear" (the existing global filter-clear button) also clears the creator filter, same as every other dropdown filter', async () => {
    window.history.pushState({}, '', '/admin/tickets?creator=cory-engine');
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-5' })] });
    await renderBoard();

    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Clear') as HTMLButtonElement;
    await act(async () => {
      clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(boardFetchCalls()[boardFetchCalls().length - 1]).not.toMatch(/creator=/);
    expect(creatorSelect().value).toBe('');
  });

  it('boundary: a deep-linked/active creator value NOT in the loaded roster (stale agent, or roster still empty) stays visible via a synthetic option — never silently dropped', async () => {
    window.history.pushState({}, '', '/admin/tickets?creator=some-removed-agent');
    getTicketCreatorOptions.mockResolvedValue(ROSTER); // roster loaded, but doesn't include this agent
    mockFetch({ backlog: [makeTicket({ id: 'x-6' })] });
    await renderBoard();

    const select = creatorSelect();
    expect(select.value).toBe('some-removed-agent');
    expect(Array.from(select.options).some((o) => o.value === 'some-removed-agent')).toBe(true);
    expect(boardFetchCalls()[boardFetchCalls().length - 1]).toMatch(/creator=some-removed-agent/);
  });

  // Org Chart v7 (2026-08-23, session CC-20260818-x4nk continued) — Ali,
  // live: the org chart's per-agent ticket count (date-unrestricted, see
  // orgChartService.ts) didn't match this board's default 7-day "recent"
  // view, so the org chart's ticket-filter button now deep-links with
  // `&range=all`. Nested here (not a separate top-level describe) so these
  // tests share ROSTER/creatorSelect()/boardFetchCalls() with the rest of
  // this file's creator-filter coverage, and the outer afterEach above
  // already resets the deep-link URL between tests.
  it('`range=all` happy path: ?creator=<agent>&range=all starts on "All time" (no created_after in the board fetch), matching the org chart card that linked here', async () => {
    window.history.pushState({}, '', '/admin/tickets?creator=cory-engine&range=all');
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-7' })] });
    await renderBoard();

    expect(creatorSelect().value).toBe('cory-engine');
    const lastCall = boardFetchCalls()[boardFetchCalls().length - 1];
    expect(lastCall).toMatch(/creator=cory-engine/);
    expect(lastCall).not.toMatch(/created_after=/);
    const allTimeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'All Time') as HTMLButtonElement;
    expect(allTimeBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('`range=all` boundary: plain navigation (no `range` param) keeps the existing 7-day "recent" default — the 2026-08-18 performance fix is untouched', async () => {
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-8' })] });
    await renderBoard();

    const lastCall = boardFetchCalls()[boardFetchCalls().length - 1];
    expect(lastCall).toMatch(/created_after=/);
    const recentBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Last 7 Days') as HTMLButtonElement;
    expect(recentBtn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('`range=all` boundary: `range` present but not exactly "all" (e.g. a typo or unrelated value) is ignored, staying on the 7-day default', async () => {
    window.history.pushState({}, '', '/admin/tickets?range=everything');
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-9' })] });
    await renderBoard();

    expect(boardFetchCalls()[boardFetchCalls().length - 1]).toMatch(/created_after=/);
  });

  // Ticket Count Sync fix, Task 3 (2026-08-24, session CC-20260818-x4nk
  // continued) — Ali, live, reported 3 times: an agent's card says "N open
  // tickets," but clicking through showed far more (confirmed live:
  // InboxCaseEngine's card said 304, the unfixed board showed up to 1262 —
  // every status including Done, since `creator`/`range` narrow WHICH
  // tickets are fetched but never touched `filterStatus`, which controls
  // which of the 5 Kanban columns render). `status=open` closes this by
  // reusing the SAME filterStatus state the "Open" KPI card already sets
  // (see the "clickable stat cards" suite above for its column-hiding
  // behavior) — this is the actual regression test for the reported bug.
  function columnHeaderLabels(): (string | null)[] {
    return Array.from(container.querySelectorAll('.rounded-top span'))
      .filter((el) => !el.classList.contains('admin-status-badge'))
      .map((el) => el.textContent);
  }

  it('`status=open` happy path: ?creator=<agent>&status=open renders ONLY the 4 non-Done columns — the exact reported bug, now fixed', async () => {
    window.history.pushState({}, '', '/admin/tickets?creator=InboxCaseEngine&range=all&status=open');
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({
      backlog: [makeTicket({ id: 'ice-1', title: 'Open one', status: 'backlog' })],
      done: [makeTicket({ id: 'ice-2', title: 'Done one', status: 'done' })],
    });
    await renderBoard();

    expect(creatorSelect().value).toBe('InboxCaseEngine');
    expect(columnHeaderLabels()).toEqual(['Backlog', 'To Do', 'In Progress', 'In Review']);
    const openBtn = Array.from(container.querySelectorAll('.admin-stat-card__button')).find((b) => b.textContent?.includes('Open')) as HTMLButtonElement;
    expect(openBtn?.querySelector('.admin-stat-card')?.classList.contains('admin-stat-card--active')).toBe(true);
  });

  it('`status=open` boundary: no `status` param renders all 5 columns including Done, same as today — this test would have caught the reported bug', async () => {
    window.history.pushState({}, '', '/admin/tickets?creator=InboxCaseEngine&range=all');
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({
      backlog: [makeTicket({ id: 'ice-3', title: 'Open one', status: 'backlog' })],
      done: [makeTicket({ id: 'ice-4', title: 'Done one', status: 'done' })],
    });
    await renderBoard();

    expect(columnHeaderLabels()).toEqual(['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']);
  });

  it('`status=done` also works (symmetry — the param isn\'t hardcoded to only ever mean "open")', async () => {
    window.history.pushState({}, '', '/admin/tickets?status=done');
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ done: [makeTicket({ id: 'x-10', title: 'Done', status: 'done' })] });
    await renderBoard();

    expect(columnHeaderLabels()).toEqual(['Done']);
  });

  it('`status=` with an unrecognized value is ignored, keeping the default all-5-columns view (fails safe, matches the `range` boundary test above)', async () => {
    window.history.pushState({}, '', '/admin/tickets?status=archived');
    getTicketCreatorOptions.mockResolvedValue(ROSTER);
    mockFetch({ backlog: [makeTicket({ id: 'x-11' })] });
    await renderBoard();

    expect(columnHeaderLabels()).toEqual(['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']);
  });
});

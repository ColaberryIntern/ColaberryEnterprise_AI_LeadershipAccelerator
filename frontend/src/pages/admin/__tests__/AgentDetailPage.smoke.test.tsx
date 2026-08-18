import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AgentDetailPage from '../AgentDetailPage';
import { AgentDetail } from '../../../services/agentDetailApi';

/**
 * Reese Phase 1 (T012). Follows the established no-browser smoke-check pattern
 * already used for sibling admin pages (AdminWorkLedgerHealthPage.smoke.test.tsx):
 * `renderToStaticMarkup` never runs `useEffect` (no commit phase in static
 * rendering), so it never fires the real `getAgentDetail` API call this page
 * makes on mount — it only proves the page's INITIAL render (loading state,
 * before the fetch resolves) is safe: no crash from `useParams`, the shell
 * component imports, or the props wiring. Full data-rendering behavior is
 * proven live in production verification (Phase I) with a real screenshot.
 */

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/admin/agents/agent-1']}>
      <Routes>
        <Route path="/admin/agents/:id" element={<AgentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgentDetailPage (Reese Phase 1 transparency page)', () => {
  it('renders its initial loading state without throwing', () => {
    expect(() => renderPage()).not.toThrow();
    const html = renderPage();
    expect(html).toContain('spinner-border');
  });
});

// T007 (ticket-ux-fixes run) — Ali's live feedback: "Conditional formatting on the
// status in the Agent Dashboard" + "Format the time everywhere you see it to cst."
// Needs the real post-fetch render (unlike the static-markup test above), so this
// uses the react-dom/client + act pattern established in
// WorkforceOSPage.smoke.test.tsx, mocking getAgentDetail directly.
jest.mock('../../../services/agentDetailApi', () => ({ getAgentDetail: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAgentDetail } = require('../../../services/agentDetailApi') as { getAgentDetail: jest.Mock };

const DETAIL: AgentDetail = {
  agent: {
    id: 'agent-reese',
    agent_name: 'Reese',
    agent_type: 'ai_staff_mentor',
    category: 'student_success',
    description: null,
    system_prompt: null,
    tools_granted: null,
    persona_version: null,
    enabled: true,
    created_at: null,
  },
  identity: null,
  live_status: 'online',
  tickets: [
    { id: 't-1', ticket_number: 1, title: 'Reaching out to Jordan Rivera', status: 'in_progress', priority: 'high', type: 'reese_autonomous_outreach', created_at: null, updated_at: '2026-08-12T15:00:00Z' },
    { id: 't-2', ticket_number: 2, title: 'DM conversation with Alex Chen', status: 'done', priority: 'medium', type: 'student_support', created_at: null, updated_at: '2026-01-15T15:00:00Z' },
  ],
  capabilities: {
    reads: ['ProofDesk learner-progress signals (XP, competencies, timeline state) for the student in the conversation'],
    produces: ['A reply message in the student DM thread'],
    undocumented_tools: [],
    produced_ticket_types: ['reese_autonomous_outreach', 'student_support'],
  },
};

let container: HTMLDivElement;
let root: Root;

async function renderAgentPage() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/admin/agents/agent-reese']}>
        <Routes>
          <Route path="/admin/agents/:id" element={<AgentDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('AgentDetailPage — Ticket activity table: colored status badges + CST timestamps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAgentDetail.mockResolvedValue(DETAIL);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders the Status column as a real StatusBadge with the humanized label, not the raw plain-text status', async () => {
    await renderAgentPage();

    // Tone DISTINCTNESS itself (in_progress != done color) is already pinned at
    // the data level in ticketTypeMeta.test.ts's isTicketStale/getTicketStatusTone
    // suite — jsdom's CSSOM doesn't reliably round-trip the `background` shorthand
    // with a var(...) value through .style/getAttribute('style'), so this test
    // instead proves the wiring: getTicketStatusLabel/getTicketStatusTone are
    // actually used in this JSX (humanized label present), not just imported.
    const badges = Array.from(container.querySelectorAll('.admin-status-badge'));
    expect(badges.some((b) => b.textContent === 'In Progress')).toBe(true);
    expect(badges.some((b) => b.textContent === 'Done')).toBe(true);
    // Regression guard: the old markup was a single fixed class for every row,
    // and the raw (non-humanized) status string, for every row.
    expect(container.innerHTML).not.toContain('bg-light text-dark border');
    expect(container.textContent).not.toContain('in_progress');
  });

  it('renders the Type column as a colored badge too, reusing the same type-tone helper the ticket board uses', async () => {
    await renderAgentPage();

    const badges = Array.from(container.querySelectorAll('.admin-status-badge'));
    expect(badges.some((b) => b.textContent === 'Reese Outreach')).toBe(true);
    expect(badges.some((b) => b.textContent === 'Student Support')).toBe(true);
  });

  it('renders the Updated column with a CST/CDT label, never the browser-local unlabeled toLocaleString() shape', async () => {
    await renderAgentPage();

    // 2026-08-12T15:00:00Z is 10:00 AM Central during CDT (summer).
    expect(container.textContent).toContain('10:00 AM CDT');
    // 2026-01-15T15:00:00Z is 9:00 AM Central during CST (winter) — different
    // instant, different DST side, proving BOTH rows convert correctly rather
    // than one shared coincidental string.
    expect(container.textContent).toContain('9:00 AM CST');
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});

// T010 (ticket-ux-fixes run) — "We should also be able to see how long it's
// been since a ticket has been worked on." (Ali, live feedback.)
describe('AgentDetailPage — "last activity" indicator on the ticket-activity table', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders a real, computed "X ago" Last activity column, not a static string', async () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      tickets: [{ ...DETAIL.tickets[0], updated_at: fiveHoursAgo }],
    });

    await renderAgentPage();

    expect(container.textContent).toContain('Last activity');
    expect(container.textContent).toContain('5h ago');
  });

  it('boundary: a ticket with no updated_at ever recorded shows "unknown" rather than crashing or showing blank', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      tickets: [{ ...DETAIL.tickets[0], updated_at: null }],
    });

    await renderAgentPage();

    expect(container.textContent).toContain('Last activity');
    expect(container.textContent).toContain('unknown');
  });
});

// Agent Detail transparency, part 2 (2026-08-18, session CC-20260818-wf9k) —
// "what it reads / what it produces", derived from real tools_granted + real
// observed ticket types, never hand-written per-agent prose.
describe('AgentDetailPage — "what this agent reads / produces" section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders the real reads/produces text derived from tools_granted, and the live produced-ticket-type badges', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);

    await renderAgentPage();

    expect(container.textContent).toContain('What this agent reads / produces');
    expect(container.textContent).toContain('ProofDesk learner-progress signals');
    expect(container.textContent).toContain('A reply message in the student DM thread');
    // Ticket-type badges reuse the same getTicketTypeLabel() humanization as the
    // Ticket activity table below it — "Reese Outreach" is reese_autonomous_outreach's label.
    expect(container.textContent).toContain('Reese Outreach');
    expect(container.textContent).toContain('Student Support');
  });

  it('honesty path: an agent with an undocumented tool renders the disclosure note, never silent, never fabricated text', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      capabilities: { reads: [], produces: [], undocumented_tools: ['a_tool_from_the_future'], produced_ticket_types: [] },
    });

    await renderAgentPage();

    expect(container.textContent).toContain('a_tool_from_the_future');
    expect(container.textContent).toContain('no documented reads/produces yet');
  });

  it('boundary: an agent with empty reads/produces (no granted tools) shows an honest empty state, not a blank section', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      capabilities: { reads: [], produces: [], undocumented_tools: [], produced_ticket_types: [] },
    });

    await renderAgentPage();

    expect(container.textContent).toContain("don't read any external data source");
    expect(container.textContent).toContain("don't produce anything on their own");
  });
});

// Agent Alias & Identity Fix — page title/breadcrumb prefer the real
// AdminUser.display_name over the raw technical agent_name (same bug, same fix
// as the Live Agents card list).
describe('AgentDetailPage — title prefers identity.display_name over raw agent_name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('display name fix: renders the real display_name in the title when identity exists and differs from agent_name', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      agent: { ...DETAIL.agent, id: 'agent-process-1', agent_name: 'cory-engine' },
      identity: { admin_user_id: 'admin-process-1', email: 'cory-engine@colaberry.com', display_name: 'Cory Engine — Autonomous Operations', is_ai_operated: true },
    });

    await renderAgentPage();

    expect(container.textContent).toContain('Cory Engine — Autonomous Operations');
    // The h1/page title must never show the raw technical id.
    const h1 = container.querySelector('h1, .page-title, [class*="title"]');
    expect(h1?.textContent).not.toBe('cory-engine');
  });

  it('boundary: falls back to agent_name when identity is null (a non-blueprint agent with no linked AdminUser)', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, identity: null });

    await renderAgentPage();

    expect(container.textContent).toContain('Reese');
  });
});

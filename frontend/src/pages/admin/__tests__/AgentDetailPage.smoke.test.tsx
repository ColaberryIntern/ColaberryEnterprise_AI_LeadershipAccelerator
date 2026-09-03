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
// AI Workforce Reset (2026-08-24) — the "Deactivate" button's real API call.
// Phase C adds reactivateAgent() + the real AUTONOMY_LEVELS/descriptions the
// component imports directly (not mockable per-call — must exist here since
// the module itself is mocked).
jest.mock('../../../services/workforceOrgChartApi', () => ({
  resetAgents: jest.fn(),
  reactivateAgent: jest.fn(),
  AUTONOMY_LEVELS: ['observe', 'suggest', 'act_audited', 'communicate'],
  AUTONOMY_LEVEL_DESCRIPTIONS: {
    observe: 'Read only — the safest starting point for any agent coming back online.',
    suggest: 'May propose actions for human review, never executes them directly.',
    act_audited: 'May write to an allowlisted set of tables; every write is audited.',
    communicate: 'May send outbound email/SMS/voice/social, within scope + consent + approval rules.',
  },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resetAgents, reactivateAgent } = require('../../../services/workforceOrgChartApi') as {
  resetAgents: jest.Mock;
  reactivateAgent: jest.Mock;
};

// At a Glance, Checkpoint F (2026-09-03) — "At a Glance" is now the
// default tab, so every test in this file that mounts the page now also
// mounts AgentAtAGlanceTab, which fetches the manager inbox (real, page-
// level fetch, previously never triggered by Overview) plus its own 4
// summary endpoints. None of these were ever mocked in this file before —
// unmocked, they'd hit a real (nonexistent, in jsdom) network call, and
// (confirmed live, the hard way) a bare `jest.fn()` with no resolved value
// makes `await getManagerInboxItems(id)` resolve to `undefined`, which
// `setInboxItems` then happily stores — `inboxItems.length` inside
// AgentAtAGlanceTab crashes on the very next render. Every describe
// block's own beforeEach already re-applies `getAgentDetail.mockResolvedValue`
// after `jest.clearAllMocks()` (the established pattern in this file) —
// these 5 new mocks follow the identical convention, applied per describe
// block below, not once at module scope.
jest.mock('../../../services/managerInboxApi', () => ({ getManagerInboxItems: jest.fn() }));
jest.mock('../../../services/managerDirectiveApi', () => ({ listDirectives: jest.fn() }));
jest.mock('../../../services/agentReportSubscriptionApi', () => ({ listReportSubscriptions: jest.fn() }));
jest.mock('../../../services/agentGoalApi', () => ({ listGoals: jest.fn() }));
jest.mock('../../../services/agentOneOnOneApi', () => ({ listOneOnOnes: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getManagerInboxItems } = require('../../../services/managerInboxApi') as { getManagerInboxItems: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listDirectives } = require('../../../services/managerDirectiveApi') as { listDirectives: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listReportSubscriptions } = require('../../../services/agentReportSubscriptionApi') as { listReportSubscriptions: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listGoals } = require('../../../services/agentGoalApi') as { listGoals: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listOneOnOnes } = require('../../../services/agentOneOnOneApi') as { listOneOnOnes: jest.Mock };

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
    // AI Workforce Reset, Phase C (2026-08-24) — honest null: this fixture
    // agent has never been through the reactivation flow.
    autonomy_level: null,
    // Trust & Control slice 2 (2026-09-03).
    department: null, module: null, source_file: null,
    max_runs_per_hour: 60, max_writes_per_execution: 100, max_proposals_per_run: 50,
    autonomy_level_set_at: null,
  },
  identity: null,
  live_status: 'online',
  // Ticket Count Sync fix (2026-08-21) — the server's TRUE open count,
  // independent of the tickets array below (which is display-capped). Matches
  // this fixture's 1 open ticket (t-1) + 1 closed (t-2) for consistency, though
  // the two are intentionally separate fields/queries in the real service.
  open_ticket_count: 1,
  tickets: [
    { id: 't-1', ticket_number: 1, title: 'Reaching out to Jordan Rivera', description: 'Reese is proactively reaching out to Jordan Rivera. Signal: inactivity. Goal: Confirm the student is unblocked and re-engaged with the curriculum within 7 days.', status: 'in_progress', priority: 'high', type: 'reese_autonomous_outreach', created_at: null, updated_at: '2026-08-12T15:00:00Z' },
    { id: 't-2', ticket_number: 2, title: 'DM conversation with Alex Chen', description: null, status: 'done', priority: 'medium', type: 'student_support', created_at: null, updated_at: '2026-01-15T15:00:00Z' },
  ],
  // Task visibility (2026-08-26) — base fixture: matches Reese's real base
  // case (no `module` set on this fixture's agent), same honest-empty
  // pattern the backend uses. Individual tests below override to cover the
  // populated cases.
  ticket_breakdown: [],
  related_tasks: [],
  // Trust Contract Phase 1 (2026-08-26) — base fixture: honest-empty, same
  // pattern as ticket_breakdown/related_tasks above. Individual tests below
  // override to cover the populated cases.
  persona_version_history: [],
  cost_summary: null,
  authorization_summary: { window_days: 30, total: 0, allow: 0, approval: 0, block: 0, enforced_count: 0 },
  capabilities: {
    reads: ['ProofDesk learner-progress signals (XP, competencies, timeline state) for the student in the conversation'],
    produces: ['A reply message in the student DM thread'],
    undocumented_tools: [],
    produced_ticket_types: ['reese_autonomous_outreach', 'student_support'],
    by_tool: [
      { tool: 'respond_to_dm', reads: [], produces: ['A reply message in the student DM thread'], documented: true },
      { tool: 'read_learner_context', reads: ['ProofDesk learner-progress signals (XP, competencies, timeline state) for the student in the conversation'], produces: [], documented: true },
    ],
  },
  // Org-chart hierarchy build (2026-08-19) — Reese's real shape: AI Staff
  // reporting through workforce_intelligence_engine to Kes.
  reports_to: {
    trail: ['Reese (agent)', 'workforce_intelligence_engine (agent) -> [human]'],
    resolved_human: { id: '3df017df-affa-49ab-884f-a99a4bd2ef4e', name: 'Kes', email: 'kesetebirhan@gmail.com' },
    immediate_agent: { id: 'agent-wie', name: 'workforce_intelligence_engine' },
  },
  // Trust Contract (2026-08-24) — Reese's real shape: identity-only, invoked
  // outside the generic scheduler wrapper, so last_run_at/run_count/error_count
  // are honest zeros. last_activity_at is NOT zero — this mirrors Reese's real
  // production state (Trust Contract fix, 2026-08-24): real ticket activity
  // exists even though the scheduler never tracked a "run".
  trust_contract: {
    trigger_type: 'event_driven',
    schedule: null,
    status: 'idle',
    last_run_at: null,
    run_count: 0,
    error_count: 0,
    avg_duration_ms: null,
    last_error: null,
    last_error_at: null,
    last_activity_at: '2026-08-24T10:00:00Z',
  },
  goals: [],
  goals_overall: 0,
};

let container: HTMLDivElement;
let root: Root;

// At a Glance, Checkpoint F (2026-09-03) — "Overview" is no longer the
// default tab; its real content (identity, tools, reports-to, trust
// contract, system prompt) moved into Command Center, unchanged. Every
// test below that asserts on that content needs Command Center open first
// — done once, here, so all 50+ call sites below get it for free instead
// of touching each test individually. The one call site that predates this
// helper (line ~31, a separate `renderPage()` using `renderToStaticMarkup`)
// never fires `useEffect` at all, so it's unaffected by tab default.
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
  const commandTabButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Command Center');
  if (commandTabButton) {
    await act(async () => {
      commandTabButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe('AgentDetailPage — Ticket activity table: colored status badges + CST timestamps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
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

  // Ticket Count Sync fix (2026-08-21, session CC-20260818-x4nk continued) —
  // the "Open tickets" stat used to be tickets.filter(open).length, which
  // undercounts once an agent's true ticket volume exceeds the capped tickets
  // array. Proves the stat now renders the server's independent open_ticket_count.
  it('renders the "Open tickets" stat from open_ticket_count, not from counting the (capped) tickets array', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, open_ticket_count: 294 }); // far more than the 2-row tickets fixture
    await renderAgentPage();

    const statCards = Array.from(container.querySelectorAll('.admin-stat-card')).map((el) => el.textContent || '');
    expect(statCards.some((text) => text.includes('Open tickets') && text.includes('294'))).toBe(true);
  });
});

// T010 (ticket-ux-fixes run) — "We should also be able to see how long it's
// been since a ticket has been worked on." (Ali, live feedback.)
describe('AgentDetailPage — "last activity" indicator on the ticket-activity table', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
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
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
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
      capabilities: { reads: [], produces: [], undocumented_tools: ['a_tool_from_the_future'], produced_ticket_types: [], by_tool: [] },
    });

    await renderAgentPage();

    expect(container.textContent).toContain('a_tool_from_the_future');
    expect(container.textContent).toContain('no documented reads/produces yet');
  });

  it('boundary: an agent with empty reads/produces (no granted tools) shows an honest empty state, not a blank section', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      capabilities: { reads: [], produces: [], undocumented_tools: [], produced_ticket_types: [], by_tool: [] },
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
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
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

// Org-chart hierarchy build (2026-08-19) — "Reports to" section: this agent's
// real accountability chain, reused from AgentDetailResult.reports_to rather
// than re-derived client-side.
describe('AgentDetailPage — "Reports to" section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders the real trail and the resolved human name/email when the chain resolves', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);

    await renderAgentPage();

    expect(container.textContent).toContain('Reports to');
    expect(container.textContent).toContain('workforce_intelligence_engine (agent) -> [human]');
    expect(container.textContent).toContain('Kes');
    expect(container.textContent).toContain('kesetebirhan@gmail.com');
  });

  it('boundary: reports_to is null -> renders an honest "no chain configured" message, never a blank or fabricated section', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, reports_to: null });

    await renderAgentPage();

    expect(container.textContent).toContain('No reports-to chain configured');
  });

  it('boundary: the chain trail exists but resolved_human is null -> discloses the break honestly, never fabricates a human', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      reports_to: { trail: ['OrphanedAgent (agent) -> [dangling]'], resolved_human: null, immediate_agent: null },
    });

    await renderAgentPage();

    expect(container.textContent).toContain('does not currently resolve to a real human');
  });

  // 2026-08-23 — "I'd like to have a link to the agent they report to" (Ali,
  // 3rd time reporting the linked issue this message bundled with).
  it('immediate_agent: renders a real clickable link to the next-hop agent\'s own detail page', async () => {
    getAgentDetail.mockResolvedValue(DETAIL); // immediate_agent = { id: 'agent-wie', name: 'workforce_intelligence_engine' }

    await renderAgentPage();

    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === 'workforce_intelligence_engine');
    expect(link).toBeDefined();
    expect(link!.getAttribute('href')).toBe('/admin/agents/agent-wie');
  });

  it('boundary: immediate_agent is null (reports directly to a human) -> no "Reports directly to" link rendered, only the existing chain text', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      reports_to: { trail: ['Reese (agent) -> [human]'], resolved_human: { id: 'ali', name: 'Ali', email: 'ali@colaberry.com' }, immediate_agent: null },
    });

    await renderAgentPage();

    expect(container.textContent).not.toContain('Reports directly to');
  });
});

// Tool & capability drill-down (2026-08-23) — Ali: "I also would like to see
// the tool & capability drill down so I can understand the tool better."
describe('AgentDetailPage — "Tools & capabilities" per-tool drill-down', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
    getAgentDetail.mockResolvedValue(DETAIL);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders one collapsible <details> per granted tool, named after the real tool string', async () => {
    await renderAgentPage();

    const details = Array.from(container.querySelectorAll('details'));
    const toolNames = details.map((d) => d.querySelector('summary code')?.textContent);
    expect(toolNames).toEqual(['respond_to_dm', 'read_learner_context']);
  });

  it('each tool\'s own reads/produces are nested inside ITS details element, not the flattened aggregate', async () => {
    await renderAgentPage();

    const details = Array.from(container.querySelectorAll('details'));
    const readLearnerContext = details.find((d) => d.querySelector('summary code')?.textContent === 'read_learner_context');
    expect(readLearnerContext?.textContent).toContain('ProofDesk learner-progress signals');
    // respond_to_dm has no reads of its own — its OWN details element must not
    // claim the other tool's read fact.
    const respondToDm = details.find((d) => d.querySelector('summary code')?.textContent === 'respond_to_dm');
    expect(respondToDm?.textContent).not.toContain('ProofDesk learner-progress signals');
    expect(respondToDm?.textContent).toContain('A reply message in the student DM thread');
  });

  it('honesty path: an undocumented tool renders an "undocumented" badge and a per-tool disclosure, never fabricated reads/produces', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      capabilities: { ...DETAIL.capabilities, by_tool: [{ tool: 'a_tool_from_the_future', reads: [], produces: [], documented: false }] },
    });

    await renderAgentPage();

    expect(container.textContent).toContain('a_tool_from_the_future');
    expect(container.textContent).toContain('undocumented');
    expect(container.textContent).toContain('No documented reads/produces yet for this tool');
  });

  it('boundary: no tools granted (by_tool empty) shows the existing "No tools recorded" empty state', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      capabilities: { ...DETAIL.capabilities, by_tool: [] },
    });

    await renderAgentPage();

    expect(container.textContent).toContain('No tools recorded.');
  });
});

// Task visibility (2026-08-26) — Ali, live, looking at Reese's real page:
// "I need to see what those [tasks] are... what triggers them, what they
// are looking for, why they triggered."
describe('AgentDetailPage — "Scheduled tasks" section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders each real sibling task with its schedule, trigger, last run, and run/error counts', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      related_tasks: [
        {
          id: 'sweep-id', agent_name: 'ReeseAutonomousOutreachSweep',
          description: 'Daily scan of the approved pilot cohort for two real risk signals.',
          trigger_type: 'cron', schedule: '0 15 * * *', enabled: true, status: 'idle',
          last_run_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), run_count: 12, error_count: 0,
        },
      ],
    });

    await renderAgentPage();

    expect(container.textContent).toContain('Scheduled tasks');
    expect(container.textContent).toContain('ReeseAutonomousOutreachSweep');
    expect(container.textContent).toContain('Daily scan of the approved pilot cohort');
    expect(container.textContent).toContain('0 15 * * *');
    expect(container.textContent).toContain('5h ago');
    expect(container.textContent).toContain('Enabled');
  });

  it('honesty boundary: shows a disabled badge for a paused task, never disguising it as running', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      related_tasks: [
        {
          id: 'sweep-id', agent_name: 'ReeseAutonomousOutreachSweep', description: null,
          trigger_type: 'cron', schedule: '0 15 * * *', enabled: false, status: 'paused',
          last_run_at: null, run_count: 0, error_count: 0,
        },
      ],
    });

    await renderAgentPage();

    expect(container.textContent).toContain('Disabled');
    expect(container.textContent).toContain('Never');
  });

  it('boundary: no related tasks (the common case — most agents have no module) shows an honest empty state', async () => {
    getAgentDetail.mockResolvedValue(DETAIL); // base fixture: related_tasks: []

    await renderAgentPage();

    expect(container.textContent).toContain('No other scheduled tasks are registered');
  });
});

// Task visibility (2026-08-26) — "which tickets each [task] creates, so I
// can see which task is creating the most tickets" + "why they triggered."
describe('AgentDetailPage — "Ticket activity" table: Why column and ticket_breakdown summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
    getAgentDetail.mockResolvedValue(DETAIL);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders the real ticket.description in the Why column, verbatim', async () => {
    await renderAgentPage();

    expect(container.textContent).toContain('Signal: inactivity. Goal: Confirm the student is unblocked');
  });

  it("boundary: a ticket with no description shows an em dash, never a blank cell or a fabricated reason", async () => {
    await renderAgentPage();

    // t-2 (the fixture's second ticket) has description: null.
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const alexRow = rows.find((r) => r.textContent?.includes('Alex Chen'));
    expect(alexRow?.querySelectorAll('td')[1].textContent).toBe('—');
  });

  it('renders the ticket_breakdown summary grouped by type and real signal_type, above the table', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      ticket_breakdown: [
        {
          type: 'reese_autonomous_outreach', count: 3,
          by_signal: [{ signal_type: 'inactivity', count: 2 }, { signal_type: 'behavior_anomaly', count: 1 }],
        },
        { type: 'student_support', count: 5, by_signal: [] },
      ],
    });

    await renderAgentPage();

    expect(container.textContent).toContain('Reese Outreach: 3');
    expect(container.textContent).toContain('inactivity: 2');
    expect(container.textContent).toContain('behavior_anomaly: 1');
    expect(container.textContent).toContain('Student Support: 5');
  });

  it('boundary: no ticket_breakdown summary rendered when it is empty (no tickets yet)', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, ticket_breakdown: [] });

    await renderAgentPage();

    expect(container.textContent).not.toContain('Reese Outreach: ');
  });
});

// Trust Contract Phase 1 (2026-08-26) — real cost, real authorization
// verdicts, real version history. Closes the "declared autonomy_level vs.
// what's actually enforced" gap using evidence that already exists.
describe('AgentDetailPage — "Trust evidence" section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders the real cost figure and run count when this agent has tracked ai_events activity', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, cost_summary: { cost_usd: 4.82, runs: 37 } });

    await renderAgentPage();

    expect(container.textContent).toContain('Trust evidence');
    expect(container.textContent).toContain('$4.82');
    expect(container.textContent).toContain('37');
  });

  it('boundary: an em dash, not $0.00, when this agent has zero cost-tracked events', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, cost_summary: null });

    await renderAgentPage();

    const statCards = Array.from(container.querySelectorAll('.admin-stat-card')).map((el) => el.textContent || '');
    expect(statCards.some((text) => text.includes('Cost (30d)') && text.includes('—'))).toBe(true);
    expect(container.textContent).not.toContain('$0.00');
  });

  it('renders the real allow/approval/block verdict counts', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      authorization_summary: { window_days: 30, total: 18, allow: 14, approval: 3, block: 1, enforced_count: 0 },
    });

    await renderAgentPage();

    expect(container.textContent).toContain('Allowed: 14');
    expect(container.textContent).toContain('Would require approval: 3');
    expect(container.textContent).toContain('Would block: 1');
  });

  it('honesty callout: discloses that every decision was shadow-mode when enforced_count is 0 but real decisions exist', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      authorization_summary: { window_days: 30, total: 5, allow: 5, approval: 0, block: 0, enforced_count: 0 },
    });

    await renderAgentPage();

    expect(container.textContent).toContain('shadow mode');
  });

  it('boundary: no shadow-mode callout when there are zero authorization checks at all — nothing to disclose', async () => {
    getAgentDetail.mockResolvedValue(DETAIL); // base fixture: authorization_summary.total === 0

    await renderAgentPage();

    expect(container.textContent).toContain('No authorization checks recorded');
    expect(container.textContent).not.toContain('shadow mode');
  });

  it('renders real persona version history entries, most-recent first as passed from the API', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      persona_version_history: [
        { id: 'h1', persona_version: '2026-09-01', previous_version: '2026-08-06', source: 'registry_seed', created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
      ],
    });

    await renderAgentPage();

    expect(container.textContent).toContain('2026-08-06');
    expect(container.textContent).toContain('2026-09-01');
    expect(container.textContent).toContain('1h ago');
  });

  it('boundary: honest empty state when persona_version_history is empty, never fabricated history', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, persona_version_history: [] });

    await renderAgentPage();

    expect(container.textContent).toContain('No version change recorded yet');
  });
});

// AI Workforce Reset (2026-08-24) — Ali, live: "we just need to remove all
// of the task they are assigned with at this time... deactivate current."
describe('AgentDetailPage — "Deactivate" action', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
    getAgentDetail.mockResolvedValue(DETAIL);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    confirmSpy.mockRestore();
  });

  function deactivateButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Deactivate')) as HTMLButtonElement | undefined;
  }

  it('renders a "Deactivate" button when the agent is enabled', async () => {
    await renderAgentPage();

    expect(deactivateButton()).toBeDefined();
  });

  it('boundary: no "Deactivate" button when the agent is already disabled — nothing left to deactivate', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, agent: { ...DETAIL.agent, enabled: false } });

    await renderAgentPage();

    expect(deactivateButton()).toBeUndefined();
  });

  it('happy path: confirming asks the user first, then calls resetAgents() with this agent\'s real id and shows the real cancelled-ticket count', async () => {
    resetAgents.mockResolvedValue([{ agentId: 'agent-reese', agentName: 'Reese', found: true, deactivated: true, ticketsCancelled: 3, error: null }]);

    await renderAgentPage();
    await act(async () => {
      deactivateButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(resetAgents).toHaveBeenCalledWith(['agent-reese']);
    expect(container.textContent).toContain('3 open tickets cancelled');
  });

  it('declining the confirmation never calls resetAgents()', async () => {
    confirmSpy.mockReturnValue(false);

    await renderAgentPage();
    await act(async () => {
      deactivateButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(resetAgents).not.toHaveBeenCalled();
  });

  it('failure path: a server error is shown honestly, not swallowed', async () => {
    resetAgents.mockResolvedValue([{ agentId: 'agent-reese', agentName: 'Reese', found: true, deactivated: false, ticketsCancelled: 0, error: 'Agent not found' }]);

    await renderAgentPage();
    await act(async () => {
      deactivateButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('Failed to deactivate: Agent not found');
  });
});

// AI Workforce Reset, Phase C (2026-08-24) — Ali, live: "add new ones
// slowly... so I can see how they perform." Reactivation requires a
// deliberate autonomy-level choice before the button enables.
describe('AgentDetailPage — reactivation flow (deactivated agent)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  function reactivateSelect(): HTMLSelectElement | undefined {
    return container.querySelector('select[aria-label="Autonomy level"]') as HTMLSelectElement | undefined;
  }

  function reactivateButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Reactivate')) as HTMLButtonElement | undefined;
  }

  it('renders no autonomy-level select or Reactivate button when the agent is enabled', async () => {
    getAgentDetail.mockResolvedValue(DETAIL); // enabled: true
    await renderAgentPage();

    expect(reactivateSelect()).toBeUndefined();
    expect(reactivateButton()).toBeUndefined();
  });

  it('boundary: a disabled agent shows the autonomy-level select and a Reactivate button disabled until a level is chosen', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, agent: { ...DETAIL.agent, enabled: false } });
    await renderAgentPage();

    expect(reactivateSelect()).toBeDefined();
    expect(reactivateButton()!.disabled).toBe(true);
  });

  it('choosing a level enables the button and shows that level\'s real description', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, agent: { ...DETAIL.agent, enabled: false } });
    await renderAgentPage();

    await act(async () => {
      const select = reactivateSelect()!;
      select.value = 'suggest';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(reactivateButton()!.disabled).toBe(false);
    expect(container.textContent).toContain('May propose actions for human review, never executes them directly.');
  });

  it('happy path: clicking Reactivate calls reactivateAgent() with the real id and chosen level, then shows the real confirmation', async () => {
    reactivateAgent.mockResolvedValue({
      agentId: 'agent-reese', agentName: 'Reese', found: true, reactivated: true, autonomyLevel: 'observe', error: null,
    });
    getAgentDetail.mockResolvedValue({ ...DETAIL, agent: { ...DETAIL.agent, enabled: false } });
    await renderAgentPage();

    await act(async () => {
      const select = reactivateSelect()!;
      select.value = 'observe';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      reactivateButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(reactivateAgent).toHaveBeenCalledWith('agent-reese', 'observe');
    expect(container.textContent).toContain('Reactivated at autonomy level "observe".');
  });

  it('failure path: a server error is shown honestly, not swallowed', async () => {
    reactivateAgent.mockResolvedValue({
      agentId: 'agent-reese', agentName: 'Reese', found: false, reactivated: false, autonomyLevel: null, error: 'Agent not found',
    });
    getAgentDetail.mockResolvedValue({ ...DETAIL, agent: { ...DETAIL.agent, enabled: false } });
    await renderAgentPage();

    await act(async () => {
      const select = reactivateSelect()!;
      select.value = 'observe';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      reactivateButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('Failed to reactivate: Agent not found');
  });
});

// Trust Contract (2026-08-24) — Ali, live: "All Agents should have a trust
// contract based on [Trust Before Intelligence]."
describe('AgentDetailPage — "Trust Contract" section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getManagerInboxItems.mockResolvedValue([]);
    listDirectives.mockResolvedValue([]);
    listReportSubscriptions.mockResolvedValue([]);
    listGoals.mockResolvedValue([]);
    listOneOnOnes.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('happy path: a cron-tracked agent shows its real schedule, last run, and run/error counts', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      trust_contract: {
        trigger_type: 'cron',
        schedule: '28 */6 * * *',
        status: 'idle',
        last_run_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        run_count: 623,
        error_count: 4,
        avg_duration_ms: 5791,
        last_error: 'out of shared memory',
        last_error_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
        last_activity_at: null, // irrelevant here — last_run_at is set, so the fallback never triggers
      },
    });

    await renderAgentPage();

    expect(container.textContent).toContain('Trust Contract');
    expect(container.textContent).toContain('cron');
    expect(container.textContent).toContain('28 */6 * * *');
    expect(container.textContent).toContain('623'); // total runs
    expect(container.textContent).toContain('5h ago'); // last run, via the real timeAgo() helper
    expect(container.textContent).toContain('5.8s'); // avg duration, formatted from ms
    expect(container.textContent).toContain('out of shared memory'); // real last error, disclosed
  });

  it('honesty boundary: an identity-only agent (no scheduler tracking) shows its real trigger_type, not a fabricated schedule', async () => {
    getAgentDetail.mockResolvedValue(DETAIL); // base fixture: trigger_type 'event_driven', schedule null

    await renderAgentPage();

    expect(container.textContent).toContain('Trust Contract');
    expect(container.textContent).toContain('event_driven');
  });

  it("boundary: no trigger_type at all shows the honest 'not invoked through the scheduled-run tracker' disclosure", async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      trust_contract: { ...DETAIL.trust_contract, trigger_type: null },
    });

    await renderAgentPage();

    expect(container.textContent).toContain("isn't invoked through the");
  });

  it('never fabricates a schedule/error when both are genuinely absent', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      trust_contract: { ...DETAIL.trust_contract, trigger_type: 'cron', schedule: null, last_error: null },
    });

    await renderAgentPage();

    // The stat grid renders (trigger_type is set), but no fabricated error banner.
    expect(container.textContent).toContain('Trust Contract');
    expect(container.querySelector('.alert-warning')).toBeNull();
  });

  // AI Workforce Reset, Phase C (2026-08-24) — the Permitted dimension: this
  // agent's real, chosen autonomy level (or an honest "not yet set").
  it('Permitted: shows "Not yet set" when autonomy_level is null (never reactivated through the Phase C flow)', async () => {
    getAgentDetail.mockResolvedValue(DETAIL); // base fixture: agent.autonomy_level null

    await renderAgentPage();

    expect(container.textContent).toContain('Autonomy level (Permitted)');
    expect(container.textContent).toContain('Not yet set');
  });

  it('Permitted: shows the real, previously-chosen autonomy level verbatim', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, agent: { ...DETAIL.agent, autonomy_level: 'act_audited' } });

    await renderAgentPage();

    expect(container.textContent).toContain('Autonomy level (Permitted)');
    expect(container.textContent).toContain('act_audited');
  });

  // Trust Contract fix (2026-08-24) — Ali, live, looking at Reese's real page:
  // "Reese has several tickets that have been opened... but this says it's
  // never been run." Fixes the literal complaint: an event-driven agent with
  // real ticket activity must never show a bare "Never".
  // Scoped to `.admin-stat-card` (not `container.textContent`) throughout —
  // the Ticket activity table below has its OWN "Last activity" column header
  // (per-ticket, unrelated), so a page-wide text check would false-positive.
  function trustContractStatCards(): string[] {
    return Array.from(container.querySelectorAll('.admin-stat-card')).map((el) => el.textContent || '');
  }

  it('Instant: an event-driven agent with real ticket activity shows a "Last activity" stat (not "Last run"/"Never")', async () => {
    getAgentDetail.mockResolvedValue(DETAIL); // base fixture: event_driven, last_run_at null, last_activity_at real

    await renderAgentPage();

    const cards = trustContractStatCards();
    expect(cards.some((text) => text.includes('Last activity'))).toBe(true);
    expect(cards.some((text) => text.includes('Last run'))).toBe(false);
    expect(cards.some((text) => text.includes('Never'))).toBe(false);
  });

  it('boundary: an event-driven agent with genuinely zero ticket history ever still shows an honest "Last run: Never"', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      trust_contract: { ...DETAIL.trust_contract, last_activity_at: null },
    });

    await renderAgentPage();

    const cards = trustContractStatCards();
    expect(cards.some((text) => text.includes('Last run') && text.includes('Never'))).toBe(true);
    expect(cards.some((text) => text.includes('Last activity'))).toBe(false);
  });

  it('a scheduler-tracked (cron) agent keeps showing "Last run" from last_run_at, never the ticket-derived fallback', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      trust_contract: {
        ...DETAIL.trust_contract,
        trigger_type: 'cron',
        last_run_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        last_activity_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // more recent, but must be ignored
      },
    });

    await renderAgentPage();

    const cards = trustContractStatCards();
    expect(cards.some((text) => text.includes('Last run') && text.includes('5h ago'))).toBe(true);
    expect(cards.some((text) => text.includes('Last activity'))).toBe(false);
  });
});

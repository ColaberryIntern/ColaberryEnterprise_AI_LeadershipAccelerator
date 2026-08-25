import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import OrgChartSection from '../OrgChartSection';
import type { OrgChartResponse } from '../../../../../services/workforceOrgChartApi';

/**
 * OrgChartSection — no @testing-library/react in this repo (confirmed,
 * plan-audit cycle 2/3), same react-dom/client + act + MemoryRouter
 * convention as frontend/src/components/admin/shell/__tests__/StatCard.test.tsx
 * and frontend/src/pages/admin/workforce/__tests__/WorkforceOSPage.smoke.test.tsx.
 */

jest.mock('../../../../../services/workforceOrgChartApi', () => ({
  getOrgChart: jest.fn(),
  // Org Chart v3 (2026-08-19) — team-switch dropdown. NAMED_DEPARTMENTS is a
  // real, static export (not a jest.fn()) — mirrors the module's actual
  // shape so OrgChartHumanDrawer's dropdown options render for real in
  // these tests, not just call-through mocks.
  NAMED_DEPARTMENTS: ['Exec', 'Sales', 'Operations', 'Recruiting', 'Customer Support', 'Marketing'],
  // Org Chart v4 fix (2026-08-20, session CC-20260818-x4nk continued) — this
  // mock factory was missing OTHER_DEPARTMENT, a real static export
  // OrgChartSection.tsx also imports and uses to build its department render
  // order (`[...NAMED_DEPARTMENTS, OTHER_DEPARTMENT]`). Without it here, the
  // import resolved to `undefined` under this mock, so the "Other" bucket's
  // key never matched anything in `byDepartment` and Taiwo/Swati silently
  // vanished from the rendered output — a real, reproducible pre-existing
  // bug (confirmed via root-cause analysis, not flakiness) that predates
  // this run and was never caught because this repo's CI has no frontend
  // jest job (see .github/workflows/ci.yml — frontend gets typecheck + build
  // only). Fixed here as a direct, in-scope correction since this run
  // already owns this exact mock block for the color-collision fixture
  // change below.
  OTHER_DEPARTMENT: 'Other',
  updateOrgMemberTeam: jest.fn(),
  assignHierarchyTask: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getOrgChart, updateOrgMemberTeam, assignHierarchyTask } = require('../../../../../services/workforceOrgChartApi') as {
  getOrgChart: jest.Mock; updateOrgMemberTeam: jest.Mock; assignHierarchyTask: jest.Mock;
};
// OrgChartMermaid (and the MermaidDiagram it wraps) loads mermaid from a CDN
// at runtime via a dynamic `import()` of a literal URL string — real
// production behavior (MermaidDiagram.tsx's own graceful CDN-failure
// fallback), but under Jest/jsdom that dynamic import can hang well past the
// default test timeout rather than rejecting fast (confirmed live: the first
// full-suite run timed out at 5000ms and left later assertions racing an
// unsettled render). OrgChartSection's own job is just "pass the right data
// to OrgChartMermaid," not "prove Mermaid's CDN rendering works" — that is
// MermaidDiagram.tsx's own concern, out of scope here — so it's mocked out
// at the OrgChartMermaid boundary this file owns.
jest.mock('../OrgChartMermaid', () => ({ __esModule: true, default: () => null }));

// Real live shape from execution-contract.md (2026-08-19): 6 named humans,
// only Ali and Kes currently have a real open task; Taiwo/Jackie/Swati/Sohail
// have none yet — the fixture below mirrors that exactly, not an invented
// "everyone has a task" scenario. Departments build (2026-08-19, continued):
// each human now carries a real `department` (Ali=Exec, Kes/Jackie=
// Operations, Sohail=Marketing, Taiwo/Swati=Other — spanning 3 named
// departments + the trailing "Other" bucket in one fixture; Taiwo/Swati keep
// `team: null` so the pre-existing "no team" drawer test below stays exactly
// accurate), and every leadership/staff entry carries a real
// `reports_to_summary`.
const CHART: OrgChartResponse = {
  organization: { id: 'org-colaberry', name: 'Colaberry' },
  humans: [
    { id: 'f179c222-284e-4180-a335-cca9e4918b2e', name: 'Ali Muwwakkil', email: 'ali@colaberry.com', team: 'Exec', department: 'Exec', role: 'manager', leadership_agent_ids: ['corybrain-id'], staff_count: 14, task: { id: 't-ali', ticket_number: null, title: '[Student Success] Cross-Departmental Initiative Execution', status: 'backlog', priority: 'medium', type: 'strategic', created_at: '2026-08-19T11:28:06.114Z' }, hierarchy_color: null },
    { id: '3df017df-affa-49ab-884f-a99a4bd2ef4e', name: 'kesetebirhan@gmail.com', email: 'kesetebirhan@gmail.com', team: 'Operations', department: 'Operations', role: 'member', leadership_agent_ids: ['wie-id'], staff_count: 4, task: { id: 't-kes', ticket_number: null, title: '[Inbox Case] Employee Access To Enterprise Platform', status: 'in_progress', priority: 'medium', type: 'inbox_case', created_at: '2026-08-19T12:00:24.739Z' }, hierarchy_color: null },
    { id: '1fbb5316-1381-4b8a-81a8-3a7325b39d5f', name: 'Taiwo Oludimimu', email: 'taiwooludimimu@gmail.com', team: null, department: 'Other', role: 'member', leadership_agent_ids: [], staff_count: 0, task: null, hierarchy_color: null },
    { id: 'a6db5276-2993-4e0b-ace9-0052ba841c80', name: 'Jackie', email: 'jackie@colaberry.com', team: 'Operations', department: 'Operations', role: 'member', leadership_agent_ids: [], staff_count: 0, task: null, hierarchy_color: null },
    { id: '5db87b51-4554-4e52-93d7-c61f9887352c', name: 'Swati', email: 'swati@colaberry.com', team: null, department: 'Other', role: 'member', leadership_agent_ids: [], staff_count: 0, task: null, hierarchy_color: null },
    { id: '4e255894-ac0b-4367-ae06-27459ea05f66', name: 'Sohail', email: 'sohail@colaberry.com', team: 'Marketing', department: 'Marketing', role: 'member', leadership_agent_ids: [], staff_count: 0, task: null, hierarchy_color: null },
  ],
  leadership: [
    { id: 'corybrain-id', agent_name: 'CoryBrain', display_name: 'Cory Brain — Strategic Initiatives', reports_to_human_id: 'f179c222-284e-4180-a335-cca9e4918b2e', reports_to_summary: 'Reports to: Ali Muwwakkil', staff_ids: ['staff-1-id'], open_ticket_count: 129, hierarchy_color: null, enabled: true },
    { id: 'wie-id', agent_name: 'workforce_intelligence_engine', display_name: 'Workforce Intelligence Engine', reports_to_human_id: '3df017df-affa-49ab-884f-a99a4bd2ef4e', reports_to_summary: 'Reports to: kesetebirhan@gmail.com', staff_ids: [], open_ticket_count: 202, hierarchy_color: null, enabled: true },
  ],
  staff: [
    { id: 'staff-1-id', agent_name: 'AdmissionsConversionArchitect', display_name: 'Admissions Conversion Architect', reports_to_agent_id: 'corybrain-id', reports_to_summary: 'Reports to: Cory Brain — Strategic Initiatives', open_ticket_count: 12, hierarchy_color: null, enabled: true },
  ],
  unresolved: [],
  generated_at: '2026-08-19T14:00:00.000Z',
};

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(<MemoryRouter><OrgChartSection /></MemoryRouter>);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

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

describe('OrgChartSection — renders all 6 humans with real/honest-empty task state', () => {
  it('renders every human, with Ali/Kes showing their real task title and the other 4 showing no task', async () => {
    getOrgChart.mockResolvedValue(CHART);

    await render();

    for (const name of ['Ali Muwwakkil', 'Taiwo Oludimimu', 'Jackie', 'Swati', 'Sohail']) {
      expect(container.textContent).toContain(name);
    }
    expect(container.textContent).toContain('kesetebirhan@gmail.com'); // Kes falls back to email (no Enrollment)
  });

  it('renders AI Leadership and AI Staff tiers with real display names, not raw agent_name', async () => {
    getOrgChart.mockResolvedValue(CHART);

    await render();

    expect(container.textContent).toContain('Cory Brain — Strategic Initiatives');
    expect(container.textContent).toContain('Workforce Intelligence Engine');
    expect(container.textContent).toContain('Admissions Conversion Architect');
  });
});

describe('OrgChartSection — drill-down (human) and drill-through (agent)', () => {
  it('clicking a human opens the drawer showing their real team counts', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const aliCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Ali Muwwakkil')) as HTMLElement;
    expect(aliCard).toBeTruthy();

    await act(async () => {
      aliCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('AI Leadership reporting here · 1');
    expect(container.textContent).toContain('Cross-Departmental Initiative Execution');
  });

  it('clicking a human with no team/task shows the honest empty states in the drawer', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const taiwoCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Taiwo Oludimimu')) as HTMLElement;
    await act(async () => {
      taiwoCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('No task assigned yet.');
    expect(container.textContent).toContain('No AI Leadership agents report to Taiwo Oludimimu yet.');
  });

  // Org Chart v4 (2026-08-20) — repointed from `corybrain-id` (a LEADERSHIP
  // agent) to the fixture's one STAFF agent. Leadership-card click behavior
  // is deliberately CHANGING in this run (see the new describe block below);
  // this assertion now describes the card type whose behavior actually
  // stays true — Staff cards remain real drill-through links, never a modal.
  it('a staff agent card is a real <a href="/admin/agents/:id"> link (drill-through, not a modal)', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const link = container.querySelector('a[href="/admin/agents/staff-1-id"]');
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain('Admissions Conversion Architect');
  });
});

// Org Chart v4 (2026-08-20, session CC-20260818-x4nk continued) — Ali, live:
// "When I click on AI Leadership, I want to be able to see their AI Team
// below and Human above in a pop up on the right side." Scoped to Leadership
// cards only — Staff cards keep real navigation (see the repointed
// drill-through test above).
describe('OrgChartSection — AI Leadership drawer', () => {
  it('clicking a Leadership card opens a drawer showing the human above and the AI Staff team below, with real data', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const leadershipCard = Array.from(container.querySelectorAll('button.wf-emp')).find((el) => el.textContent?.includes('Cory Brain — Strategic Initiatives')) as HTMLElement;
    expect(leadershipCard).toBeTruthy();

    await act(async () => {
      leadershipCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Human above.
    expect(container.textContent).toContain('Reports to');
    expect(container.textContent).toContain('Ali Muwwakkil');
    // AI Staff below.
    expect(container.textContent).toContain('AI Staff team · 1');
    expect(container.textContent).toContain('Admissions Conversion Architect');

    // The staff row INSIDE the drawer is still a real drill-through link,
    // not a nested modal.
    const staffLinkInsideDrawer = container.querySelector('.wf-drawer a[href="/admin/agents/staff-1-id"]');
    expect(staffLinkInsideDrawer).toBeTruthy();
  });

  it('a Leadership agent with zero AI Staff shows the honest empty state, never a crash', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const wieCard = Array.from(container.querySelectorAll('button.wf-emp')).find((el) => el.textContent?.includes('Workforce Intelligence Engine')) as HTMLElement;
    await act(async () => {
      wieCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('No AI Staff agents report to Workforce Intelligence Engine yet.');
    expect(container.textContent).toContain('kesetebirhan@gmail.com'); // the human it reports to
  });

  it('clicking a Staff card never opens the Leadership drawer — Staff click behavior is unchanged (real navigation only)', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    // Staff cards render as <a>, not <button.wf-emp> — dispatching a click on
    // the anchor itself (jsdom does not follow real navigation) must not
    // cause any drawer markup to appear.
    const staffLink = container.querySelector('a[href="/admin/agents/staff-1-id"]') as HTMLElement;
    await act(async () => {
      staffLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('.wf-scrim')).toBeFalsy();
  });
});

describe('OrgChartSection — failure and boundary states', () => {
  it('renders an honest error with a retry button when the API call fails', async () => {
    getOrgChart.mockRejectedValue({ response: { data: { error: 'Could not load the org chart.' } } });

    await render();

    expect(container.textContent).toContain('Could not load the org chart.');
    expect(container.querySelector('button')?.textContent).toContain('Retry');
  });

  it('boundary: zero unresolved agents renders no broken-chain warning', async () => {
    getOrgChart.mockResolvedValue(CHART);

    await render();

    expect(container.textContent).not.toContain('broken reports-to chain');
  });

  it('boundary: an unresolved agent renders an honest disclosure, never silently dropped', async () => {
    getOrgChart.mockResolvedValue({ ...CHART, unresolved: [{ id: 'orphan-id', agent_name: 'OrphanedAgent', reason: 'OrphanedAgent (agent) -> [dangling]' }] });

    await render();

    expect(container.textContent).toContain('1 agent(s) have a broken reports-to chain');
    expect(container.textContent).toContain('OrphanedAgent');
  });
});

// Departments build (2026-08-19, session CC-20260818-x4nk continued): "we
// need to divide them up into dept" + "Each AI staff should have a tag on
// them to show who they report to on their cards before even clicking" +
// "option to go full screen".
describe('OrgChartSection — department grouping', () => {
  it('groups humans under their real department headers, and buckets a null/unrecognized team into "Other" — never drops anyone', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const groups = Array.from(container.querySelectorAll('.wf-dept-group'));
    const execGroup = groups.find((g) => g.textContent?.includes('Exec ·'));
    const opsGroup = groups.find((g) => g.textContent?.includes('Operations ·'));
    const marketingGroup = groups.find((g) => g.textContent?.includes('Marketing ·'));
    const otherGroup = groups.find((g) => g.textContent?.includes('Other ·'));

    expect(execGroup?.textContent).toContain('Ali Muwwakkil');
    expect(execGroup?.textContent).not.toContain('Sohail');

    expect(opsGroup?.textContent).toContain('kesetebirhan@gmail.com');
    expect(opsGroup?.textContent).toContain('Jackie');

    expect(marketingGroup?.textContent).toContain('Sohail');

    expect(otherGroup?.textContent).toContain('Taiwo Oludimimu');
    expect(otherGroup?.textContent).toContain('Swati');

    // Every one of the 6 humans is accounted for across the 4 groups — none silently dropped.
    const allGroupedText = groups.map((g) => g.textContent).join(' ');
    for (const name of ['Ali Muwwakkil', 'kesetebirhan@gmail.com', 'Taiwo Oludimimu', 'Jackie', 'Swati', 'Sohail']) {
      expect(allGroupedText).toContain(name);
    }
  });

  it('a department with zero members renders no section at all (e.g. "Recruiting" and "Customer Support" are absent from this fixture)', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    expect(container.textContent).not.toContain('Recruiting ·');
    expect(container.textContent).not.toContain('Customer Support ·');
  });
});

describe('OrgChartSection — reports-to tags (visible before any click)', () => {
  it('every AI Leadership and AI Staff card shows its real reports_to_summary tag in the initial render, with no interaction required', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    expect(container.textContent).toContain('Reports to: Ali Muwwakkil');
    expect(container.textContent).toContain('Reports to: kesetebirhan@gmail.com');
    expect(container.textContent).toContain('Reports to: Cory Brain — Strategic Initiatives');
  });
});

// Card restructure (2026-08-21, session CC-20260818-x4nk continued) — Ali,
// live, with a screenshot: long real agent names were rendering
// character-by-character in the old narrow single-row card (e.g.
// "Auton/omou/s/Opera/tions"). jsdom doesn't compute real CSS layout, so it
// can't directly assert "no character-level wrap" the way a browser
// screenshot can (that proof lives in this run's production verification
// instead) — but it CAN prove the DOM/text contract that any such bug would
// require breaking: the full name must render as one contiguous text node
// on `.nm` (never split into several small text nodes by JS), and the new
// `title` attribute must carry the full string for hover, using the exact
// longest real production names from execution-contract.md.
describe('OrgChartSection — longest real production names render intact (no JS-level splitting)', () => {
  const LONG_NAME_CHART: OrgChartResponse = {
    ...CHART,
    leadership: [
      { id: 'cory-engine-id', agent_name: 'cory-engine', display_name: 'Cory Engine — Autonomous Operations', reports_to_human_id: 'f179c222-284e-4180-a335-cca9e4918b2e', reports_to_summary: 'Reports to: Ali Muwwakkil', staff_ids: [], open_ticket_count: 42, hierarchy_color: null, enabled: true },
      { id: 'abm-id', agent_name: 'AgentBehaviorMonitorAgent', display_name: 'Agent Behavior Monitor — Security', reports_to_human_id: 'f179c222-284e-4180-a335-cca9e4918b2e', reports_to_summary: 'Reports to: Ali Muwwakkil', staff_ids: [], open_ticket_count: 3, hierarchy_color: null, enabled: true },
    ],
    staff: [
      { id: 'marketing-architect-id', agent_name: 'MarketingGrowthStrategyArchitect', display_name: 'Marketing & Growth Strategy Architect', reports_to_agent_id: 'cory-engine-id', reports_to_summary: 'Reports to: Cory Engine — Autonomous Operations', open_ticket_count: 7, hierarchy_color: null, enabled: true },
      { id: 'platform-architect-id', agent_name: 'PlatformInfrastructureStrategyArchitect', display_name: 'Platform & Infrastructure Strategy Architect', reports_to_agent_id: 'cory-engine-id', reports_to_summary: 'Reports to: Cory Engine — Autonomous Operations', open_ticket_count: 2, hierarchy_color: null, enabled: true },
    ],
  };

  it('the longest real Leadership/Staff display names each render as ONE contiguous text node on .nm, with a title attribute carrying the full name', async () => {
    getOrgChart.mockResolvedValue(LONG_NAME_CHART);
    await render();

    const longNames = [
      'Cory Engine — Autonomous Operations',
      'Agent Behavior Monitor — Security',
      'Marketing & Growth Strategy Architect',
      'Platform & Infrastructure Strategy Architect',
    ];
    for (const name of longNames) {
      const nameEls = Array.from(container.querySelectorAll('.wf-emp-grid .nm')).filter((el) => el.textContent === name);
      expect(nameEls.length).toBeGreaterThanOrEqual(1); // full string intact in one element, never split
      expect(nameEls[0].getAttribute('title')).toBe(name); // full text always available via hover, even if visually clamped
    }
  });

  it('the reports-to chip for a long leadership name is truncatable (trunc class) and carries the full summary via title', async () => {
    getOrgChart.mockResolvedValue(LONG_NAME_CHART);
    await render();

    const chip = Array.from(container.querySelectorAll('.wf-chip.trunc')).find(
      (el) => el.getAttribute('title') === 'Reports to: Cory Engine — Autonomous Operations',
    );
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toBe('Reports to: Cory Engine — Autonomous Operations');
  });

  it('every AI Leadership/Staff card in the grid uses the new wf-emp-grid two-row layout', async () => {
    getOrgChart.mockResolvedValue(LONG_NAME_CHART);
    await render();

    const gridCards = container.querySelectorAll('.wf-dirs .wf-emp-grid');
    // LONG_NAME_CHART replaces `leadership`/`staff` wholesale: 2 leadership +
    // 2 staff = 4 AI Leadership/Staff cards, all on the new layout. Human
    // cards (also wf-emp-grid, in their own .wf-dirs per department) add
    // more on top of that floor.
    expect(gridCards.length).toBeGreaterThanOrEqual(4);
    for (const card of Array.from(gridCards)) {
      expect(card.querySelector('.wf-emp-head')).toBeTruthy();
      expect(card.querySelector('.wf-emp-meta')).toBeTruthy();
    }
  });
});

describe('OrgChartSection — fullscreen toggle', () => {
  let fullscreenElement: Element | null;
  let requestFullscreenMock: jest.Mock;
  let exitFullscreenMock: jest.Mock;
  let definedFullscreenElement = false;

  beforeEach(() => {
    fullscreenElement = null;
    requestFullscreenMock = jest.fn().mockImplementation(function (this: Element) {
      fullscreenElement = this;
      return Promise.resolve();
    });
    exitFullscreenMock = jest.fn().mockImplementation(() => {
      fullscreenElement = null;
      return Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsdom has no real Fullscreen API; these are test-only shims, not app code.
    (Element.prototype as any).requestFullscreen = requestFullscreenMock;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).exitFullscreen = exitFullscreenMock;
    try {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
      definedFullscreenElement = true;
    } catch {
      // Some jsdom versions ship a non-configurable fullscreenElement getter
      // already — if so, the sync-with-native-Esc-exit test below is
      // skipped rather than crashing the whole suite (guarded per-test).
      definedFullscreenElement = false;
    }
  });

  it('clicking the fullscreen button calls requestFullscreen() on the chart container', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const button = container.querySelector('button[aria-label="View fullscreen"]') as HTMLElement;
    expect(button).toBeTruthy();

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
  });

  it('toggling off while fullscreen calls document.exitFullscreen(), and a native fullscreenchange event (e.g. the user pressing Esc) flips the button back to "enter" state without a second click', async () => {
    if (!definedFullscreenElement) return; // guarded — see beforeEach
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const enterButton = container.querySelector('button[aria-label="View fullscreen"]') as HTMLElement;
    await act(async () => {
      enterButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.dispatchEvent(new Event('fullscreenchange'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const exitButton = container.querySelector('button[aria-label="Exit fullscreen"]') as HTMLElement;
    expect(exitButton).toBeTruthy();

    await act(async () => {
      exitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);

    // Simulate the browser itself exiting fullscreen (Esc) — fires
    // fullscreenchange with fullscreenElement now null WITHOUT the
    // component's own button being clicked again.
    await act(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('button[aria-label="View fullscreen"]')).toBeTruthy();
  });
});

// Org Chart v3 (2026-08-19, session CC-20260818-x4nk continued) — Ali:
// "Give me the ability to switch the people between teams."
describe('OrgChartHumanDrawer — team dropdown', () => {
  it('selecting a new department calls updateOrgMemberTeam with the right id/team and triggers a refetch', async () => {
    getOrgChart.mockResolvedValue(CHART);
    updateOrgMemberTeam.mockResolvedValue({ ...CHART.humans[3], team: 'Marketing' }); // Jackie
    await render();

    const jackieCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Jackie')) as HTMLElement;
    await act(async () => {
      jackieCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const select = container.querySelector('select[aria-label="Change Jackie\'s department"]') as HTMLSelectElement;
    expect(select).toBeTruthy();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      nativeSetter.call(select, 'Marketing');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateOrgMemberTeam).toHaveBeenCalledWith('a6db5276-2993-4e0b-ace9-0052ba841c80', 'Marketing');
    // Refetch-on-success: getOrgChart called once on mount + once more after the team change.
    expect(getOrgChart).toHaveBeenCalledTimes(2);
  });

  it('selecting the empty option ("None (Other)") clears the department by passing null', async () => {
    getOrgChart.mockResolvedValue(CHART);
    updateOrgMemberTeam.mockResolvedValue({ ...CHART.humans[0], team: null });
    await render();

    const aliCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Ali Muwwakkil')) as HTMLElement;
    await act(async () => {
      aliCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const select = container.querySelector('select[aria-label="Change Ali Muwwakkil\'s department"]') as HTMLSelectElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      nativeSetter.call(select, '');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateOrgMemberTeam).toHaveBeenCalledWith('f179c222-284e-4180-a335-cca9e4918b2e', null);
  });
});

// Org Chart v3 (2026-08-19) — Ali: "Human, AI Leadership, AI Staff should
// all have the same colors."
describe('OrgChartSection — hierarchy colors', () => {
  it('a colored branch (human + their leadership + their staff) all render the SAME background; an uncolored human falls back to the hash-based color unchanged', async () => {
    const COLORED_CHART: OrgChartResponse = {
      ...CHART,
      humans: CHART.humans.map((h) => (h.id === 'f179c222-284e-4180-a335-cca9e4918b2e' ? { ...h, hierarchy_color: '#367895' } : { ...h, hierarchy_color: null })),
      leadership: CHART.leadership.map((l) => (l.id === 'corybrain-id' ? { ...l, hierarchy_color: '#367895' } : { ...l, hierarchy_color: null })),
      staff: CHART.staff.map((s) => ({ ...s, hierarchy_color: '#367895' })), // the only staff entry reports through corybrain-id
    };
    getOrgChart.mockResolvedValue(COLORED_CHART);
    await render();

    const aliCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Ali Muwwakkil')) as HTMLElement;
    const aliAvatar = aliCard.querySelector('.wf-av') as HTMLElement;
    const aliBackground = aliAvatar.style.background;
    expect(aliBackground).toBeTruthy();

    const corybrainCard = Array.from(container.querySelectorAll('a.wf-emp')).find((el) => el.textContent?.includes('Cory Brain')) as HTMLElement;
    const corybrainAvatar = corybrainCard.querySelector('.wf-av') as HTMLElement;
    // Same hierarchy_color value ('#367895') rendered through the same
    // React inline-style path -> jsdom normalizes it identically either way,
    // so a direct equality check is format-agnostic (never hardcodes
    // whether jsdom keeps '#367895' or expands to rgb(...)).
    expect(corybrainAvatar.style.background).toBe(aliBackground);

    const staffCard = Array.from(container.querySelectorAll('a.wf-emp')).find((el) => el.textContent?.includes('Admissions Conversion Architect')) as HTMLElement;
    const staffAvatar = staffCard.querySelector('.wf-av') as HTMLElement;
    expect(staffAvatar.style.background).toBe(aliBackground);

    // Sohail has no hierarchy_color anywhere in this fixture — falls back to
    // the pre-existing hash-based color, which is simply SOME real color,
    // not empty/unset, and not the same as the colored branch above.
    const sohailCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Sohail')) as HTMLElement;
    const sohailAvatar = sohailCard.querySelector('.wf-av') as HTMLElement;
    expect(sohailAvatar.style.background).toBeTruthy();
    expect(sohailAvatar.style.background).not.toBe(aliBackground);
  });

  // Org Chart v4 color-collision fix (2026-08-20, session CC-20260818-x4nk
  // continued) — the exact live bug Ali reported (JJ and Ali both rendering
  // green). This 7th human's id was found by deterministically replaying
  // agentAvatarColor.ts's own hash function offline (not guessed): under the
  // OLD two-pass logic (hash-assign every human first with zero knowledge of
  // reserved colors, THEN separately overwrite only the humans with a real
  // server hierarchy_color), this exact id's fallback color collided
  // byte-for-byte with Ali's server-assigned '#FB2832' — reproduced and
  // confirmed via a standalone script before writing this assertion. After
  // the fix (reserved-color set computed BEFORE the fallback pass), the two
  // can never land on the same color.
  it('the exact live-reported bug: a no-agent human whose hash fallback would have collided with a human-with-agents color never collides after the fix', async () => {
    const NO_AGENT_COLLISION_ID = '99999999-0000-4000-8000-000000000002';
    const COLLISION_CHART: OrgChartResponse = {
      ...CHART,
      humans: [
        ...CHART.humans.map((h) => (h.id === 'f179c222-284e-4180-a335-cca9e4918b2e' ? { ...h, hierarchy_color: '#FB2832' } : h)),
        {
          id: NO_AGENT_COLLISION_ID, name: 'JJ', email: 'john@colaberry.com', team: null, department: 'Other',
          role: 'member', leadership_agent_ids: [], staff_count: 0, task: null, hierarchy_color: null,
        },
      ],
    };
    getOrgChart.mockResolvedValue(COLLISION_CHART);
    await render();

    const aliCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Ali Muwwakkil')) as HTMLElement;
    const aliBackground = (aliCard.querySelector('.wf-av') as HTMLElement).style.background;
    expect(aliBackground).toBeTruthy();

    const jjCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('JJ')) as HTMLElement;
    const jjBackground = (jjCard.querySelector('.wf-av') as HTMLElement).style.background;
    expect(jjBackground).toBeTruthy();

    // This is the specific assertion that would have FAILED before the fix
    // (both would have rendered '#FB2832').
    expect(jjBackground).not.toBe(aliBackground);
  });

  // The run's own bar: "never end up with the same color," checked across
  // the FULL rendered population, not a single pair — every real hierarchy
  // color reserved by a human/leadership/staff entry must never also be worn
  // by a fallback (no-color) entry anywhere else on the same chart.
  it('no fallback (no-color) card anywhere on the chart ever renders a color already reserved by a real hierarchy_color, checked across every human/leadership/staff card at once', async () => {
    const MIXED_CHART: OrgChartResponse = {
      ...CHART,
      humans: [
        ...CHART.humans.map((h) => (h.id === 'f179c222-284e-4180-a335-cca9e4918b2e' ? { ...h, hierarchy_color: '#FB2832' } : h)),
        { id: '99999999-0000-4000-8000-000000000002', name: 'JJ', email: 'john@colaberry.com', team: null, department: 'Other', role: 'member', leadership_agent_ids: [], staff_count: 0, task: null, hierarchy_color: null },
        { id: '99999999-0000-4000-8000-000000000009', name: 'Extra Person', email: 'extra@colaberry.com', team: null, department: 'Other', role: 'member', leadership_agent_ids: [], staff_count: 0, task: null, hierarchy_color: null },
      ],
      leadership: CHART.leadership.map((l) => (l.id === 'corybrain-id' ? { ...l, hierarchy_color: '#FB2832' } : l)),
      staff: CHART.staff.map((s) => ({ ...s, hierarchy_color: '#FB2832' })),
    };
    getOrgChart.mockResolvedValue(MIXED_CHART);
    await render();

    const allCards = Array.from(container.querySelectorAll('.wf-emp, a.wf-emp'));
    // Capture the REAL reserved color in whatever format jsdom normalizes it
    // to (rather than comparing against the raw '#FB2832' literal, which may
    // not string-match jsdom's own style-serialization format) — same
    // format-agnostic approach the existing "colored branch" test above
    // uses, extended to the full population.
    const aliCard = allCards.find((el) => el.textContent?.includes('Ali Muwwakkil')) as HTMLElement;
    const reservedBackground = (aliCard.querySelector('.wf-av') as HTMLElement).style.background;
    expect(reservedBackground).toBeTruthy();

    const noColorCardNames = ['JJ', 'Extra Person', 'Jackie', 'Swati', 'Sohail', 'Workforce Intelligence Engine'];
    let checkedCount = 0;
    for (const name of noColorCardNames) {
      const card = allCards.find((el) => el.textContent?.includes(name));
      const avatar = card?.querySelector('.wf-av') as HTMLElement | undefined;
      if (!avatar) continue;
      checkedCount += 1;
      expect(avatar.style.background).not.toBe(reservedBackground);
    }
    // Guards against the loop above silently checking zero cards (e.g. a
    // future fixture rename breaking every `.find()` and passing vacuously).
    expect(checkedCount).toBeGreaterThanOrEqual(5);
  });
});

// Org Chart v3 (2026-08-19) — Ali: "The human has the ability to create and
// assign tasks to any agent in it's hierarchy even if they report to
// another AI Agent."
describe('OrgChartHumanDrawer — assign task', () => {
  async function openAliDrawerAndAssignForm() {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const aliCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Ali Muwwakkil')) as HTMLElement;
    await act(async () => {
      aliCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const openButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Assign task') as HTMLElement;
    await act(async () => {
      openButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it("the agent picker's options are exactly Ali's real downstream agents (CoryBrain AI Leadership + Admissions Conversion Architect AI Staff) — not Kes's workforce_intelligence_engine", async () => {
    await openAliDrawerAndAssignForm();

    const select = container.querySelector('select[aria-label="Assign task to agent"]') as HTMLSelectElement;
    const optionLabels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);

    expect(optionLabels).toEqual([
      'Cory Brain — Strategic Initiatives (AI Leadership)',
      'Admissions Conversion Architect (AI Staff)',
    ]);
    expect(optionLabels).not.toContain(expect.stringContaining('Workforce Intelligence Engine'));
  });

  // Real bug, caught live 2026-08-25: Taiwo assigned a task to
  // FinanceIntelligenceArchitect, one of the 17 agents deactivated in Phase
  // A — the picker listed it with no indication it was inactive, and the
  // resulting ticket sat unworked forever since that agent is switched off.
  it('excludes a deactivated (enabled:false) agent from the picker, even though it is genuinely in the hierarchy', async () => {
    getOrgChart.mockResolvedValue({
      ...CHART,
      leadership: [{ ...CHART.leadership[0], enabled: false }, CHART.leadership[1]], // CoryBrain deactivated
    });
    await render();

    const aliCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Ali Muwwakkil')) as HTMLElement;
    await act(async () => {
      aliCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const openButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Assign task') as HTMLElement;
    await act(async () => {
      openButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const select = container.querySelector('select[aria-label="Assign task to agent"]') as HTMLSelectElement;
    const optionLabels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);

    // The deactivated CoryBrain is gone; the still-enabled AI Staff under it
    // (Admissions Conversion Architect) is unaffected — only the agent that
    // is ACTUALLY deactivated drops out, not everyone downstream of it.
    expect(optionLabels).toEqual(['Admissions Conversion Architect (AI Staff)']);
    expect(optionLabels).not.toContain(expect.stringContaining('Cory Brain'));
  });

  it('boundary: when EVERY agent in the hierarchy is deactivated, the whole "Assign task" section disappears rather than offering an empty picker', async () => {
    getOrgChart.mockResolvedValue({
      ...CHART,
      leadership: [{ ...CHART.leadership[0], enabled: false }, CHART.leadership[1]],
      staff: [{ ...CHART.staff[0], enabled: false }],
    });
    await render();

    const aliCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Ali Muwwakkil')) as HTMLElement;
    await act(async () => {
      aliCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const openButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Assign task');
    expect(openButton).toBeUndefined();
  });

  it('submitting calls assignHierarchyTask with a generated idempotency key, and a retry (form stays open on failure) reuses the SAME key', async () => {
    await openAliDrawerAndAssignForm();

    const titleInput = container.querySelector('input[aria-label="Task title"]') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      nativeSetter.call(titleInput, 'Investigate lead spike');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // First submit fails (simulated network error) — form stays open.
    assignHierarchyTask.mockRejectedValueOnce(new Error('network error'));
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(assignHierarchyTask).toHaveBeenCalledTimes(1);
    const firstKey = assignHierarchyTask.mock.calls[0][1].idempotencyKey;
    expect(firstKey).toBeTruthy();

    // Retry (same form, same key generated at open-time) — this time succeeds.
    assignHierarchyTask.mockResolvedValueOnce({ id: 'ticket-1', title: 'Investigate lead spike' });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(assignHierarchyTask).toHaveBeenCalledTimes(2);
    const secondKey = assignHierarchyTask.mock.calls[1][1].idempotencyKey;
    expect(secondKey).toBe(firstKey); // SAME key reused across the retry, never regenerated

    expect(assignHierarchyTask).toHaveBeenLastCalledWith(
      'f179c222-284e-4180-a335-cca9e4918b2e',
      expect.objectContaining({ agentId: 'corybrain-id', title: 'Investigate lead spike', idempotencyKey: firstKey }),
    );
  });
});

// Org Chart v4 (2026-08-20, session CC-20260818-x4nk continued) — every AI
// Leadership/AI Staff card's ticket-filter button. Opens the ticket board
// filtered to exactly that agent's tickets in a NEW TAB.
describe('OrgChartSection — ticket-filter button', () => {
  let windowOpenSpy: jest.SpyInstance;

  beforeEach(() => {
    windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    windowOpenSpy.mockRestore();
  });

  it('clicking a Leadership card\'s ticket-filter button opens the right filtered URL in a new tab, and does NOT also open the drawer', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const leadershipButton = container.querySelector('[aria-label="View Cory Brain — Strategic Initiatives\'s tickets"]') as HTMLElement;
    expect(leadershipButton).toBeTruthy();

    await act(async () => {
      leadershipButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(windowOpenSpy).toHaveBeenCalledWith('/admin/tickets?creator=CoryBrain&range=all&status=open', '_blank', 'noopener,noreferrer');
    // The card's own click handler (open the Leadership drawer) must NOT
    // also have fired — stopPropagation on the button click.
    expect(container.querySelector('.wf-scrim')).toBeFalsy();
  });

  it('clicking a Staff card\'s ticket-filter button opens the right filtered URL in a new tab, and does NOT also navigate the card\'s own link', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const staffButton = container.querySelector('[aria-label="View Admissions Conversion Architect\'s tickets"]') as HTMLElement;
    expect(staffButton).toBeTruthy();

    await act(async () => {
      staffButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(windowOpenSpy).toHaveBeenCalledWith('/admin/tickets?creator=AdmissionsConversionArchitect&range=all&status=open', '_blank', 'noopener,noreferrer');
  });

  it('encodes an agent_name with special characters safely in the URL', async () => {
    const SPECIAL_CHART: OrgChartResponse = {
      ...CHART,
      leadership: [{ ...CHART.leadership[0], agent_name: 'agent name/with?special&chars' }],
    };
    getOrgChart.mockResolvedValue(SPECIAL_CHART);
    await render();

    const leadershipButton = container.querySelector('[aria-label="View Cory Brain — Strategic Initiatives\'s tickets"]') as HTMLElement;
    await act(async () => {
      leadershipButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(windowOpenSpy).toHaveBeenCalledWith(
      `/admin/tickets?creator=${encodeURIComponent('agent name/with?special&chars')}&range=all&status=open`,
      '_blank',
      'noopener,noreferrer',
    );
  });
});

// Ticket Count Sync fix, Task 2 (2026-08-21, session CC-20260818-x4nk
// continued) — Ali, live: clicking the ticket-COUNT NUMBER itself (the most
// natural click target) did nothing; only the small icon next to it
// navigated. Fixed by merging the count (.wl) and the icon (.wf-toggle) into
// ONE clickable/keyboard-operable region (.wf-emp-actions itself). These
// tests are the actual regression coverage for the reported bug — the suite
// above already proves the aria-label-selected element still works (it now
// resolves to the merged wrapper instead of the old icon-only span).
describe('OrgChartSection — the ticket-count NUMBER itself is now clickable (Task 2 fix)', () => {
  let windowOpenSpy: jest.SpyInstance;

  beforeEach(() => {
    windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    windowOpenSpy.mockRestore();
  });

  it('clicking specifically the .wl count badge (not the icon) on a Leadership card opens the filtered tickets — the exact reported bug, now fixed', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const leadershipControl = container.querySelector('[aria-label="View Cory Brain — Strategic Initiatives\'s tickets"]') as HTMLElement;
    const countBadge = leadershipControl.querySelector('.wl') as HTMLElement;
    expect(countBadge).toBeTruthy();

    await act(async () => {
      // bubbles: true — a real click on a child element bubbles up to the
      // parent's onClick, exactly like a real mouse click on the number.
      countBadge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(windowOpenSpy).toHaveBeenCalledWith('/admin/tickets?creator=CoryBrain&range=all&status=open', '_blank', 'noopener,noreferrer');
    expect(container.querySelector('.wf-scrim')).toBeFalsy(); // still doesn't also open the drawer
  });

  it('clicking specifically the .wl count badge on a Staff card opens the filtered tickets, and does not also navigate the card\'s own Link', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const staffControl = container.querySelector('[aria-label="View Admissions Conversion Architect\'s tickets"]') as HTMLElement;
    const countBadge = staffControl.querySelector('.wl') as HTMLElement;
    expect(countBadge).toBeTruthy();

    await act(async () => {
      countBadge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(windowOpenSpy).toHaveBeenCalledWith('/admin/tickets?creator=AdmissionsConversionArchitect&range=all&status=open', '_blank', 'noopener,noreferrer');
  });

  it('pressing Enter on the focused control (keyboard operability, previously missing on the icon-only control) opens the filtered tickets', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const leadershipControl = container.querySelector('[aria-label="View Cory Brain — Strategic Initiatives\'s tickets"]') as HTMLElement;

    await act(async () => {
      leadershipControl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(windowOpenSpy).toHaveBeenCalledWith('/admin/tickets?creator=CoryBrain&range=all&status=open', '_blank', 'noopener,noreferrer');
  });

  it('pressing Space on the focused control also opens the filtered tickets', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const staffControl = container.querySelector('[aria-label="View Admissions Conversion Architect\'s tickets"]') as HTMLElement;

    await act(async () => {
      staffControl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(windowOpenSpy).toHaveBeenCalledWith('/admin/tickets?creator=AdmissionsConversionArchitect&range=all&status=open', '_blank', 'noopener,noreferrer');
  });

  it('a key other than Enter/Space does nothing', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const leadershipControl = container.querySelector('[aria-label="View Cory Brain — Strategic Initiatives\'s tickets"]') as HTMLElement;

    await act(async () => {
      leadershipControl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
});

// AI Workforce Reset (2026-08-24) — Ali, live: a deactivated agent must be
// visually distinguishable on the chart, not rendered identically to an
// active one.
describe('OrgChartSection — inactive (deactivated) agents are visually distinct', () => {
  it('a disabled Leadership agent shows an "Inactive" badge and is dimmed', async () => {
    getOrgChart.mockResolvedValue({
      ...CHART,
      leadership: [{ ...CHART.leadership[0], enabled: false }, CHART.leadership[1]],
    });
    await render();

    const card = Array.from(container.querySelectorAll('button.wf-emp')).find((b) => b.textContent?.includes('Cory Brain')) as HTMLElement;
    expect(card.textContent).toContain('Inactive');
    expect((card.style as any).opacity).toBe('0.55');
  });

  it('a disabled Staff agent shows an "Inactive" badge and is dimmed', async () => {
    getOrgChart.mockResolvedValue({
      ...CHART,
      staff: [{ ...CHART.staff[0], enabled: false }],
    });
    await render();

    const card = Array.from(container.querySelectorAll('a.wf-emp')).find((a) => a.textContent?.includes('Admissions Conversion Architect')) as HTMLElement;
    expect(card.textContent).toContain('Inactive');
    expect((card.style as any).opacity).toBe('0.55');
  });

  it('an active (enabled:true) agent never shows the "Inactive" badge', async () => {
    getOrgChart.mockResolvedValue(CHART); // every fixture entry is enabled:true
    await render();

    expect(container.textContent).not.toContain('Inactive');
  });
});

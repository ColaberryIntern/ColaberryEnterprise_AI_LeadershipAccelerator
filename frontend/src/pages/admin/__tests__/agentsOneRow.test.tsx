/**
 * AF12.2 — the agent surfaces are one sidebar row, and the page is the navigation.
 *
 * Ali, 20 Nov 2026, looking at the Program group: *"I think they need to be combined like
 * marketing."* Marketing's own note in `adminNav.ts` records the rule being applied here: eight
 * rows for one owner made the rail the navigation and the overview a page nobody needed, so now
 * the overview IS the navigation, and **the pages are not deleted**.
 *
 * Three things could go wrong in a way nobody would notice until it bit somebody, so each gets an
 * assertion rather than a comment:
 *
 *   1. THE RESTATEMENT. Dropping a nav entry without restating the path in
 *      `UNLISTED_PATH_SECTIONS` makes `sectionForPath` return null. `ProtectedRoute` computes
 *      `section ? canSection(section) : !isScopedRep`, so a null does not close the page, it OPENS
 *      it to every identity that is not a plain sales rep. Two owner-only pages would render for a
 *      builder and then 403 their own data. `adminNav.ts` warns about this twice and it has still
 *      happened once.
 *
 *   2. THE GROUP LEAKING. "Across everyone" is withheld from a viewer without `program`. If that
 *      ever flips to rendering-by-default, a builder gets two live links to pages the API refuses,
 *      which is the same failure as (1) wearing different clothes.
 *
 *   3. THE CAPABILITY BOARD MOVING. It is programme-wide and `program`-gated, so it looks like it
 *      belongs in the new group. It must not move: `BUILDER_STEPS` step 4 points at
 *      `hub-card-capability-board`, and `walkthroughTargets.test.ts` exists because a tour naming
 *      an element its page does not render says "this step is about something that is not on this
 *      page right now" and stays broken for a month. This was caught in review before it shipped;
 *      the assertion is here so it is caught by the suite next time.
 *
 * TEST STYLE: this repo has no `@testing-library/react`; the frontend suites drive React through
 * `createRoot` and `act` directly, as the sibling suites in this folder do.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

import { NAV_GROUPS, sectionForPath } from '../../../components/Layout/adminNav';

jest.mock('../../../services/agentDomainApi', () => ({
  fetchMyDomains: jest.fn(),
  fetchMyChangeRequests: jest.fn(),
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('../../../components/admin/shell', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionCard: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <section><h2>{title}</h2>{children}</section>
  ),
}));

jest.mock('../../../components/admin/agentDashboard/AgentDashboardWalkthrough', () => ({
  __esModule: true,
  default: () => <div data-testid="walkthrough-stub" />,
}));

jest.mock('../marketing/bugReport/ReportAProblem', () => ({
  __esModule: true,
  default: () => <div data-testid="report-stub" />,
}));

// The page probes its own access by CALLING the API rather than reading a role off the token, so
// the probe is what this test drives to produce an owner and a builder.
const probe = jest.fn();
jest.mock('../../../utils/api', () => ({ __esModule: true, default: { get: (...a: unknown[]) => probe(...a) } }));

import AgentDashboardPage, { buildGroups } from '../AgentDashboardPage';
import * as api from '../../../services/agentDomainApi';

const fetchMine = api.fetchMyDomains as jest.Mock;
const fetchReqs = api.fetchMyChangeRequests as jest.Mock;

const DOMAIN = {
  domain_key: 'platform',
  stories: 52,
  stories_verified: 11,
  build_authorizations: 3,
  agent_display_name: 'Atlas',
} as never;

let container: HTMLDivElement;
// Nullable, and the teardown guards on it: the pure describes below never mount, so an
// unconditional unmount here would fail every one of them on an undefined root.
let root: Root | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMine.mockResolvedValue({ domains: [DOMAIN], note: '' });
  fetchReqs.mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) { const r = root; act(() => { r.unmount(); }); root = null; }
  container.remove();
});

async function mountAs(who: 'owner' | 'builder'): Promise<void> {
  probe.mockImplementation(() => (who === 'owner'
    ? Promise.resolve({ data: {} })
    : Promise.reject({ response: { status: 403 } })));
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter><AgentDashboardPage /></MemoryRouter>);
  });
  // Two settles: the domains/requests pair, then the access probe.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

const ownerGroup = () => container.querySelector('[data-testid="agent-dashboard-group-across"]');
const card = (key: string) => container.querySelector(`[data-testid="hub-card-${key}"]`);

// ───────────────────────────── 1. the sidebar ─────────────────────────────

describe('the sidebar is one row', () => {
  const programLinks = NAV_GROUPS.find((g) => g.label === 'Program')?.links ?? [];
  const paths = programLinks.map((l) => l.path);

  it('THE CONTROL: the Program group is read, and it is not empty', () => {
    // Without this, every "is absent" assertion below would pass on an empty list.
    expect(programLinks.length).toBeGreaterThan(4);
    expect(paths).toContain('/admin/accelerator');
  });

  it('keeps exactly one agent row, and it is called Agents', () => {
    const agents = programLinks.filter((l) => l.path === '/admin/agent-dashboard');
    expect(agents).toHaveLength(1);
    expect(agents[0].label).toBe('Agents');
    // The section is the whole reason a builder can reach it at all: 'dashboard' is the one
    // section every mgmt role carries, and inheriting the group's 'program' would 403 all seven.
    expect(agents[0].section).toBe('dashboard');
  });

  it('no longer carries All Domains or Builder Path as rows', () => {
    expect(paths).not.toContain('/admin/all-domains');
    expect(paths).not.toContain('/admin/builder-path');
  });
});

describe('the restatement, which is the load-bearing half', () => {
  it.each([
    ['/admin/all-domains'],
    ['/admin/builder-path'],
  ])('%s still resolves to program, so ProtectedRoute still gates it', (path) => {
    expect(sectionForPath(path)).toBe('program');
  });

  it('THE MUTATION CONTROL: an unclassified path really does return null', () => {
    // Proves the two assertions above are not passing because sectionForPath returns 'program'
    // for everything. If this ever returns a section, those assertions mean nothing.
    expect(sectionForPath('/admin/not-a-real-page-at-all')).toBeNull();
  });

  it('the hub itself is unmoved, so every bookmark and deep link still works', () => {
    expect(sectionForPath('/admin/agent-dashboard')).toBe('dashboard');
  });
});

// ───────────────────────────── 2. the groups ─────────────────────────────

describe('buildGroups', () => {
  const groups = buildGroups(DOMAIN, []);
  const across = groups.find((g) => g.key === 'across');
  const keysIn = (k: string) => groups.find((g) => g.key === k)?.cards.map((c) => c.key) ?? [];

  it('THE CONTROL: the three agent groups are still there and still not owner-only', () => {
    for (const k of ['capability', 'task', 'tool']) {
      const g = groups.find((x) => x.key === k);
      expect(g).toBeTruthy();
      expect(g?.ownerOnly).toBeFalsy();
    }
  });

  it('adds one owner-only group holding the two rows that left the sidebar', () => {
    expect(across?.ownerOnly).toBe(true);
    expect(across?.cards.map((c) => c.key)).toEqual(['all-domains', 'builder-path']);
    expect(across?.cards.map((c) => c.to)).toEqual(['/admin/all-domains', '/admin/builder-path']);
  });

  it('every card in it declares the section it needs', () => {
    // Belt and braces with the group gate: if the group is ever rendered by mistake, each card
    // still carries enough for HubCardView to refuse it rather than offer a live link.
    expect(across?.cards.every((c) => c.section === 'program')).toBe(true);
  });

  it('leaves the capability board in Capability, where the builder tour points at it', () => {
    // See the file header, item 3. This one is not a style preference.
    expect(keysIn('capability')).toContain('capability-board');
    expect(across?.cards.map((c) => c.key)).not.toContain('capability-board');
  });

  it('stops the Tasks card promising a view that does not exist', () => {
    const tasks = groups.flatMap((g) => g.cards).find((c) => c.key === 'tasks');
    expect(tasks?.notBuilt).toBe(true);
    // The duplicate is the reason: it pointed at the same place as Change requests.
    const changeReq = groups.flatMap((g) => g.cards).find((c) => c.key === 'change-requests');
    expect(tasks?.to).toBe(changeReq?.to);
  });
});

// ───────────────────────────── 3. rendered ─────────────────────────────

describe('what a builder sees', () => {
  it('does not render the owner group at all', async () => {
    await mountAs('builder');
    expect(ownerGroup()).toBeNull();
    expect(card('all-domains')).toBeNull();
    expect(card('builder-path')).toBeNull();
  });

  it('THE CONTROL: still gets the three groups, so the page is shorter and not empty', async () => {
    await mountAs('builder');
    expect(container.querySelector('[data-testid="agent-dashboard-groups"]')).toBeTruthy();
    expect(card('my-domain')).toBeTruthy();
    expect(card('change-requests')).toBeTruthy();
  });
});

describe('what the owner sees', () => {
  it('renders the owner group with both rows that left the sidebar', async () => {
    await mountAs('owner');
    expect(ownerGroup()).toBeTruthy();
    expect(card('all-domains')).toBeTruthy();
    expect(card('builder-path')).toBeTruthy();
  });

  it('reaches them as real links, not as refused cards', async () => {
    await mountAs('owner');
    expect(card('all-domains')?.tagName).toBe('A');
    expect(card('builder-path')?.getAttribute('href')).toBe('/admin/builder-path');
  });

  it('the page and the sidebar row agree on their own name', async () => {
    await mountAs('owner');
    expect(container.querySelector('h1')?.textContent).toBe('Agents');
  });
});

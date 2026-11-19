/**
 * The builder path board — the owner's view of where all seven builders are.
 *
 * ## What is worth testing here
 *
 * Not that it renders. That **loading, failed and nothing-on-any-list are three different
 * things**, because collapsing them is how "it is broken" and "nobody has proposed anything yet"
 * become indistinguishable — the failure the My Domain page records in its own header.
 *
 * And that **no figure is baked into the page**. The counts in this programme have moved
 * repeatedly (1,477 to 553 to 598 stories; 40 to 70 path stories) and every time the stale number
 * was in prose nobody re-derived. One test reads this page's source and fails on any hardcoded
 * domain name or count.
 *
 * NOTE ON STYLE: this repo has no `@testing-library/react`; its frontend suites drive React
 * through `createRoot` and `act` directly. This matches that idiom rather than adding a dependency
 * in passing.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../../services/builderPathApi', () => ({
  fetchBuilderPathBoard: jest.fn(),
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('../../../components/admin/shell', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionCard: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <section><h2>{title}</h2>{children}</section>
  ),
}));

import AdminBuilderPathPage from '../AdminBuilderPathPage';
import * as api from '../../../services/builderPathApi';

const fetchBoard = api.fetchBuilderPathBoard as jest.Mock;
const PAGE_SRC = path.join(__dirname, '..', 'AdminBuilderPathPage.tsx');

let container: HTMLDivElement;
let root: Root;

function candidate(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    domain_key: 'alpha_area',
    title: 'Draft the weekly intake summary',
    source: 'manager',
    product_state: 'api_only',
    stage: 'platform_owed',
    turn: 'owner',
    action: 'Ali owes you the screen.',
    blocked_reason: 'Ali owes you the screen.',
    ...over,
  };
}

function builder(over: Record<string, unknown> = {}) {
  const candidates = (over.candidates as unknown[]) ?? [candidate()];
  return {
    domain_key: 'alpha_area',
    candidates,
    waiting_on_you: 1,
    theirs_to_move: 0,
    cleared_the_gate: 0,
    gate_size: 1,
    note: 'one candidate, one waiting on you.',
    ...over,
  };
}

function payload(over: Record<string, unknown> = {}) {
  const builders = (over.builders as unknown[]) ?? [builder()];
  return {
    builders,
    gap_board: [{
      product_area: 'alpha_area',
      screens_owed: [{
        domain_key: 'alpha_area',
        feature_key: 'knowledge.edit',
        label: 'edit the knowledge base',
        state: 'api_only',
        product_route_note: 'the endpoints exist and no page calls them',
      }],
      scope_sheets_owed: [],
      total: 1,
    }],
    summary: {
      domains: builders.length,
      candidates: 1,
      waiting_on_you: 1,
      screens_owed: 1,
      scope_sheets_owed: 0,
    },
    reason: '1 candidates across 1 domains. 1 are waiting on you.',
    ...over,
  };
}

async function render() {
  await act(async () => { root.render(<AdminBuilderPathPage />); });
}
const text = () => container.textContent ?? '';

beforeEach(() => {
  fetchBoard.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('loading, failed and empty are three different things', () => {
  it('LOADING says it is loading, and shows no counts', async () => {
    fetchBoard.mockReturnValue(new Promise(() => {}));
    await render();
    expect(text()).toContain('Loading the board');
    expect(text()).not.toContain('Waiting on you');
    expect(text()).not.toContain('Could not load');
  });

  it('FAILED says it failed, and is not an empty board', async () => {
    fetchBoard.mockRejectedValue(new Error('boom'));
    await render();
    expect(text()).toContain('Could not load the builder path board');
    expect(text()).not.toContain('Nothing is on any list yet');
    expect(text()).not.toContain('Loading the board');
  });

  it('NOTHING ON ANY LIST says so, and explains that silence is not a stall', async () => {
    fetchBoard.mockResolvedValue(payload({
      builders: [builder({ candidates: [], waiting_on_you: 0, note: 'No candidates yet.' })],
      gap_board: [],
      summary: {
        domains: 1, candidates: 0, waiting_on_you: 0, screens_owed: 0, scope_sheets_owed: 0,
      },
      reason: 'No candidate has been put on any list yet.',
    }));
    await render();
    expect(text()).toContain('Nothing is on any list yet');
    expect(text()).toContain('not the same as a builder who is stuck');
    expect(text()).not.toContain('Could not load');
    expect(text()).not.toContain('Loading the board');
  });

  it('a failure never renders the empty-list card, which is the whole point', async () => {
    fetchBoard.mockRejectedValue(new Error('boom'));
    await render();
    expect(text()).not.toMatch(/Nothing is on any list/);
  });
});

describe('every figure comes from the API', () => {
  it('renders the summary the API returned, not numbers of its own', async () => {
    fetchBoard.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('1 candidates across 1 domains');
    expect(text()).toContain('alpha_area');
  });

  it('renders each candidate\'s action sentence verbatim', async () => {
    fetchBoard.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('Ali owes you the screen.');
    expect(text()).toContain('platform_owed');
  });

  it('renders the API\'s own note when a builder has no candidates', async () => {
    fetchBoard.mockResolvedValue(payload({
      builders: [builder({ candidates: [], note: 'A very specific explanation from the API.' })],
    }));
    await render();
    expect(text()).toContain('A very specific explanation from the API.');
  });

  /**
   * The source sweep. It is what caught the stale figures twice on the sibling page.
   */
  it('contains no hardcoded domain name, candidate count or gap count', () => {
    const src = fs.readFileSync(PAGE_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const domain of [
      'marketing', 'admissions', 'curriculum', 'internship', 'platform', 'sales',
      'website', 'executive', 'learner_success', 'product_experience',
    ]) {
      expect({ domain, found: src.includes(domain) }).toEqual({ domain, found: false });
    }
    // No bare multi-digit figure anywhere in the code: every number on this page is a field.
    expect(src).not.toMatch(/\b\d{2,}\b/);
  });
});

describe('the gap board', () => {
  it('groups by product area with a count per group', async () => {
    fetchBoard.mockResolvedValue(payload({
      gap_board: [
        {
          product_area: 'alpha_area',
          screens_owed: [
            { domain_key: 'alpha_area', feature_key: 'f1', label: 'first feature', state: 'api_only', product_route_note: null },
            { domain_key: 'alpha_area', feature_key: 'f2', label: 'second feature', state: 'api_only', product_route_note: null },
          ],
          scope_sheets_owed: [candidate({ id: 'c9', title: 'a thing the product cannot do', product_state: 'not_built' })],
          total: 3,
        },
        {
          product_area: 'beta_area',
          screens_owed: [],
          scope_sheets_owed: [candidate({ id: 'c8', domain_key: 'beta_area', title: 'another unbuilt thing', product_state: 'not_built' })],
          total: 1,
        },
      ],
    }));
    await render();
    expect(text()).toContain('alpha_area');
    expect(text()).toContain('beta_area');
    expect(text()).toContain('first feature');
    expect(text()).toContain('a thing the product cannot do');
    // The per-group total, which is what makes it a board rather than a list.
    expect(text()).toMatch(/3/);
  });

  it('says in words that the two halves are owed by different people', async () => {
    fetchBoard.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('Screens owed');
    expect(text()).toContain('Scope sheets owed');
    expect(text()).toMatch(/are yours/);
  });

  it('an EMPTY gap board says so in words rather than rendering an empty grid', async () => {
    fetchBoard.mockResolvedValue(payload({
      gap_board: [],
      summary: {
        domains: 1, candidates: 1, waiting_on_you: 0, screens_owed: 0, scope_sheets_owed: 0,
      },
    }));
    await render();
    expect(text()).toContain('Nothing is owed by the product right now');
    expect(text()).not.toContain('Product area');
  });

  it('renders the route note when the catalog supplies one', async () => {
    fetchBoard.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('the endpoints exist and no page calls them');
  });
});

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import GrowthJourneyPage from '../GrowthJourneyPage';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type { StatusRegistry } from '../../../services/growthJourneyApi';

/**
 * The three states this workspace must tell apart (Phase 6, T613).
 *
 * A dark system, an unseeded one and a working one render the same rows. All
 * three are reachable today and the first two are the LIKELY ones, so each is
 * asserted to NAME the thing to change — the flag, or the seed script — rather
 * than merely to render without crashing.
 *
 * ── WHY THE REGISTRY IS MOCKED AND THE READS ARE NOT ────────────────────────
 *
 * The page reads only `status/registry`; Overview reads readiness and health on
 * its own. Mocking all three here would test the Overview tab by accident and
 * make a failure ambiguous about which surface broke. The Overview reads are
 * stubbed to pending so the tab renders its loading state and contributes
 * nothing to these assertions.
 */

/*
 * 30s, not jest's 5000ms default - the third of this task's three rendering suites
 * to carry it, and the reason is worth keeping. Two sibling suites got this line
 * after the full 290-suite run starved them; this one was left on the default and
 * failed in the very next full run while the two fixed ones passed. The machine was
 * at 1.18GB free of 39.73GB and 100% CPU, and 13 other suites this branch has never
 * touched failed in the same run - two of which pass 92 tests when run scoped.
 * NOTHING BELOW ASSERTS LESS BECAUSE OF THIS LINE. It buys time, not leniency.
 */
jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyApi', () => ({
  getStatusRegistry: jest.fn(),
  getReadiness: jest.fn(),
  getHealth: jest.fn(),
}));

/*
 * The inspect reads are mocked too, because this suite now MOUNTS the real tabs
 * from the page. Their own suites cover what each tab renders; these cells only
 * ask whether the page reaches them at all, so every read here resolves to an
 * empty page - the cheapest payload that still lets a tab render its heading.
 */
jest.mock('../../../services/growthJourneyInspectApi', () => ({
  listClassifications: jest.fn(),
  listDecisions: jest.fn(),
  listTransitions: jest.fn(),
  listShadowRuns: jest.fn(),
  listOfferPolicies: jest.fn(),
  listContentRules: jest.fn(),
  getClassificationWhy: jest.fn(),
  getDecisionWhy: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyApi') as {
  getStatusRegistry: jest.Mock;
  getReadiness: jest.Mock;
  getHealth: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const inspect = require('../../../services/growthJourneyInspectApi') as Record<string, jest.Mock>;

/**
 * EVERY IMPLEMENTATION IS SET PER TEST, NEVER IN THE FACTORY.
 *
 * `react-scripts` hardcodes `resetMocks: true` (createJestConfig.js:68), which
 * strips the implementation off every mock before each test - including the ones
 * a `jest.mock` factory supplied. The first draft of this file put
 * `jest.fn(() => new Promise(() => {}))` in the factory and twelve of thirteen
 * cells failed with `Cannot read properties of undefined (reading 'then')`,
 * because by the time the component called the fetcher it returned undefined.
 * The factory may declare the SHAPE; only a beforeEach can give it behaviour.
 */

const registry = (over: Partial<StatusRegistry> = {}): StatusRegistry => ({
  brands: [{ id: 'b-cpn', tenant_id: 't-cola', slug: 'cpn', name: 'CPN', status: 'active', default_journey_program_id: 'p-1' }],
  programs: [{
    id: 'p-1', brand_id: 'b-cpn', slug: 'cpn-learner', name: 'CPN Learner', kind: 'learner', status: 'active',
    terminology: { subject: 'learner', relationship: 'enrolment', pipeline: 'path' },
  }],
  paths: [{ program_id: 'p-1', offer_family: 'learner_paid_training', name: 'Paid training', status: 'active' }],
  flags: { master: true, signal_ingest: true, classification: true, decisions: true, handoffs: true, execution: false },
  memberships_populated: true,
  agents: [{ agent_name: 'journey_nightly', enabled: true, last_run_at: '2026-09-30T04:00:00.000Z' }],
  ...over,
});

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/admin/growth-journey']}>
        <GrowthJourneyPage />
      </MemoryRouter>,
    );
  });
}

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // Pending for ever: the Overview tab holds its loading state and contributes
  // nothing to what these cells assert.
  api.getReadiness.mockImplementation(() => new Promise(() => {}));
  api.getHealth.mockImplementation(() => new Promise(() => {}));

  // Empty pages, shaped per endpoint family: the inspect reads echo a `scope`,
  // `/classifications` echoes `status`, `/decisions` echoes `mode`, and
  // `/shadow/runs` echoes a window plus its agent list. Implementations HERE and
  // never in the factory - react-scripts sets resetMocks: true, and the symptom of
  // forgetting is exactly the `undefined.then` these four cells first hit.
  const scope = { tenant_id: 't-1', brand_id: null, program_id: null };
  const emptyPage = { rows: [], total: 0, limit: 25, offset: 0 };
  inspect.listClassifications.mockResolvedValue({ ...emptyPage, status: 'needs_review' });
  inspect.listDecisions.mockResolvedValue({ ...emptyPage, mode: 'shadow' });
  inspect.listTransitions.mockResolvedValue({ ...emptyPage, scope });
  inspect.listShadowRuns.mockResolvedValue({
    ...emptyPage, window_days: 7, agents: [], counts_available: false, scope,
  });
  inspect.listOfferPolicies.mockResolvedValue({ ...emptyPage, scope });
  inspect.listContentRules.mockResolvedValue({ ...emptyPage, scope });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('switched off', () => {
  beforeEach(() => {
    api.getStatusRegistry.mockResolvedValue(registry({
      flags: { master: false, signal_ingest: false, classification: false, decisions: false, handoffs: false, execution: false },
    }));
  });

  it('names the flag, so nobody debugs a system that is merely off', async () => {
    await render();
    expect(text()).toContain('GROWTH_JOURNEY_ENABLED');
    expect(text()).toContain('switched off');
  });

  it('says the page is showing configuration rather than activity', async () => {
    await render();
    // The distinction that stops a dark system reading as a broken one.
    expect(text()).toContain('configuration');
  });

  it('does not also claim there are no memberships', async () => {
    // Two different problems. Showing both when only one is true would send
    // someone to run a seed script that is not the issue.
    await render();
    expect(text()).not.toContain('seedTenantMemberships');
  });
});

describe('no memberships seeded', () => {
  beforeEach(() => {
    api.getStatusRegistry.mockResolvedValue(registry({ memberships_populated: false }));
  });

  it('names the seed script', async () => {
    await render();
    expect(text()).toContain('seedTenantMemberships');
  });

  it('says why an empty system here is indistinguishable from a working one', async () => {
    await render();
    expect(text()).toContain('looks exactly like a working one');
  });

  it('does not also claim the system is switched off', async () => {
    await render();
    expect(text()).not.toContain('switched off');
  });
});

describe('loaded', () => {
  beforeEach(() => {
    api.getStatusRegistry.mockResolvedValue(registry());
  });

  it('shows neither state, and renders the registry counts', async () => {
    await render();
    expect(text()).not.toContain('GROWTH_JOURNEY_ENABLED');
    expect(text()).not.toContain('seedTenantMemberships');
    expect(text()).toContain('Brands');
    expect(text()).toContain('Programmes');
  });

  it("uses the PROGRAMME's own terminology, not a hardcoded word", async () => {
    // A CPN learner and a Colaberry Business buyer are not both "leads". With no
    // programme selected the fallback is deliberately generic; selecting one must
    // use that row's words. This asserts the neutral fallback is in use and the
    // word "lead" was not baked in.
    await render();
    expect(text()).not.toContain("One lead's");
  });

  it('offers a brand and a programme select, both labelled', async () => {
    await render();
    const selects = Array.from(container.querySelectorAll('select'));
    expect(selects).toHaveLength(2);
    for (const s of selects) {
      const label = container.querySelector(`label[for="${s.id}"]`);
      expect(label?.textContent).toBeTruthy();
    }
  });

  it('names an unbuilt tab as unbuilt rather than rendering an empty panel', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/growth-journey?tab=experiments']}>
          <GrowthJourneyPage />
        </MemoryRouter>,
      );
    });
    expect(text()).toContain('not built yet');
  });

  /*
   * EVERY BUILT TAB IS MOUNTED FROM THE PAGE HERE, and the reason is this phase's
   * central lesson. T613's `/api` defect survived four attempts and a PASS because
   * every suite mocked the API module and nothing exercised the real wiring. T614's
   * five tabs then shipped with suites that mounted each component DIRECTLY and
   * nothing that mounted the page at `?tab=…` - so the verifier could drop
   * 'content' from the page's built list and keep all 194 cells green while the
   * page rendered the tab AND "not built yet" at the same time.
   *
   * A component that works in isolation and is unreachable from its page is not
   * shipped. These cells are the only thing standing between that and a repeat.
   */
  it.each([
    ['classification', 'was classified'],
    ['decisions', 'What was decided'],
    ['shadow', 'Did the shadow runs happen?'],
    ['content', 'What may be said'],
  ])('mounts the %s tab from the page itself', async (tabKey, heading) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/admin/growth-journey?tab=${tabKey}`]}>
          <GrowthJourneyPage />
        </MemoryRouter>,
      );
    });
    expect(text()).toContain(heading);
    // And the unbuilt panel must NOT also be on screen: the page's first lookup was
    // two parallel lists and could render both together.
    expect(text()).not.toContain('not built yet');
  });
});

describe('the mechanical accessibility rules', () => {
  it.each([
    ['loaded', registry()],
    ['switched off', registry({ flags: { master: false, signal_ingest: false, classification: false, decisions: false, handoffs: false, execution: false } })],
    ['no memberships', registry({ memberships_populated: false })],
  ])('pass in the %s state', async (_name, reg) => {
    api.getStatusRegistry.mockResolvedValue(reg);
    await render();
    // Applied to all three states, not just the happy one: a banner or an empty
    // state is exactly where an unlabelled control or a stray heading level gets
    // added without anyone looking.
    expectNoA11yViolations(container, { expectH1: true });
  });
});

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
jest.mock('../../../services/growthJourneyQueueApi', () => ({
  listHandoffQueue: jest.fn(),
  listExperiments: jest.fn(),
}));

/*
 * ALL FIVE performance reads are stubbed, not just the two the tab calls directly.
 * Attempt 2 stubbed `getRates` and `getMetrics` and spread the rest from `actual`,
 * so mounting `?tab=performance` ran the REAL `getReceipts`/`getOutcomes`/
 * `getByJourney` from the three new child panels - an unmocked request out of a
 * test, which this project forbids outright. The cells still passed, because they
 * only assert the tab's heading and the rejected read renders as an error panel.
 * Nothing in this universe may reach the network.
 */
jest.mock('../../../services/growthJourneyPerformanceApi', () => {
  const actual = jest.requireActual('../../../services/growthJourneyPerformanceApi');
  return {
    ...actual,
    getRates: jest.fn(),
    getMetrics: jest.fn(),
    getReceipts: jest.fn(),
    getOutcomes: jest.fn(),
    getByJourney: jest.fn(),
  };
});

jest.mock('../../../services/growthJourneyControlsApi', () => {
  const actual = jest.requireActual('../../../services/growthJourneyControlsApi');
  return { ...actual, listControls: jest.fn(), createPause: jest.fn(), createRollout: jest.fn(), clearPause: jest.fn(), clearRollout: jest.fn() };
});

/*
 * THE SIXTH AND SEVENTH MOCKS, added 2026-11-22 with the Explorer Growth merge.
 *
 * Six of the twelve tabs now render brand-scoped Explorer panels, and those
 * panels fetch through two NEW clients. Without these mocks this suite issues
 * real requests out of a test - which this file forbids outright - and the cells
 * still pass, because a rejected read renders as a scope or error panel and the
 * headings asserted below are above it.
 *
 * Every read resolves the SCOPED ENVELOPE rather than a bare payload: `data`
 * plus `scope`. That is the contract `ScopeState` branches on, so a stub that
 * answered a bare payload would exercise a shape the server never sends.
 */
jest.mock('../../../services/growthJourneyExplorerApi', () => {
  const actual = jest.requireActual('../../../services/growthJourneyExplorerApi');
  return {
    ...actual,
    getExplorerSummary: jest.fn(),
    getExplorerDistribution: jest.fn(),
    getExplorerCampus: jest.fn(),
    getExplorerOutreach: jest.fn(),
    getExplorerLearners: jest.fn(),
    getExplorerLearner: jest.fn(),
    getExplorerLearnerSignals: jest.fn(),
    getExplorerLearnerDecisions: jest.fn(),
    getExplorerEligibility: jest.fn(),
    getExplorerDecisions: jest.fn(),
    getExplorerWhy: jest.fn(),
    getExplorerShadow: jest.fn(),
    getExplorerContent: jest.fn(),
  };
});
jest.mock('../../../services/growthJourneyBrandRoleApi', () => {
  const actual = jest.requireActual('../../../services/growthJourneyBrandRoleApi');
  return { ...actual, getBrandRole: jest.fn(), putBrandRole: jest.fn() };
});

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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const queue = require('../../../services/growthJourneyQueueApi') as Record<string, jest.Mock>;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const perf = require('../../../services/growthJourneyPerformanceApi') as Record<string, jest.Mock>;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ctrl = require('../../../services/growthJourneyControlsApi') as Record<string, jest.Mock>;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const explorers = require('../../../services/growthJourneyExplorerApi') as Record<string, jest.Mock>;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const brandRole = require('../../../services/growthJourneyBrandRoleApi') as Record<string, jest.Mock>;

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

  // T615's four tabs, each with ITS OWN envelope. An "empty payload" here is four
  // different shapes, which is the clearest evidence that no generic table could
  // have served this surface.
  queue.listHandoffQueue.mockResolvedValue({ ...emptyPage, status: 'open', owner_queue: null });
  queue.listExperiments.mockResolvedValue({
    brands: [], window_days: 30, policy_type: 'holdout', conversion_outcomes: [], scope,
  });
  perf.getRates.mockResolvedValue({
    brands: [], window_days: 30, max_handoffs_per_brand: 5000, max_outcomes_per_brand: 10000, scope,
  });
  perf.getMetrics.mockResolvedValue({ metrics: [], computed_at: '2026-10-01T08:00:00.000Z', scope });
  perf.getReceipts.mockResolvedValue({ ...emptyPage, scope });
  perf.getOutcomes.mockResolvedValue({ ...emptyPage, scope });
  perf.getByJourney.mockResolvedValue({ journeys: [], scope: { ...scope, start: null, end: null } });
  ctrl.listControls.mockResolvedValue({ controls: [], count: 0 });

  /*
   * The six Explorer tabs. Every read answers the SCOPED ENVELOPE - `data` plus
   * `scope` - because that is what `ScopeState` branches on, and a stub that
   * answered a bare payload would exercise a shape the server never sends.
   *
   * `reason: 'all_brands'` with `in_scope: true` is the state these cells run
   * in: the suite's URLs carry no `?brand=`, so nothing is narrowed, which is
   * also the state production is in before the membership seed.
   */
  const inScope = {
    tenant_id: 't-1', brand_id: null, program_id: null,
    in_scope: true, reason: 'all_brands' as const,
  };
  const scoped = <T,>(data: T) => ({ data, scope: inScope });

  explorers.getExplorerSummary.mockResolvedValue(
    scoped({
      decision_date: null, modes: [], total: 0, waited: 0, actionable: 0,
      with_content: 0, executed: 0, gaps: 0, learners_with_profile: 0,
    }),
  );
  explorers.getExplorerDistribution.mockResolvedValue(
    scoped({ today: [], overlays: [], trend: [] }),
  );
  // The REAL `CampusActivity` shape. My first stub invented one, and the campus
  // cell failed on `a.assignments.people.toLocaleString()` - a stub that is the
  // wrong shape fails for the wrong reason and teaches nothing.
  explorers.getExplorerCampus.mockResolvedValue(
    scoped({
      explorers: 0,
      open_house: { people: 0, rsvps: 0, last_7_days: 0 },
      assignments: { completed: 0, people: 0, last_7_days: 0 },
      admissions_calls: { booked: 0, upcoming: 0, cancelled: 0, people: 0 },
      tours: { started: 0, finished: 0, by_stop: [] },
      on_campus: { last_24h: 0, last_7_days: 0 },
      tracked_since: '2026-10-26',
    }),
  );
  explorers.getExplorerOutreach.mockResolvedValue(
    scoped({ view: 'reach_out', rows: [], tracked_since: '2026-10-26', total: 0, offset: 0 }),
  );
  explorers.getExplorerLearners.mockResolvedValue(scoped(emptyPage));
  explorers.getExplorerDecisions.mockResolvedValue(
    scoped({ ...emptyPage, decision_date: null }),
  );
  explorers.getExplorerShadow.mockResolvedValue(
    scoped({ ...emptyPage, decision_date: null }),
  );
  explorers.getExplorerContent.mockResolvedValue(
    scoped({
      total: 0, active: 0, emailable: 0, matrix: [], purposes: [],
      decision_gaps: { gap_count: 0, decision_date: null, named: [] },
    }),
  );
  // The drawer's four reads and the Why modal: unreachable without a row to
  // click, stubbed so a stray render cannot reach the network.
  for (const fn of ['getExplorerLearner', 'getExplorerLearnerSignals',
    'getExplorerLearnerDecisions', 'getExplorerEligibility', 'getExplorerWhy']) {
    explorers[fn].mockResolvedValue(scoped(null));
  }

  brandRole.getBrandRole.mockResolvedValue({
    brand_id: 'b-cpn', status: 'default', source: 'kind_default',
    role: { title: 'Enrollment Specialist', description: 'Reaches out.', updated_at: null },
  });
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

  /*
   * This cell USED to assert that `?tab=experiments` rendered "not built yet".
   * T615 built the last four, so that assertion is now false and keeping it would
   * have been a test asserting the absence of work that exists. What replaces it is
   * the invariant that actually matters: every key the tab strip offers has a view
   * behind it. The fallback panel stays in the page as defence, but nothing should
   * reach it - and if someone adds a tenth tab to TABS without a view, this fails
   * rather than the operator finding out.
   *
   * ── WHY IT IS `it.each` AND NOT A LOOP, WHICH IS HOW IT WAS SHIPPED ─────────
   *
   * Attempt 2 wrote this as a `for` loop re-rendering the same `<MemoryRouter
   * initialEntries={[…]}>` into the same root. `MemoryRouter` builds its history
   * ONCE, in a ref - react-router/dist/react-router.development.js:993,
   * `if (historyRef.current == null) { historyRef.current = createMemoryHistory(…) }`
   * - so a changed `initialEntries` on a re-render is ignored and all nine
   * iterations rendered `?tab=overview`. The cell PASSED with `performance` removed
   * from TAB_VIEWS and the page rendering "Performance is not built yet", and the
   * session log claimed it as the replacement invariant. It could not fail.
   *
   * One cell per key gets a fresh root from the outer `beforeEach`, hence a fresh
   * MemoryRouter, hence the URL the cell is named for.
   */
  /*
   * THE ALL-BRANDS NOTICE, AND WHY IT IS ASSERTED HERE.
   *
   * It used to render inside `ScopeState`, so a tab with two panels printed the
   * same sentence twice. Moving it to the page fixed that and would have left it
   * with no test at all - behaviour moved out of a covered component into an
   * uncovered one. These two cells are the replacement.
   */
  it('says once that nothing is narrowed, when no brand is selected', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/growth-journey?tab=overview']}>
          <GrowthJourneyPage />
        </MemoryRouter>,
      );
    });

    const hits = (text().match(/All brands\./g) ?? []).length;
    // ONCE. Two panels on this tab, one notice.
    expect(hits).toBe(1);
  });

  it('does not say it when a brand IS selected', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/growth-journey?tab=overview&brand=b-cpn']}>
          <GrowthJourneyPage />
        </MemoryRouter>,
      );
    });

    expect(text()).not.toContain('All brands.');
  });

  it.each(['overview', 'campus', 'learners', 'decisions', 'content', 'shadow',
    'classification', 'handoffs', 'experiments', 'performance', 'controls', 'brand-setup'])(
    '?tab=%s has a view behind it, so the fallback panel is unreachable',
    async (key) => {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={[`/admin/growth-journey?tab=${key}`]}>
            <GrowthJourneyPage />
          </MemoryRouter>,
        );
      });
      expect(text()).not.toContain('not built yet');
    },
  );

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
  /*
   * THREE STRINGS CHANGED HERE ON 2026-11-22, AND NOTHING ELSE DID.
   *
   * `decisions`, `shadow` and `content` now render EXPLORER'S panels rather than
   * the journey's, per the execution contract's assumption 1, so they genuinely
   * answer different questions and carry different headings. `shadow` is the one
   * whose words really moved: "Did the shadow runs happen?" asked whether the
   * cron ran; the panel now shows what would have gone out.
   *
   * `campus`, `learners` and `brand-setup` are new rows for new tabs.
   *
   * Every other assertion in this file is unchanged. The fallback-panel loop
   * above still covers all twelve keys, the switched-off and unseeded states are
   * untouched, and the no-unmocked-request guarantee is STRENGTHENED by the two
   * client mocks at the top rather than relaxed.
   */
  it.each([
    ['overview', 'How the population looks now'],
    ['campus', 'What explorers are doing'],
    ['learners', 'Learners'],
    ['decisions', 'What was decided'],
    ['content', 'What may be said'],
    ['shadow', 'What would have gone out'],
    ['brand-setup', 'Brand setup'],
    ['classification', 'was classified'],
    ['handoffs', 'Who is waiting for a human'],
    ['experiments', 'Did withholding content change anything?'],
    ['performance', 'How the handoff pipeline is performing'],
    ['controls', 'Pauses and rollouts'],
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

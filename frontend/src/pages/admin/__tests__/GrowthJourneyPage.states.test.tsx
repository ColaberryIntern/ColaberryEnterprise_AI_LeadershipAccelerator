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

jest.mock('../../../services/growthJourneyApi', () => ({
  getStatusRegistry: jest.fn(),
  getReadiness: jest.fn(),
  getHealth: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyApi') as {
  getStatusRegistry: jest.Mock;
  getReadiness: jest.Mock;
  getHealth: jest.Mock;
};

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

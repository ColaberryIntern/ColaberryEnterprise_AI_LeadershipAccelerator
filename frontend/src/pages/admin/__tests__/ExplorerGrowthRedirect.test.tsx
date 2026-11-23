import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ExplorerGrowthRedirect, { mapTab } from '../ExplorerGrowthRedirect';
import type { StatusRegistry } from '../../../services/growthJourneyApi';

/**
 * Where an Explorer Growth bookmark lands, in all five states.
 *
 * THE CELL THIS FILE EXISTS FOR is "master ON, memberships NOT populated ->
 * redirect WITHOUT a brand". The first draft always appended Colaberry
 * Training's uuid, and in production - where `tenant_memberships` is empty -
 * selecting a brand is exactly what makes the read 403, which renders zero rows.
 * Every bookmarked visit would have landed on a blank page on day one, with the
 * old page no longer reachable.
 */

jest.mock('../../../services/growthJourneyApi', () => ({ getStatusRegistry: jest.fn() }));
// Explorer's page is the fallback in two of the five rows. Mocked to a marker so
// those cells assert WHICH page rendered without mounting its whole read surface
// (and without it issuing requests from a test).
jest.mock('../ExplorerGrowthPage', () => ({
  __esModule: true,
  default: () => <div data-testid="explorer-page">Explorer Growth OS</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyApi') as { getStatusRegistry: jest.Mock };

const CT_BRAND = '10ebfb01-dc51-450d-bbef-a2c10e42efa8';

const registry = (over: Partial<StatusRegistry> = {}): StatusRegistry =>
  ({
    brands: [
      {
        id: CT_BRAND,
        tenant_id: 't-cola',
        slug: 'colaberry-training',
        name: 'Colaberry Training',
        status: 'active',
        default_journey_program_id: 'p-1',
      },
    ],
    programs: [],
    paths: [],
    flags: {
      master: true,
      signal_ingest: false,
      classification: false,
      decisions: false,
      handoffs: false,
      execution: false,
    },
    memberships_populated: false,
    agents: [],
    ...over,
  }) as StatusRegistry;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** Reports where the router ended up, so a redirect is asserted by its URL. */
function Landed() {
  const loc = useLocation();
  return <div data-testid="landed">{`${loc.pathname}${loc.search}`}</div>;
}

async function visit(url = '/admin/explorer-growth'): Promise<void> {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/admin/explorer-growth" element={<ExplorerGrowthRedirect />} />
          <Route path="/admin/growth-journey" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    );
  });
}

const at = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');

describe('the five states, one cell each', () => {
  it('master OFF renders Explorer\'s page, untouched', async () => {
    api.getStatusRegistry.mockResolvedValue(
      registry({
        flags: {
          master: false,
          signal_ingest: false,
          classification: false,
          decisions: false,
          handoffs: false,
          execution: false,
        },
      })
    );

    await visit();

    // The merged page does not exist while the journey is dark, so the old page
    // is still the right answer.
    expect(at('explorer-page')).toBe('Explorer Growth OS');
    expect(at('landed')).toBeNull();
  });

  it('master ON with NO memberships redirects WITHOUT a brand', async () => {
    api.getStatusRegistry.mockResolvedValue(registry({ memberships_populated: false }));

    await visit();

    // The cell this file exists for. A brand in the URL is what makes the read
    // 403 before the seed runs, and a 403 renders zero rows.
    expect(at('landed')).toBe('/admin/growth-journey?tab=shadow');
    expect(at('landed')).not.toContain('brand');
    expect(at('landed')).not.toContain(CT_BRAND);
  });

  it('master ON WITH memberships redirects with Colaberry Training selected', async () => {
    api.getStatusRegistry.mockResolvedValue(registry({ memberships_populated: true }));

    await visit();

    expect(at('landed')).toBe(`/admin/growth-journey?tab=shadow&brand=${CT_BRAND}`);
  });

  it('a failed registry read renders Explorer\'s page, failing toward what works', async () => {
    api.getStatusRegistry.mockRejectedValue(new Error('registry unavailable'));

    await visit();

    // An outage is not a reason to send somebody to a surface whose own guards
    // we could not read.
    expect(at('explorer-page')).toBe('Explorer Growth OS');
    expect(at('landed')).toBeNull();
  });

  it('while loading it redirects nowhere and says it is loading', async () => {
    api.getStatusRegistry.mockImplementation(() => new Promise(() => {}));

    await visit();

    expect(text()).toContain('Loading');
    expect(at('landed')).toBeNull();
    expect(at('explorer-page')).toBeNull();
  });
});

describe('the brand id is looked up, never written down', () => {
  it('omits the brand when the slug is absent from the registry', async () => {
    api.getStatusRegistry.mockResolvedValue(
      registry({
        memberships_populated: true,
        brands: [
          {
            id: 'b-other',
            tenant_id: 't-cola',
            slug: 'ai-flotation',
            name: 'AI Flotation',
            status: 'active',
            default_journey_program_id: null,
          },
        ],
      })
    );

    await visit();

    // A guessed uuid would select a brand that does not exist and render the
    // out-of-scope state, which looks like a broken page. All-brands is honest.
    expect(at('landed')).toBe('/admin/growth-journey?tab=shadow');
  });

  it('uses the registry\'s id rather than any literal in the source', async () => {
    api.getStatusRegistry.mockResolvedValue(
      registry({
        memberships_populated: true,
        brands: [
          {
            id: 'a-different-uuid',
            tenant_id: 't-cola',
            slug: 'colaberry-training',
            name: 'Colaberry Training',
            status: 'active',
            default_journey_program_id: 'p-1',
          },
        ],
      })
    );

    await visit();

    // If the uuid were hardcoded this would still be the production one, and it
    // would be wrong in every other environment, SILENTLY.
    expect(at('landed')).toContain('brand=a-different-uuid');
  });
});

describe('the tab mapping', () => {
  it.each([
    ['overview', 'overview'],
    ['campus', 'campus'],
    // Explorer called the roster "journey"; the merged page calls it what it is.
    ['journey', 'learners'],
    ['decisions', 'decisions'],
    ['shadow', 'shadow'],
    ['content', 'content'],
    // Added 2026-11-23. These two used to fall back to `shadow`, which is how a
    // bookmark to the Brain quietly landed somewhere else: the tabs were left out
    // of the merge as deferred write surfaces, but this redirect turned that
    // deferral into a removal, because Explorer's own page is no longer where the
    // operator arrives.
    ['brain', 'brain'],
    ['settings', 'settings'],
  ])('%s -> %s', (from, to) => {
    expect(mapTab(from)).toBe(to);
  });

  it('a bare URL lands on `shadow`, which is where Explorer always landed', () => {
    // `ExplorerGrowthPage`'s own DEFAULT_TAB is `shadow`. Sending someone who
    // bookmarked the bare URL to a different tab than they have always landed on
    // is a small, daily, avoidable annoyance.
    expect(mapTab(null)).toBe('shadow');
  });

  it.each(['nonsense', '', 'brain-setup', 'BRAIN'])(
    '%p falls back to `shadow`',
    (raw) => {
      // Only genuinely unknown values fall back now. `brain-setup` and `BRAIN`
      // are here on purpose: they are near-misses of real keys, and a mapping
      // that matched them loosely would send a typo somewhere confident rather
      // than somewhere honest.
      expect(mapTab(raw)).toBe('shadow');
    }
  );

  it('maps every tab Explorer itself offers, so no bookmark falls back silently', () => {
    // The real regression this guards: `brain` and `settings` were absent from
    // TAB_MAP for a day, and nothing failed. A bookmark to them landed on Shadow
    // and looked like a working page, which is the worst shape for a missing
    // surface - it does not announce itself.
    //
    // Explorer's own eight keys, from `ExplorerGrowthPage.tsx`'s TabKey union.
    const EXPLORER_TABS = [
      'overview', 'campus', 'journey', 'decisions', 'shadow', 'content', 'brain', 'settings',
    ];
    const fellBack = EXPLORER_TABS.filter((t) => mapTab(t) === 'shadow' && t !== 'shadow');
    // Named rather than counted, so a failure says which bookmark broke.
    expect(fellBack).toEqual([]);
  });

  it('carries the mapped tab through the real redirect, not just through mapTab', async () => {
    api.getStatusRegistry.mockResolvedValue(registry({ memberships_populated: true }));

    await visit('/admin/explorer-growth?tab=journey');

    expect(at('landed')).toBe(`/admin/growth-journey?tab=learners&brand=${CT_BRAND}`);
  });
});

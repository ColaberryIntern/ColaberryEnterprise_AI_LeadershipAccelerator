/**
 * "SEE WHY" HAS TO DO SOMETHING WHEN THE DOMAIN MAP IS ALREADY SHOWING.
 *
 * The handler used to be `onSeeWhy={() => setTab('domains')}`, and 'domains' is
 * the tab the page opens on. React bails out when a state setter is handed the
 * value the state already holds, so the click re-rendered nothing and the button
 * was dead for every student who clicked it before touching a tab — which is
 * everyone, because it sits in the hero ABOVE the tab strip.
 *
 * The regression guarded here is therefore NOT "the tab changes". It is "the
 * panel is brought into view", which is the part that actually answers the
 * question the button asks, and the only observable part when the tab was
 * already correct. A future refactor that returns to a bare `setTab` fails here.
 *
 * Harness follows ProjectsPage.buildCount.test.tsx (createRoot + act) with the
 * shell and the heavy panels mocked, so what is under test is the page rather
 * than its furniture. CertReadinessHero is deliberately NOT mocked: the button
 * lives inside it, and mocking it would test the mock.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { CertReadiness, CertTrackInfo, CertDomain } from '../../../../services/certPrepApi';

jest.mock('../../today/PortalShell', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode | ((c: boolean) => React.ReactNode) }) => (
    <div>{typeof children === 'function' ? children(false) : children}</div>
  ),
}));
jest.mock('../../today/CondensedHeaderCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../CertProgressRail', () => ({ __esModule: true, default: () => null }));
jest.mock('../CertEvidencePanel', () => ({ __esModule: true, default: () => null }));
jest.mock('../CertSessionRunner', () => ({ __esModule: true, default: () => null }));
jest.mock('../CertDomainMap', () => ({
  __esModule: true,
  default: () => <div data-domain-map="1">domain map</div>,
}));
// Spread the real module: CertReadinessHero (deliberately unmocked) also imports
// `readinessLabel` from here, and a factory that lists only the two network calls
// leaves it undefined — the page then dies on render for a reason that has nothing
// to do with the button under test.
jest.mock('../../../../services/certPrepApi', () => ({
  ...jest.requireActual('../../../../services/certPrepApi'),
  __esModule: true,
  getCertPrepSummary: jest.fn(),
  getCertDomains: jest.fn(),
}));

import { getCertPrepSummary, getCertDomains } from '../../../../services/certPrepApi';
import CertPrepPage from '../CertPrepPage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TRACK: CertTrackInfo = {
  track_id: 'ccar-f',
  display_name: 'Claude Certified Architect - Foundations',
  issuer: 'Anthropic',
  blueprint_version: '1.0-2026-07',
  blueprint_source: 'official',
  exam_item_count: 60,
  exam_duration_minutes: 120,
  passing_scaled_score: 720,
};

const READINESS: CertReadiness = {
  track_id: 'ccar-f',
  blueprint_version: '1.0-2026-07',
  readiness_policy_version: 'v1-knowledge-dominant',
  knowledge_scaled: 800,
  evidence_coverage_pct: 40,
  sample_confidence: 0.9,
  overall_scaled: 740,
  overall_state: 'approaching',
  weights_available: true,
  domain_breakdown: [
    { domain_id: 'd1', knowledge_pct: 62, answered: 12, evidence_verified: 1, objectives_total: 6, objectives_evidenced: 1 },
  ],
  qualifying_sittings: 1,
  answered_total: 60,
};

const DOMAINS: CertDomain[] = [
  {
    domain_id: 'd1',
    label: 'Agentic Architecture',
    description: null,
    weight_pct: 27,
    weight_source: 'official',
    display_order: 1,
    objectives: [{ objective_id: 'o1', label: 'Design an agent loop' }],
    state: READINESS.domain_breakdown[0],
  },
];

let container: HTMLDivElement;
let root: Root;
let scrollSpy: jest.Mock;

beforeEach(() => {
  (getCertPrepSummary as jest.Mock).mockResolvedValue({
    data: { availability: { available: true, programWeek: 8, startWeek: 7, trackId: 'ccar-f', reason: 'open' }, readiness: READINESS },
  });
  (getCertDomains as jest.Mock).mockResolvedValue({ data: { track: TRACK, domains: DOMAINS } });

  // jsdom implements neither of these; the handler under test calls both.
  scrollSpy = jest.fn();
  (Element.prototype as any).scrollIntoView = scrollSpy;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: any) => { cb(0); return 0; });
  if (!window.matchMedia) {
    (window as any).matchMedia = () => ({ matches: false });
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  jest.restoreAllMocks();
});

async function renderReadyPage(): Promise<void> {
  await act(async () => {
    root.render(<CertPrepPage />);
  });
}

function seeWhyButton(): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent || '').trim().toLowerCase() === 'see why',
  );
  if (!match) throw new Error('the "See why" button is not on the page');
  return match as HTMLButtonElement;
}

describe('Cert Prep — "See why" from the hero', () => {
  it('brings the domain panel into view even though Domain Map is ALREADY the open tab', async () => {
    await renderReadyPage();

    // The precondition that made the original bug invisible to a tab-based
    // assertion: nothing has been clicked, so the page is already on 'domains'.
    const openTab = container.querySelector('.cp-tab.is-active');
    expect(openTab?.textContent).toContain('Domain Map');
    expect(container.querySelector('[data-domain-map]')).not.toBeNull();
    expect(scrollSpy).not.toHaveBeenCalled();

    await act(async () => { seeWhyButton().click(); });

    // The assertion the old `setTab('domains')` could never satisfy.
    expect(scrollSpy).toHaveBeenCalled();
  });

  it('still works from another tab, and lands the student back on the domain map', async () => {
    await renderReadyPage();

    const practice = Array.from(container.querySelectorAll('.cp-tab')).find(
      (t) => (t.textContent || '').includes('Practice'),
    ) as HTMLButtonElement;
    await act(async () => { practice.click(); });
    expect(container.querySelector('[data-domain-map]')).toBeNull();

    await act(async () => { seeWhyButton().click(); });

    expect(container.querySelector('[data-domain-map]')).not.toBeNull();
    expect(scrollSpy).toHaveBeenCalled();
  });
});

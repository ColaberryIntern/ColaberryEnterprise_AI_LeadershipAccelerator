/**
 * AF11.9 — the front door's three branches, as a reader sees them.
 *
 * The matcher is tested against the real catalog in
 * `backend/src/services/agentDomain/__tests__/productFeatureCatalog.test.ts`. What is tested HERE
 * is the thing a backend test cannot see: that "already in the app" offers no way to turn itself
 * into a build request, which is the mistake this whole screen exists to stop.
 */

const mockAsk = jest.fn();
jest.mock('../../../../services/productFeatureApi', () => ({
  askProductFeatures: (...a: unknown[]) => mockAsk(...a),
}));

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AddCapabilityFrontDoor from '../AddCapabilityFrontDoor';

let container: HTMLDivElement;
let root: Root | null = null;

const LANDING_PAGE = {
  feature_key: 'marketing.landing_page.draft',
  domain_key: 'marketing',
  label: 'Draft a landing page',
  what_it_does: 'Create a landing page, revise it, and preview the real rendered page.',
  state: 'in_app' as const,
  product_route: '/admin/landing-pages',
  backed_by: 'backend/src/routes/admin/landingPageRoutes.ts',
  verified_on: '2026-11-17',
  ruling_needed: null,
  matches: ['landing page'],
};

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container.remove();
  root = null;
});

async function render(domainKey = 'marketing') {
  await act(async () => {
    root = createRoot(container);
    root.render(<AddCapabilityFrontDoor domainKey={domainKey} />);
  });
  await act(async () => { await Promise.resolve(); });
}

const text = () => container.textContent ?? '';

async function ask(value: string) {
  const input = container.querySelector('#front-door-candidate') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const button = [...container.querySelectorAll('button')]
    .find((b) => b.textContent?.includes('Check the app first'));
  await act(async () => {
    (button as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

describe('already in the app', () => {
  beforeEach(() => mockAsk.mockResolvedValue({
    answer: {
      state: 'in_app',
      feature: LANDING_PAGE,
      route_to: 'use_it_then_ask_for_a_grant',
      implies_tried_in_product: null,
      domain_is_mapped: true,
    },
    coverage: { features: 5, domains: ['marketing'] },
  }));

  it('says so, and links at the real screen', async () => {
    await render();
    await ask('draft a landing page');
    expect(text()).toContain('The app already does this');
    const link = container.querySelector('a[href="/admin/landing-pages"]');
    expect(link).toBeTruthy();
  });

  it('OFFERS NO WAY TO TURN THIS INTO A BUILD, which is the whole point', async () => {
    // The ticket: the answer is never "write a request". If this branch ever grows a button that
    // files one, the front door has become a form and the most expensive mistake in the path —
    // paying to build what we already own — is available again in one click.
    await render();
    await ask('draft a landing page');
    // It mentions the scope sheet only to say one is NOT needed. What must be absent is the
    // instruction that routes there, and any control that files a request.
    expect(text()).toContain('does not need a scope sheet');
    expect(text()).not.toContain('The next step is the scope sheet');
    expect(text()).toContain('that is a grant');
  });

  it('shows the evidence and the date, so the claim can be checked rather than trusted', async () => {
    await render();
    await ask('draft a landing page');
    expect(text()).toContain('landingPageRoutes.ts');
    expect(text()).toContain('2026-11-17');
  });
});

describe('partly there', () => {
  it('shows the ruling that is needed, and does not call it a build', async () => {
    mockAsk.mockResolvedValue({
      answer: {
        state: 'partly',
        feature: {
          ...LANDING_PAGE,
          feature_key: 'marketing.landing_page.publish',
          state: 'partly',
          ruling_needed: 'Publishing puts a page on the public internet under the Colaberry name.',
        },
        route_to: 'ask_for_a_ruling',
        implies_tried_in_product: null,
        domain_is_mapped: true,
      },
      coverage: { features: 5, domains: ['marketing'] },
    });
    await render();
    await ask('publish a landing page');
    expect(text()).toContain('public internet');
    expect(text()).toContain('ruling');
    expect(text()).toContain('does not need a scope sheet');
    expect(text()).not.toContain('The next step is the scope sheet');
  });
});

describe('not built', () => {
  it('routes to the scope sheet and names what it will ask for', async () => {
    mockAsk.mockResolvedValue({
      answer: {
        state: 'not_built',
        feature: null,
        route_to: 'write_a_scope_sheet',
        implies_tried_in_product: 'not_built',
        domain_is_mapped: true,
      },
      coverage: { features: 5, domains: ['marketing'] },
    });
    await render();
    await ask('scan the repository for off-palette colors');
    expect(text()).toContain('The app cannot do this yet');
    expect(text()).toContain('scope sheet');
    expect(text()).toContain('who acts on the output');
  });

  it('SAYS AN UNMAPPED DOMAIN IS UNMAPPED, rather than claiming nothing exists', async () => {
    // "We have not looked at your domain" and "we looked and it is not there" must not read the
    // same, or the next answer will not be believed either.
    mockAsk.mockResolvedValue({
      answer: {
        state: 'not_built',
        feature: null,
        route_to: 'write_a_scope_sheet',
        implies_tried_in_product: 'not_built',
        domain_is_mapped: false,
      },
      coverage: { features: 5, domains: ['marketing'] },
    });
    await render('learner_success');
    await ask('anything at all');
    expect(text()).toContain('Nobody has mapped');
    expect(text()).toContain('best guess rather than a check');
  });
});

describe('when the catalog cannot be read', () => {
  it('says UNANSWERED rather than no, because a failed lookup is not an absence', async () => {
    // Telling somebody to write a scope sheet for a feature that exists is the expensive
    // direction, and a 500 must not be allowed to produce that answer.
    mockAsk.mockRejectedValue(new Error('network'));
    await render();
    await ask('draft a landing page');
    expect(text()).toContain('unanswered rather than no');
    expect(text()).not.toContain('The app cannot do this yet');
  });
});

describe('it files nothing', () => {
  it('asks and nothing else: no request is created by using the front door', async () => {
    mockAsk.mockResolvedValue({
      answer: {
        state: 'in_app', feature: LANDING_PAGE, route_to: 'use_it_then_ask_for_a_grant',
        implies_tried_in_product: null, domain_is_mapped: true,
      },
      coverage: { features: 5, domains: ['marketing'] },
    });
    await render();
    await ask('draft a landing page');
    // One read, with the candidate and the domain, and no other call of any kind.
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockAsk).toHaveBeenCalledWith('draft a landing page', 'marketing');
    expect(text()).toContain('Nothing is filed by this');
  });
});

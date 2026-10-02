import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ContentTab from '../ContentTab';
import ContentRulesTable from '../ContentRulesTable';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type {
  OfferPolicyRow, OfferPoliciesResponse, ContentRuleRow, ContentRulesResponse,
} from '../../../services/growthJourneyInspectApi';

/**
 * The content tab and its rules table (Phase 6, T614).
 *
 * The load-bearing cell in this file is the 25-item cut. `approved_landing_pages` is
 * capped server-side while `approved_landing_pages_total` carries the true length,
 * and this is the ONLY per-list floor on the nine reads - everywhere else `total` is
 * a real COUNT(*). A screen that renders 25 as though it were all of them is the
 * same defect T608 was docked for and T613 spent two attempts defending on the
 * health panel, so it is pinned from both sides: cut and not cut.
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyInspectApi', () => ({
  listOfferPolicies: jest.fn(),
  listContentRules: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyInspectApi') as {
  listOfferPolicies: jest.Mock;
  listContentRules: jest.Mock;
};

const pRow = (over: Partial<OfferPolicyRow> = {}): OfferPolicyRow => ({
  id: 'p-1',
  brand_id: 'b-1',
  offer_family: 'ai_leadership',
  decision: 'allow',
  status: 'active',
  effective_from: '2026-01-01',
  effective_to: null,
  approved_landing_pages: ['/ai-leadership'],
  approved_landing_pages_total: 1,
  claims_count: 3,
  ctas_count: 2,
  required_approvals: ['legal'],
  ...over,
});

const pPage = (over: Partial<OfferPoliciesResponse> = {}): OfferPoliciesResponse => ({
  rows: [pRow()],
  total: 5,
  limit: 25,
  offset: 0,
  scope: { tenant_id: 't-1', brand_id: 'b-1', program_id: null },
  ...over,
});

const rRow = (over: Partial<ContentRuleRow> = {}): ContentRuleRow => ({
  id: 'r-1',
  brand_id: 'b-1',
  offer_family: 'ai_leadership',
  collection_key: 'case_study',
  asset_id: 'a-1',
  version: 3,
  approval_status: 'draft',
  approved_by: 'reviewer-7',
  approved_by_redacted: false,
  approved_at: '2026-09-01T00:00:00.000Z',
  claims_count: 4,
  access_tier: 'public',
  effective_from: null,
  expires_at: null,
  ...over,
});

const rPage = (over: Partial<ContentRulesResponse> = {}): ContentRulesResponse => ({
  rows: [rRow()],
  total: 2,
  limit: 25,
  offset: 0,
  scope: { tenant_id: 't-1', brand_id: 'b-1', program_id: null },
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const renderTab = async () => {
  await act(async () => { root.render(<ContentTab />); });
};
const renderRules = async () => {
  await act(async () => { root.render(<ContentRulesTable />); });
};
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.listOfferPolicies.mockResolvedValue(pPage());
  api.listContentRules.mockResolvedValue(rPage());
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('the 25-item landing-page cut is reported as a floor', () => {
  it('says "showing N of M" and flags the cap when the list was cut', async () => {
    api.listOfferPolicies.mockResolvedValue(pPage({
      rows: [pRow({
        approved_landing_pages: Array.from({ length: 25 }, (_, i) => `/p${i}`),
        approved_landing_pages_total: 112,
      })],
    }));
    await renderTab();
    expect(text()).toContain('showing 25 of 112');
    expect(text()).toContain('list cut at the server cap');
  });

  it('and says simply "N approved" when nothing was cut - no false caveat', async () => {
    // A warning about a condition that did not arise costs the real warning its
    // credibility, so the uncut case must NOT carry the badge.
    await renderTab();
    expect(text()).toContain('1 approved');
    expect(text()).not.toContain('list cut at the server cap');
  });

  it('says none approved rather than "0 of 0"', async () => {
    api.listOfferPolicies.mockResolvedValue(pPage({
      rows: [pRow({ approved_landing_pages: [], approved_landing_pages_total: 0 })],
    }));
    await renderTab();
    expect(text()).toContain('none approved');
  });
});

describe('decision is a stored setting, not a verdict about a person', () => {
  it('renders the row value with the column named as a policy', async () => {
    await renderTab();
    expect(text()).toContain('allow');
    expect(text()).toContain('own stored setting');
  });

  it('renders deny just as plainly', async () => {
    api.listOfferPolicies.mockResolvedValue(pPage({ rows: [pRow({ decision: 'deny', status: 'paused' })] }));
    await renderTab();
    expect(text()).toContain('deny');
    expect(text()).toContain('paused');
  });

  it('says the claim and CTA copy is never served, so counts do not read as a failed load', async () => {
    // The counts asserted as BARE CHARACTERS could never fail: '3' and '2' are
    // satisfied by `limit 25`, `2026-01-01` and `of 5 offer policies` elsewhere on
    // the page. The verifier replaced both cells with 'n/a' and all 194 stayed
    // green. Two-digit values in their own cells, asserted positionally.
    api.listOfferPolicies.mockResolvedValue(pPage({
      rows: [pRow({ claims_count: 37, ctas_count: 19 })],
    }));
    await renderTab();
    expect(text()).toContain('never served to this screen');
    const cells = Array.from(container.querySelectorAll('tbody td')).map((c) => c.textContent ?? '');
    expect(cells).toContain('37');
    expect(cells).toContain('19');
  });

  it('reports an open-ended policy as open-ended rather than blank', async () => {
    await renderTab();
    expect(text()).toContain('open-ended');
  });

  it('and a closed one with its end date', async () => {
    api.listOfferPolicies.mockResolvedValue(pPage({ rows: [pRow({ effective_to: '2026-12-31' })] }));
    await renderTab();
    expect(text()).toContain('2026-12-31');
    expect(text()).not.toContain('open-ended');
  });
});

describe('figures come off the payload', () => {
  it('reports the served page', async () => {
    await renderTab();
    expect(text()).toContain('of 5 offer policies');
  });

  it('and a second page proves it', async () => {
    api.listOfferPolicies.mockResolvedValue(pPage({ total: 41, limit: 10, offset: 20 }));
    await renderTab();
    expect(text()).toContain('of 41 offer policies');
    expect(text()).toContain('limit 10, offset 20');
  });
});

describe('the rules table reports the API mask rather than guessing', () => {
  it('shows a redacted approver as redacted by the API', async () => {
    api.listContentRules.mockResolvedValue(rPage({
      rows: [rRow({ approved_by: 'redacted', approved_by_redacted: true })],
    }));
    await renderRules();
    expect(text()).toContain('redacted by the API');
  });

  it('and an empty one as not recorded', async () => {
    api.listContentRules.mockResolvedValue(rPage({
      rows: [rRow({ approved_by: 'unknown', approved_by_redacted: false })],
    }));
    await renderRules();
    // Scoped to the row: `'not recorded'` is caption copy here too.
    const body = container.querySelector('tbody')?.textContent ?? '';
    expect(body).toContain('not recorded');
  });

  it('positive control: a real approver renders verbatim', async () => {
    await renderRules();
    expect(text()).toContain('reviewer-7');
  });

  it('treats approval_status as free text, not a closed enum', async () => {
    // The column is a bare STRING(16) with no CHECK, so a value nobody documented
    // must still render rather than being dropped by a dropdown.
    api.listContentRules.mockResolvedValue(rPage({
      rows: [rRow({ approval_status: 'awaiting_legal' })],
    }));
    await renderRules();
    expect(text()).toContain('awaiting_legal');
  });

  it('warns that an empty filter result does not prove the value is absent', async () => {
    api.listContentRules.mockResolvedValue(rPage({ rows: [], total: 0 }));
    await renderRules();
    expect(text()).toContain('not proof the value does not exist');
  });

  it('reads the version off the row', async () => {
    api.listContentRules.mockResolvedValue(rPage({ rows: [rRow({ version: 11 })] }));
    await renderRules();
    expect(text()).toContain('11');
  });
});

describe('the mechanical accessibility rules', () => {
  it('pass on the policies table', async () => {
    await renderTab();
    expectNoA11yViolations(container);
  });

  it('pass on the rules table', async () => {
    await renderRules();
    expectNoA11yViolations(container);
  });

  it('pass on both empty states', async () => {
    api.listOfferPolicies.mockResolvedValue(pPage({ rows: [], total: 0 }));
    api.listContentRules.mockResolvedValue(rPage({ rows: [], total: 0 }));
    await renderTab();
    expectNoA11yViolations(container);
  });
});

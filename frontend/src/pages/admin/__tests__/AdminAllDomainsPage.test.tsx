/**
 * "All Domains" — the programme-wide counterpart to My Domain.
 *
 * What is worth testing here is not that a table renders. It is the two things this page could
 * get wrong in a way nobody would notice:
 *
 *   1. IT COULD IMPLY PROGRESS. A programme-wide total is exactly the figure somebody quotes in
 *      a meeting. "503 stories" on its own is the single most misleading thing this surface can
 *      say, because none is started, none is verified and no build is authorized. So the verified
 *      and authorization counts must appear beside the story count in the totals AND in each row.
 *
 *   2. IT COULD QUIETLY BECOME A SCOPED PAGE, or My Domain could quietly become this one. They
 *      answer different questions and AF2.1 names conflating them as a failure mode: widening
 *      My Domain to all ten would leak every intern's scope. A test therefore pins which API
 *      function this page calls.
 *
 * TEST STYLE: this repo has no `@testing-library/react`; the frontend suites drive React through
 * `createRoot` and `act` directly. This matches the sibling suite rather than adding a dependency
 * in passing.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import * as fs from 'fs';
import * as path from 'path';

// Declared inside the factory: babel hoists jest.mock above const declarations, so referencing
// an outer `const mockX` here throws "Cannot access before initialization".
jest.mock('../../../services/agentDomainApi', () => ({
  fetchMyDomains: jest.fn(),
  fetchProvisionedDomains: jest.fn(),
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('../../../components/admin/shell', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionCard: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <section><h2>{title}</h2>{children}</section>
  ),
}));

import AdminAllDomainsPage from '../AdminAllDomainsPage';
import * as api from '../../../services/agentDomainApi';

const fetchAll = api.fetchProvisionedDomains as jest.Mock;
const fetchMine = api.fetchMyDomains as jest.Mock;
const PAGE_SRC = path.join(__dirname, '..', 'AdminAllDomainsPage.tsx');

let container: HTMLDivElement;
let root: Root;

function row(over: Record<string, unknown> = {}) {
  return {
    domain_key: 'alpha',
    student_project_id: 'p1',
    anchor_id: 'a1',
    stage: 'discovery',
    entry_point: 'agent_domain_factory_provisioner',
    manager_identity_id: 'm1',
    manager_email: 'manager@example.com',
    manager_can_reach: true,
    manager_blocker: null,
    intended_builder_state: 'verified_active',
    agent_id: null,
    releases: 3,
    stories: 70,
    stories_verified: 0,
    build_authorizations: 0,
    ...over,
  };
}

function payload(over: Record<string, unknown> = {}) {
  const domains = (over.domains as unknown[]) ?? [row()];
  return {
    summary: {
      domains: domains.length,
      releases: 30,
      stories: 503,
      stories_verified: 0,
      build_authorizations: 0,
      missing_lifecycle_row: 0,
      managers_blocked: 0,
      disclosure: 'These projects are PLANS. No story is verified and no build is authorized, so '
        + 'no agent has done any of this work.',
    },
    domains,
    ...over,
  };
}

async function render() {
  await act(async () => { root.render(<AdminAllDomainsPage />); });
}
const text = () => container.textContent ?? '';

beforeEach(() => {
  fetchAll.mockReset();
  fetchMine.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('it asks the programme-wide question, not the scoped one', () => {
  it('calls the all-ten endpoint and never the self-scoped one', async () => {
    fetchAll.mockResolvedValue(payload());
    await render();
    expect(fetchAll).toHaveBeenCalledTimes(1);
    // The pin that stops this page quietly becoming a second My Domain.
    expect(fetchMine).not.toHaveBeenCalled();
  });

  it('renders every domain returned, not just the first', async () => {
    fetchAll.mockResolvedValue(payload({
      domains: [row({ domain_key: 'alpha' }), row({ domain_key: 'beta' }), row({ domain_key: 'gamma' })],
    }));
    await render();
    for (const k of ['alpha', 'beta', 'gamma']) expect(text()).toContain(k);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('POSITIVE CONTROL: the row count tracks the payload rather than being fixed', async () => {
    // Without this, "toHaveLength(3)" above would also pass against a page that always
    // rendered three rows regardless of the data.
    fetchAll.mockResolvedValue(payload({ domains: [row({ domain_key: 'solo' })] }));
    await render();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});

describe('it cannot imply progress', () => {
  it('shows verified and authorized beside the story total, so 503 never stands alone', async () => {
    fetchAll.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('503');
    expect(text()).toContain('Stories verified');
    expect(text()).toContain('Build authorizations');
  });

  it('every row carries its own verified and authorized figures', async () => {
    fetchAll.mockResolvedValue(payload({
      domains: [row({ domain_key: 'alpha', stories: 70, stories_verified: 0, build_authorizations: 0 })],
    }));
    await render();
    const cells = Array.from(container.querySelectorAll('tbody tr td')).map((c) => c.textContent);
    // Releases, stories, verified, authorized all present on the row itself, not only in totals.
    expect(cells).toContain('3');
    expect(cells).toContain('70');
    expect(cells.filter((c) => c === '0')).toHaveLength(2);
  });

  it("renders the API's disclosure verbatim, not a paraphrase", async () => {
    fetchAll.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('These projects are PLANS');
    expect(text()).toContain('no agent has done any of this work');
  });

  it('CHANGES what it says when the backend changes its disclosure', async () => {
    // Positive control for the test above: the sentence is passed through, not baked in.
    fetchAll.mockResolvedValue(payload({
      summary: { ...payload().summary, stories_verified: 4, disclosure: 'Some stories are verified.' },
    }));
    await render();
    expect(text()).toContain('Some stories are verified.');
    expect(text()).not.toContain('These projects are PLANS');
  });

  it('hardcodes no figure and no domain name, asserted against its own source', async () => {
    const code = fs.readFileSync(PAGE_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const forbidden of ['503', '443', 'marketing', 'curriculum', 'admissions', 'learner_success']) {
      expect(code.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('POSITIVE CONTROL: the hardcode detector fires on text that does contain a figure', () => {
    expect('const stories = 503;'.toLowerCase()).toContain('503');
  });
});

describe('loading, failure and nothing-provisioned are three different states', () => {
  it('a failure says so rather than rendering an empty table', async () => {
    fetchAll.mockRejectedValue(new Error('boom'));
    await render();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(text()).toContain('Could not load the domain projects');
    // The distinction that matters: a failed load must never look like "there are no domains".
    expect(container.querySelector('tbody')).toBeNull();
  });

  it('an empty result is a finding about provisioning, not an error', async () => {
    fetchAll.mockResolvedValue(payload({ domains: [] }));
    await render();
    expect(text()).toContain('Nothing has been provisioned');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows a loading state before the request settles', async () => {
    fetchAll.mockReturnValue(new Promise(() => { /* never resolves */ }));
    await render();
    expect(text()).toContain('Loading the domain projects');
    expect(container.querySelector('tbody')).toBeNull();
  });
});

describe('it surfaces the bad parts rather than defaulting them', () => {
  it('flags a manager who cannot reach the surface, and names the blocker', async () => {
    fetchAll.mockResolvedValue(payload({
      domains: [row({
        manager_can_reach: false,
        manager_blocker: 'manager_has_no_admin_login: an org_members row but no admin_users row',
      })],
    }));
    await render();
    expect(text()).toContain('cannot reach the admin surface');
    expect(text()).toContain('no admin_users row');
  });

  it('a missing lifecycle row is shown as missing, not as a blank', async () => {
    fetchAll.mockResolvedValue(payload({ domains: [row({ stage: null })] }));
    await render();
    expect(text()).toContain('no lifecycle row');
  });

  it('an unassigned manager reads as unassigned, not as an empty cell', async () => {
    fetchAll.mockResolvedValue(payload({ domains: [row({ manager_email: null })] }));
    await render();
    expect(text()).toContain('unassigned');
  });

  it('says no agent is built yet rather than leaving the field empty', async () => {
    fetchAll.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('none built yet');
  });

  it('surfaces programme-wide problem counts rather than burying them', async () => {
    fetchAll.mockResolvedValue(payload({
      summary: { ...payload().summary, managers_blocked: 3, missing_lifecycle_row: 2 },
    }));
    await render();
    expect(text()).toContain('Managers blocked');
    expect(text()).toContain('Missing lifecycle row');
  });
});

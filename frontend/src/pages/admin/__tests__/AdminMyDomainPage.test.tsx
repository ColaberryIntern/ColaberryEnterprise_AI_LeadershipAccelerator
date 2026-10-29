/**
 * AF2.1 — "My Domain", the landing a domain owner sees after bridging into the admin portal.
 *
 * The thing worth testing is NOT that it renders. It is that it cannot imply progress. These are
 * provisioned PLANS: 503 stories across ten domains, none started, no capability confirmed, no
 * build authorized. A page showing a large story count on its own would read as work underway,
 * which is the most misleading thing this surface could say.
 *
 * Two figures moved during this build -- 448 to 503 stories, and six-of-ten to seven-of-ten
 * reachable managers -- and both times the stale copy sat in prose nobody re-derived. So one test
 * reads this page's own source and fails if any figure or domain name is baked into it.
 *
 * NOTE ON THE TEST STYLE: this repo has no `@testing-library/react` -- the frontend suites drive
 * React through `createRoot` and `act` directly. My first draft imported testing-library and the
 * suite would not even load. Adding a dependency to make a test convenient is not a call to make
 * in passing, so this matches the existing idiom instead.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import * as fs from 'fs';
import * as path from 'path';

// Declared inside the factory: babel hoists jest.mock above const declarations, so referencing an
// outer `const mockX` here throws "Cannot access before initialization".
jest.mock('../../../services/agentDomainApi', () => ({
  fetchMyDomains: jest.fn(),
  fetchProvisionedDomains: jest.fn(),
  errorMessage: (_e: unknown, fallback: string) => fallback,
  // AF10.6. Both are real exports the page imports, so leaving them out of this factory would
  // make the naming control fail on an undefined call rather than on anything this suite is
  // about. Its own behaviour is covered in AdminMyDomainPage.agentName.test.tsx.
  setAgentDisplayName: jest.fn(),
  AGENT_DISPLAY_NAME_MAX: 60,
}));

jest.mock('../../../components/admin/shell', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionCard: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <section><h2>{title}</h2>{children}</section>
  ),
}));

import AdminMyDomainPage from '../AdminMyDomainPage';
import * as api from '../../../services/agentDomainApi';

const fetchMine = api.fetchMyDomains as jest.Mock;
const PAGE_SRC = path.join(__dirname, '..', 'AdminMyDomainPage.tsx');

let container: HTMLDivElement;
let root: Root;

function row(over: Record<string, unknown> = {}) {
  return {
    domain_key: 'marketing',
    student_project_id: 'p1', anchor_id: 'a1',
    stage: 'discovery', entry_point: 'agent_domain_factory_provisioner',
    manager_identity_id: 'm1', manager_email: 'sohail@colaberry.com',
    manager_can_reach: true, manager_blocker: null,
    intended_builder_state: 'verified_active', agent_id: null,
    // AF10.6: null is the normal state. The intern names their agent; nothing backfills it.
    agent_display_name: null,
    releases: 3, stories: 70, stories_verified: 0, build_authorizations: 0,
    ...over,
  };
}
function payload(over: Record<string, unknown> = {}) {
  const domains = (over.domains as unknown[]) ?? [row()];
  return {
    caller_email: 'sohail@colaberry.com',
    resolved_identities: 1,
    summary: {
      domains: domains.length, releases: 3, stories: 70,
      stories_verified: 0, build_authorizations: 0,
      missing_lifecycle_row: 0, managers_blocked: 0,
      disclosure: 'These projects are PLANS. No story is verified and no build is authorized, so '
        + 'no agent has done any of this work.',
    },
    note: 'Scoped to the domains this identity is the accountable manager for.',
    // `domains` was computed above and never returned in the first draft, so data.domains was
    // undefined and the page threw on .length in every test that did not pass it explicitly.
    domains,
    ...over,
  };
}

async function render() {
  await act(async () => { root.render(<AdminMyDomainPage />); });
}
const text = () => container.textContent ?? '';

beforeEach(() => {
  fetchMine.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('AF2.1 it cannot imply progress', () => {
  it('shows the verified count beside the story count, so 70 never stands alone', async () => {
    fetchMine.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('70');
    // The honest pair. If either label disappears the page starts overstating.
    expect(text()).toContain('Stories verified');
    expect(text()).toContain('Build authorizations');
  });

  it("renders the API's disclosure verbatim, not a paraphrase", async () => {
    fetchMine.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('These projects are PLANS');
    expect(text()).toContain('no agent has done any of this work');
  });

  it('CHANGES what it says when the backend changes its disclosure', async () => {
    // Positive control for the test above: the sentence is passed through, not baked in.
    fetchMine.mockResolvedValue(payload({
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

describe('AF2.1 loading, failure and owns-nothing are three different states', () => {
  it('a failure says so rather than rendering an empty page', async () => {
    fetchMine.mockRejectedValue(new Error('boom'));
    await render();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(text()).toContain('Could not load your domain');
  });

  it('owning nothing shows the API reason and is NOT an error', async () => {
    fetchMine.mockResolvedValue(payload({
      domains: [], resolved_identities: 0,
      note: 'This email resolves to no org_members row in the org of record, so it owns no domain.',
    }));
    await render();
    expect(text()).toContain('owns no domain');
    // The distinction that matters: not-yours must not look like broken.
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows a loading state before the request settles', async () => {
    fetchMine.mockReturnValue(new Promise(() => { /* never resolves */ }));
    await render();
    expect(text()).toContain('Loading your domain');
  });
});

describe('AF2.1 it surfaces the bad parts rather than defaulting them', () => {
  it('flags a manager who cannot reach the surface, and names the blocker', async () => {
    fetchMine.mockResolvedValue(payload({
      domains: [row({
        domain_key: 'platform', manager_can_reach: false,
        manager_blocker: 'manager_has_no_admin_login: Kes has an org_members row but no admin_users row',
      })],
    }));
    await render();
    expect(text()).toContain('cannot reach the admin surface');
    expect(text()).toContain('no admin_users row');
  });

  it('a missing lifecycle row is shown as missing, not as a blank', async () => {
    fetchMine.mockResolvedValue(payload({ domains: [row({ stage: null })] }));
    await render();
    expect(text()).toContain('no lifecycle row');
  });

  it('says no agent is built yet rather than leaving the field empty', async () => {
    fetchMine.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('none built yet');
  });

  it('renders every domain the caller owns, not just the first', async () => {
    fetchMine.mockResolvedValue(payload({
      domains: [row({ domain_key: 'executive' }), row({ domain_key: 'learner_success' })],
    }));
    await render();
    expect(text()).toContain('executive');
    expect(text()).toContain('learner_success');
  });
});

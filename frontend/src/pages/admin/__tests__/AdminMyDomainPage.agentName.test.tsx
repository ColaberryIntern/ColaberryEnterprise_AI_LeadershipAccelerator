/**
 * AF10.6 — naming your own agent, from the page the intern is already on.
 *
 * The properties worth the most here:
 *
 *  - The slot shows the NAME, not the UUID. It rendered a bare `agent_id` before this ticket,
 *    which is the reason the ticket exists. The id stays reachable on `title` because it is what
 *    anyone debugging needs.
 *  - A 409 is rendered in the SERVER'S OWN WORDS. "Maya is already taken by another agent" tells
 *    the intern what to do next; "Could not save" does not. This is the one assertion that
 *    protects the entire point of the uniqueness check.
 *  - "not named yet" is a real state, distinct from "none built yet". An unnamed agent and an
 *    absent agent are different facts and must not render the same.
 *
 * TEST STYLE: this repo has no `@testing-library/react`; frontend suites drive React through
 * `createRoot` and `act` directly. Matching the sibling suite rather than adding a dependency.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../../services/agentDomainApi', () => ({
  fetchMyDomains: jest.fn(),
  fetchProvisionedDomains: jest.fn(),
  setAgentDisplayName: jest.fn(),
  AGENT_DISPLAY_NAME_MAX: 60,
  // The real one surfaces `response.data.error`. Mirrored here, because a mock that always
  // returned the fallback would make the "renders the server's words" test pass vacuously.
  errorMessage: (e: unknown, fallback: string) => (
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
  ),
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
const setName = api.setAgentDisplayName as jest.Mock;

const AGENT = '11111111-2222-4333-8444-555555555555';

let container: HTMLDivElement;
let root: Root;

function row(over: Record<string, unknown> = {}) {
  return {
    domain_key: 'curriculum',
    student_project_id: 'p1', anchor_id: 'a1',
    stage: 'discovery', entry_point: 'agent_domain_factory_provisioner',
    manager_identity_id: 'm1', manager_email: 'swati@example.com',
    manager_can_reach: true, manager_blocker: null,
    intended_builder_state: 'verified_active',
    agent_id: AGENT, agent_display_name: null,
    releases: 3, stories: 70, stories_verified: 0, build_authorizations: 0,
    ...over,
  };
}

function payload(over: Record<string, unknown> = {}) {
  const domains = (over.domains as unknown[]) ?? [row()];
  return {
    caller_email: 'ruth@example.com',
    resolved_identities: 1,
    summary: {
      domains: domains.length, releases: 3, stories: 70,
      stories_verified: 0, build_authorizations: 0,
      missing_lifecycle_row: 0, managers_blocked: 0,
      disclosure: 'These projects are PLANS.',
    },
    domains,
    ...over,
  };
}

async function render() {
  await act(async () => { root.render(<AdminMyDomainPage />); });
}
const text = () => container.textContent ?? '';
const buttons = () => Array.from(container.querySelectorAll('button'));
const byLabel = (label: string) => buttons().find((b) => (b.textContent ?? '').includes(label))!;
const input = () => container.querySelector('input') as HTMLInputElement | null;

async function click(el: Element) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

async function type(value: string) {
  const el = input()!;
  await act(async () => {
    // React tracks the value internally, so set it through the descriptor or the change event
    // reports the old value.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  fetchMine.mockReset();
  setName.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('the agent slot shows a name, not a UUID', () => {
  it('renders the stored name', async () => {
    fetchMine.mockResolvedValue(payload({ domains: [row({ agent_display_name: 'Dara' })] }));
    await render();
    expect(text()).toContain('Dara');
  });

  it('does NOT render the raw agent id as visible text', async () => {
    fetchMine.mockResolvedValue(payload({ domains: [row({ agent_display_name: 'Dara' })] }));
    await render();
    // The id is still reachable for debugging, just not occupying the line.
    expect(text()).not.toContain(AGENT);
    expect(container.innerHTML).toContain(AGENT);
  });

  it('says "not named yet" when the agent exists but has no name', async () => {
    fetchMine.mockResolvedValue(payload());
    await render();
    expect(text()).toContain('not named yet');
    expect(byLabel('name your agent')).toBeTruthy();
  });

  it('distinguishes an UNNAMED agent from an ABSENT one', async () => {
    fetchMine.mockResolvedValue(payload({ domains: [row({ agent_id: null })] }));
    await render();
    expect(text()).toContain('none built yet');
    expect(text()).not.toContain('not named yet');
  });
});

describe('setting the name', () => {
  it('sends the typed name for this agent and then shows it', async () => {
    fetchMine.mockResolvedValue(payload());
    setName.mockResolvedValue({ agent_id: AGENT, display_name: 'Dara', unchanged: false });
    await render();

    await click(byLabel('name your agent'));
    await type('Dara');
    await click(byLabel('Save'));

    expect(setName).toHaveBeenCalledWith(AGENT, 'Dara');
    expect(text()).toContain('Dara');
  });

  it('RENDERS THE SERVER\'S OWN REFUSAL, so a collision says which name collided', async () => {
    fetchMine.mockResolvedValue(payload());
    setName.mockRejectedValue({
      response: { data: { error: '"Maya" is already taken by another agent.' } },
    });
    await render();

    await click(byLabel('name your agent'));
    await type('Maya');
    await click(byLabel('Save'));

    expect(text()).toContain('"Maya" is already taken by another agent.');
    // And it did not pretend the name was saved. The control stays OPEN with the rejected text
    // still in it, so the intern can edit one character instead of starting over -- which is why
    // this asserts "still editing" rather than "back to not named yet".
    expect(byLabel('Save')).toBeTruthy();
    expect(input()!.value).toBe('Maya');
  });

  it('falls back to a plain sentence only when the server said nothing', async () => {
    fetchMine.mockResolvedValue(payload());
    setName.mockRejectedValue(new Error('network down'));
    await render();

    await click(byLabel('name your agent'));
    await type('Ava');
    await click(byLabel('Save'));

    expect(text()).toContain('Could not save that name.');
    expect(text()).not.toContain('network down');
  });

  it('will not submit an empty name', async () => {
    fetchMine.mockResolvedValue(payload());
    await render();

    await click(byLabel('name your agent'));
    await type('   ');

    expect((byLabel('Save') as HTMLButtonElement).disabled).toBe(true);
    await click(byLabel('Save'));
    expect(setName).not.toHaveBeenCalled();
  });

  it('caps the input at the length the API accepts', async () => {
    fetchMine.mockResolvedValue(payload());
    await render();
    await click(byLabel('name your agent'));
    expect(input()!.maxLength).toBe(60);
  });

  it('cancel leaves the stored name alone and writes nothing', async () => {
    fetchMine.mockResolvedValue(payload({ domains: [row({ agent_display_name: 'Dara' })] }));
    await render();

    await click(byLabel('rename'));
    await type('Something else');
    await click(byLabel('Cancel'));

    expect(setName).not.toHaveBeenCalled();
    expect(text()).toContain('Dara');
  });

  it('offers "rename" rather than "name your agent" once it has a name', async () => {
    fetchMine.mockResolvedValue(payload({ domains: [row({ agent_display_name: 'Dara' })] }));
    await render();
    expect(byLabel('rename')).toBeTruthy();
    expect(buttons().some((b) => (b.textContent ?? '').includes('name your agent'))).toBe(false);
  });
});

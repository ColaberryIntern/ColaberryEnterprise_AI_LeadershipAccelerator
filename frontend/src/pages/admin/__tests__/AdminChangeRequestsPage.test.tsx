/**
 * AF4.2 — the change-request page, and the one property that carries real risk.
 *
 * This page sits on `section: 'dashboard'`, the one section every mgmt role holds, so a mentor, a
 * support rep and a community organizer can all open it. **The decision queue must not render for
 * them**, and the page decides that by asking the admin-only API rather than guessing from a
 * client-side role — so a 403 on the queue read is "not for you", not an error.
 *
 * The second-most valuable assertion is that a refused decision is shown in the SERVER'S OWN
 * WORDS. "The person who filed a change request cannot be the person who approves it" tells
 * somebody what to do next; "Could not save" does not.
 *
 * TEST STYLE: this repo has no `@testing-library/react`; frontend suites drive React through
 * `createRoot` and `act` directly. Matching the sibling suites rather than adding a dependency.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../../services/agentDomainApi', () => ({
  fetchMyDomains: jest.fn(),
  fetchMyChangeRequests: jest.fn(),
  fetchAllChangeRequests: jest.fn(),
  fileChangeRequest: jest.fn(),
  decideChangeRequest: jest.fn(),
  CHANGE_REQUEST_TITLE_MAX: 140,
  CHANGE_REQUEST_DESCRIPTION_MAX: 4000,
  DECLINED_REASON_MAX: 1000,
  // Mirrors the real one. A mock that always returned the fallback would make the "server's own
  // words" test pass vacuously.
  errorMessage: (e: unknown, fallback: string) => (
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
  ),
}));

/**
 * AF11.11. The tool form is covered by its own suite; here it is stubbed so this page's tests stay
 * about the page. Stubbed rather than left real because the real one fetches a capability list and
 * an actor roster on mount, which this suite has no reason to describe.
 */
jest.mock('../../../components/admin/toolRequest/ToolRequestForm', () => ({
  __esModule: true,
  default: ({ domainKey }: { domainKey: string }) => (
    <div data-testid="tool-request-form-stub">{`tool form for ${domainKey}`}</div>
  ),
}));

jest.mock('../../../components/admin/shell', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionCard: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <section><h2>{title}</h2>{children}</section>
  ),
}));

import AdminChangeRequestsPage from '../AdminChangeRequestsPage';
import * as api from '../../../services/agentDomainApi';

const mocked = api as unknown as Record<string, jest.Mock>;

const CR = (over: Record<string, unknown> = {}) => ({
  id: 'cr-1',
  domain_key: 'platform-automation',
  title: 'Let an intern rename their own agent',
  description: 'The UUID is unreadable.',
  status: 'submitted',
  requested_by_identity: 'ruth@colaberry.com',
  requested_at: '2026-10-29T08:00:00Z',
  approved_by_identity: null,
  approved_at: null,
  declined_reason: null,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<AdminChangeRequestsPage />);
  });
  // Let the two settled promise chains flush.
  await act(async () => { await Promise.resolve(); });
}

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  jest.clearAllMocks();
});

beforeEach(() => {
  mocked.fetchMyDomains.mockResolvedValue({ domains: [{ domain_key: 'platform-automation' }] });
  mocked.fetchMyChangeRequests.mockResolvedValue([]);
  mocked.fetchAllChangeRequests.mockRejectedValue({ response: { status: 403 } });
});

const text = () => container.textContent ?? '';

/**
 * Type into a CONTROLLED input.
 *
 * Setting `el.value` directly and firing `input` does not work: React keeps its own value tracker,
 * sees no change, never calls `onChange`, and re-renders the field with the old state. The symptom
 * is subtle and cost a CI round trip here — the error message under test rendered correctly (the
 * mock rejects regardless of input) while the field read as empty, so the failure looked like the
 * page discarding the text rather than the test never entering it.
 *
 * Going through the prototype's value setter is what the sibling suite does, for the same reason.
 */
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * AF11.11. Pick the change path, which is now a CHOICE rather than the only thing on the page.
 *
 * Neither path is pre-selected, deliberately: defaulting to `change` would mean the tool path is
 * only ever found by somebody who already knew it existed, which is how this page shipped with the
 * API accepting tool requests and nothing able to send one.
 */
async function chooseChange() {
  const radio = container.querySelector('#cr-kind-change') as HTMLInputElement;
  await act(async () => { radio.click(); });
}

/**
 * The change-request form, found by the field it owns rather than by DOM position.
 *
 * `querySelector('form')` is not safe here: `AddCapabilityFrontDoor` renders a form of its own, and
 * it now sits BEFORE this one. It used to sit inside it, which was a `<form>` nested in a `<form>`
 * and is not valid HTML. Selecting by position would have quietly started submitting the front
 * door instead, which is exactly what happened when the two became siblings.
 */
function changeForm(): HTMLFormElement {
  const title = container.querySelector('#cr-title');
  const form = title?.closest('form');
  if (!form) throw new Error('the change form is not rendered');
  return form as HTMLFormElement;
}

describe('who sees the decision queue', () => {
  it('THE INTERN VIEW: no queue at all when the admin-only read is refused', async () => {
    await render();
    expect(text()).toContain('Ask for something');
    expect(text()).toContain('Your requests');
    // The section heading, the buttons, and the copy must all be absent.
    expect(text()).not.toContain('Decide');
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
    expect([...container.querySelectorAll('button')].map((b) => b.textContent))
      .not.toContain('Approve');
  });

  it('a 403 on the queue is NOT shown as an error', async () => {
    await render();
    // "Could not load" would tell an intern the page is broken when it is working exactly as
    // designed.
    expect(text()).not.toContain('Could not load change requests');
    expect(container.querySelector('.alert-danger')).toBeNull();
  });

  it('THE ADMIN VIEW: the queue renders when the API returns it', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([CR()]);
    await render();
    expect(text()).toContain('Decide');
    expect([...container.querySelectorAll('button')].map((b) => b.textContent))
      .toContain('Approve');
  });

  it('says plainly that approving starts no work', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([CR()]);
    await render();
    // A button labelled "Approve" invites the reader to assume a build follows. It does not.
    expect(text()).toContain('does not start any work');
  });
});

describe('the three states are kept distinct', () => {
  it('shows a real failure as a failure', async () => {
    mocked.fetchMyChangeRequests.mockRejectedValue({ response: { data: { error: 'The database is unreachable.' } } });
    await render();
    expect(container.querySelector('.alert-danger')).not.toBeNull();
    expect(text()).toContain('The database is unreachable.');
  });

  it('owning no domain is an explanation, not an error or a spinner', async () => {
    mocked.fetchMyDomains.mockResolvedValue({ domains: [] });
    await render();
    expect(text()).toContain('no domain is assigned to you');
    expect(container.querySelector('.alert-danger')).toBeNull();
  });

  it('having filed nothing is a sentence, not an empty box', async () => {
    await render();
    expect(text()).toContain('You have not filed any yet.');
  });
});

describe('a decided request shows who decided it and when', () => {
  it('names the approving human and the timestamp, which is the acceptance criterion', async () => {
    mocked.fetchMyChangeRequests.mockResolvedValue([CR({
      status: 'approved',
      approved_by_identity: 'ali@colaberry.com',
      approved_at: '2026-10-29T14:30:00Z',
    })]);
    await render();
    expect(text()).toContain('Approved by');
    expect(text()).toContain('ali@colaberry.com');
    // Central, written out, because every time in this product is Central.
    expect(text()).toContain('CT');
  });

  it('shows a decline reason, so the person who filed it can read why', async () => {
    mocked.fetchMyChangeRequests.mockResolvedValue([CR({
      status: 'declined',
      approved_by_identity: 'ali@colaberry.com',
      approved_at: '2026-10-29T14:30:00Z',
      declined_reason: 'Out of scope this quarter.',
    })]);
    await render();
    expect(text()).toContain('Out of scope this quarter.');
  });
});

describe('refusals are rendered in the server’s own words', () => {
  it('shows a 409 refusal verbatim when a decision is not allowed to stand', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([CR()]);
    mocked.decideChangeRequest.mockRejectedValue({
      response: {
        status: 409,
        data: { error: 'The person who filed a change request cannot be the person who approves it.' },
      },
    });
    await render();
    const approve = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Approve')!;
    await act(async () => { approve.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).toContain('cannot be the person who approves it');
  });

  it('keeps the filing form filled after a refusal, so a one-character fix is not a retype', async () => {
    mocked.fileChangeRequest.mockRejectedValue({
      response: { data: { error: 'A title needs at least one letter.' } },
    });
    await render();
    await chooseChange();
    const input = container.querySelector('#cr-title') as HTMLInputElement;
    await type(input, '...');
    // The text really is in the field before we submit, or the assertion below would pass for the
    // wrong reason - an empty field "retaining" nothing.
    expect((container.querySelector('#cr-title') as HTMLInputElement).value).toBe('...');
    const form = changeForm();
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).toContain('A title needs at least one letter.');
    expect((container.querySelector('#cr-title') as HTMLInputElement).value).toBe('...');
  });
});

describe('AF11.11 — the tool path has a door, and it is not the default', () => {
  it('OFFERS BOTH, and preselects neither', async () => {
    await render();
    const change = container.querySelector('#cr-kind-change') as HTMLInputElement;
    const tool = container.querySelector('#cr-kind-tool') as HTMLInputElement;
    expect(change).not.toBeNull();
    expect(tool).not.toBeNull();
    // Defaulting to `change` is what kept the tool path invisible: the API has accepted
    // `kind: 'tool'` since AF7.1 and this page never sent it.
    expect(change.checked).toBe(false);
    expect(tool.checked).toBe(false);
    // And no form is showing yet, so neither path is entered by accident.
    expect(container.querySelector('#cr-title')).toBeNull();
    expect(container.querySelector('[data-testid="tool-request-form-stub"]')).toBeNull();
  });

  it('choosing the tool path shows the scope sheet and NOT the one-line change form', async () => {
    await render();
    const tool = container.querySelector('#cr-kind-tool') as HTMLInputElement;
    await act(async () => { tool.click(); });
    expect(container.querySelector('[data-testid="tool-request-form-stub"]')).not.toBeNull();
    expect(container.querySelector('#cr-title')).toBeNull();
  });

  it('choosing the change path shows the change form and NOT the scope sheet', async () => {
    await render();
    await chooseChange();
    expect(container.querySelector('#cr-title')).not.toBeNull();
    expect(container.querySelector('[data-testid="tool-request-form-stub"]')).toBeNull();
  });

  it('hands the tool form the domain, so it reads the right capability list', async () => {
    await render();
    const tool = container.querySelector('#cr-kind-tool') as HTMLInputElement;
    await act(async () => { tool.click(); });
    expect(text()).toContain('tool form for platform-automation');
  });

  it('says what the scope sheet is for, so the longer form is not a surprise', async () => {
    await render();
    expect(text()).toContain('lets an agent');
  });

  it('does not nest the front door’s form inside the request form', async () => {
    await render();
    await chooseChange();
    // `AddCapabilityFrontDoor` renders a form, and it used to be rendered INSIDE
    // `<form onSubmit={onFile}>`. A form nested in a form is not valid HTML, and it also meant
    // the two submit buttons lived in the same form element.
    const forms = [...container.querySelectorAll('form')];
    expect(forms.length).toBeGreaterThanOrEqual(2);
    for (const form of forms) {
      expect(form.querySelector('form')).toBeNull();
    }
  });

  it('asks for the domain BEFORE the choice, because both paths need one', async () => {
    mocked.fetchMyDomains.mockResolvedValue({ domains: [] });
    await render();
    // With no domain there is nothing to ask against, so neither path is offered.
    expect(container.querySelector('#cr-kind-tool')).toBeNull();
    expect(text()).toContain('no domain is assigned to you');
  });
});

describe('the limits come from the API module, never guessed in the page', () => {
  it('bounds the title input with the shared constant', async () => {
    await render();
    await chooseChange();
    const input = container.querySelector('#cr-title') as HTMLInputElement;
    // If the page hardcoded a different number, an intern could type what the server refuses.
    expect(input.getAttribute('maxLength')).toBe(String(api.CHANGE_REQUEST_TITLE_MAX));
  });
});

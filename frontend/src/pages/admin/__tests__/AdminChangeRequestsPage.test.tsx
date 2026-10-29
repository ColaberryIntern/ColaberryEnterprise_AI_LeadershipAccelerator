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

describe('who sees the decision queue', () => {
  it('THE INTERN VIEW: no queue at all when the admin-only read is refused', async () => {
    await render();
    expect(text()).toContain('Ask for a change');
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
    const input = container.querySelector('#cr-title') as HTMLInputElement;
    await type(input, '...');
    // The text really is in the field before we submit, or the assertion below would pass for the
    // wrong reason - an empty field "retaining" nothing.
    expect((container.querySelector('#cr-title') as HTMLInputElement).value).toBe('...');
    const form = container.querySelector('form')!;
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).toContain('A title needs at least one letter.');
    expect((container.querySelector('#cr-title') as HTMLInputElement).value).toBe('...');
  });
});

describe('the limits come from the API module, never guessed in the page', () => {
  it('bounds the title input with the shared constant', async () => {
    await render();
    const input = container.querySelector('#cr-title') as HTMLInputElement;
    // If the page hardcoded a different number, an intern could type what the server refuses.
    expect(input.getAttribute('maxLength')).toBe(String(api.CHANGE_REQUEST_TITLE_MAX));
  });
});

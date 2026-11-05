/**
 * AF11.3 — the review console, and the four properties that carry real risk.
 *
 *   1. **All six field groups are on one screen.** The decision being made is whether an agent may
 *      act on the systems in WHERE, and that is only answerable next to WHAT FOR and HOW. A tab
 *      would let a grant be settled without blast radius ever being read.
 *   2. **The three duplicate-check states are three different things.** "Never checked",
 *      "could not check" and "compared against 57, nothing close" look identical as an empty list,
 *      and only one of them is a reason to approve.
 *   3. **Every refusal is shown.** The server answers 409 with a list; one reason per round trip
 *      teaches the reader to click again rather than to read.
 *   4. **Nothing on the page can grant anything.** No autonomy control, no tool-grant toggle.
 *      `assign_existing_tool` records an intent and AF11.4 performs the grant.
 *
 * TEST STYLE: this repo has no `@testing-library/react`; frontend suites drive React through
 * `createRoot` and `act` directly. Matching the sibling suites rather than adding a dependency.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../../services/agentDomainApi', () => ({
  fetchAllChangeRequests: jest.fn(),
  // Mirrors the real one. A mock that always returned the fallback would make the "server's own
  // words" assertions pass vacuously.
  errorMessage: (e: unknown, fallback: string) => (
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
  ),
}));

jest.mock('../../../services/toolRequestReviewApi', () => {
  const actual = jest.requireActual('../../../services/toolRequestReviewApi');
  return {
    ...actual,
    decideToolRequest: jest.fn(),
    fetchToolRequestDecisions: jest.fn(),
  };
});

jest.mock('../../../components/admin/shell', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionCard: ({ title, children }: { title?: React.ReactNode; children?: React.ReactNode }) => (
    <section><h2>{title}</h2>{children}</section>
  ),
  EmptyState: ({ title, description }: { title: string; description?: React.ReactNode }) => (
    <div><p>{title}</p><p>{description}</p></div>
  ),
}));

import AdminToolRequestReviewPage from '../AdminToolRequestReviewPage';
import * as api from '../../../services/agentDomainApi';
import * as review from '../../../services/toolRequestReviewApi';

const mocked = api as unknown as Record<string, jest.Mock>;
const mockedReview = review as unknown as Record<string, jest.Mock>;

const DETAIL = {
  agent_id: 'a1b2c3d4-0000-4000-8000-000000000001',
  domain_key: 'platform-automation',
  tool_name: 'read_community_feed',
  purpose: 'See what members posted today without opening Skool by hand',
  reads: ['community_posts', 'community_members'],
  produces: ['feed_digest'],
  capability_id: 'product_experience.CAP.daily_digest',
  task_unblocked: 'The daily digest the agent cannot write today',
  manual_today: 'Someone opens Skool and copies the posts into a doc',
  needed_by: '2026-11-20',
  run_frequency: 'daily',
  touches: ['skool', 'postgres'],
  inputs: ['community_id'],
  writes: false,
  side_effects: null,
  reversible: null,
  reversibility_note: null,
};

const CHECK = {
  checked_at: '2026-11-04T10:00:00Z',
  catalog_size: 57,
  catalog_absent: false,
  threshold: 0.2,
  candidates: [{
    tool_name: 'fetch_skool_posts',
    score: 0.5305,
    matched_fields: [{
      field: 'reads',
      detail: 'Both read community_posts.',
      tokens: ['community_posts'],
      coverage: 1,
    }],
  }],
  behaviorless_tools: ['legacy_ping'],
};

const REQ = (over: Record<string, unknown> = {}) => ({
  id: 'cr-tool-1',
  kind: 'tool',
  domain_key: 'platform-automation',
  title: 'My agent needs to read the community feed',
  description: null,
  status: 'submitted',
  requested_by_identity: 'mihret@colaberry.com',
  requested_at: '2026-11-03T09:00:00Z',
  approved_by_identity: null,
  approved_at: null,
  declined_reason: null,
  tool_request: DETAIL,
  duplicate_check: CHECK,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<AdminToolRequestReviewPage />);
  });
  // Let the queue read and the history read both settle.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  jest.clearAllMocks();
});

beforeEach(() => {
  mocked.fetchAllChangeRequests.mockResolvedValue([REQ()]);
  mockedReview.fetchToolRequestDecisions.mockResolvedValue([]);
});

const text = () => container.textContent ?? '';
const buttons = () => [...container.querySelectorAll('button')];
const buttonNamed = (label: string) => buttons().find((b) => b.textContent?.trim() === label);

async function click(el: Element | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

/**
 * Type into a CONTROLLED input.
 *
 * Setting `el.value` directly and firing `input` does not work: React keeps its own value tracker,
 * sees no change, never calls `onChange`, and re-renders the field with the old state. Going
 * through the prototype's value setter is what the sibling suite does, for the same reason.
 */
async function type(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

describe('PROPERTY 1 — all six field groups, on one screen', () => {
  it('renders every group, with nothing collapsed behind a tab', async () => {
    await render();
    for (const g of ['who', 'what', 'what_for', 'when', 'where', 'how']) {
      expect(container.querySelector(`[data-testid="facts-group-${g}"]`)).toBeTruthy();
    }
  });

  it('shows the blast-radius field itself, not a count of it', async () => {
    await render();
    // "2 systems" would let somebody approve without reading which two.
    expect(text()).toContain('skool');
    expect(text()).toContain('postgres');
  });

  it('shows what it reads, what it produces, and what is manual today', async () => {
    await render();
    expect(text()).toContain('community_posts');
    expect(text()).toContain('feed_digest');
    expect(text()).toContain('Someone opens Skool');
  });

  it('says "none — it does not write" rather than leaving the write fields blank', async () => {
    // A blank cell reads as "nothing to see here". `side_effects: null` on a read-only tool is a
    // fact, and a different one from a field nobody filled in.
    await render();
    expect(text()).toContain('none — it does not write');
  });

  it('says a tool request with no details cannot be judged, rather than showing an empty screen', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([REQ({ tool_request: null })]);
    await render();
    expect(text()).toContain('carries no details');
    expect(container.querySelector('[data-testid="facts-group-who"]')).toBeNull();
  });
});

describe('PROPERTY 2 — the three duplicate-check states are three different things', () => {
  it('a stored check with candidates names the MATCHED FIELD and the shared words', async () => {
    await render();
    expect(container.querySelector('[data-testid="candidate-fetch_skool_posts"]')).toBeTruthy();
    expect(text()).toContain('what it reads');
    expect(text()).toContain('Both read community_posts.');
    // The score is shown, but never on its own.
    expect(text()).toContain('0.53');
    expect(text()).toContain('advice, not a verdict');
  });

  it('NO CHECK STORED reads as "never checked", never as "no duplicates"', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([REQ({ duplicate_check: null })]);
    await render();
    expect(text()).toContain('never checked');
    expect(text()).not.toContain('Nothing close');
  });

  it('CATALOG ABSENT reads as "could not see the catalog", not as an empty result', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([REQ({
      duplicate_check: { ...CHECK, catalog_absent: true, candidates: [] },
    })]);
    await render();
    expect(text()).toContain('could not see the catalog');
    expect(text()).toContain('Treat this as unchecked');
  });

  it('A CHECK THAT FOUND NOTHING says what it compared against', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([REQ({
      duplicate_check: { ...CHECK, candidates: [] },
    })]);
    await render();
    expect(text()).toContain('Compared against 57 registered tools');
    expect(text()).toContain('Nothing close');
    expect(text()).not.toContain('never checked');
  });
});

describe('PROPERTY 3 — the four verbs, and every refusal', () => {
  it('offers exactly the four verbs', async () => {
    await render();
    for (const label of [
      'Approve to build', 'Deny', 'Assign an existing tool', 'Send back',
    ]) {
      expect(buttonNamed(label)).toBeTruthy();
    }
  });

  it('will not submit a denial until it carries a reason', async () => {
    await render();
    await click(buttonNamed('Deny'));
    const submit = buttons().find((b) => b.textContent?.includes('Record this decision'));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    const box = container.querySelector('#decision-reason') as HTMLTextAreaElement;
    await type(box, 'A tool already does this.');
    expect((buttons().find((b) => b.textContent?.includes('Record this decision')) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('a send-back names a FIELD, chosen from the ones the request has', async () => {
    await render();
    await click(buttonNamed('Send back'));
    const select = container.querySelector('#decision-missing-field') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const values = [...select.options].map((o) => o.value).filter(Boolean);
    expect(values).toContain('touches');
    expect(values).toContain('side_effects');
    // Not a free-text box: "needs more detail" gives the person nowhere to start.
    expect(values.length).toBeGreaterThan(10);
  });

  it('assigning an existing tool offers the candidates the matcher found', async () => {
    await render();
    await click(buttonNamed('Assign an existing tool'));
    const select = container.querySelector('#decision-tool') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toContain('fetch_skool_posts');
  });

  it('records the decision and takes the SERVER\'S status for the request', async () => {
    // `send_back` leaves it `submitted` on purpose, so a status computed on the client would be
    // wrong for one of the four verbs.
    mockedReview.decideToolRequest.mockResolvedValue({
      change_request_id: 'cr-tool-1', verb: 'send_back',
      decided_by_identity: 'ali@colaberry.com', decided_at: '2026-11-05T15:00:00Z',
      reason: null, missing_field: 'touches', assigned_tool_name: null,
      request_status: 'submitted',
    });
    await render();
    await click(buttonNamed('Send back'));
    await type(container.querySelector('#decision-missing-field') as HTMLSelectElement, 'touches');
    await click(buttons().find((b) => b.textContent?.includes('Record this decision')));
    expect(mockedReview.decideToolRequest).toHaveBeenCalledWith('cr-tool-1', {
      verb: 'send_back', missing_field: 'touches',
    });
    // Still decidable, because a send-back leaves the request open. Asserted on the panel's own
    // sentence rather than on "already been decided", which is a substring of the history
    // section's heading and would have passed or failed for the wrong reason.
    expect(text()).not.toContain('A second decision does not replace the first');
    expect(buttonNamed('Approve to build')).toBeTruthy();
  });

  it('SENDS the optional send-back note rather than dropping it', async () => {
    // The form offers the note, the contract accepts a reason on any verb, and the first draft
    // of the submit keyed `reason` off `deny` — so a note the person typed was read, trimmed and
    // then silently discarded.
    mockedReview.decideToolRequest.mockResolvedValue({
      change_request_id: 'cr-tool-1', verb: 'send_back',
      decided_by_identity: 'ali@colaberry.com', decided_at: '2026-11-05T15:00:00Z',
      reason: 'Name the systems.', missing_field: 'touches', assigned_tool_name: null,
      request_status: 'submitted',
    });
    await render();
    await click(buttonNamed('Send back'));
    await type(container.querySelector('#decision-missing-field') as HTMLSelectElement, 'touches');
    await type(container.querySelector('#decision-sendback-note') as HTMLTextAreaElement, 'Name the systems.');
    await click(buttons().find((b) => b.textContent?.includes('Record this decision')));
    expect(mockedReview.decideToolRequest).toHaveBeenCalledWith('cr-tool-1', {
      verb: 'send_back', missing_field: 'touches', reason: 'Name the systems.',
    });
  });

  it('shows EVERY reason a refused decision carries, not the first', async () => {
    mockedReview.decideToolRequest.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'Not a configured approver. You filed this request.',
          issues: [
            { rule: 'decider_not_an_approver', detail: 'You are not a configured approver.' },
            { rule: 'proposer_cannot_decide', detail: 'The person who filed it cannot decide it.' },
          ],
        },
      },
    });
    await render();
    await click(buttonNamed('Approve to build'));
    await click(buttons().find((b) => b.textContent?.includes('Record this decision')));
    expect(text()).toContain('You are not a configured approver.');
    expect(text()).toContain('The person who filed it cannot decide it.');
  });

  it('falls back to the server\'s sentence when a failure carried no issues', async () => {
    mockedReview.decideToolRequest.mockRejectedValue({
      response: { status: 500, data: { error: 'Could not record that decision.' } },
    });
    await render();
    await click(buttonNamed('Approve to build'));
    await click(buttons().find((b) => b.textContent?.includes('Record this decision')));
    expect(text()).toContain('Could not record that decision.');
  });

  it('FORGETS a reason typed for one request when another is selected', async () => {
    // Otherwise a denial reason written about request A sits in the box ready to be recorded
    // against request B.
    mocked.fetchAllChangeRequests.mockResolvedValue([
      REQ(),
      REQ({ id: 'cr-tool-2', title: 'Post the digest back to Skool' }),
    ]);
    await render();
    await click(buttonNamed('Deny'));
    await type(
      container.querySelector('#decision-reason') as HTMLTextAreaElement,
      'A tool already does this.',
    );
    await click(buttons().find((b) => b.textContent?.includes('Post the digest back to Skool')));
    // The verb is cleared too, so nothing is pre-selected against the new request.
    expect(container.querySelector('#decision-reason')).toBeNull();
    expect(text()).not.toContain('A tool already does this.');
  });

  it('a decided request offers no verbs at all', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([REQ({ status: 'approved' })]);
    await render();
    expect(text()).toContain('A second decision does not replace the first');
    expect(buttonNamed('Approve to build')).toBeFalsy();
  });
});

describe('PROPERTY 4 — nothing on this page grants anything', () => {
  it('has no autonomy control, no tool-grant toggle and no enable switch', async () => {
    await render();
    const html = container.innerHTML;
    for (const forbidden of ['autonomy', 'tools_granted', 'abac_mode', 'risk_tier']) {
      expect(html.toLowerCase()).not.toContain(forbidden);
    }
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });

  it('says plainly that recording a decision grants and builds nothing', async () => {
    await render();
    expect(text()).toContain('Nothing is granted or built by this');
  });

  it('calls an assignment an INTENT where it is recorded', async () => {
    mockedReview.fetchToolRequestDecisions.mockResolvedValue([{
      change_request_id: 'cr-tool-1', verb: 'assign_existing_tool',
      decided_by_identity: 'ali@colaberry.com', decided_at: '2026-11-05T15:00:00Z',
      reason: null, missing_field: null, assigned_tool_name: 'fetch_skool_posts',
      request_status: '',
    }]);
    await render();
    expect(text()).toContain('an intent, not a grant');
  });
});

describe('the decision history', () => {
  it('names the actor and the time on every decision', async () => {
    mockedReview.fetchToolRequestDecisions.mockResolvedValue([{
      change_request_id: 'cr-tool-1', verb: 'send_back',
      decided_by_identity: 'ali@colaberry.com', decided_at: '2026-11-04T15:00:00Z',
      reason: 'The blast radius is not stated.', missing_field: 'touches',
      assigned_tool_name: null, request_status: '',
    }]);
    await render();
    expect(text()).toContain('ali@colaberry.com');
    expect(text()).toContain('CT');
    expect(text()).toContain('The blast radius is not stated.');
  });

  it('calls out a request that has been sent back more than once', async () => {
    const back = (n: number) => ({
      change_request_id: 'cr-tool-1', verb: 'send_back',
      decided_by_identity: 'ali@colaberry.com',
      decided_at: `2026-11-0${n}T15:00:00Z`,
      reason: null, missing_field: 'touches', assigned_tool_name: null, request_status: '',
    });
    mockedReview.fetchToolRequestDecisions.mockResolvedValue([back(1), back(2), back(3)]);
    await render();
    expect(text()).toContain('sent back 3 times');
  });

  it('says a FAILED history read failed, rather than "nothing decided yet"', async () => {
    // Rendering one as the other would hide a decision somebody made.
    mockedReview.fetchToolRequestDecisions.mockRejectedValue({
      response: { data: { error: 'Could not load the decisions on this request.' } },
    });
    await render();
    expect(text()).toContain('Could not load the decisions');
    expect(text()).not.toContain('Nothing has been decided on this request yet');
  });
});

describe('who sees this queue', () => {
  it('a 403 reads as "not for you", never as a failure', async () => {
    mocked.fetchAllChangeRequests.mockRejectedValue({ response: { status: 403 } });
    await render();
    expect(text()).toContain('not for you');
    expect(container.querySelector('.alert-danger')).toBeNull();
  });

  it('a real failure is shown as one', async () => {
    mocked.fetchAllChangeRequests.mockRejectedValue({
      response: { status: 500, data: { error: 'Database is down.' } },
    });
    await render();
    expect(text()).toContain('Database is down.');
  });

  it('shows only TOOL requests, because the four verbs do not apply to a change request', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([
      REQ(),
      { ...REQ({ id: 'cr-change-1', title: 'Rename my agent' }), kind: 'change', tool_request: null },
    ]);
    await render();
    expect(text()).toContain('My agent needs to read the community feed');
    expect(text()).not.toContain('Rename my agent');
  });

  it('an empty queue says where tool requests come from', async () => {
    mocked.fetchAllChangeRequests.mockResolvedValue([]);
    await render();
    expect(text()).toContain('No tool requests');
  });
});

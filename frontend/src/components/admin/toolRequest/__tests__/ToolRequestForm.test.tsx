/**
 * AF11.11 — the form that files a tool request.
 *
 * Four properties are worth a test here, and they are the four that make a twenty-four-field form
 * survivable rather than abandoned:
 *
 *   1. it sends `kind: 'tool'` with a payload, which is the whole bug: the API has accepted tool
 *      requests since AF7.1 and nothing could send one
 *   2. lists are sent as ARRAYS even when empty, because the contract reads absent and empty
 *      differently and conflating them turns "reads nothing" into "did not say"
 *   3. a refusal lands on its FIELD and does not clear the form
 *   4. the two feature-exists answers render as a ROUTE, not as a red error
 *
 * TEST STYLE: this repo has no `@testing-library/react`; frontend suites drive React through
 * `createRoot` and `act` directly. Matching the sibling suites rather than adding a dependency.
 */

const mockFile = jest.fn();
const mockCaps = jest.fn();
const mockActors = jest.fn();

jest.mock('../../../../services/agentDomainApi', () => ({
  fileChangeRequest: (...a: unknown[]) => mockFile(...a),
  fetchMyDomainCapabilities: (...a: unknown[]) => mockCaps(...a),
  fetchActorRoster: (...a: unknown[]) => mockActors(...a),
  searchAgentDomainDatasets: jest.fn().mockResolvedValue({
    datasets: [], total_matched: 0, catalog_size: 10, catalog_absent: false,
  }),
  // Mirrors the real helpers. Stubs that returned nothing would make the refusal tests pass
  // vacuously.
  errorMessage: (e: unknown, fallback: string) => (
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
  ),
  toolRequestIssues: (e: unknown) => {
    const raw = (e as { response?: { data?: { issues?: unknown } } })?.response?.data?.issues;
    return Array.isArray(raw) ? raw : [];
  },
  CHANGE_REQUEST_TITLE_MAX: 140,
  TOOL_NAME_MAX: 120,
  TOOL_PURPOSE_MAX: 1000,
  TOOL_NARRATIVE_MAX: 1000,
  TOOL_SIDE_EFFECTS_MAX: 2000,
  TOOL_LIST_ITEM_MAX: 300,
  TOOL_LIST_MAX_ITEMS: 50,
  TOOL_ACTOR_MAX: 254,
  TOOL_RUN_FREQUENCIES: ['once', 'on_demand', 'per_event', 'hourly', 'daily', 'weekly', 'monthly', 'quarterly'],
  TOOL_ENVIRONMENTS: ['sandbox', 'production'],
  TOOL_PRODUCT_STATES: ['used_by_hand', 'exists_unused', 'not_built'],
}));

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ToolRequestForm from '../ToolRequestForm';

let container: HTMLDivElement;
let root: Root | null = null;
const onFiled = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockCaps.mockResolvedValue({
    capabilities: [
      {
        capability_id: 'marketing.landing_page.draft',
        name: 'Draft a landing page',
        classification: 'core',
        implementation_state: 'implemented',
        requirement_validation_state: 'draft',
        starting_autonomy: 'R0',
        max_permitted_autonomy: 'R2',
        human_decision: true,
      },
    ],
    capabilities_returned: 1,
    capability_total: 1,
  });
  mockActors.mockResolvedValue({
    actors: ['ali@colaberry.com', 'kes@colaberry.com'],
    roster_absent: false,
    note: 'The people we hold a record of.',
  });
  mockFile.mockResolvedValue({ id: 'cr-new', kind: 'tool', title: 'x' });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container.remove();
  root = null;
});

async function render(over: Partial<React.ComponentProps<typeof ToolRequestForm>> = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ToolRequestForm
        domainKey="marketing"
        agentId="11111111-1111-1111-1111-111111111111"
        agentDisplayName="Sohail"
        onFiled={onFiled}
        {...over}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

const text = () => container.textContent ?? '';

/** Type into a CONTROLLED input: React keeps its own value tracker, so `el.value =` is ignored. */
async function type(selector: string, value: string) {
  const el = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  if (!el) throw new Error(`no element for ${selector}`);
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(selector: string) {
  const el = container.querySelector(selector) as HTMLElement;
  if (!el) throw new Error(`no element for ${selector}`);
  await act(async () => { el.click(); });
}

async function submit() {
  const form = container.querySelector('form')!;
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

describe('THE BUG THIS FIXES: it files a TOOL request', () => {
  it('sends kind "tool" with a tool_request payload', async () => {
    await render();
    await type('#tr-tool-name', 'read_cron_registry');
    await submit();
    expect(mockFile).toHaveBeenCalledTimes(1);
    const sent = mockFile.mock.calls[0][0];
    // The field whose absence meant production held zero tool requests.
    expect(sent.kind).toBe('tool');
    expect(sent.tool_request).toBeDefined();
    expect(sent.tool_request.tool_name).toBe('read_cron_registry');
    expect(sent.domain_key).toBe('marketing');
  });

  it('carries the agent id, so the request names what would hold the tool', async () => {
    await render();
    await submit();
    expect(mockFile.mock.calls[0][0].tool_request.agent_id)
      .toBe('11111111-1111-1111-1111-111111111111');
  });

  it('hands the created request back, so the page can show it without a refetch', async () => {
    await render();
    await submit();
    expect(onFiled).toHaveBeenCalledWith({ id: 'cr-new', kind: 'tool', title: 'x' });
  });
});

describe('ABSENT IS NOT EMPTY: the five lists are always sent', () => {
  it('sends every list as an array even when nothing was typed', async () => {
    await render();
    await submit();
    const d = mockFile.mock.calls[0][0].tool_request;
    // `list(d.inputs) === null` refuses as `inputs_undeclared`, so omitting these would turn
    // "this tool reads nothing" into "you did not say what it reads".
    for (const field of ['reads', 'produces', 'read_datasets', 'touches', 'inputs']) {
      expect(Array.isArray(d[field])).toBe(true);
      expect(d[field]).toEqual([]);
    }
  });

  it('drops blank rows rather than filing them as answers', async () => {
    await render();
    // One real entry, then an added blank row left untouched.
    await type('#tr-touches', 'postgres');
    const add = [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Add another')!;
    await act(async () => { add.click(); });
    await submit();
    // `['postgres', '']` would file a blast radius of two systems, one of them nameless.
    expect(mockFile.mock.calls[0][0].tool_request.touches).toEqual(['postgres']);
  });
});

describe('the enums are omitted until chosen, never sent blank', () => {
  it('leaves the three enum keys out when nothing is selected', async () => {
    await render();
    await submit();
    const d = mockFile.mock.calls[0][0].tool_request;
    // An empty string would be a shape error reported as an invalid enum, where leaving the key
    // out lets the contract answer `*_missing` and name the field.
    expect('tried_in_product' in d).toBe(false);
    expect('run_frequency' in d).toBe(false);
    expect('environment' in d).toBe(false);
    expect('writes' in d).toBe(false);
  });

  it('sends them once chosen', async () => {
    await render();
    await click('#tr-tried-not_built');
    await click('#tr-env-production');
    await click('#tr-writes-no');
    await submit();
    const d = mockFile.mock.calls[0][0].tool_request;
    expect(d.tried_in_product).toBe('not_built');
    expect(d.environment).toBe('production');
    expect(d.writes).toBe(false);
  });
});

describe('a writing tool is asked more, and a reading one is not asked at all', () => {
  it('hides the side-effect questions until it writes', async () => {
    await render();
    expect(container.querySelector('#tr-side-effects')).toBeNull();
    await click('#tr-writes-no');
    expect(container.querySelector('#tr-side-effects')).toBeNull();
  });

  it('asks what it changes and whether it can be undone once it writes', async () => {
    await render();
    await click('#tr-writes-yes');
    expect(container.querySelector('#tr-side-effects')).not.toBeNull();
    expect(container.querySelector('#tr-reversible-yes')).not.toBeNull();
  });

  it('OMITS the three write-only fields for a read-only tool, rather than nulling them', async () => {
    await render();
    await click('#tr-writes-no');
    await submit();
    const d = mockFile.mock.calls[0][0].tool_request;
    // Omitted, NOT null. They are `.optional()` and not `.nullable()` in the schema, so an
    // explicit null is a shape error and every read-only request would be refused with a Zod
    // message about a field the builder never saw. `acceptToolRequest` stores the nulls itself:
    // `side_effects: writes ? text(d.side_effects) : null`.
    //
    // `backend/src/schemas/__tests__/agentToolRequestSchema.formPayload.test.ts` proves the
    // schema really does refuse the null, so this is pinned on both sides of the wire.
    expect('side_effects' in d).toBe(false);
    expect('reversible' in d).toBe(false);
    expect('reversibility_note' in d).toBe(false);
  });

  it('does NOT carry over what was typed before the answer changed to read-only', async () => {
    await render();
    await click('#tr-writes-yes');
    await type('#tr-side-effects', 'It deletes rows.');
    await click('#tr-writes-no');
    await submit();
    // Filing a side effect for a tool that has none would put a sentence on the approver's screen
    // describing a write that does not happen.
    expect('side_effects' in mockFile.mock.calls[0][0].tool_request).toBe(false);
  });

  it('sends the three fields on a WRITING tool, and omits a blank note', async () => {
    await render();
    await click('#tr-writes-yes');
    await type('#tr-side-effects', 'It disables a scheduled job.');
    await click('#tr-reversible-yes');
    await submit();
    const d = mockFile.mock.calls[0][0].tool_request;
    expect(d.side_effects).toBe('It disables a scheduled job.');
    expect(d.reversible).toBe(true);
    // The note is optional even on a writing tool, so a blank one is absent rather than ''.
    expect('reversibility_note' in d).toBe(false);
  });
});

describe('EVERY REFUSAL LANDS ON ITS FIELD', () => {
  const refuse = (issues: Array<{ rule: string; detail: string }>) => {
    mockFile.mockRejectedValue({ response: { status: 400, data: { error: 'Refused.', issues } } });
  };

  it('shows the sentence for a field, in the server’s own words', async () => {
    refuse([{ rule: 'purpose_missing', detail: 'A tool request has to say what it is for.' }]);
    await render();
    await submit();
    expect(text()).toContain('A tool request has to say what it is for.');
    expect(container.querySelector('[data-testid="issue-purpose_missing"]')).not.toBeNull();
  });

  it('shows a dozen refusals at once, each in its own place', async () => {
    refuse([
      { rule: 'tool_name_missing', detail: 'Name the tool.' },
      { rule: 'purpose_missing', detail: 'Say what it is for.' },
      { rule: 'acts_on_output_missing', detail: 'Name the person who acts on it.' },
      { rule: 'needed_by_missing', detail: 'Say when you need it.' },
      { rule: 'touches_missing', detail: 'List what it touches.' },
    ]);
    await render();
    await submit();
    for (const s of ['Name the tool.', 'Say what it is for.', 'Name the person who acts on it.',
      'Say when you need it.', 'List what it touches.']) {
      expect(text()).toContain(s);
    }
    expect(container.querySelectorAll('[data-testid^="issue-"]').length).toBe(5);
  });

  it('DOES NOT CLEAR THE FORM, so a one-character fix is not a retype of twenty-four fields', async () => {
    refuse([{ rule: 'needed_by_not_a_date', detail: 'A needed-by date looks like 2026-11-30.' }]);
    await render();
    await type('#tr-tool-name', 'read_cron_registry');
    await type('#tr-purpose', 'So the agent can tell which jobs are scheduled.');
    // Really in the fields before submitting, or the assertion below passes for the wrong reason.
    expect((container.querySelector('#tr-tool-name') as HTMLInputElement).value)
      .toBe('read_cron_registry');
    await submit();
    expect(text()).toContain('A needed-by date looks like');
    expect((container.querySelector('#tr-tool-name') as HTMLInputElement).value)
      .toBe('read_cron_registry');
    expect((container.querySelector('#tr-purpose') as HTMLTextAreaElement).value)
      .toBe('So the agent can tell which jobs are scheduled.');
  });

  it('shows an unmapped rule rather than swallowing it', async () => {
    refuse([{ rule: 'duplicate_open_request', detail: 'You already have one open for this.' }]);
    await render();
    await submit();
    expect(text()).toContain('You already have one open for this.');
  });

  it('falls back to the single sentence when a failure carries no named issues', async () => {
    mockFile.mockRejectedValue({ response: { data: { error: 'The database is unreachable.' } } });
    await render();
    await submit();
    expect(text()).toContain('The database is unreachable.');
  });

  it('does NOT also show a general failure when it has named issues to show', async () => {
    refuse([{ rule: 'purpose_missing', detail: 'Say what it is for.' }]);
    await render();
    await submit();
    // Two messages about one refusal reads as two problems.
    expect(text()).not.toContain('Could not file that request.');
  });
});

describe('THE TWO ANSWERS THAT ARE NOT FAULTS', () => {
  it('renders feature-exists as a route, with no red field', async () => {
    mockFile.mockRejectedValue({
      response: {
        status: 400,
        data: {
          error: 'Refused.',
          issues: [{
            rule: 'feature_exists_request_a_grant',
            detail: 'marketing.landing_page.draft already does this.',
          }],
        },
      },
    });
    await render();
    await submit();
    expect(container.querySelector('[data-testid="route-feature_exists_request_a_grant"]'))
      .not.toBeNull();
    expect(text()).toContain('This is a grant, not a build');
    // The server's own sentence is kept beside the route rather than replaced by it.
    expect(text()).toContain('marketing.landing_page.draft already does this.');
    // And nothing is marked wrong, because nothing the builder typed is.
    expect(container.querySelector('[data-testid^="issue-"]')).toBeNull();
  });

  it('PRE-EMPTS the route rather than spending a submit on it', async () => {
    await render();
    await click('#tr-tried-used_by_hand');
    // Said before submitting, so the builder learns the shorter request exists without a round
    // trip into a refusal.
    expect(text()).toContain('this is a grant, not a build');
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('tells somebody who has not tried the feature to use it first', async () => {
    await render();
    await click('#tr-tried-exists_unused');
    expect(text()).toContain('go and use it first');
  });

  it('says nothing of the kind once they confirm the app cannot do it', async () => {
    await render();
    await click('#tr-tried-not_built');
    expect(text()).not.toContain('this is a grant, not a build');
  });
});

describe('the pickers', () => {
  it('offers this domain’s capabilities, read from the per-domain endpoint', async () => {
    await render();
    expect(mockCaps).toHaveBeenCalledWith('marketing');
    const options = [...container.querySelectorAll('#tr-capability option')].map((o) => o.textContent);
    expect(options.join(' ')).toContain('marketing.landing_page.draft');
  });

  it('offers the people roster for the field that names a person', async () => {
    await render();
    const options = [...container.querySelectorAll('#tr-actor-list option')]
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain('ali@colaberry.com');
  });

  it('AN UNREADABLE CAPABILITY LIST reads as missing, never as "this domain has none"', async () => {
    mockCaps.mockRejectedValue({ response: { data: { error: 'The registry is unreadable.' } } });
    await render();
    expect(text()).toContain('The registry is unreadable.');
    // The distinction that matters: the gate refuses an id not on the roster, so a builder shown
    // an empty list would have nothing to pick and no idea why.
    expect(text()).toContain('missing rather than empty');
  });

  it('AN UNREADABLE PEOPLE ROSTER says so, and still lets them type', async () => {
    mockActors.mockResolvedValue({ actors: [], roster_absent: true, note: '' });
    await render();
    expect(text()).toContain('could not read the people record');
    // The field stays usable, or a database hiccup would block filing entirely.
    expect((container.querySelector('#tr-acts-on-output') as HTMLInputElement).disabled)
      .toBe(false);
  });

  it('says how many capabilities are shown of how many exist', async () => {
    mockCaps.mockResolvedValue({
      capabilities: [{
        capability_id: 'a.b', name: 'A', classification: 'core',
        implementation_state: 'absent', requirement_validation_state: 'draft',
        starting_autonomy: 'R0', max_permitted_autonomy: 'R1', human_decision: false,
      }],
      capabilities_returned: 1,
      capability_total: 213,
    });
    await render();
    // A picker showing 1 of 213 must say so rather than implying the domain has one.
    expect(text()).toContain('1 of 213');
  });
});

describe('a domain with no agent', () => {
  it('says so up front rather than after twenty-three fields are filled', async () => {
    await render({ agentId: null });
    expect(text()).toContain('no agent on record');
    expect(text()).toContain('would be refused');
  });

  it('omits agent_id rather than sending an empty one', async () => {
    await render({ agentId: null });
    await submit();
    expect('agent_id' in mockFile.mock.calls[0][0].tool_request).toBe(false);
  });
});

describe('what the form promises', () => {
  it('says filing starts no build and grants nothing', async () => {
    await render();
    expect(text()).toContain('does not start a build');
    expect(text()).toContain('does not grant anything');
  });

  it('renders all eight groups, in the review console’s order', async () => {
    await render();
    const groups = [...container.querySelectorAll('[data-testid^="form-group-"]')]
      .map((el) => el.getAttribute('data-testid'));
    expect(groups[0]).toBe('form-group-worth_building');
    expect(groups).toHaveLength(8);
  });

  it('bounds its inputs with the SHARED limits, not numbers typed into the form', async () => {
    await render();
    expect((container.querySelector('#tr-tool-name') as HTMLInputElement)
      .getAttribute('maxLength')).toBe('120');
    expect((container.querySelector('#tr-acts-on-output') as HTMLInputElement)
      .getAttribute('maxLength')).toBe('254');
  });

  it('has NO client-side required logic, because the server owns completeness', async () => {
    // Submitting an empty form reaches the API. If this form had its own required-field rules
    // there would be two definitions of a complete tool request, and the one the tests assert
    // would not be the one the API enforces.
    await render();
    await submit();
    expect(mockFile).toHaveBeenCalledTimes(1);
  });
});

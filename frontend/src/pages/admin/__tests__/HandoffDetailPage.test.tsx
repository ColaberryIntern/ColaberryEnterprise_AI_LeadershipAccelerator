import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HandoffDetailPage from '../HandoffDetailPage';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type { HandoffDetail, HandoffRow } from '../../../services/growthJourneyApi';

/**
 * The handoff detail page: the three moves, the 409, and the packet (Phase 6, T613).
 *
 * ── THE 409 IS THE MOST VALUABLE THING THIS PAGE SAYS ───────────────────────
 *
 * The state machine decides what is legal and answers an illegal move with the
 * status the row was actually in. "You cannot release a queued handoff, it is
 * queued" tells an operator what to do; a red "request failed" sends them to
 * Slack. So a conflict is asserted to render CALMLY and to carry `from`, and a
 * genuine fault is asserted to still render as an error - the two must not
 * collapse into one another in either direction.
 *
 * ── AND THE PACKET IS ASSERTED REDACTED, AGAINST THE PLAN'S CLAIM ───────────
 *
 * T613's spec says "the packet already carries no address". T612's privacy sweep
 * found the opposite: `GET /handoffs/:id` serves the `evidence` column whole, and
 * this repo's own access-suite fixtures seed it with `{ contact: 'lead@example.com' }`.
 * So the adversarial fixture below puts an address in the packet, in a talking
 * point and in a disposition reason, and the page is required to render none of
 * them. If the API is ever changed to scrub, these cells keep passing; if it is
 * not, they are the only thing standing between that column and the screen.
 */

jest.mock('../../../services/growthJourneyApi', () => ({
  getHandoff: jest.fn(),
  acceptHandoff: jest.fn(),
  dispositionHandoff: jest.fn(),
  releaseHandoff: jest.fn(),
  // Re-exported rather than mocked away: it is a pure predicate over an error
  // shape, and a stub would let a wrong `from` pass unnoticed.
  handoffConflict: jest.requireActual('../../../services/growthJourneyApi').handoffConflict,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyApi') as {
  getHandoff: jest.Mock;
  acceptHandoff: jest.Mock;
  dispositionHandoff: jest.Mock;
  releaseHandoff: jest.Mock;
  handoffConflict: (e: unknown) => unknown;
};

const ID = '30000000-0000-4000-8000-000000000001';

const row = (over: Partial<HandoffRow> = {}): HandoffRow => ({
  id: ID, tenant_id: 't-cola', brand_id: 'b-ent', program_id: 'p-1', subject_ref: 'lead:4711',
  lead_id: 4711, enrollment_id: null, decision_id: 'd-1', owner_queue: 'sales',
  assigned_to_type: 'human', assigned_to_id: 'staff-1', ticket_id: 'tk-1',
  assignment_blocked_reason: null, priority: 'high', expected_value: 2500, urgent: false,
  reason: 'commercial_state:PROPOSAL_SENT', best_channel: 'email', consent_basis: 'form',
  sla_due_at: '2026-10-02T00:00:00.000Z', status: 'queued', disposition: null,
  disposition_reason: null, disposition_at: null, dispositioned_by: null,
  return_to_ai: null, integration_refused: null, accepted_at: null, expired_at: null,
  source: 'decision_deferral', created_at: '2026-09-30T04:00:00.000Z',
  updated_at: '2026-09-30T04:00:00.000Z', qualification_gaps: null,
  talking_points: ['asked about invoicing'],
  ...over,
});

const detail = (over: Partial<HandoffDetail> = {}): HandoffDetail => ({
  handoff: row(),
  packet: { links: { person: '/admin/people/lead:4711' }, rank: 3 },
  ...over,
});

/** A 409 as axios delivers it: the machine's answer, not a transport failure. */
const conflict = (message: string, from: string) => ({
  response: { status: 409, data: { error: message, error_class: 'ValidationError', from } },
});

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/admin/growth-journey/handoffs/${ID}`]}>
        <Routes>
          <Route path="/admin/growth-journey/handoffs/:id" element={<HandoffDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');
const buttonNamed = (name: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(name));

async function click(name: string) {
  const el = buttonNamed(name);
  if (!el) throw new Error(`no button named ${name}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

/**
 * Type into a CONTROLLED input.
 *
 * Assigning `input.value` directly does not work: React 18 tracks the value
 * through a property descriptor on the prototype and treats a direct assignment
 * as no change, so the component's state never updates and the Disposition
 * button stays disabled. Going through the prototype's own setter is what makes
 * React see the edit. There is no @testing-library in this repo to do it for us.
 */
async function type(value: string) {
  const input = container.querySelector('input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // Implementations go HERE, never in the jest.mock factory: react-scripts sets
  // `resetMocks: true`, which strips a factory-supplied implementation before
  // every test and leaves the fetcher returning undefined.
  api.getHandoff.mockResolvedValue(detail());
  api.acceptHandoff.mockResolvedValue({ status: 'accepted' });
  api.dispositionHandoff.mockResolvedValue({ status: 'dispositioned' });
  api.releaseHandoff.mockResolvedValue({ status: 'queued' });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('the packet and the row', () => {
  it('renders the ids, counts and ranks', async () => {
    await render();
    expect(text()).toContain('lead:4711');
    expect(text()).toContain('sales');
    expect(text()).toContain('tk-1');
    expect(text()).toContain('rank');
  });

  it('renders an EMPTY packet as empty rather than as a blank panel', async () => {
    api.getHandoff.mockResolvedValue(detail({ packet: {} }));
    await render();
    expect(text()).toContain('The packet is empty');
  });
});

describe('no address reaches the screen, whatever the API served', () => {
  const poisoned = () =>
    detail({
      handoff: row({
        disposition_reason: 'follow up with cfo@bigco.com',
        talking_points: ['email lead@example.com before Friday'],
      }),
      packet: { contact: 'lead@example.com', note: 'cc someone@example.com', rank: 3 },
    });

  it('masks addresses from the packet, the talking points and the row', async () => {
    api.getHandoff.mockResolvedValue(poisoned());
    await render();
    expect(text()).not.toContain('@');
    expect(text()).toContain('[redacted]');
  });

  it('keeps the surrounding text, so the field is redacted and not dropped', async () => {
    // A page that deleted the whole value would also pass the assertion above
    // while losing the information an operator needs.
    api.getHandoff.mockResolvedValue(poisoned());
    await render();
    expect(text()).toContain('follow up with');
    expect(text()).toContain('before Friday');
    expect(text()).toContain('rank');
  });

  it('masks an address in a packet KEY, not only in a value', async () => {
    // THE DEFECT THIS CELL EXISTS FOR. The first version of this page passed every
    // packet VALUE through the mask and rendered the KEY raw - `<code>{k}</code>` -
    // directly beneath a caption claiming the packet was not trusted to be
    // address-free. T613's verifier moved the address out of a value and into a key
    // and it printed verbatim. The backend shares the blind spot: `noAddress.ts`
    // recurses Object.entries VALUES and never inspects a key.
    api.getHandoff.mockResolvedValue(detail({
      packet: { 'lead@example.com': 'contact', note: 'cc someone@example.com', rank: 3 },
    }));
    await render();
    expect(text()).not.toContain('@');
    // The other keys and values must survive, so this is a redaction and not a drop.
    expect(text()).toContain('note');
    expect(text()).toContain('rank');
    expect(text()).toContain('contact');
  });

  it('the KEY fixture really does carry an address - the needle exists', () => {
    // The positive control for the cell above. Without it that cell would pass
    // against a fixture whose key had quietly stopped containing an address.
    const keys = Object.keys({ 'lead@example.com': 'contact', note: 'x', rank: 3 });
    expect(keys.some((k) => k.includes('@'))).toBe(true);
  });

  it('the fixture really does carry addresses - the needle exists', () => {
    // The positive control. Without it both cells above would pass against a
    // fixture that had quietly stopped containing an address.
    expect(JSON.stringify(poisoned())).toContain('@');
  });
});

describe('the three moves', () => {
  it('accept calls the API and re-reads the row', async () => {
    await render();
    await click('Accept');
    expect(api.acceptHandoff).toHaveBeenCalledWith(ID);
    // Re-read, so the page shows the new status rather than the one it moved from.
    expect(api.getHandoff).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Accept recorded');
  });

  it('disposition is refused by the UI until a reason is given', async () => {
    await render();
    expect(buttonNamed('Disposition')?.hasAttribute('disabled')).toBe(true);
    await type('budget confirmed');
    expect(buttonNamed('Disposition')?.hasAttribute('disabled')).toBe(false);
    await click('Disposition');
    expect(api.dispositionHandoff).toHaveBeenCalledWith(ID, { disposition: 'qualified', reason: 'budget confirmed' });
  });

  it('release passes a reason when one was typed, and omits it when not', async () => {
    await render();
    await click('Release');
    expect(api.releaseHandoff).toHaveBeenCalledWith(ID, {});
    await type('not ours');
    await click('Release');
    expect(api.releaseHandoff).toHaveBeenLastCalledWith(ID, { reason: 'not ours' });
  });
});

describe('a 409 is an answer, not a failure', () => {
  it('shows the status the row was in, and does not read as an error', async () => {
    api.releaseHandoff.mockRejectedValue(conflict('handoff is queued; it cannot be released', 'queued'));
    await render();
    await click('Release');
    expect(text()).toContain('not legal from here');
    expect(text()).toContain('it cannot be released');
    // `from` is the useful half: it says what to do next.
    expect(text()).toContain('queued');
    expect(container.querySelector('.alert-danger')).toBeNull();
    expect(container.querySelector('.alert-warning')).not.toBeNull();
  });

  it('does NOT re-read the row, because nothing changed', async () => {
    api.acceptHandoff.mockRejectedValue(conflict('handoff is accepted; it cannot be accepted', 'accepted'));
    await render();
    await click('Accept');
    expect(api.getHandoff).toHaveBeenCalledTimes(1);
  });

  it('a genuine fault still renders as an error - the two do not collapse', async () => {
    // The other direction. A page that treated every failure as a conflict would
    // tell an operator their move was illegal when the server was down.
    api.acceptHandoff.mockRejectedValue({ response: { status: 500, data: { error: 'Handoff accept failed' } } });
    await render();
    await click('Accept');
    expect(container.querySelector('.alert-danger')).not.toBeNull();
    expect(text()).toContain('Handoff accept failed');
    expect(text()).not.toContain('not legal from here');
  });
});

describe('the mechanical accessibility rules', () => {
  it('pass on the loaded detail page', async () => {
    await render();
    expectNoA11yViolations(container, { expectH1: true });
  });

  it('pass with a conflict notice on screen', async () => {
    api.releaseHandoff.mockRejectedValue(conflict('handoff is queued; it cannot be released', 'queued'));
    await render();
    await click('Release');
    expectNoA11yViolations(container, { expectH1: true });
  });
});

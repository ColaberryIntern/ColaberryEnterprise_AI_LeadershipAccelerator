import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ControlsTab from '../ControlsTab';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type { ControlRow, ControlsResponse } from '../../../services/growthJourneyControlsApi';

/**
 * The controls tab: the only WRITE surface in the Growth Journey frontend
 * (Phase 6, T615).
 *
 * ── EVERY CELL NAMES THE MUTATION IT KILLS ──────────────────────────────────
 *
 * T613 and T614 produced five defects between them and every one was a check that
 * could not fail. So each cell below states the edit it catches. If the mutation
 * cannot be named, the cell is decoration.
 *
 * The plan's three named mutations are covered here and in the sibling
 * `growthJourneyControlsApi.test.ts`:
 *   M1 a null rate rendered as 0%  -> PerformanceTab's suite, not this one
 *   M2 the rollout form allows daily_limit 26
 *   M3 reason optional
 *
 * ── AND NOTHING HERE POSTS FOR REAL ─────────────────────────────────────────
 *
 * The whole controls client is mocked. A rollout to `limited` is the one control in
 * this system that moves it toward contacting a person, so a test that actually
 * called it would be a hard stop for this entire run, not a flaky suite.
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyControlsApi', () => {
  const actual = jest.requireActual('../../../services/growthJourneyControlsApi');
  return {
    // The constants and the pure helpers are REAL: they are the contract under
    // test, and stubbing them would let a wrong cap pass.
    PAUSE_CHANNELS: actual.PAUSE_CHANNELS,
    ROLLOUT_CHANNELS: actual.ROLLOUT_CHANNELS,
    ROLLOUT_MODES: actual.ROLLOUT_MODES,
    DAILY_LIMIT_MAX: actual.DAILY_LIMIT_MAX,
    COHORT_MAX: actual.COHORT_MAX,
    controlRefusal: actual.controlRefusal,
    rolloutBody: actual.rolloutBody,
    // Only the network calls are stubbed.
    listControls: jest.fn(),
    createPause: jest.fn(),
    clearPause: jest.fn(),
    createRollout: jest.fn(),
    clearRollout: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyControlsApi') as {
  listControls: jest.Mock;
  createPause: jest.Mock;
  clearPause: jest.Mock;
  createRollout: jest.Mock;
  clearRollout: jest.Mock;
};

const row = (over: Partial<ControlRow> = {}): ControlRow => ({
  id: 'c-1',
  tenant_id: 't-1',
  kind: 'pause',
  scope_key: 'brand:b-1|channel:email',
  brand_id: 'b-1',
  program_id: null,
  channel: 'email',
  subject_ref: null,
  mode: 'off',
  cohort_lead_ids: null,
  daily_limit: null,
  reason: 'deliverability review',
  set_by_admin_id: 'admin-42',
  created_at: '2026-10-01T08:00:00.000Z',
  cleared_at: null,
  cleared_by_admin_id: null,
  ...over,
});

const page = (over: Partial<ControlsResponse> = {}): ControlsResponse => ({
  controls: [row()],
  count: 1,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = async (props: Partial<React.ComponentProps<typeof ControlsTab>> = {}) => {
  await act(async () => { root.render(<ControlsTab {...props} />); });
};
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');
const byLabel = (label: string): HTMLInputElement | HTMLSelectElement => {
  const el = Array.from(container.querySelectorAll('label'))
    .find((l) => (l.textContent ?? '').startsWith(label));
  const id = el?.getAttribute('for');
  const field = id ? container.querySelector(`#${id}`) : null;
  if (!field) throw new Error(`no field labelled ${label}`);
  return field as HTMLInputElement | HTMLSelectElement;
};
/** React tracks a controlled value through a prototype descriptor. */
const type = async (field: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = field instanceof HTMLSelectElement
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(field, value);
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const button = (label: string): HTMLButtonElement => {
  const b = Array.from(container.querySelectorAll('button'))
    .find((x) => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`no button ${label}`);
  return b as HTMLButtonElement;
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.listControls.mockResolvedValue(page());
  api.createPause.mockResolvedValue({ id: 'new-1' });
  api.createRollout.mockResolvedValue({ id: 'new-2' });
  api.clearPause.mockResolvedValue({ id: 'c-1' });
  api.clearRollout.mockResolvedValue({ id: 'c-1' });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('the read has its own envelope', () => {
  // KILLS: reading `data.rows` instead of `data.controls`. That renders an empty
  // table on a system WITH controls - indistinguishable from a working screen on
  // one without, which is the worst failure this tab can have.
  it('renders rows from `controls`, not from `rows`', async () => {
    await render();
    expect(text()).toContain('brand:b-1|channel:email');
    expect(text()).toContain('deliverability review');
  });

  it('reads the controls SCOPED to the brand it was given', async () => {
    // The verifier's MV3: dropping `brand_id` from the call survived, so nothing
    // asserted this tab was brand-scoped at all.
    await render({ brandId: 'b-42' });
    expect(api.listControls).toHaveBeenCalledWith(expect.objectContaining({ brand_id: 'b-42' }));
  });

  it('reports `count` and says the read is not paged', async () => {
    // KILLS: a paging footer copied from the other tabs. There is no offset and the
    // read caps at 500, so a footer promising pages would be a lie.
    api.listControls.mockResolvedValue(page({ controls: [row(), row({ id: 'c-2' })], count: 2 }));
    await render();
    expect(text()).toContain('2 returned');
    expect(text()).toContain('not paged');
  });

  it('says plainly that nothing is in force when the list is empty', async () => {
    api.listControls.mockResolvedValue(page({ controls: [], count: 0 }));
    await render();
    expect(text()).toContain('No active controls in scope');
    expect(text()).toContain('every scope sits at whatever the flags make it');
  });

  it('distinguishes a cohort rollout from a pause in the cohort column', async () => {
    // KILLS: rendering `cohort_lead_ids.length` without the null guard, which
    // throws on every pause row, or rendering 0 for a pause - a pause has no
    // cohort, which is a different fact from a cohort of none.
    api.listControls.mockResolvedValue(page({
      controls: [
        row(),
        row({ id: 'c-2', kind: 'rollout', mode: 'limited', cohort_lead_ids: [1, 2, 3], daily_limit: 9 }),
      ],
      count: 2,
    }));
    await render();
    const body = container.querySelector('tbody')?.textContent ?? '';
    expect(body).toContain('not a cohort');
    expect(body).toContain('3 leads');
    expect(body).toContain('9/day');
  });

  it('says a clear is not an undo, because the word suggests otherwise', async () => {
    await render();
    expect(text()).toContain('does not undo what');
  });
});

describe('clearing routes to the right endpoint for the kind', () => {
  // KILLS: calling clearPause for every row. A rollout cleared through the pause
  // endpoint is a 404, and the row stays in force while the UI looks like it worked.
  it('a pause clears through the pause endpoint', async () => {
    await render();
    await act(async () => { button('Clear').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(api.clearPause).toHaveBeenCalledWith('c-1');
    expect(api.clearRollout).not.toHaveBeenCalled();
  });

  it('a rollout clears through the rollout endpoint', async () => {
    api.listControls.mockResolvedValue(page({
      controls: [row({ kind: 'rollout', mode: 'review' })],
    }));
    await render();
    await act(async () => { button('Clear').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(api.clearRollout).toHaveBeenCalledWith('c-1');
    expect(api.clearPause).not.toHaveBeenCalled();
  });
});

describe('NO CONTROL FORM SUBMITS WITHOUT A REASON - the plan asks for this by name', () => {
  // KILLS the plan's M3: `reason` made optional. A control with no stated reason is
  // an unexplained change to who the system may contact.
  it('the pause button is disabled until a reason is typed', async () => {
    await render({ brandId: 'b-1' });
    expect(button('Pause').disabled).toBe(true);
    expect(text()).toContain('A reason is required');
    await type(byLabel('Reason (required)'), 'deliverability');
    expect(button('Pause').disabled).toBe(false);
  });

  it('and a whitespace-only reason does not count as one', async () => {
    await render({ brandId: 'b-1' });
    await type(byLabel('Reason (required)'), '   ');
    expect(button('Pause').disabled).toBe(true);
  });

  it('the rollout button is disabled until a reason is typed', async () => {
    await render({ brandId: 'b-1', programId: 'p-1' });
    expect(button('Roll forward').disabled).toBe(true);
    const reasons = Array.from(container.querySelectorAll('label'))
      .filter((l) => (l.textContent ?? '').startsWith('Reason (required)'));
    // Two forms, two reason fields: fill the rollout one specifically.
    const rollId = reasons[1]?.getAttribute('for') ?? '';
    await type(container.querySelector(`#${rollId}`) as HTMLInputElement, 'piloting');
    expect(button('Roll forward').disabled).toBe(false);
  });

  it('and a whitespace-only reason does not count on the ROLLOUT form either', async () => {
    // The verifier's MV1: `reason.trim()` weakened to `reason.length` SURVIVED,
    // because only the PAUSE form had a whitespace cell while the plan names this
    // test for "no control form". Two forms, so two cells.
    await render({ brandId: 'b-1', programId: 'p-1' });
    await type(container.querySelector('#gj-roll-reason') as HTMLInputElement, '    ');
    expect(button('Roll forward').disabled).toBe(true);
    expect(api.createRollout).not.toHaveBeenCalled();
  });

  it('no write is attempted while a form is incomplete', async () => {
    await render();
    expect(api.createPause).not.toHaveBeenCalled();
    expect(api.createRollout).not.toHaveBeenCalled();
  });
});

describe('a pause must name a scope, because the wildcard pause is a kill switch', () => {
  // KILLS: dropping the `namesSomething` guard. The backend refuses an
  // all-wildcard pause in two places, and a UI that offers it teaches an operator
  // that the system has a second global kill switch. It has exactly one.
  it('stays disabled with a reason but no scope at all', async () => {
    await render();
    await type(byLabel('Reason (required)'), 'because');
    expect(button('Pause').disabled).toBe(true);
    expect(text()).toContain('Name a brand, programme, channel or subject');
  });

  it('enables once any ONE dimension is named', async () => {
    await render();
    await type(byLabel('Reason (required)'), 'because');
    await type(byLabel('Subject'), 'lead:4711');
    expect(button('Pause').disabled).toBe(false);
  });
});

describe('the rollout cannot start Ali outreach, which the pause form can stop', () => {
  // KILLS: ROLLOUT_CHANNELS replaced by PAUSE_CHANNELS. The API refuses it, but the
  // damage is the UI advertising that Ali's personal outreach can be STARTED here.
  it('offers ali_outreach as a pause channel', async () => {
    await render();
    const opts = Array.from(byLabel('Channel').querySelectorAll('option')).map((o) => o.getAttribute('value'));
    expect(opts).toContain('ali_outreach');
  });

  it('and never as a rollout channel', async () => {
    await render();
    const selects = Array.from(container.querySelectorAll('select'));
    // The rollout channel select is the one whose id names the rollout form.
    const rollChannel = selects.find((s) => s.id === 'gj-roll-channel');
    const opts = Array.from(rollChannel?.querySelectorAll('option') ?? []).map((o) => o.getAttribute('value'));
    expect(opts).toEqual(['email', 'in_app']);
    expect(opts).not.toContain('ali_outreach');
  });
});

describe('the daily limit is capped at 25 - the plan asks for this by name', () => {
  const fillRollout = async () => {
    await type(container.querySelector('#gj-roll-mode') as HTMLSelectElement, 'limited');
    await type(container.querySelector('#gj-roll-cohort') as HTMLInputElement, '4711');
    await type(container.querySelector('#gj-roll-reason') as HTMLInputElement, 'piloting');
  };

  // KILLS the plan's M2: DAILY_LIMIT_MAX raised to 26, or the client-side check
  // removed so a 26 reaches the API.
  it('refuses 26 and says why', async () => {
    await render({ brandId: 'b-1', programId: 'p-1' });
    await fillRollout();
    await type(container.querySelector('#gj-roll-limit') as HTMLInputElement, '26');
    expect(button('Roll forward').disabled).toBe(true);
    expect(text()).toContain('from 1 to 25');
    expect(api.createRollout).not.toHaveBeenCalled();
  });

  it('accepts 25', async () => {
    await render({ brandId: 'b-1', programId: 'p-1' });
    await fillRollout();
    await type(container.querySelector('#gj-roll-limit') as HTMLInputElement, '25');
    expect(button('Roll forward').disabled).toBe(false);
  });

  it('refuses 0 and a fraction too, not only the upper bound', async () => {
    await render({ brandId: 'b-1', programId: 'p-1' });
    await fillRollout();
    await type(container.querySelector('#gj-roll-limit') as HTMLInputElement, '0');
    expect(button('Roll forward').disabled).toBe(true);
    await type(container.querySelector('#gj-roll-limit') as HTMLInputElement, '2.5');
    expect(button('Roll forward').disabled).toBe(true);
  });

  it('a limited rollout with no cohort stays disabled', async () => {
    // The API refuses it; the form should not need the round trip to find out.
    await render({ brandId: 'b-1', programId: 'p-1' });
    await type(container.querySelector('#gj-roll-mode') as HTMLSelectElement, 'limited');
    await type(container.querySelector('#gj-roll-reason') as HTMLInputElement, 'piloting');
    await type(container.querySelector('#gj-roll-limit') as HTMLInputElement, '5');
    expect(button('Roll forward').disabled).toBe(true);
  });

  it('refuses a cohort over the cap of 50 and says the count', async () => {
    // The verifier's MV2: the FORM's cohort guard had no cell - only the constant's
    // value was pinned - so widening the comparison to 9999 survived.
    await render({ brandId: 'b-1', programId: 'p-1' });
    await type(container.querySelector('#gj-roll-mode') as HTMLSelectElement, 'limited');
    await type(container.querySelector('#gj-roll-reason') as HTMLInputElement, 'piloting');
    await type(container.querySelector('#gj-roll-limit') as HTMLInputElement, '5');
    await type(container.querySelector('#gj-roll-cohort') as HTMLInputElement,
      Array.from({ length: 51 }, (_, i) => String(i + 1)).join(','));
    expect(text()).toContain('51 usable ids');
    expect(text()).toContain('the cap is 50');
    expect(button('Roll forward').disabled).toBe(true);
  });

  it('accepts a cohort of exactly 50', async () => {
    await render({ brandId: 'b-1', programId: 'p-1' });
    await type(container.querySelector('#gj-roll-mode') as HTMLSelectElement, 'limited');
    await type(container.querySelector('#gj-roll-reason') as HTMLInputElement, 'piloting');
    await type(container.querySelector('#gj-roll-limit') as HTMLInputElement, '5');
    await type(container.querySelector('#gj-roll-cohort') as HTMLInputElement,
      Array.from({ length: 50 }, (_, i) => String(i + 1)).join(','));
    expect(button('Roll forward').disabled).toBe(false);
  });

  it('hides the cohort and limit fields on a review rollout', async () => {
    // KILLS: showing them on review. A review body carrying either is a 400, and a
    // visible field invites exactly that.
    await render({ brandId: 'b-1', programId: 'p-1' });
    expect(container.querySelector('#gj-roll-limit')).toBeNull();
    await type(container.querySelector('#gj-roll-mode') as HTMLSelectElement, 'limited');
    expect(container.querySelector('#gj-roll-limit')).not.toBeNull();
  });
});

describe('the server refusal is shown as sent', () => {
  // KILLS: swallowing `details`, or treating a 409 as an error. The 400 messages
  // ARE the cross-field rules in the operator's own words.
  it('renders a 400 with its field messages', async () => {
    api.createPause.mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'Invalid request', details: [{ path: 'reason', message: 'too short' }] },
      },
    });
    await render({ brandId: 'b-1' });
    await type(byLabel('Reason (required)'), 'x');
    await act(async () => { button('Pause').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(text()).toContain('The server refused this');
    expect(text()).toContain('too short');
  });

  it('renders a 409 as a conflict carrying the scope, not as a fault', async () => {
    api.createPause.mockRejectedValue({
      response: { status: 409, data: { error: 'Control already active', scope_key: 'brand:b-1' } },
    });
    await render({ brandId: 'b-1' });
    await type(byLabel('Reason (required)'), 'x');
    await act(async () => { button('Pause').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(text()).toContain('already has an active control');
    expect(text()).toContain('brand:b-1');
  });

  it('renders a business-rule 400 that carries NO details array', async () => {
    // The second 400 shape: `renderWriteFailure` sends the whole message in `error`.
    api.createPause.mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'a pause must name a brand, a programme, a channel or a subject', error_class: 'ScopeKeyError' },
      },
    });
    await render({ brandId: 'b-1' });
    await type(byLabel('Reason (required)'), 'x');
    await act(async () => { button('Pause').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(text()).toContain('must name a brand');
  });

  it('a 500 reads as a failure, not as a refusal', async () => {
    api.createPause.mockRejectedValue(new Error('Execution control create failed'));
    await render({ brandId: 'b-1' });
    await type(byLabel('Reason (required)'), 'x');
    await act(async () => { button('Pause').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(text()).toContain('Execution control create failed');
    expect(text()).not.toContain('already has an active control');
  });
});

describe('a successful write sends exactly the contract and reloads', () => {
  it('a pause sends only the named keys, because the body is .strict()', async () => {
    await render({ brandId: 'b-1' });
    await type(byLabel('Reason (required)'), 'deliverability');
    await act(async () => { button('Pause').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(api.createPause).toHaveBeenCalledWith(expect.objectContaining({
      brand_id: 'b-1', reason: 'deliverability',
    }));
    // and the list is re-read, because the table is the only honest answer about
    // what is actually in force
    expect(api.listControls).toHaveBeenCalledTimes(2);
  });

  it('a review rollout carries neither cohort nor limit', async () => {
    await render({ brandId: 'b-1', programId: 'p-1' });
    await type(container.querySelector('#gj-roll-reason') as HTMLInputElement, 'piloting');
    await act(async () => { button('Roll forward').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const sent = api.createRollout.mock.calls[0][0];
    expect(sent.mode).toBe('review');
    expect(sent.cohort_lead_ids).toBeUndefined();
    expect(sent.daily_limit).toBeUndefined();
  });
});

describe('the mechanical accessibility rules', () => {
  it('every data table carries thead.table-light with scoped column headers', async () => {
    await render();
    const tables = Array.from(container.querySelectorAll('table'));
    expect(tables.length).toBeGreaterThan(0);
    tables.forEach((t) => {
      expect(t.querySelector('thead')?.className ?? '').toContain('table-light');
      const cols = Array.from(t.querySelectorAll('thead th'));
      expect(cols.length).toBeGreaterThan(0);
      cols.forEach((th) => expect(th.getAttribute('scope')).toBe('col'));
    });
  });

  it('pass with controls and both forms on screen', async () => {
    await render();
    expectNoA11yViolations(container);
  });

  it('pass with no controls', async () => {
    api.listControls.mockResolvedValue(page({ controls: [], count: 0 }));
    await render();
    expectNoA11yViolations(container);
  });

  it('every form control has a real label', async () => {
    // Rule 6 accepts a bare placeholder as a name, which it should not, so this
    // asserts an actual `label[for]` for every field on the only writing screen.
    await render();
    const fields = Array.from(container.querySelectorAll('input, select'));
    expect(fields.length).toBeGreaterThan(0);
    fields.forEach((f) => {
      expect(f.id).toBeTruthy();
      expect(container.querySelector(`label[for="${f.id}"]`)).not.toBeNull();
    });
  });
});

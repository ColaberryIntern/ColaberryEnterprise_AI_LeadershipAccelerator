import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ManageInternDrawer from '../ManageInternDrawer';

/**
 * The Manage drawer — the console's only write surface.
 *
 * Almost everything here is about the asymmetry between the two kinds of action. `pause` and
 * `resume` have edges both ways, so a misclick costs one more click. `complete`, `withdraw` and
 * `remove` have **no outbound edges at all**: the application keeps its decision forever and coming
 * back means submitting a new one. So those three must be impossible to fire by accident, and the
 * tests below try to fire them by accident in every way available.
 */
const mockTransition = jest.fn();
jest.mock('../../../../services/adminInternConsoleApi', () => ({
  transitionIntern: (...a: unknown[]) => mockTransition(...a),
  ONE_WAY_ACTIONS: ['complete', 'withdraw', 'remove'],
}));

const row = (over: Record<string, unknown> = {}) => ({
  enrollment_id: 'enr-1',
  name: 'Sarbjit Kaur',
  email: null,
  application_state: 'active',
  application_id: 'app-1',
  joined_at: '2026-09-22T00:00:00.000Z',
  day: 10,
  cohort: { id: 'c-1', name: 'Explorer', type: 'explorer' },
  activity: { last_activity_at: null, last_activity_source: null, days_since: 1, level: 'yellow', days: [], graced: false },
  training: { weeks: [], weeks_completed: 0, weeks_1_3_clear: false, pace: null, pace_unavailable: null },
  cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
  project: null,
  ...over,
}) as any;

let container: HTMLDivElement;
let root: Root;
const onClose = jest.fn();
const onChanged = jest.fn();

const render = async (r: any = row()) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ManageInternDrawer row={r} onClose={onClose} onChanged={onChanged} />);
  });
};

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  jest.clearAllMocks();
});

const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label) as HTMLButtonElement;
const text = () => container.textContent ?? '';
const type = async (value: string) => {
  const input = container.querySelector('.aint-confirm input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => mockTransition.mockResolvedValue({ application_id: 'app-1', state: 'paused', action: 'pause' }));

describe('the reversible pair', () => {
  it('pauses an active intern in one click, with no confirmation', async () => {
    await render();

    await act(async () => { button('Pause').click(); });

    expect(mockTransition).toHaveBeenCalledWith('app-1', 'pause', expect.objectContaining({ confirm: undefined }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('offers Resume, not Pause, for a paused intern', async () => {
    // Offering both invites a transition the state machine will refuse anyway.
    await render(row({ application_state: 'paused' }));

    expect(button('Resume')).toBeTruthy();
    expect(button('Pause')).toBeFalsy();
  });

  it('sends the reason so the audit trail says why', async () => {
    await render();
    const reason = container.querySelector('.aint-field input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(reason, 'exam week');
      reason.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => { button('Pause').click(); });

    expect(mockTransition).toHaveBeenCalledWith('app-1', 'pause', expect.objectContaining({ reason: 'exam week' }));
  });

  it('sends no reason rather than an empty one', async () => {
    await render();

    await act(async () => { button('Pause').click(); });

    expect(mockTransition.mock.calls[0][2].reason).toBeUndefined();
  });
});

describe('the one-way three cannot be fired by accident', () => {
  it.each(['Mark complete', 'Withdraw', 'Remove'])('%s asks for confirmation instead of acting', async (label) => {
    await render();

    await act(async () => { button(label).click(); });

    expect(mockTransition).not.toHaveBeenCalled();
    expect(text()).toContain('cannot be undone');
  });

  it('keeps the confirm button disabled until the exact word is typed', async () => {
    await render();
    await act(async () => { button('Remove').click(); });

    const confirm = button('Yes, remove');
    expect(confirm.disabled).toBe(true);

    await type('rem');
    expect(button('Yes, remove').disabled).toBe(true);

    await type('Remove');          // wrong case is not the word
    expect(button('Yes, remove').disabled).toBe(true);

    await type('remove');
    expect(button('Yes, remove').disabled).toBe(false);
  });

  it('sends the typed word as the server-side confirmation, not a generated one', async () => {
    // The server demands `confirm === action`. If this component filled it in automatically the
    // typing would be theatre and the server check would be satisfied by a misclick.
    await render();
    await act(async () => { button('Withdraw').click(); });
    await type('withdraw');

    await act(async () => { button('Yes, withdraw').click(); });

    expect(mockTransition).toHaveBeenCalledWith('app-1', 'withdraw', expect.objectContaining({ confirm: 'withdraw' }));
  });

  it('cancels back to safety without acting', async () => {
    await render();
    await act(async () => { button('Remove').click(); });
    await type('remove');

    await act(async () => { button('Cancel').click(); });

    expect(mockTransition).not.toHaveBeenCalled();
    expect(container.querySelector('.aint-confirm')).toBeNull();
  });

  it('does not carry a typed word from one action to another', async () => {
    // Typing "remove", cancelling, then opening Withdraw must not leave Withdraw already armed.
    await render();
    await act(async () => { button('Remove').click(); });
    await type('remove');
    await act(async () => { button('Cancel').click(); });

    await act(async () => { button('Withdraw').click(); });

    expect(button('Yes, withdraw').disabled).toBe(true);
  });
});

describe('when the server refuses', () => {
  it('shows the server\'s own message rather than a generic failure', async () => {
    // "This application is completed and cannot be changed" tells a manager what to do next.
    mockTransition.mockRejectedValue({
      response: { data: { error: 'This application is completed and cannot be changed. Reapplying opens a new application.' } },
    });
    await render();

    await act(async () => { button('Pause').click(); });

    expect(text()).toContain('cannot be changed');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('falls back to a plain message when the server sends none', async () => {
    mockTransition.mockRejectedValue(new Error('network'));
    await render();

    await act(async () => { button('Pause').click(); });

    expect(text()).toContain('Could not change this status.');
  });
});

describe('controls that are not available', () => {
  it('renders Nudge and Note disabled, each saying why', async () => {
    await render();

    expect(button('Nudge').disabled).toBe(true);
    expect(button('Note').disabled).toBe(true);
    expect(button('Note').title).toContain('table that does not exist');
  });

  it('says there is nothing to manage when the intern has no application', async () => {
    await render(row({ application_id: null, application_state: null }));

    expect(text()).toContain('no application record');
    expect(button('Pause')).toBeFalsy();
  });

  it('gives every control an accessible name', async () => {
    await render();

    for (const el of Array.from(container.querySelectorAll('button'))) {
      const name = (el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('title');
      expect(name).toBeTruthy();
    }
  });
});

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Studio setup (D4, P4-01).
 *
 * The cases here are the ones the screen exists for: Create stays locked until four specific
 * decisions are made, a producer cannot be the presenter, a permanent choice demands an
 * acknowledgement, and every server refusal reaches the operator as a sentence rather than a
 * reason code.
 *
 * THE COLD-RENDER TEST IS THE LOAD-BEARING ONE. This screen opens in its own browser tab from
 * the admin nav, so it begins with no in-app state at all - a new tab IS a cold render. If
 * anything here needed a prior navigation to have happened, the whole new-tab design would be
 * broken and nothing else in this suite would notice.
 *
 * Mounted with createRoot and act rather than a testing library, because this repo has none and
 * adding a dependency for one screen is not a decision a screen gets to make.
 */

const mockGet = jest.fn();
const mockPatch = jest.fn();
jest.mock('../../../../services/studioSetupApi', () => {
  const actual = jest.requireActual('../../../../services/studioSetupApi');
  return {
    ...actual,
    getStudioConfig: (...a: unknown[]) => mockGet(...a),
    patchStudioConfig: (...a: unknown[]) => mockPatch(...a),
  };
});

import StudioSetupPage from '../StudioSetupPage';

const S = '11111111-1111-4111-8111-111111111111';

const config = (over: Record<string, unknown> = {}) => ({
  session: {
    id: S,
    title: 'Architecture day, week 3',
    cohort_id: 'c1',
    session_date: '2026-11-19',
    start_time: '14:00',
    end_time: '16:00',
  },
  presenter_enrollment_id: null,
  producer_enrollment_id: null,
  guest_access: null,
  occurrence: null,
  canSetAccessMode: true,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

/** Mounts the page the way a new browser tab does: a URL, and nothing else. */
async function renderCold(): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[`/admin/live/studio/${S}`]}>
        <Routes>
          <Route path="/admin/live/studio/:sessionId" element={<StudioSetupPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

const q = <T extends HTMLElement>(sel: string) => container.querySelector(sel) as T | null;
const all = (sel: string) => [...container.querySelectorAll(sel)];
const text = () => container.textContent || '';
const create = () => q<HTMLButtonElement>('[data-testid="cls-create"]')!;
const alertText = () => (q('[role="alert"]')?.textContent || '');

async function click(el: Element | null): Promise<void> {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** React tracks input value on the DOM node, so a plain .value set is not seen by onChange. */
async function type(sel: string, value: string): Promise<void> {
  const el = q<HTMLInputElement>(sel)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function check(sel: string): Promise<void> {
  const el = q<HTMLInputElement>(sel)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')!.set!;
  await act(async () => {
    setter.call(el, true);
    el.dispatchEvent(new Event('click', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(config());
  mockPatch.mockResolvedValue({ ok: true, config: config() });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('the cold render — the whole new-tab design depends on this', () => {
  it('renders the class from the URL alone, with no prior navigation', async () => {
    await renderCold();
    expect(text()).toContain('Architecture day, week 3');
    expect(mockGet).toHaveBeenCalledWith(S);
  });

  it('says so plainly when the class does not exist', async () => {
    mockGet.mockRejectedValue({ response: { status: 404 } });
    await renderCold();
    expect(text()).toMatch(/could not be found/i);
  });
});

describe('Create is locked until four decisions are made', () => {
  it('starts disabled, and shows WHICH four are missing', async () => {
    await renderCold();
    expect(create().disabled).toBe(true);
    const todo = all('[data-testid="cls-sum"]').filter((d) => /To do/.test(d.textContent || ''));
    expect(todo).toHaveLength(4);
  });

  it('unlocks only once all four read Done', async () => {
    await renderCold();

    await type('#cls-presenter', 'person-a');
    await type('#cls-producer', 'person-b');
    expect(create().disabled).toBe(true);

    await click(q('[data-testid="cls-aud-guests"]'));
    expect(create().disabled).toBe(true);

    await click(q('[data-testid="cls-mode-free"]'));
    expect(create().disabled).toBe(true);

    await check('#cls-ack');
    expect(create().disabled).toBe(false);
    expect(text()).not.toContain('To do');
  });

  it('blocks Create when the producer is the presenter, and says why', async () => {
    await renderCold();
    await type('#cls-presenter', 'same-person');
    await type('#cls-producer', 'same-person');
    await click(q('[data-testid="cls-aud-guests"]'));
    await click(q('[data-testid="cls-mode-free"]'));
    await check('#cls-ack');

    expect(alertText()).toMatch(/other than the presenter/i);
    expect(create().disabled).toBe(true);
  });
});

describe('the permanent choice', () => {
  it('warns that it cannot be changed, before it is made', async () => {
    await renderCold();
    expect(text()).toMatch(/cannot be changed from any screen afterwards/i);
  });

  it('locks the choice and names it once a broadcast exists', async () => {
    mockGet.mockResolvedValue(config({
      canSetAccessMode: false,
      occurrence: {
        id: 'occ-1', access_mode: 'paid', editorial_state: 'scheduled', version: 2,
        provider_session_id: 'input-1',
      },
    }));
    await renderCold();
    expect(q<HTMLButtonElement>('[data-testid="cls-mode-paid"]')!.disabled).toBe(true);
    expect(text()).toMatch(/cannot be changed here/i);
  });

  it('warns about a broadcast that will not play', async () => {
    // The 20 October finding: real, correctly timed, and unplayable. A screen that stays silent
    // lets a class reach air before anyone notices.
    mockGet.mockResolvedValue(config({
      canSetAccessMode: false,
      occurrence: {
        id: 'occ-1', access_mode: 'private', editorial_state: 'scheduled', version: 1,
        provider_session_id: null,
      },
    }));
    await renderCold();
    expect(text()).toMatch(/no live input/i);
  });
});

describe('refusals reach the operator as sentences', () => {
  const cases: Array<[string, RegExp]> = [
    ['no_room', /no room yet/i],
    ['already_aired', /already gone on air/i],
    ['cancelled', /cannot be put back on air/i],
    ['no_live_input', /no live input could be reserved/i],
    ['access_mode_is_permanent', /cannot be changed from any/i],
    ['version_conflict', /someone else changed this/i],
  ];

  it.each(cases)('renders %s as plain language, never the reason code', async (refusal, copy) => {
    mockPatch.mockResolvedValue({ ok: false, refusal, config: config() });
    await renderCold();
    await click(q('[data-testid="cls-save"]'));

    expect(alertText()).toMatch(copy);
    /*
     * No machine-readable code leaks into the sentence.
     *
     * Asserted as "no snake_case token" rather than "does not contain the reason string",
     * because `cancelled` is both a reason code AND the ordinary English word for what
     * happened - its sentence says "this broadcast was cancelled" and should. The thing that
     * must never reach a person is an identifier, and in this codebase an identifier is the
     * one with underscores in it.
     */
    expect(alertText()).not.toMatch(/[a-z]+_[a-z_]+/);
  });

  it('keeps the operator answers when the save does not happen at all', async () => {
    mockPatch.mockRejectedValue(new Error('network down'));
    await renderCold();

    await type('#cls-presenter', 'person-a');
    await click(q('[data-testid="cls-save"]'));

    expect(alertText()).toMatch(/did not save/i);
    // It never reports a success it did not get, and nothing typed is thrown away.
    expect(q<HTMLInputElement>('#cls-presenter')!.value).toBe('person-a');
  });
});

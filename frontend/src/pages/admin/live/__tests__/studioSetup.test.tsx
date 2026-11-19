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
/**
 * `searchStudioStaff` is stubbed for the reason the rest of this repo states about any child
 * that fetches: there is no global axios mock, so leaving it live would put a real request
 * inside every test here the moment the People card renders.
 */
const mockStaff = jest.fn();
/**
 * The admin api client, because Run this class posts through it. Unmocked it would be a real
 * request, and  would try to leave the test page.
 */
const mockApiPost = jest.fn();
/**
 * `GET /api/admin/me`, because the page asks it on mount whether this operator has a portal
 * account to cross into at all. Defaulted per test in `beforeEach`.
 */
const mockApiGet = jest.fn();
jest.mock('../../../../utils/api', () => ({
  __esModule: true,
  default: {
    post: (...a: unknown[]) => mockApiPost(...a),
    get: (...a: unknown[]) => mockApiGet(...a),
  },
}));
jest.mock('../../../../services/studioSetupApi', () => {
  const actual = jest.requireActual('../../../../services/studioSetupApi');
  return {
    ...actual,
    getStudioConfig: (...a: unknown[]) => mockGet(...a),
    patchStudioConfig: (...a: unknown[]) => mockPatch(...a),
    searchStudioStaff: (...a: unknown[]) => mockStaff(...a),
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

/**
 * Choose a person through the picker, the way an operator does: type, wait, click a name.
 *
 * Both fields used to be text boxes you pasted an enrollment id into, which is what these tests
 * did. They are a search now, so the test drives the search - otherwise it would be asserting
 * against a control the product no longer has.
 *
 * The wait is real: the picker debounces by 200ms so that typing a name does not open one
 * request per character.
 */
async function pick(which: string, id: string, name: string): Promise<void> {
  mockStaff.mockResolvedValue([{ enrollment_id: id, name, email: `${id}@colaberry.com` }]);
  await type(`[data-testid="search-${which}"]`, name.slice(0, 3));
  await act(async () => { await new Promise((r) => { setTimeout(r, 250); }); });
  await click(q(`[data-testid="option-${id}"]`)!);
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
  // The ordinary operator: an admin login with a portal account behind it.
  mockApiGet.mockResolvedValue({ data: { has_portal_account: true } });
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

    await pick('presenter', 'person-a', 'Ada Lovelace');
    await pick('producer', 'person-b', 'Grace Hopper');
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
    await pick('presenter', 'same-person', 'Ada Lovelace');
    await pick('producer', 'same-person', 'Ada Lovelace');
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

  /**
   * THE DEAD SAVE BUTTON, found on production on 18 November 2026 on a class airing the day
   * after.
   *
   * Create and Save changes are the same control, gated on all four checklist items. The
   * acknowledgement checkbox is only rendered while the access mode is still settable, and it
   * is settable only while no broadcast exists. So on every class that HAD a broadcast, the
   * fourth item sat on To do with no control attached to it anywhere on the page, and the
   * primary button was disabled for all time.
   *
   * The property these two pin is that the checklist can only ever ask for something the
   * operator can actually do.
   */
  it('does not demand an acknowledgement that has no checkbox left to tick', async () => {
    mockGet.mockResolvedValue(config({
      canSetAccessMode: false,
      occurrence: {
        id: 'occ-1', access_mode: 'free', editorial_state: 'scheduled', version: 2,
        provider_session_id: 'input-1',
      },
    }));
    await renderCold();

    // The control is genuinely absent, which is what made the old gate impossible to satisfy.
    expect(q('#cls-ack')).toBeNull();

    const permanence = all('[data-testid="cls-sum"]')
      .find((n) => /permanence/i.test(n.textContent || ''));
    expect(permanence).toBeDefined();
    expect(permanence!.textContent).not.toMatch(/to do/i);
  });

  it('lets an existing broadcast be edited and saved', async () => {
    // The pickers resolve the saved ids back to names on mount, so the lookup has to answer.
    mockStaff.mockResolvedValue([
      { enrollment_id: 'person-a', name: 'Ada Lovelace', email: 'ada@example.com' },
      { enrollment_id: 'person-b', name: 'Grace Hopper', email: 'grace@example.com' },
    ]);
    mockGet.mockResolvedValue(config({
      canSetAccessMode: false,
      presenter_enrollment_id: 'person-a',
      producer_enrollment_id: 'person-b',
      guest_access: true,
      occurrence: {
        id: 'occ-1', access_mode: 'free', editorial_state: 'scheduled', version: 2,
        provider_session_id: 'input-1',
      },
    }));
    await renderCold();

    expect(create().textContent).toMatch(/save changes/i);
    expect(create().disabled).toBe(false);
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

    await pick('presenter', 'person-a', 'Ada Lovelace');
    await click(q('[data-testid="cls-save"]'));

    expect(alertText()).toMatch(/did not save/i);
    /**
     * It never reports a success it did not get, and the operator's choice is not thrown away.
     *
     * Asserted on the PICKED row rather than on an input value, because the control changed:
     * once somebody is chosen the field shows their name, which is the whole point of the
     * picker. The property under test is unchanged - a failed save keeps the answer - and
     * checking the name is a stronger version of it, since a uuid surviving in a box would not
     * prove the screen still showed the right person.
     */
    expect(q('[data-testid="picked-presenter"]')).not.toBeNull();
    expect(q('[data-testid="picked-presenter"]')!.textContent).toContain('Ada Lovelace');
  });
});

/**
 * RUN THIS CLASS — the step that was missing between setting a class up and running it.
 *
 * The producer controls live on `/portal/live/:id`, a PARTICIPANT surface. Setting the class up
 * happens in admin. Those are two different sessions, so an operator who created a broadcast
 * and opened its page got the public viewer card - "This class has not started yet" - with no
 * hint that they were merely in the wrong session. That is what happened on production, and the
 * backend log confirmed the producer endpoint was never called at all.
 *
 * The assertions here are about the two halves of that: the button only exists once there is
 * something to run, and a failure says so rather than looking like a dead control.
 */
describe('crossing from setup into the producer view', () => {
  /** The page with a broadcast already created, which is when the button exists. */
  const withBroadcast = () => config({
    canSetAccessMode: false,
    occurrence: {
      id: 'occ-1', access_mode: 'free', editorial_state: 'scheduled', version: 2,
      provider_session_id: 'input-1',
    },
  });

  it('is NOT offered before the broadcast exists', async () => {
    // Nothing to run yet. A button that navigated to a producer page for a class with no
    // occurrence would land on the same viewer card it exists to avoid.
    await renderCold();
    expect(q('[data-testid="cls-run"]')).toBeNull();
  });

  it('appears once the class has a broadcast', async () => {
    mockGet.mockResolvedValue(withBroadcast());
    await renderCold();
    expect(q('[data-testid="cls-run"]')).not.toBeNull();
  });

  it('says so when the exchange fails, rather than doing nothing visible', async () => {
    // The reason this screen needed a button at all was a path that silently did not work.
    // A button that silently does not work would be the same failure with extra steps.
    mockApiPost.mockRejectedValue(new Error('no bridge'));
    mockGet.mockResolvedValue(withBroadcast());
    await renderCold();

    await click(q('[data-testid="cls-run"]')!);

    expect(q('[data-testid="cls-run-failed"]')).not.toBeNull();
    expect(alertText()).toMatch(/could not open the producer view/i);
  });

  it('keeps the setup reachable after a failed exchange', async () => {
    // The operator's work is saved; the only thing that failed is the hop. Losing the screen
    // would make a recoverable problem look like a lost configuration.
    mockApiPost.mockRejectedValue(new Error('no bridge'));
    mockGet.mockResolvedValue(withBroadcast());
    await renderCold();
    await click(q('[data-testid="cls-run"]')!);

    expect(q('[data-testid="cls-run"]')).not.toBeNull();
    expect(q('[data-testid="cls-create"]')).not.toBeNull();
  });

  /**
   * THE EXCHANGE AN OPERATOR CANNOT MAKE, found on production on 18 November 2026.
   *
   * The hop needs a staff portal account linked to the admin login, and most admin logins do
   * not have one: 8 of 50 on production, and the second super_admin is not among them. Pressing
   * the button as one of the other 42 returned a 403 and the generic "could not open" sentence,
   * which describes the symptom, blames nothing in particular, and leaves the operator pressing
   * it again.
   *
   * So the question is asked before the click, and only a definite no is acted on.
   */
  it('refuses up front when this admin login has no portal account to cross into', async () => {
    mockApiGet.mockResolvedValue({ data: { has_portal_account: false } });
    mockGet.mockResolvedValue(withBroadcast());
    await renderCold();

    expect(q<HTMLButtonElement>('[data-testid="cls-run"]')!.disabled).toBe(true);
    expect(q('[data-testid="cls-run-no-portal"]')).not.toBeNull();
    // It names the account, not the class. Nothing about the class is wrong.
    expect(text()).toMatch(/this admin login is not linked to one/i);
  });

  it('says nothing about accounts when the operator has one', async () => {
    mockGet.mockResolvedValue(withBroadcast());
    await renderCold();

    expect(q<HTMLButtonElement>('[data-testid="cls-run"]')!.disabled).toBe(false);
    expect(q('[data-testid="cls-run-no-portal"]')).toBeNull();
  });

  it('leaves the button live when the lookup itself fails', async () => {
    /*
     * Unknown is not no. Folding a failed lookup into "no portal account" would disable the
     * button for an operator whose bridge works, which is a worse failure than the one this
     * check exists to prevent: it blocks the show on the strength of a request that did not
     * answer.
     */
    mockApiGet.mockRejectedValue(new Error('me is down'));
    mockGet.mockResolvedValue(withBroadcast());
    await renderCold();

    expect(q<HTMLButtonElement>('[data-testid="cls-run"]')!.disabled).toBe(false);
    expect(q('[data-testid="cls-run-no-portal"]')).toBeNull();
  });
});

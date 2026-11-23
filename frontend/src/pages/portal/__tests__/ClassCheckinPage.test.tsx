import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The class check-in landing: the surface the room QR resolves to.
 *
 * 2026-11-23, Ali: "It should not be a login at all. They just put their name and email (could be
 * accessing from live stream and not have an account). ... When they login it should not send an
 * email. It should check them in and immediately start showing them how they look when they are
 * checked in to the class." So the page is name + email only, for everyone, and these tests pin:
 *   - no portal session is ever used (no join, no portalApi, no login link anywhere);
 *   - check-in goes straight to the live view, before class too, and keeps re-confirming until
 *     the class opens (that is what turns it into attendance);
 *   - the live loop (status, questions, votes) runs on the guest pass;
 *   - the 2026-08-20 incident (a phone that had lost the class and said nothing) stays fixed.
 *
 * Mocks are built inside the factories and read back through the typed import, because babel
 * hoists `jest.mock` above const declarations.
 */

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ sessionId: 'sess-1' }),
}));
jest.mock('../../../services/guestCheckinApi', () => ({
  __esModule: true,
  getCheckinInfo: jest.fn(),
  guestCheckin: jest.fn(),
  getGuestCompanionState: jest.fn(),
  guestVote: jest.fn(),
  guestPulse: jest.fn(),
  guestAsk: jest.fn(),
  guestRun: jest.fn(),
  guestChatList: jest.fn().mockResolvedValue([]),
  guestChatPost: jest.fn(),
  loadSavedGuest: jest.fn(),
  saveGuest: jest.fn(),
  forgetGuest: jest.fn(),
}));

import {
  getCheckinInfo, guestCheckin, getGuestCompanionState, guestPulse, guestAsk, guestVote, loadSavedGuest, saveGuest, guestChatList,
} from '../../../services/guestCheckinApi';
import { LIVE_PULSES } from '../../../components/portal/livePulse';
import ClassCheckinPage, { CHECKIN_TAB_TITLE } from '../ClassCheckinPage';

const mockInfo = getCheckinInfo as unknown as jest.Mock;
const mockCheckin = guestCheckin as unknown as jest.Mock;
const mockState = getGuestCompanionState as unknown as jest.Mock;
const mockPulse = guestPulse as unknown as jest.Mock;
const mockAsk = guestAsk as unknown as jest.Mock;
const mockVote = guestVote as unknown as jest.Mock;
const mockLoadSaved = loadSavedGuest as unknown as jest.Mock;
const mockSave = saveGuest as unknown as jest.Mock;

const INFO = {
  title: 'Week 12 - Build Day',
  session_date: '2026-10-15',
  start_time: '18:30:00',
  cohort_name: 'Cohort - July 2026',
  room_id: 'room-9',
};

const STATUS_STATE = { phase: 'status', title: 'Week 12', question: null, prompt: null, my_pulse: null };
const PROMPT_STATE = {
  phase: 'prompt', title: 'Week 12', question: null, my_pulse: null,
  prompt: { label: 'Build the dashboard', prompt: 'Create a dashboard that shows last month by region.', pasteWhere: 'Claude' },
};
const QUESTION_STATE = {
  phase: 'question', title: 'Week 12', prompt: null, my_pulse: null,
  question: { key: 'q1', kind: 'poll', q: 'Which ships first?', options: ['The schema', 'The UI'], answer: 0, revealed: false, my_choice: null },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockInfo.mockResolvedValue(INFO);
  mockCheckin.mockResolvedValue({ pass: 'pass-1', name: 'Ana Ruiz', matched: false, class_window: 'open' });
  mockState.mockResolvedValue(STATUS_STATE);
  mockPulse.mockResolvedValue(undefined);
  mockAsk.mockResolvedValue(undefined);
  mockVote.mockResolvedValue(undefined);
  mockLoadSaved.mockReturnValue(null);
  (guestChatList as unknown as jest.Mock).mockResolvedValue([]);
});

const flush = async () => {
  await act(async () => undefined);
  await act(async () => undefined);
};

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<ClassCheckinPage />);
  });
  await flush();
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
  jest.useRealTimers();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = () => container.textContent || '';
const click = async (id: string) => {
  await act(async () => { find(id)!.click(); });
  await flush();
};

async function typeInto(id: string, value: string) {
  const input = find(id) as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function checkIn(name = 'Ana Ruiz', email = 'ana@example.com') {
  await typeInto('checkin-guest-name', name);
  await typeInto('checkin-guest-email', email);
  await click('checkin-guest-submit');
}

/** Render, then check in: the state every live-loop test starts from. */
async function renderCheckedIn() {
  await render();
  await checkIn();
}

describe('name and email, never a login', () => {
  it('asks for name and email, then shows the live view straight away', async () => {
    await render();

    expect(find('checkin-guest-form')).not.toBeNull();
    expect(text()).toContain('No account or password needed');
    await checkIn();

    expect(mockCheckin).toHaveBeenCalledWith('sess-1', 'Ana Ruiz', 'ana@example.com');
    expect(mockSave).toHaveBeenCalledWith('sess-1', { pass: 'pass-1', name: 'Ana Ruiz', email: 'ana@example.com' });
    expect(text()).toContain('checked in, Ana');
    expect(find('pulse-grid')).not.toBeNull();
  });

  it('offers no way to log in, anywhere on the page', async () => {
    await render();
    expect(text().toLowerCase()).not.toContain('log in');
    expect(container.querySelector('a[href*="/portal/login"]')).toBeNull();
    await checkIn();
    expect(text().toLowerCase()).not.toContain('log in');
    expect(find('checkin-enter')).toBeNull();
  });

  it('wears Colaberry Training branding: tab title and footer', async () => {
    mockInfo.mockResolvedValue({ ...INFO, program_name: 'Forward Deployed AI Engineer Accelerator' });
    await render();

    expect(document.title).toBe(CHECKIN_TAB_TITLE);
    expect(find('checkin-foot')!.textContent).toBe('Colaberry Training · Forward Deployed AI Engineer Accelerator');
    expect(text()).not.toContain('Enterprise');
  });

  it('a device that checked in before goes straight back to the live view, without the form', async () => {
    mockLoadSaved.mockReturnValue({ pass: 'old', name: 'Ana Ruiz', email: 'ana@example.com' });
    await render();

    expect(mockCheckin).toHaveBeenCalledWith('sess-1', 'Ana Ruiz', 'ana@example.com');
    expect(find('checkin-guest-form')).toBeNull();
    expect(text()).toContain('checked in, Ana');
  });

  it("shows the server's reason when a check-in is refused", async () => {
    mockCheckin.mockRejectedValue({ response: { status: 410, data: { error: 'This class has already ended' } } });
    await render();
    await checkIn();

    expect(find('checkin-guest-error')!.textContent).toBe('This class has already ended');
  });

  it('will not submit without a name and a real-looking email', async () => {
    await render();
    await checkIn('Ana', 'not-an-email');

    expect(mockCheckin).not.toHaveBeenCalled();
    expect(find('checkin-guest-error')!.textContent).toContain('valid email');
  });

  it('a class closed to check-in says so, and still offers no login', async () => {
    mockInfo.mockResolvedValue({ ...INFO, accepts_guests: false });
    await render();

    expect(find('checkin-closed')).not.toBeNull();
    expect(find('checkin-guest-form')).toBeNull();
    expect(text().toLowerCase()).not.toContain('log in');
  });
});

describe('before and after the class', () => {
  const EARLY = { ...INFO, class_window: 'before', start_label: '6:30 PM CST' };

  it('BEFORE: checking in shows the live view at once, and says class starts soon', async () => {
    mockInfo.mockResolvedValue(EARLY);
    mockCheckin.mockResolvedValue({ pass: 'pass-1', name: 'Ana Ruiz', matched: false, class_window: 'before' });
    await render();

    expect(text()).toContain('6:30 PM CST');
    await checkIn();

    expect(text()).toContain('checked in, Ana');
    expect(find('pulse-grid')).not.toBeNull();
    expect(text()).toContain('Class starts soon');
  });

  it('BEFORE: keeps re-confirming each minute so the check-in becomes attendance once class opens', async () => {
    jest.useFakeTimers();
    mockInfo.mockResolvedValue(EARLY);
    mockCheckin.mockResolvedValue({ pass: 'pass-1', name: 'Ana Ruiz', matched: false, class_window: 'before' });
    await render();
    await checkIn();
    expect(mockCheckin).toHaveBeenCalledTimes(1);

    mockCheckin.mockResolvedValue({ pass: 'pass-1', name: 'Ana Ruiz', matched: true, class_window: 'open' });
    await act(async () => { jest.advanceTimersByTime(60 * 1000); });
    await flush();
    expect(mockCheckin).toHaveBeenCalledTimes(2);

    // Once the server says the class is open, it stops re-confirming.
    await act(async () => { jest.advanceTimersByTime(3 * 60 * 1000); });
    expect(mockCheckin).toHaveBeenCalledTimes(2);
  });

  it('AFTER: says the class has ended and records nothing', async () => {
    mockInfo.mockResolvedValue({ ...INFO, class_window: 'ended' });
    await render();

    expect(find('checkin-ended')).not.toBeNull();
    expect(find('checkin-guest-form')).toBeNull();
    expect(mockCheckin).not.toHaveBeenCalled();
  });
});

describe('when the class cannot be loaded', () => {
  it('says the link may be incomplete rather than crashing, and retries', async () => {
    mockInfo.mockRejectedValue(new Error('404'));
    await render();

    expect(text()).toContain('load this class');
    mockInfo.mockResolvedValue(INFO);
    await click('checkin-retry-load');

    expect(text()).toContain('Week 12 - Build Day');
  });
});

describe('the Builder pulse', () => {
  it('offers DOC 04 four states on the status screen', async () => {
    await renderCheckedIn();
    LIVE_PULSES.forEach(({ state }) => { expect(find(`pulse-${state}`)).not.toBeNull(); });
    expect(text()).toContain('Following');
  });

  it('OFFERS ALL FOUR IN BUILD MODE TOO', async () => {
    mockState.mockResolvedValue(PROMPT_STATE);
    await renderCheckedIn();

    expect(text()).toContain('Create a dashboard that shows last month by region.');
    LIVE_PULSES.forEach(({ state }) => { expect(find(`pulse-${state}`)).not.toBeNull(); });
  });

  it('sends the wire value on the guest pass, not the label', async () => {
    await renderCheckedIn();
    await click('pulse-here');

    expect(mockPulse).toHaveBeenCalledWith('sess-1', 'pass-1', 'here');
    expect(find('pulse-here')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the tap on screen even when the write fails', async () => {
    await renderCheckedIn();
    mockPulse.mockRejectedValue(new Error('offline'));
    await click('pulse-stuck');

    expect(find('pulse-stuck')!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('asking a question', () => {
  it('sends the question on the guest pass and clears the box', async () => {
    await renderCheckedIn();
    await typeInto('checkin-ask-input', 'how do I run that?');
    await click('checkin-ask-send');

    expect(mockAsk).toHaveBeenCalledWith('sess-1', 'pass-1', 'how do I run that?');
    expect((find('checkin-ask-input') as HTMLInputElement).value).toBe('');
  });

  it('POSTS ONCE when Enter is pressed twice', async () => {
    await renderCheckedIn();
    await typeInto('checkin-ask-input', 'does anyone else see this?');
    const input = find('checkin-ask-input') as HTMLInputElement;
    await act(async () => {
      const evt = () => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      input.dispatchEvent(evt());
      input.dispatchEvent(evt());
    });
    await flush();

    expect(mockAsk).toHaveBeenCalledTimes(1);
  });

  it('keeps the text in the box when the send fails', async () => {
    await renderCheckedIn();
    mockAsk.mockRejectedValue(new Error('offline'));
    await typeInto('checkin-ask-input', 'this took me a minute to write');
    await click('checkin-ask-send');

    expect((find('checkin-ask-input') as HTMLInputElement).value).toBe('this took me a minute to write');
  });
});

describe('answering what is on the instructor screen', () => {
  it('shows the live question and votes on the guest pass', async () => {
    mockState.mockResolvedValue(QUESTION_STATE);
    await renderCheckedIn();

    expect(text()).toContain('Which ships first?');
    await click('checkin-opt-1');
    expect(mockVote).toHaveBeenCalledWith('sess-1', 'pass-1', 'q1', 1);
  });

  it('takes no vote once the instructor has locked it', async () => {
    mockState.mockResolvedValue({ ...QUESTION_STATE, question: { ...QUESTION_STATE.question, theater: { state: 'locked' } } });
    await renderCheckedIn();

    expect((find('checkin-opt-0') as HTMLButtonElement).disabled).toBe(true);
    expect(text()).toContain('Voting locked');
  });
});

describe('the device that has lost the class (2026-08-20)', () => {
  it('says nothing after a single dropped request', async () => {
    jest.useFakeTimers();
    mockState.mockRejectedValue({ response: { status: 500 } });
    await renderCheckedIn();

    expect(find('checkin-link-warn')).toBeNull();
  });

  it('admits it is reconnecting after three, and clears it once the class comes back', async () => {
    jest.useFakeTimers();
    mockState.mockRejectedValue({ response: { status: 500 } });
    await renderCheckedIn();
    await act(async () => { jest.advanceTimersByTime(2500); });
    await act(async () => { jest.advanceTimersByTime(2500); });
    expect(text()).toContain('Reconnecting');

    mockState.mockResolvedValue(STATUS_STATE);
    await act(async () => { jest.advanceTimersByTime(2500); });
    expect(find('checkin-link-warn')).toBeNull();
  });

  it('an expired check-in asks for name and email again, never a login', async () => {
    jest.useFakeTimers();
    mockState.mockRejectedValue({ response: { status: 401 } });
    await renderCheckedIn();

    expect(text()).toContain('Check in again');
    expect(text().toLowerCase()).not.toContain('log in');
  });
});

describe('it looks like Colaberry', () => {
  it('drives its colors from semantic tokens, with thumb-sized status buttons', async () => {
    await render();
    const css = container.querySelector('style')?.textContent || '';

    expect(css).toContain('var(--surface-card)');
    expect(css).toContain('var(--text-body)');
    expect(css).toMatch(/\.cbck-status\{[^}]*min-height:/);
  });
});

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The class check-in landing — the first tests this file has ever had.
 *
 * WHY IT MATTERED THAT IT HAD NONE. This is the surface the room QR actually resolves to
 * (`broadcastSessionLinks.ts:47-49`, `sessionReminderEmail.ts:42-44`), so it is the single
 * highest-traffic live surface in the subsystem and the one a class cannot start without —
 * 615 untested lines carrying attendance, the sign-in round trip, the Builder pulse, polls,
 * Prompt Drops and the connection warning. `CompanionDeck`'s header says outright that its
 * logic was NOT extracted from here because doing it blind to no coverage was too risky. This
 * file is what removes that excuse.
 *
 * WHAT IS PINNED, IN PRIORITY ORDER: attendance is recorded exactly once; the sign-in round
 * trip carries the student back to this URL (without it the QR silently does nothing); the
 * pulse offers DOC 04's four states in BOTH controllers; a question cannot be double-posted;
 * and the 2026-08-20 incident — a phone that had lost the class and said nothing — stays
 * fixed in both directions.
 *
 * Mocks are built inside the factories and read back through the typed import, because babel
 * hoists `jest.mock` above const declarations.
 */

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ sessionId: 'sess-1' }),
  useNavigate: jest.fn(),
}));
jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../../contexts/ParticipantAuthContext', () => ({ useParticipantAuth: jest.fn() }));
jest.mock('../../../services/onboardingApi', () => ({
  __esModule: true,
  joinSession: jest.fn(),
  setSessionPulse: jest.fn(),
  askSessionQuestion: jest.fn(),
  getCompanionState: jest.fn(),
  submitPollResponse: jest.fn(),
}));
jest.mock('../../../services/pointsFx', () => ({ __esModule: true, emitPointsEarned: jest.fn() }));

import { useNavigate } from 'react-router-dom';
import portalApi from '../../../utils/portalApi';
import { useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import {
  joinSession, setSessionPulse, askSessionQuestion, getCompanionState, submitPollResponse,
} from '../../../services/onboardingApi';
import { emitPointsEarned } from '../../../services/pointsFx';
import { LIVE_PULSES } from '../../../components/portal/livePulse';
import ClassCheckinPage from '../ClassCheckinPage';

const mockUseNavigate = useNavigate as unknown as jest.Mock;
const mockGet = (portalApi as unknown as { get: jest.Mock }).get;
const mockAuth = useParticipantAuth as unknown as jest.Mock;
const mockJoin = joinSession as unknown as jest.Mock;
const mockPulse = setSessionPulse as unknown as jest.Mock;
const mockAsk = askSessionQuestion as unknown as jest.Mock;
const mockCompanion = getCompanionState as unknown as jest.Mock;
const mockPoll = submitPollResponse as unknown as jest.Mock;
const mockPoints = emitPointsEarned as unknown as jest.Mock;

const INFO = {
  title: 'Week 12 - Build Day',
  session_date: '2026-10-15',
  start_time: '18:30:00',
  cohort_name: 'Cohort - July 2026',
  room_id: 'room-9',
};

const STATUS_STATE = {
  phase: 'status', title: 'Week 12', question: null, prompt: null, my_pulse: null,
};

const PROMPT_STATE = {
  phase: 'prompt',
  title: 'Week 12',
  question: null,
  my_pulse: null,
  prompt: {
    label: 'Build the dashboard',
    prompt: 'Create a dashboard that shows last month by region.',
    pasteWhere: 'Claude Code',
    expectedResult: 'a chart appears',
    stopCondition: 'it errors twice',
  },
};

const QUESTION_STATE = {
  phase: 'question',
  title: 'Week 12',
  prompt: null,
  my_pulse: null,
  question: {
    key: 'q1', kind: 'poll', q: 'Which ships first?',
    options: ['The schema', 'The UI'], answer: 0, revealed: false, my_choice: null,
  },
};

let container: HTMLDivElement;
let root: Root;
let navigate: jest.Mock;

beforeEach(() => {
  navigate = jest.fn();
  mockUseNavigate.mockReturnValue(navigate);
  mockAuth.mockReturnValue({ isAuthenticated: true });
  mockGet.mockResolvedValue({ data: INFO });
  mockJoin.mockResolvedValue({ awarded: false, points: 0 });
  mockPulse.mockResolvedValue(undefined);
  mockAsk.mockResolvedValue(undefined);
  mockPoll.mockResolvedValue(undefined);
  mockCompanion.mockResolvedValue(STATUS_STATE);
});

/** Let the info → join → companion chain settle; it is three chained promises deep. */
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

async function typeQuestion(value: string) {
  const input = find('checkin-ask-input') as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function pressEnter() {
  const input = find('checkin-ask-input') as HTMLInputElement;
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true,
    }));
  });
}

describe('recording attendance', () => {
  it('checks the student in once, without being asked', async () => {
    // The whole point of the QR: scanning it IS the check-in. A student who has to press
    // something has already been failed by the scan.
    await render();

    expect(mockJoin).toHaveBeenCalledWith('sess-1', 'classroom');
    expect(mockJoin).toHaveBeenCalledTimes(1);
    expect(text()).toContain('checked in');
    expect(text()).toContain('Week 12 - Build Day');
  });

  it('fires the points burst only when the server says points were awarded', async () => {
    mockJoin.mockResolvedValue({ awarded: true, points: 25 });
    await render();

    expect(mockPoints).toHaveBeenCalledWith(25);
  });

  it('CONTROL: a re-scan awards nothing and fires no burst', async () => {
    // joinSession is idempotent server-side; a second scan re-confirms and awards 0.
    mockJoin.mockResolvedValue({ awarded: false, points: 0 });
    await render();

    expect(mockPoints).not.toHaveBeenCalled();
  });

  it('offers a way forward when recording attendance fails', async () => {
    // A failed check-in must never be a dead end: the class is still happening, and an
    // instructor can mark someone present by hand.
    mockJoin.mockRejectedValue(new Error('offline'));
    await render();

    expect(text()).toContain('couldn');
    expect(find('checkin-retry-join')).not.toBeNull();

    await click('checkin-enter-anyway');
    expect(navigate).toHaveBeenCalledWith('/portal/rooms/room-9');
  });

  it('retries the check-in on request', async () => {
    mockJoin.mockRejectedValue(new Error('offline'));
    await render();

    mockJoin.mockResolvedValue({ awarded: false, points: 0 });
    await click('checkin-retry-join');

    expect(find('checkin-enter')).not.toBeNull();
  });
});

describe('the student who is not signed in yet', () => {
  beforeEach(() => { mockAuth.mockReturnValue({ isAuthenticated: false }); });

  it('CARRIES THEM BACK HERE after sign-in', async () => {
    // Without the `next` parameter the magic-link round trip lands on /portal/today and the
    // attendance is never recorded — the QR looks like it did nothing, which is the exact
    // failure this page exists to prevent.
    await render();

    const href = find('checkin-login')!.getAttribute('href');
    expect(href).toBe('/portal/login?next=%2Fportal%2Fclass-checkin%2Fsess-1');
  });

  it('names the class so they know they scanned the right code', async () => {
    await render();

    expect(text()).toContain('Week 12 - Build Day');
    expect(text()).toContain('Cohort - July 2026');
    expect(text()).toContain('6:30 PM');
  });

  it('records no attendance for someone who is not signed in', async () => {
    await render();

    expect(mockJoin).not.toHaveBeenCalled();
  });
});

describe('when the class cannot be loaded', () => {
  it('says the link may be incomplete rather than crashing, and retries', async () => {
    mockGet.mockRejectedValue(new Error('404'));
    await render();

    expect(text()).toContain('load this class');
    expect(mockJoin).not.toHaveBeenCalled();

    mockGet.mockResolvedValue({ data: INFO });
    await click('checkin-retry-load');

    expect(text()).toContain('Week 12 - Build Day');
  });
});

describe('the Builder pulse', () => {
  it('offers DOC 04 four states on the status screen', async () => {
    await render();

    LIVE_PULSES.forEach(({ state }) => {
      expect(find(`pulse-${state}`)).not.toBeNull();
    });
    expect(text()).toContain('Following');
  });

  it('OFFERS ALL FOUR IN BUILD MODE TOO', async () => {
    // The regression this guards: Build Mode used to offer three and drop `here`, so during
    // the one segment where an instructor most needs to know who is merely following along,
    // there was no button for it — and a student who had already tapped it watched their own
    // status vanish from the grid when the instructor moved to a prompt.
    mockCompanion.mockResolvedValue(PROMPT_STATE);
    await render();

    expect(text()).toContain('Create a dashboard that shows last month by region.');
    LIVE_PULSES.forEach(({ state }) => {
      expect(find(`pulse-${state}`)).not.toBeNull();
    });
  });

  it('sends the wire value, not the label', async () => {
    // `here` is the value in the database CHECK constraint; "Following" is only what it says.
    await render();
    await click('pulse-here');

    expect(mockPulse).toHaveBeenCalledWith('sess-1', 'here');
    expect(find('pulse-here')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the tap on screen even when the write fails', async () => {
    await render();
    mockPulse.mockRejectedValue(new Error('offline'));
    await click('pulse-stuck');

    expect(find('pulse-stuck')!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('asking a question', () => {
  it('sends the question and clears the box', async () => {
    await render();
    await typeQuestion('how do I run that?');
    await click('checkin-ask-send');

    expect(mockAsk).toHaveBeenCalledWith('sess-1', 'how do I run that?');
    expect((find('checkin-ask-input') as HTMLInputElement).value).toBe('');
  });

  it('POSTS ONCE when Enter is pressed twice', async () => {
    // React batches, so two presses both read `qState === 'idle'` out of the same closure.
    // Nothing downstream deduplicates a question, so the instructor's deck showed it twice.
    await render();
    await typeQuestion('does anyone else see this?');

    const input = find('checkin-ask-input') as HTMLInputElement;
    await act(async () => {
      const evt = () => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      input.dispatchEvent(evt());
      input.dispatchEvent(evt());
    });
    await flush();

    expect(mockAsk).toHaveBeenCalledTimes(1);
  });

  it('will not send an empty box, or one holding only spaces', async () => {
    await render();
    expect((find('checkin-ask-send') as HTMLButtonElement).disabled).toBe(true);

    await typeQuestion('   ');
    await pressEnter();

    expect(mockAsk).not.toHaveBeenCalled();
  });

  it('keeps the text in the box when the send fails', async () => {
    await render();
    mockAsk.mockRejectedValue(new Error('offline'));
    await typeQuestion('this took me a minute to write');
    await click('checkin-ask-send');

    expect((find('checkin-ask-input') as HTMLInputElement).value)
      .toBe('this took me a minute to write');
  });
});

describe('answering what is on the instructor screen', () => {
  it('shows the live question and submits a tap', async () => {
    mockCompanion.mockResolvedValue(QUESTION_STATE);
    await render();

    expect(text()).toContain('Which ships first?');
    await click('checkin-opt-1');

    expect(mockPoll).toHaveBeenCalledWith('sess-1', 'q1', 1);
  });

  it('takes no vote once the answer is revealed', async () => {
    mockCompanion.mockResolvedValue({
      ...QUESTION_STATE,
      question: { ...QUESTION_STATE.question, revealed: true },
    });
    await render();

    expect((find('checkin-opt-0') as HTMLButtonElement).disabled).toBe(true);
  });

  it('takes no vote once the instructor has locked it', async () => {
    mockCompanion.mockResolvedValue({
      ...QUESTION_STATE,
      question: { ...QUESTION_STATE.question, theater: { state: 'locked' } },
    });
    await render();

    expect((find('checkin-opt-0') as HTMLButtonElement).disabled).toBe(true);
    expect(text()).toContain('Voting locked');
  });
});

describe('the phone that has lost the class (2026-08-20)', () => {
  it('says nothing after a single dropped request', async () => {
    // Venue wifi drops one request routinely. Warning on the first failure would train
    // students to ignore the warning.
    jest.useFakeTimers();
    mockCompanion.mockRejectedValue({ response: { status: 500 } });
    await render();

    expect(find('checkin-link-warn')).toBeNull();
  });

  it('admits it is reconnecting after three', async () => {
    // The incident: the poll swallowed every error and kept rendering its last view forever,
    // so a student watched a status screen while the room answered questions. Indistinguishable
    // from "the instructor is not on a question slide", which is why nobody could see it.
    jest.useFakeTimers();
    mockCompanion.mockRejectedValue({ response: { status: 500 } });
    await render();

    await act(async () => { jest.advanceTimersByTime(2500); });
    await act(async () => { jest.advanceTimersByTime(2500); });

    expect(find('checkin-link-warn')).not.toBeNull();
    expect(text()).toContain('Reconnecting');
  });

  it('does not pretend a 401 might recover', async () => {
    // The session is gone; no amount of waiting brings it back, so spending the grace window
    // on hope just delays the only thing that helps.
    jest.useFakeTimers();
    mockCompanion.mockRejectedValue({ response: { status: 401 } });
    await render();

    expect(text()).toContain('been signed out');
    expect(text()).toContain('Questions will not reach this phone');
  });

  it('clears the warning on its own once the class comes back', async () => {
    // Recovery is automatic by design: the student should not have to know to reload.
    jest.useFakeTimers();
    mockCompanion.mockRejectedValue({ response: { status: 500 } });
    await render();
    await act(async () => { jest.advanceTimersByTime(2500); });
    await act(async () => { jest.advanceTimersByTime(2500); });
    expect(find('checkin-link-warn')).not.toBeNull();

    mockCompanion.mockResolvedValue(STATUS_STATE);
    await act(async () => { jest.advanceTimersByTime(2500); });

    expect(find('checkin-link-warn')).toBeNull();
  });
});

describe('getting into the class', () => {
  it('opens the session room', async () => {
    await render();
    await click('checkin-enter');

    expect(navigate).toHaveBeenCalledWith('/portal/rooms/room-9');
  });

  it('falls back to Today for a session with no room yet', async () => {
    // Never the retired /portal/sessions/:id page. The student is checked in either way, and
    // Today's own next-class card picks up from there.
    mockGet.mockResolvedValue({ data: { ...INFO, room_id: null } });
    await render();
    await click('checkin-enter');

    expect(navigate).toHaveBeenCalledWith('/portal/today');
  });
});

describe('it looks like Colaberry', () => {
  it('drives its colors from semantic tokens', async () => {
    /**
     * NOT the blanket "no hex anywhere" assertion the sibling live surfaces carry, because
     * this sheet would fail it and the file header claims otherwise. Verified 2026-10-31:
     * fifteen hex literals, of which thirteen are `var(--token, #fallback)` fallbacks (a
     * legitimate pattern) or `color:#fff` on a filled button, and two are the Prompt Drop
     * box's deliberately terminal-dark `#0f1720`/`#26313f`/`#e7eef6`, which do not adapt to
     * light mode. Recorded rather than silently "fixed" here — restyling a student-facing
     * code block is a design decision, not a test cleanup, and asserting something untrue
     * would be worse than asserting less.
     */
    await render();
    const css = container.querySelector('style')?.textContent || '';

    expect(css).toContain('var(--surface-card)');
    expect(css).toContain('var(--text-body)');
  });

  it('gives every status button a thumb-sized target', async () => {
    // This page is reached by scanning a QR, so it is a phone surface first.
    await render();
    const css = container.querySelector('style')?.textContent || '';

    expect(css).toMatch(/\.cbck-status\{[^}]*min-height:/);
  });
});

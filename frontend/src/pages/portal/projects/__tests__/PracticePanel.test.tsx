import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PracticePanel from '../presentation/PracticePanel';

jest.mock('../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const portalApi = require('../../../../utils/portalApi').default as { get: jest.Mock; post: jest.Mock };

const SESSION = {
  attemptId: 'at1', attemptNo: 2, mode: 'practice_solo',
  attemptState: 'scheduled', recordingState: 'expected',
  bookingId: 'b1', roomId: 'r1', title: 'Practice: Load Intake Agent',
  startAt: '2026-11-04T19:00:00.000Z', endAt: '2026-11-04T19:30:00.000Z',
  timezone: 'America/Chicago', bookingState: 'scheduled',
  meetingReady: true, recordingPolicy: 'always',
};

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  portalApi.get.mockReset();
  portalApi.post.mockReset();
  portalApi.get.mockResolvedValue({ data: { session: null } });
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

function mount(demo = false) {
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(<PracticePanel projectId="p1" storyId="PREP-4" demo={demo} />);
  });
}

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const click = async (el: Element | null) => {
  await act(async () => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
};

/** Drive the datetime-local input the way React reads it. */
async function type(value: string) {
  const input = q('ps-practice-when') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('reserving a practice room', () => {
  it('offers the form when nothing is booked', async () => {
    mount();
    await flush();
    expect(q('ps-practice-form')).not.toBeNull();
    expect(q('ps-practice-booked')).toBeNull();
  });

  it('sends real ISO instants, never the naive wall clock from the input', async () => {
    // A naive "2026-11-04T13:00" is read in whatever zone the server runs in. That
    // exact mistake put Zoom bookings five to six hours out.
    portalApi.post.mockResolvedValue({ data: SESSION });
    mount();
    await flush();
    await type('2026-11-04T13:00');
    await click(q('ps-practice-submit'));

    expect(portalApi.post).toHaveBeenCalledTimes(1);
    const body = portalApi.post.mock.calls[0][1];
    expect(body.start_at).toMatch(/Z$/);
    expect(body.end_at).toMatch(/Z$/);
    expect(new Date(body.start_at).toISOString()).toBe(body.start_at);
    // 30 minutes apart, as the server's default slot length.
    expect(new Date(body.end_at).getTime() - new Date(body.start_at).getTime()).toBe(30 * 60000);
  });

  it('shows the booked take once reserved, and never a meeting URL', async () => {
    portalApi.post.mockResolvedValue({ data: SESSION });
    mount();
    await flush();
    await type('2026-11-04T13:00');
    await click(q('ps-practice-submit'));

    expect(q('ps-practice-booked')).not.toBeNull();
    expect(q('ps-practice-ready')).not.toBeNull();
    const html = container.innerHTML;
    expect(html).not.toContain('https://');
    expect(html).not.toContain('zoom.us');
  });

  it('says the room is still being made rather than showing a dead join control', async () => {
    portalApi.get.mockResolvedValue({ data: { session: { ...SESSION, meetingReady: false } } });
    mount();
    await flush();
    expect(q('ps-practice-pending')).not.toBeNull();
    // No anchor anywhere: a link that cannot work teaches a student the tool is broken.
    expect(container.querySelector('a')).toBeNull();
  });
});

describe('the recording state is reported honestly', () => {
  const booked = (over: Record<string, unknown> = {}) => ({ ...SESSION, ...over });

  it('never calls a still-processing recording ready', async () => {
    // A webhook receipt proves an event arrived; it does not prove a playable file
    // exists. Telling someone their rehearsal is ready and sending them to an empty
    // page makes them distrust the next honest message.
    portalApi.get.mockResolvedValue({ data: { session: booked({ recordingState: 'processing' }) } });
    mount();
    await flush();

    expect(q('ps-practice-recording-state')?.textContent).toBe('Processing');
    expect(q('ps-practice-recording-detail')?.textContent).toMatch(/not watchable yet/i);
    expect(container.textContent).not.toMatch(/recording complete/i);
  });

  it('says ready only when it is', async () => {
    portalApi.get.mockResolvedValue({ data: { session: booked({ recordingState: 'ready' }) } });
    mount();
    await flush();
    expect(q('ps-practice-recording-state')?.textContent).toBe('Ready');
  });

  it('presents a review as a check in progress, not as a failure', async () => {
    // It usually means a cohort session had overlapping slots. Nothing is lost,
    // and alarming the student would be both wrong and unkind.
    portalApi.get.mockResolvedValue({ data: { session: booked({ recordingState: 'review' }) } });
    mount();
    await flush();
    expect(q('ps-practice-recording-detail')?.textContent).toMatch(/nothing is lost/i);
  });

  it('does not claim a recording exists when none arrived', async () => {
    portalApi.get.mockResolvedValue({ data: { session: booked({ recordingState: 'missing' }) } });
    mount();
    await flush();
    expect(q('ps-practice-recording-state')?.textContent).toBe('Not found');
    expect(q('ps-practice-recording-detail')?.textContent).toMatch(/no recording arrived/i);
  });

  it('defaults to "expected" rather than inventing a state it does not know', async () => {
    portalApi.get.mockResolvedValue({ data: { session: booked({ recordingState: 'something-new' }) } });
    mount();
    await flush();
    expect(q('ps-practice-recording-state')?.textContent).toBe('Expected');
  });
});

describe('when the single host is already busy', () => {
  const conflict = {
    response: { status: 409, data: { error: 'A class owns the host then.', why: 'class_window', next_available: '2026-11-04T21:00:00.000Z' } },
  };

  it('tells the student when they CAN practise, not only that they cannot now', async () => {
    portalApi.post.mockRejectedValue(conflict);
    mount();
    await flush();
    await type('2026-11-04T13:00');
    await click(q('ps-practice-submit'));

    expect(q('ps-practice-problem')?.textContent).toContain('A class owns the host then.');
    expect(q('ps-practice-next-free')).not.toBeNull();
  });

  it('books the offered time when the student takes it', async () => {
    portalApi.post.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ data: SESSION });
    mount();
    await flush();
    await type('2026-11-04T13:00');
    await click(q('ps-practice-submit'));
    await click(q('ps-practice-next-free'));

    expect(portalApi.post).toHaveBeenCalledTimes(2);
    // The server's own instant, posted back verbatim — not a time the UI invented.
    expect(portalApi.post.mock.calls[1][1].start_at).toBe('2026-11-04T21:00:00.000Z');
    expect(q('ps-practice-booked')).not.toBeNull();
  });

  it('offers no alternative when the server did not name one', async () => {
    portalApi.post.mockRejectedValue({
      response: { status: 409, data: { error: 'That time is taken.', why: 'taken', next_available: null } },
    });
    mount();
    await flush();
    await type('2026-11-04T13:00');
    await click(q('ps-practice-submit'));

    expect(q('ps-practice-problem')).not.toBeNull();
    // Inventing one would send the student straight back into the same refusal.
    expect(q('ps-practice-next-free')).toBeNull();
  });
});

describe('explorer/demo mode', () => {
  it('never calls the API', async () => {
    mount(true);
    await flush();
    expect(portalApi.get).not.toHaveBeenCalled();
    expect(portalApi.post).not.toHaveBeenCalled();
    expect(q('ps-practice-demo')).not.toBeNull();
  });
});

/**
 * THE REGRESSION THIS FILE EXISTS TO PREVENT.
 *
 * The practice panel is mounted by PresentationStageBody. It was first wired with
 * the `!onEvidenceStage` guard copied from the placeholder it replaced, which meant
 * PREP-4 — whose entire ask is "rehearse with one other person", and which hands in
 * ON the Practice stage — was the single task where room booking was invisible. It
 * reached production that way and was caught by eye, not by a test.
 */
describe('the practice panel is mounted on the Practice stage of every prep task', () => {
  const SRC_PATH = require('path').join(__dirname, '..', 'presentation', 'PresentationStageBody.tsx');
  const src: string = require('fs').readFileSync(SRC_PATH, 'utf8');

  it('is reading the real stage body file', () => {
    // Positive control: a wrong path yields '' and every assertion below would
    // then pass vacuously.
    expect(src.length).toBeGreaterThan(500);
    expect(src).toContain('PracticePanel');
  });

  it('mounts the panel on the Practice stage unconditionally', () => {
    expect(src).toContain("{stage === 'practice' && (");
  });

  it('does NOT gate it on the task handing in somewhere else', () => {
    // PREP-4 hands in ON 'practice'. This guard hid the booking form from the one
    // task most about rehearsing.
    expect(src).not.toContain("stage === 'practice' && !onEvidenceStage");
  });

  it('still gates the not-shipped placeholders, which SHOULD defer to a hand-in form', () => {
    // Keeps the fix from being over-applied: the guard is right for a notice.
    expect(src).toContain("stage === 'reflect' && !onEvidenceStage");
  });
});

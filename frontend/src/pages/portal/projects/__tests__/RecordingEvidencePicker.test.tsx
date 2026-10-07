import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import RecordingEvidencePicker, { formatLength, describeAttempt } from '../RecordingEvidencePicker';
import DemoEvidencePanel from '../DemoEvidencePanel';
import portalApi from '../../../../utils/portalApi';
import type { ProjectTask } from '../projectsStore';

jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../projectSync', () => ({ refreshProjectsFromBackend: jest.fn().mockResolvedValue(undefined) }));

const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const attempt = (over: Record<string, unknown> = {}) => ({
  attemptId: '11111111-2222-4333-8444-555555555555',
  attemptNo: 2,
  mode: 'practice_solo',
  isFinalTake: false,
  startedAt: '2026-11-20T19:00:00Z',
  endedAt: '2026-11-20T19:10:00Z',
  parts: 1,
  durationSeconds: 600,
  ...over,
});

async function mountPicker(selected = '') {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<RecordingEvidencePicker projectId="p1" storyId="PREP-2" selected={selected} onSelect={() => undefined} />);
  });
}

describe('picking a recording this platform already holds', () => {
  it('lists the student\'s own takes', async () => {
    api.get.mockResolvedValue({ data: { attempts: [attempt(), attempt({ attemptId: 'b', attemptNo: 1 })] } });
    await mountPicker();
    const text = container.textContent || '';
    expect(text).toContain('Take 2');
    expect(text).toContain('Take 1');
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  });

  // The API deliberately returns no playback URL — the take is watched in the
  // Studio, which applies its own access checks.
  it('renders no link to the video', async () => {
    api.get.mockResolvedValue({ data: { attempts: [attempt()] } });
    await mountPicker();
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });

  /**
   * The bug this pins: `RoomRecordingsPanel` used to `catch { setResources([]) }`,
   * so a failed fetch read as "no recordings yet". One sends the student to go
   * and record something they have already recorded; the other says try again.
   */
  it('a failed load says so and offers a retry — it never claims there are none', async () => {
    api.get.mockRejectedValue(new Error('network'));
    await mountPicker();
    const text = container.textContent || '';
    expect(text).toContain('could not load');
    expect(text).toContain('does not mean you have none');
    expect(text).not.toContain('Nothing recorded');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('the retry actually refetches, and recovers', async () => {
    api.get.mockRejectedValueOnce(new Error('network'));
    await mountPicker();
    api.get.mockResolvedValue({ data: { attempts: [attempt()] } });

    const retry = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Try again'));
    expect(retry).toBeTruthy();
    await act(async () => { retry!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Take 2');
  });

  it('nothing recorded yet says what to do, and that a recording takes time to arrive', async () => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    await mountPicker();
    const text = container.textContent || '';
    expect(text).toContain('Nothing recorded for this task yet');
    expect(text).toContain('up to an hour');
  });

  it('asks the right task for the right project', async () => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    await mountPicker();
    expect(api.get).toHaveBeenCalledWith('/api/portal/projects/p1/tasks/PREP-2/recording-evidence');
  });
});

describe('describing a take without inventing anything', () => {
  it('omits a length no part reported rather than printing 0 min', () => {
    expect(formatLength(null)).toBeNull();
    expect(formatLength(0)).toBeNull();
    expect(formatLength(600)).toBe('10 min');
    expect(formatLength(3900)).toBe('1 h 05 min');
    expect(describeAttempt(attempt({ durationSeconds: null, startedAt: null }))).toBe('');
  });

  // Zoom splits a recording when the host stops and restarts. Saying "2 parts"
  // is why the playback comes in two pieces; saying "1 part" is noise.
  it('mentions parts only when there is more than one', () => {
    expect(describeAttempt(attempt({ parts: 1 }))).not.toContain('part');
    expect(describeAttempt(attempt({ parts: 2 }))).toContain('2 parts');
  });
});

describe('the hand-in form offers it', () => {
  function mountPanel(storyId: string) {
    const task = { id: 't1', storyId, title: 'x', state: 'todo', due: 'today' } as unknown as ProjectTask;
    act(() => {
      const r = createRoot(container);
      root = r;
      r.render(<DemoEvidencePanel task={task} projectId="p1" taskId={storyId} points={40} />);
    });
  }

  /**
   * PREP-2 and PREP-5 used to show a URL box and nothing else, so a student who
   * had just rehearsed in the Studio had to publish the video somewhere public
   * to hand it in.
   */
  it('a recording task offers a Studio recording as well as a link', () => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    mountPanel('PREP-2');
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent || '');
    expect(labels.some((l) => l.includes('Use a Studio recording'))).toBe(true);
    expect(labels.some((l) => l.includes('Paste a link'))).toBe(true);
    // Prose about a recording is still not a recording.
    expect(labels.some((l) => l.includes('Write it'))).toBe(false);
  });

  it('a narrative task keeps all three ways in', () => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    mountPanel('PREP-1');
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent || '');
    expect(labels.some((l) => l.includes('Write it'))).toBe(true);
    expect(labels.some((l) => l.includes('Use a Studio recording'))).toBe(true);
  });

  // An attempt id left in the link box would post as kind:'link' and come back
  // rejected as a malformed URL, which reads as the picker being broken.
  it('switching how you hand in clears what was already typed', () => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    mountPanel('PREP-1');
    const box = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(box).not.toBeNull();

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      nativeSetter.call(box, 'some notes I typed');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('some notes I typed');

    const toLink = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Paste a link'))!;
    act(() => { toLink.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect((container.querySelector('input[type="url"]') as HTMLInputElement).value).toBe('');
  });
});

/**
 * What the take actually contains, shown next to it.
 *
 * The server decides the wording; the picker's job is to put it where the student
 * sees it BEFORE choosing, not after a reviewer complains.
 */
describe('a take that is missing audio or screen says so', () => {
  it('shows the server-written warning against that take', async () => {
    api.get.mockResolvedValue({
      data: { attempts: [attempt({ hasAudio: false, warnings: ['This recording has no audio track. Nobody reviewing it will hear you.'] })] },
    });
    await mountPicker();
    expect(container.textContent).toContain('no audio track');
    // Still offered — it is their recording, and hiding it helps nobody.
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(1);
  });

  it('says nothing when the provider did not tell us', async () => {
    api.get.mockResolvedValue({ data: { attempts: [attempt({ hasAudio: null, warnings: [] })] } });
    await mountPicker();
    expect(container.textContent).not.toContain('no audio');
    expect(container.textContent).not.toContain('no shared screen');
  });

  // A reviewer must be able to tell a take we captured from one the student
  // pointed us at. Nobody fetched the second or checked what is on the far end.
  it('marks a take the student recovered by link', async () => {
    api.get.mockResolvedValue({ data: { attempts: [attempt({ recoveredFromLink: true })] } });
    await mountPicker();
    expect(container.textContent).toContain('your own link, not captured here');
  });

  it('a take with no warnings field at all still renders', async () => {
    api.get.mockResolvedValue({ data: { attempts: [attempt()] } });
    await mountPicker();
    expect(container.textContent).toContain('Take 2');
  });
});

/**
 * Accessibility of the async states.
 *
 * A screen reader user presses "Use a Studio recording" and then hears nothing at
 * all until they go hunting: the fetch, its result, and an empty result were all
 * silent. Each state now announces itself.
 */
describe('every state of the picker announces itself', () => {
  it('announces the wait', async () => {
    let release: (v: any) => void = () => undefined;
    api.get.mockReturnValue(new Promise((res) => { release = res; }));
    await act(async () => {
      const r = createRoot(container);
      root = r;
      r.render(<RecordingEvidencePicker projectId="p1" storyId="PREP-2" selected="" onSelect={() => undefined} />);
    });
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.textContent).toContain('Looking for your recordings');
    await act(async () => { release({ data: { attempts: [] } }); });
  });

  it('announces how many arrived, without reading the whole list aloud', async () => {
    api.get.mockResolvedValue({ data: { attempts: [attempt(), attempt({ attemptId: 'b', attemptNo: 1 })] } });
    await mountPicker();
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.textContent).toContain('2 recordings found');
  });

  it('uses the singular for one', async () => {
    api.get.mockResolvedValue({ data: { attempts: [attempt()] } });
    await mountPicker();
    expect(container.querySelector('[role="status"]')!.textContent).toContain('1 recording found');
  });

  it('announces an empty result rather than leaving silence', async () => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    await mountPicker();
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.textContent).toContain('Nothing recorded');
  });

  // The radio group needs a name a screen reader can read before the options.
  it('groups the takes under a legend', async () => {
    api.get.mockResolvedValue({ data: { attempts: [attempt()] } });
    await mountPicker();
    expect(container.querySelector('fieldset')).not.toBeNull();
    expect(container.querySelector('legend')!.textContent).toContain('Your recordings');
  });

  it('every radio is reachable by its own label', async () => {
    api.get.mockResolvedValue({ data: { attempts: [attempt()] } });
    await mountPicker();
    const input = container.querySelector('input[type="radio"]') as HTMLInputElement;
    const label = container.querySelector(`label[for="${input.id}"]`);
    expect(input.id).toBeTruthy();
    expect(label).not.toBeNull();
  });
});

/**
 * Which way in a recording task OPENS on.
 *
 * Caught by looking at a real production screenshot, not by a test: the hand-in
 * form opened on "Paste a link", so the selected-state styling put the old
 * workaround in the loud button and left the recording we already hold as the
 * quiet one. The page was steering students to the thing P4-T6 removes.
 */
describe('a recording task opens on the Studio recording', () => {
  function mountPanelFor(storyId: string) {
    const task = { id: 't1', storyId, title: 'x', state: 'todo', due: 'today' } as unknown as ProjectTask;
    act(() => {
      const r = createRoot(container);
      root = r;
      r.render(<DemoEvidencePanel task={task} projectId="p1" taskId={storyId} points={40} />);
    });
  }

  it.each(['PREP-2', 'PREP-5'])('%s shows the picker first, not a URL box', (storyId) => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    mountPanelFor(storyId);
    expect(container.querySelector('input[type="url"]')).toBeNull();
    const studio = Array.from(container.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes('Use a Studio recording'))!;
    expect(studio.getAttribute('aria-pressed')).toBe('true');
  });

  it('asks for the recordings on mount, so the student sees their takes immediately', async () => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    await act(async () => { mountPanelFor('PREP-2'); });
    expect(api.get).toHaveBeenCalledWith('/api/portal/projects/p1/tasks/PREP-2/recording-evidence');
  });

  // A student who recorded elsewhere must not be stranded on an empty picker.
  it('still offers the link box one click away', () => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    mountPanelFor('PREP-2');
    const link = Array.from(container.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes('Paste a link'))!;
    expect(link).toBeTruthy();
    act(() => { link.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('input[type="url"]')).not.toBeNull();
  });

  // A narrative task is unchanged: prose is still the natural first option there.
  it('leaves a narrative task opening on the text box', () => {
    api.get.mockResolvedValue({ data: { attempts: [] } });
    mountPanelFor('PREP-1');
    expect(container.querySelector('textarea')).not.toBeNull();
  });
});

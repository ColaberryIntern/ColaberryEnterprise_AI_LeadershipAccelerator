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

import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import type { AttemptView } from '../careerPrepApi';
import { ReadAloud } from '../ReadAloud';
import { PREP_SECONDS } from '../useReadAloud';

/** CP5.8 (Ali 2026-11-21, option B): the read-aloud warm-up in the room. */
const mockLine = jest.fn();
const mockUpload = jest.fn();
const mockFetch = jest.fn();
jest.mock('../careerPrepApi', () => ({
  fetchReadAloudLineApi: (...a: unknown[]) => mockLine(...a),
  uploadAttemptApi: (...a: unknown[]) => mockUpload(...a),
  fetchAttemptApi: (...a: unknown[]) => mockFetch(...a),
}));

const LINE = { id: 'ra-03', text: 'I chose a small first version, put it in front of real users, and changed it based on what they actually did.' };
const DONE: AttemptView = {
  id: 'a9', status: 'done', errorClass: null,
  result: { seconds: 9, notes: [], readAloud: { score: 91, lineId: 'ra-03' }, scores: [
    { key: 'pace', label: 'Pace', score: 100, value: '142 wpm', target: '100 to 165 wpm', source: 'x' },
    { key: 'smoothness', label: 'Smoothness', score: 70, value: '2 pause(s) of 1 s or more', target: 'none', source: 'x' },
    { key: 'completeness', label: 'Completeness', score: 100, value: '21 of 21 words', target: 'all', source: 'x' },
  ] },
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function mount(el: React.ReactElement): HTMLDivElement {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const r = createRoot(h);
  host = h; root = r;
  act(() => { r.render(el); });
  return h;
}
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = async (h: HTMLElement, id: string) => { await act(async () => { (h.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click(); }); await flush(); };
const q = (h: HTMLElement, id: string) => h.querySelector(`[data-testid="${id}"]`);

let gum: jest.Mock;
let recorders: Array<{ started: boolean; state: string; stop: () => void }>;
const stopTrack = jest.fn();
beforeEach(() => {
  mockLine.mockReset().mockResolvedValue(LINE); mockUpload.mockReset(); mockFetch.mockReset(); stopTrack.mockReset();
  gum = jest.fn(async () => ({ getTracks: () => [{ stop: stopTrack }], getAudioTracks: () => [] }));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: gum } });
  recorders = [];
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder = class {
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    started = false;
    constructor() { recorders.push(this); }
    state = 'inactive';
    start() { this.started = true; this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['x']) }); this.onstop?.(); }
  };
});
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; jest.useRealTimers(); });

describe('ReadAloud (CP5.8)', () => {
  it('Record asks for the MICROPHONE ONLY, shows the line, and records nothing before Go', async () => {
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    expect(q(h, 'cp-ra-line')).toBeNull();
    await click(h, 'cp-ra-record');
    expect(gum).toHaveBeenCalledWith({ audio: true, video: false });
    expect(q(h, 'cp-ra-line')?.textContent).toBe(LINE.text);
    expect(q(h, 'cp-ra-level')).not.toBeNull();
    expect(q(h, 'cp-ra-prep')?.textContent).toContain(`${PREP_SECONDS} of ${PREP_SECONDS} seconds`);
    expect(recorders).toHaveLength(0);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('the prep countdown runs down to "Ready when you are" and never starts recording by itself', async () => {
    jest.useFakeTimers();
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await act(async () => { (q(h, 'cp-ra-record') as HTMLButtonElement).click(); });
    await act(async () => { await Promise.resolve(); });
    for (let i = 0; i < PREP_SECONDS + 2; i += 1) await act(async () => { jest.advanceTimersByTime(1000); });
    expect(q(h, 'cp-ra-prep')?.textContent).toBe('Ready when you are');
    expect(recorders).toHaveLength(0);
  });

  it('Go records, Stop sends ONE audio upload with the line id, and the three parts and the score show', async () => {
    mockUpload.mockResolvedValue({ id: 'a9', status: 'pending', result: null, errorClass: null });
    mockFetch.mockResolvedValue(DONE);
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await click(h, 'cp-ra-record');
    await click(h, 'cp-ra-go');
    expect(recorders[0].started).toBe(true);
    await click(h, 'cp-ra-stop');
    await flush();
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [session, index, key, blob, , lineId] = mockUpload.mock.calls[0];
    expect([session, index, lineId]).toEqual(['ses-1', 0, 'ra-03']);
    expect(typeof key).toBe('string');
    expect((blob as Blob).type).toBe('audio/webm');
    expect(stopTrack).toHaveBeenCalled();
    expect(q(h, 'cp-ra-score')?.textContent).toBe('91');
    expect(q(h, 'cp-ra-part-pace')?.textContent).toContain('100');
    expect(q(h, 'cp-ra-part-smoothness')?.textContent).toContain('70');
    expect(q(h, 'cp-ra-part-completeness')?.textContent).toContain('21 of 21 words');
    expect(q(h, 'cp-ra-result')?.textContent).toMatch(/Filler words, accent and pronunciation are never scored/);
  });

  it('an unclear recording says why and offers to try again; nothing is shown as a score', async () => {
    mockUpload.mockResolvedValue({ id: 'a9', status: 'failed', result: null, errorClass: 'UnclearAudio' });
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await click(h, 'cp-ra-record');
    await click(h, 'cp-ra-go');
    await click(h, 'cp-ra-stop');
    expect(q(h, 'cp-ra-problem')).not.toBeNull();
    expect(q(h, 'cp-ra-score')).toBeNull();
  });

  it('the line failing to load opens NO microphone (no hot mic), says the line failed, and a retry opens exactly one stream', async () => {
    mockLine.mockRejectedValueOnce(new Error('offline'));
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await click(h, 'cp-ra-record');
    expect(gum).not.toHaveBeenCalled(); // the mic is asked for only after the line arrives
    expect(stopTrack).not.toHaveBeenCalled();
    expect(q(h, 'cp-ra-problem')?.textContent).toContain('Could not load the line');
    expect(q(h, 'cp-ra-problem')?.textContent).not.toContain('microphone');
    await click(h, 'cp-ra-record');
    expect(gum).toHaveBeenCalledTimes(1);
    expect(q(h, 'cp-ra-line')?.textContent).toBe(LINE.text);
    expect(q(h, 'cp-ra-record')).toBeNull(); // armed: no second Record, so no second stream
  });

  const deferredLine = () => { let ok: (v: typeof LINE) => void = () => undefined; mockLine.mockReturnValueOnce(new Promise((r) => { ok = r; })); return (v = LINE) => ok(v); };

  it('a double click on Record while the line loads asks for the microphone ONCE', async () => {
    const resolve = deferredLine();
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    const rec = q(h, 'cp-ra-record') as HTMLButtonElement;
    await act(async () => { rec.click(); rec.click(); });
    await act(async () => { resolve(); });
    await flush();
    expect(mockLine).toHaveBeenCalledTimes(1);
    expect(gum).toHaveBeenCalledTimes(1);
    expect(q(h, 'cp-ra-line')?.textContent).toBe(LINE.text);
  });

  it('leaving (unmount) while the line loads never opens the microphone', async () => {
    const resolve = deferredLine();
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await act(async () => { (q(h, 'cp-ra-record') as HTMLButtonElement).click(); });
    act(() => root!.unmount()); root = null;
    await act(async () => { resolve(); });
    await flush();
    expect(gum).not.toHaveBeenCalled();
  });

  it('a microphone granted AFTER leaving is stopped at once, never kept', async () => {
    let grant: (s: unknown) => void = () => undefined;
    gum.mockReturnValueOnce(new Promise((r) => { grant = r; }));
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await act(async () => { (q(h, 'cp-ra-record') as HTMLButtonElement).click(); });
    await flush();
    expect(gum).toHaveBeenCalledTimes(1);
    act(() => root!.unmount()); root = null;
    await act(async () => { grant({ getTracks: () => [{ stop: stopTrack }], getAudioTracks: () => [] }); });
    await flush();
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it('a recording that does not upload says so (and shows no score)', async () => {
    mockUpload.mockRejectedValueOnce(new Error('network down'));
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await click(h, 'cp-ra-record');
    await click(h, 'cp-ra-go');
    await click(h, 'cp-ra-stop');
    expect(q(h, 'cp-ra-problem')?.textContent).toContain('did not upload');
    expect(q(h, 'cp-ra-score')).toBeNull();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('leaving mid-reading stops the recorder and the microphone, and sends nothing', async () => {
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await click(h, 'cp-ra-record');
    await click(h, 'cp-ra-go');
    expect(recorders[0].state).toBe('recording');
    act(() => root!.unmount()); root = null;
    await flush();
    expect(recorders[0].state).toBe('inactive');
    expect(stopTrack).toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('leaving while the score is pending stops the polling', async () => {
    jest.useFakeTimers();
    mockUpload.mockResolvedValue({ id: 'a9', status: 'pending', result: null, errorClass: null });
    mockFetch.mockResolvedValue({ id: 'a9', status: 'pending', result: null, errorClass: null });
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await act(async () => { (q(h, 'cp-ra-record') as HTMLButtonElement).click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { (q(h, 'cp-ra-go') as HTMLButtonElement).click(); });
    await act(async () => { (q(h, 'cp-ra-stop') as HTMLButtonElement).click(); });
    for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
    const before = mockFetch.mock.calls.length;
    expect(before).toBeGreaterThanOrEqual(1);
    act(() => root!.unmount()); root = null;
    for (let i = 0; i < 5; i += 1) await act(async () => { jest.advanceTimersByTime(3000); await Promise.resolve(); });
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(before + 1);
  });

  it('a browser that cannot record says so and lets go of the microphone', async () => {
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = class { constructor() { throw new Error('NotSupportedError'); } };
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await click(h, 'cp-ra-record');
    await click(h, 'cp-ra-go');
    expect(q(h, 'cp-ra-problem')?.textContent).toContain('could not record');
    expect(stopTrack).toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('after Record, focus moves to Go', async () => {
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await click(h, 'cp-ra-record');
    expect(document.activeElement).toBe(q(h, 'cp-ra-go'));
  });

  it('a reading is capped at 60 seconds: the recorder stops by itself and sends once', async () => {
    jest.useFakeTimers();
    mockUpload.mockResolvedValue({ id: 'a9', status: 'failed', result: null, errorClass: 'UnclearAudio' });
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await act(async () => { (q(h, 'cp-ra-record') as HTMLButtonElement).click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { (q(h, 'cp-ra-go') as HTMLButtonElement).click(); });
    await act(async () => { jest.advanceTimersByTime(59_000); });
    expect(mockUpload).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1_000); });
    await act(async () => { await Promise.resolve(); });
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalled();
  });

  it('a blocked microphone says so and records nothing', async () => {
    gum.mockRejectedValueOnce(new Error('NotAllowedError'));
    const h = mount(<ReadAloud sessionId="ses-1" segmentIndex={0} />);
    await click(h, 'cp-ra-record');
    expect(q(h, 'cp-ra-problem')?.textContent).toContain('Allow the microphone');
    expect(q(h, 'cp-ra-go')).toBeNull();
  });
});

import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import type { AttemptView, PrepRecap, PrepSessionView, SessionSegment, StoredPlan } from '../careerPrepApi';
import { SessionRunner } from '../SessionRunner';
import { TryRecorder } from '../TryRecorder';
import { useSession } from '../useSession';
import { questionFor, QUESTION_BANK } from '../logic/sessionCopy';

const mockStart = jest.fn();
const mockPatch = jest.fn();
const mockUpload = jest.fn();
const mockFetch = jest.fn();
jest.mock('../careerPrepApi', () => ({
  startSessionApi: (...a: unknown[]) => mockStart(...a),
  patchSessionApi: (...a: unknown[]) => mockPatch(...a),
  uploadAttemptApi: (...a: unknown[]) => mockUpload(...a),
  fetchAttemptApi: (...a: unknown[]) => mockFetch(...a),
}));

const seg = (kind: SessionSegment['kind'], title: string, minutes: number, state: SessionSegment['state'] = 'pending'): SessionSegment => ({ kind, title, minutes, state });
const view = (segments: SessionSegment[], over: Partial<PrepSessionView> = {}): PrepSessionView => ({ id: 'ses-1', planId: 'plan-1', status: 'running', startedAt: '2026-11-16T18:00:00Z', secondsActive: 0, segments, ...over });
const three = [seg('warmup', 'Warm up', 2), seg('try', 'Try it on camera', 8), seg('cooldown', 'Cool down', 1)];
const plan = { id: 'plan-1' } as StoredPlan;

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
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = async (h: HTMLElement, id: string) => { await act(async () => { (h.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click(); }); await flush(); };

const onOver = jest.fn();
function Harness({ hasPlan = true, questions }: { hasPlan?: boolean; questions?: string[] }): React.ReactElement {
  const s = useSession(hasPlan ? plan : null, onOver);
  return <SessionRunner s={s} type="recruiter" hasPlan={hasPlan} questions={questions} />;
}

beforeEach(() => {
  mockStart.mockReset(); mockPatch.mockReset(); mockUpload.mockReset(); mockFetch.mockReset(); onOver.mockReset();
  mockPatch.mockImplementation(async (_id: string, b: { action: string }) => ({ session: view(three, { status: b.action === 'finish' ? 'finished' : b.action === 'end' ? 'ended' : 'running' }) }));
});

describe('the session (CP4.4)', () => {
  it('asks for a plan first when there is none', () => {
    expect(mount(<Harness hasPlan={false} />).textContent).toContain('Pick a plan with Cora first');
  });

  it('starts on part 1 with the ring, the segment list and Next', async () => {
    mockStart.mockResolvedValue({ session: view(three), resumed: false });
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    expect(mockStart).toHaveBeenCalledWith('plan-1');
    expect(h.textContent).toContain('Part 1 of 3 · 2 minutes');
    expect(h.querySelector('.cp-ring')?.getAttribute('aria-label')).toBe('2:00 left in this part');
    expect(h.querySelectorAll('.cp-seglist li')).toHaveLength(3);
    expect(h.querySelector('.cp-seglist li[aria-current="step"]')?.textContent).toContain('Warm up');
    expect(h.querySelector('[data-testid="cp-session-next"]')?.textContent).toBe('Next: Try it on camera ›');
  });

  it('marks each part done on the server, and after the last part marks it done and then finishes', async () => {
    mockStart.mockResolvedValue({ session: view(three), resumed: false });
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await click(h, 'cp-session-next');
    expect(mockPatch).toHaveBeenLastCalledWith('ses-1', expect.objectContaining({ action: 'segment_done', segmentIndex: 0 }));
    expect(h.textContent).toContain('Part 2 of 3');
    expect(h.querySelector('[data-testid="cp-try"]')).not.toBeNull();
    await click(h, 'cp-session-next');
    expect(h.querySelector('[data-testid="cp-session-next"]')?.textContent).toBe('Finish ✓');
    await click(h, 'cp-session-next');
    const actions = mockPatch.mock.calls.map((c) => [c[1].action, c[1].segmentIndex]);
    expect(actions).toEqual([['segment_done', 0], ['segment_done', 1], ['segment_done', 2], ['finish', undefined]]);
    expect(h.querySelector('[data-testid="cp-session-over"]')?.textContent).toBe('Session finished. Well done.');
  });

  it('a reload resumes after the parts the server already has as done', async () => {
    mockStart.mockResolvedValue({ session: view([seg('warmup', 'Warm up', 2, 'done'), seg('try', 'Try it on camera', 8, 'done'), seg('cooldown', 'Cool down', 1)], { secondsActive: 600 }), resumed: true });
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    expect(h.textContent).toContain('Part 3 of 3');
    expect(h.querySelectorAll('.cp-seglist li')[0].textContent).toMatch(/^✓/);
  });

  it('a session with every part done opens as finished, not on a part that does not exist', async () => {
    mockStart.mockResolvedValue({ session: view(three.map((x) => ({ ...x, state: 'done' as const }))), resumed: true });
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    expect(h.querySelector('[data-testid="cp-session-over"]')).not.toBeNull();
  });

  it('End session ends it on the server and says the practice is saved', async () => {
    mockStart.mockResolvedValue({ session: view(three), resumed: false });
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await click(h, 'cp-session-end');
    expect(mockPatch).toHaveBeenLastCalledWith('ses-1', expect.objectContaining({ action: 'end' }));
    expect(h.textContent).toContain('Your practice so far is saved');
  });

  it('a failed save keeps the session going and says so', async () => {
    mockStart.mockResolvedValue({ session: view(three), resumed: false });
    mockPatch.mockRejectedValue(new Error('offline'));
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await click(h, 'cp-session-next');
    expect(h.textContent).toContain('Part 2 of 3');
    expect(h.querySelector('[role="alert"]')?.textContent).toContain('Could not save your progress just now');
  });

  it('uses the interview\'s own questions first, then the bank', () => {
    expect(questionFor(0, 'recruiter', ['Why Acme?'])).toBe('Why Acme?');
    expect(questionFor(4, 'technical', null)).toBe(QUESTION_BANK.technical[1]);
  });
});

const all = [seg('warmup', 'Warm up', 2), { ...seg('learn', 'Learn: Pace and clarity', 4), targetSkill: 'pace_clarity' }, seg('try', 'Try it on camera', 8), seg('pressure', 'Pressure round', 5), seg('rehearsal', 'Full rehearsal', 25), seg('cooldown', 'Cool down', 1)];
const toPart = async (h: HTMLElement, n: number) => { for (let k = 0; k < n; k++) await click(h, 'cp-session-next'); };

describe('each part of a session has its own body (CP4.4)', () => {
  beforeEach(() => { mockStart.mockResolvedValue({ session: view(all), resumed: false }); mockPatch.mockImplementation(async () => ({ session: view(all) })); });
  afterEach(() => { delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis; });

  it('Warm up gives the line to say and no camera', async () => {
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    expect(h.querySelector('[data-testid="cp-body-warmup"]')?.textContent).toContain('Hi, I am glad to be here.');
    expect(h.querySelector('[data-testid="cp-try"]')).toBeNull();
  });
  it("Learn explains the part's skill in plain words", async () => {
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await toPart(h, 1);
    expect(h.querySelector('[data-testid="cp-body-learn"]')?.textContent).toContain('100 to 165 words a minute');
  });
  it("Try asks the interview's own question and records it", async () => {
    const h = mount(<Harness questions={['Why Acme?', 'What did you ship?']} />);
    await click(h, 'cp-session-start');
    await toPart(h, 2);
    expect(h.querySelector('.cp-try-q')?.textContent).toBe('Question: Why Acme?');
    expect(h.querySelector('[data-testid="cp-record"]')).not.toBeNull();
  });
  it('the Pressure round adds a follow-up and Cora can read it aloud', async () => {
    const speak = jest.fn();
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = { speak };
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function U(this: { text: string }, t: string) { this.text = t; };
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await toPart(h, 3);
    const q = h.querySelector('.cp-try-q')?.textContent ?? '';
    expect(q).toContain('Then: Why did you choose that approach?');
    await click(h, 'cp-hear');
    expect(speak.mock.calls[0][0].text).toBe(q.replace('Question: ', ''));
  });
  it('without browser speech there is no Hear button, and the recorder still works', async () => {
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await toPart(h, 3);
    expect(h.querySelector('[data-testid="cp-hear"]')).toBeNull();
    expect(h.querySelector('[data-testid="cp-record"]')).not.toBeNull();
  });
  it('the Full rehearsal asks three questions in one recording', async () => {
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await toPart(h, 4);
    expect(h.querySelector('.cp-try-q')?.textContent).toMatch(/\(1\) .+ \(2\) .+ \(3\) .+/);
  });
  it('Cool down says where the scores go', async () => {
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await toPart(h, 5);
    expect(h.querySelector('[data-testid="cp-body-cooldown"]')?.textContent).toContain('appear on Your progress');
  });
  it('each part gets a fresh recorder: a score never carries to the next question', async () => {
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn(async () => ({ getTracks: () => [{ stop: jest.fn() }] })) } });
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = class { ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; start() { /* rec */ } stop() { this.onstop?.(); } };
    mockUpload.mockResolvedValue({ id: 'att-1', status: 'done', errorClass: null, result: { seconds: 30, scores: [], notes: ['Good pace.'] } });
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await toPart(h, 2);
    await click(h, 'cp-record');
    await click(h, 'cp-stop');
    expect(h.querySelector('[data-testid="cp-try-result"]')).not.toBeNull();
    await toPart(h, 1);
    expect(h.querySelector('[data-testid="cp-try-result"]')).toBeNull();
    expect(h.querySelector('[data-testid="cp-record"]')).not.toBeNull();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original });
  });
});

describe('the recap (CP4.5)', () => {
  const recap: PrepRecap = { status: 'finished', minutes: 11, attempts: 1, pending: 0, firstName: 'Ali', readiness: { before: 64, after: 69, company: 'Acme' }, skills: [{ key: 'pace_clarity', label: 'Pace and clarity', before: 48, after: 57 }], streak: 5 };
  it("finishing shows the server's recap and hands it to the room", async () => {
    const one = [seg('warmup', 'Warm up', 2)];
    mockStart.mockResolvedValue({ session: view(one), resumed: false });
    mockPatch.mockImplementation(async (_id: string, b: { action: string }) => (b.action === 'finish'
      ? { session: view([seg('warmup', 'Warm up', 2, 'done')], { status: 'finished' }), recap } : { session: view([seg('warmup', 'Warm up', 2, 'done')]) }));
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await click(h, 'cp-session-next');
    const r = h.querySelector('[data-testid="cp-recap"]');
    expect(r?.textContent).toContain('Nice work, Ali.');
    expect(r?.textContent).toContain('Readiness 69 from 64');
    expect(r?.textContent).toContain('48 → 57');
    expect(onOver).toHaveBeenCalledWith(expect.objectContaining({ status: 'finished' }), recap);
  });
  it('a recap with no scored answer says the numbers did not change, and shows no readiness it does not have', async () => {
    mockStart.mockResolvedValue({ session: view(three), resumed: false });
    mockPatch.mockImplementation(async (_id: string, b: { action: string }) => (b.action === 'end'
      ? { session: view(three, { status: 'ended' }), recap: { status: 'ended', minutes: 2, attempts: 0, pending: 0, skills: [], streak: 1 } } : { session: view(three) }));
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await click(h, 'cp-session-end');
    const r = h.querySelector('[data-testid="cp-recap"]');
    expect(r?.textContent).toContain('Session ended');
    expect(r?.textContent).toContain('your numbers did not change');
    expect(r?.textContent).not.toContain('Readiness');
  });
  it('an answer still being scored at the end is shown as such, not as "numbers did not change"', async () => {
    mockStart.mockResolvedValue({ session: view(three), resumed: false });
    mockPatch.mockImplementation(async (_id: string, b: { action: string }) => (b.action === 'end'
      ? { session: view(three, { status: 'ended' }), recap: { status: 'ended', minutes: 4, attempts: 0, pending: 1, skills: [], streak: 1 } } : { session: view(three) }));
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    await click(h, 'cp-session-end');
    expect(h.querySelector('[data-testid="cp-recap-pending"]')?.textContent).toContain('One answer is still being scored');
    expect(h.querySelector('[data-testid="cp-recap"]')?.textContent).not.toContain('did not change');
  });
  it('a session left paused is resumed on the server when it is picked up again', async () => {
    mockStart.mockResolvedValue({ session: view(three, { status: 'paused' }), resumed: true });
    const h = mount(<Harness />);
    await click(h, 'cp-session-start');
    expect(mockPatch).toHaveBeenCalledWith('ses-1', expect.objectContaining({ action: 'resume' }));
    expect(h.textContent).toContain('Part 1 of 3');
  });
});

describe('recording a Try (CP4.4)', () => {
  const done: AttemptView = { id: 'att-1', status: 'done', errorClass: null, result: { seconds: 40, notes: ['Slow down a little.'], scores: [{ key: 'pace', label: 'Pace', score: 70, value: '172 words a minute', target: '100 to 165', source: 'your recording' }] } };
  let stopTracks: jest.Mock;
  beforeEach(() => {
    stopTracks = jest.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn(async () => ({ getTracks: () => [{ stop: stopTracks }] })) } });
    class FakeRecorder {
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { /* recording */ }
      stop() { this.ondataavailable?.({ data: new Blob(['x']) }); this.onstop?.(); }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  });

  it('records, uploads with a client key, polls and shows the scores with their source', async () => {
    mockUpload.mockResolvedValue({ ...done, status: 'pending', result: null });
    mockFetch.mockResolvedValue(done);
    const h = mount(<TryRecorder sessionId="ses-1" segmentIndex={1} prompt="Tell me about yourself." />);
    await click(h, 'cp-record');
    await click(h, 'cp-stop');
    expect(stopTracks).toHaveBeenCalled();
    const [sid, idx, key] = mockUpload.mock.calls[0];
    expect([sid, idx]).toEqual(['ses-1', 1]);
    expect(String(key).length).toBeGreaterThanOrEqual(8);
    expect(mockFetch).toHaveBeenCalledWith('ses-1', 'att-1');
    expect(h.querySelector('[data-testid="cp-try-result"]')?.textContent).toContain('Pace: 172 words a minute (target 100 to 165)');
    expect(h.textContent).toContain('Slow down a little.');
  });

  it('a dropped upload is sent again with the same key, so the server sees one attempt', async () => {
    mockUpload.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(done);
    const h = mount(<TryRecorder sessionId="ses-1" segmentIndex={1} prompt="Q" />);
    await click(h, 'cp-record');
    await click(h, 'cp-stop');
    expect(h.querySelector('[role="alert"]')?.textContent).toContain('send it again');
    await click(h, 'cp-resend');
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockUpload.mock.calls[1][2]).toBe(mockUpload.mock.calls[0][2]);
    expect(h.querySelector('[data-testid="cp-try-result"]')).not.toBeNull();
  });

  it('a blocked camera says how to allow it and uploads nothing', async () => {
    (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValue(new Error('NotAllowedError'));
    const h = mount(<TryRecorder sessionId="ses-1" segmentIndex={1} prompt="Q" />);
    await click(h, 'cp-record');
    expect(h.querySelector('[role="alert"]')?.textContent).toContain('Allow the camera and microphone');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('a failed scoring offers Record again', async () => {
    mockUpload.mockResolvedValue({ ...done, status: 'failed', result: null, errorClass: 'analysis' });
    const h = mount(<TryRecorder sessionId="ses-1" segmentIndex={1} prompt="Q" />);
    await click(h, 'cp-record');
    await click(h, 'cp-stop');
    expect(h.querySelector('[data-testid="cp-rerecord"]')).not.toBeNull();
    await click(h, 'cp-rerecord');
    expect(h.querySelector('[data-testid="cp-record"]')).not.toBeNull();
  });
});

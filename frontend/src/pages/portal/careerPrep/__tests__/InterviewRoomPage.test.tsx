import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InterviewRoomPage from '../InterviewRoomPage';
import { useCareerPrepFlag } from '../../../../components/careerPrep/careerPrepFlag';
import { decideRoomApi, fetchRoomApi, roomAnswer, type RoomData } from '../../../../components/careerPrep/interviewRoom/interviewRoomApi';
import { MAX_POLLS, POLL_MS } from '../../../../components/careerPrep/interviewRoom/useInterviewRoom';
import { CONSENT_COPY } from '../../../../components/careerPrep/interviewRoom/RoomConsent';
import { fetchPlacementInterviewsApi } from '../../../../components/careerPrep/interviewsApi';
import { fetchPrepDashboard } from '../../../../components/careerPrep/careerPrepApi';

/**
 * Career Prep v27, CP9.1 (kit F5; execution contract E3): the candidate's interview room at
 * /portal/career/interview/<id>. The consent screen names recording AND AI scoring of the voice and words (the audio
 * only, never the video), gives "No" the same weight as "Yes", and says plainly that any no means unrecorded with no replay. The
 * meeting link appears only after the student's own decision, when the server says the room is ready.
 */
jest.mock('../../../../components/careerPrep/careerPrepFlag', () => ({ useCareerPrepFlag: jest.fn() }));
jest.mock('../../../../components/careerPrep/interviewRoom/interviewRoomApi', () => ({
  ...jest.requireActual('../../../../components/careerPrep/interviewRoom/interviewRoomApi'), fetchRoomApi: jest.fn(), decideRoomApi: jest.fn() }));
jest.mock('../../../../components/careerPrep/interviewsApi', () => ({ fetchPlacementInterviewsApi: jest.fn() }));
jest.mock('../../../../components/careerPrep/careerPrepApi', () => ({ fetchPrepDashboard: jest.fn() }));

const ID = 'pi-7';
const ZOOM = 'https://zoom.example/j/SECRET';
const room = (over: Partial<RoomData> = {}): RoomData => ({ interviewId: ID, you: 'candidate', company: 'Northwind', role: 'ML Engineer',
  startsAt: '2026-11-23T15:00:00.000Z', endsAt: '2026-11-23T15:30:00.000Z', opensAt: '2026-11-23T14:50:00.000Z', yourDecision: null,
  consent: { consented: 0, of: 2, declined: false, label: 'RECORDING 0 OF 2 CONSENTED' }, recording: { status: 'off', note: null },
  join: { status: 'decide_first', url: null, reason: 'Choose whether this interview may be recorded first.' }, ...over });
const ready = (decision: 'consent' | 'decline') => room({ yourDecision: decision, consent: { consented: decision === 'consent' ? 1 : 0, of: 2, declined: decision === 'decline', label: `RECORDING ${decision === 'consent' ? 1 : 0} OF 2 CONSENTED` },
  recording: decision === 'decline' ? { status: 'declined', note: 'Recording off: someone chose not to be recorded. The interview goes ahead unrecorded, with no replay.' } : { status: 'off', note: null },
  join: { status: 'ready', url: ZOOM, reason: null } });

let host: HTMLDivElement;
let root: Root;
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
// Microtask turns only (no timer), so it also works under fake timers.
const flush = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter initialEntries={[`/portal/career/interview/${ID}`]}><Routes><Route path="/portal/career/interview/:interviewId" element={<InterviewRoomPage />} /></Routes></MemoryRouter>); });
  await flush();
}
beforeEach(() => {
  (useCareerPrepFlag as jest.Mock).mockReturnValue(true);
  (fetchRoomApi as jest.Mock).mockReset().mockResolvedValue({ kind: 'ok', room: room() });
  (decideRoomApi as jest.Mock).mockReset();
  (fetchPlacementInterviewsApi as jest.Mock).mockReset().mockResolvedValue({ kpis: {}, interviews: [{ id: ID, prepId: 'i7' }] });
  (fetchPrepDashboard as jest.Mock).mockReset().mockResolvedValue({ readiness: { value: 61, target: 65, trend: [] }, interviews: [{ id: 'i7', target: 65, questions: ['Tell me about a model you shipped.'] }],
    skills: [{ key: 'a', label: 'Pace and clarity', score: 48, count: 4, sources: [] }, { key: 'b', label: 'Proof of work', score: 74, count: 4, sources: [] }, { key: 'c', label: 'Few filler words', score: 52, count: 4, sources: [] }] });
});
afterEach(() => { act(() => root.unmount()); host.remove(); jest.useRealTimers(); });

describe('the gate', () => {
  it('Career Prep off: the page does not exist; another learner\'s interview: not found', async () => {
    (useCareerPrepFlag as jest.Mock).mockReturnValue(false);
    await mount();
    expect($('cp-not-found')).not.toBeNull();
    expect(fetchRoomApi).not.toHaveBeenCalled();
    act(() => root.unmount()); host.remove();
    (useCareerPrepFlag as jest.Mock).mockReturnValue(true);
    (fetchRoomApi as jest.Mock).mockResolvedValue({ kind: 'not_found' });
    await mount();
    expect($('cp-iroom-notice')?.textContent).toMatch(/Interview not found/);
    expect($('cp-iroom-prep')).toBeNull();
  });
  it('not open yet: when it opens, no choice yet, no link', async () => {
    (fetchRoomApi as jest.Mock).mockResolvedValue({ kind: 'not_open', opensAt: '2026-11-23T14:50:00.000Z' });
    await mount();
    expect($('cp-iroom-opens')?.textContent).toMatch(/It opens Mon, Nov 23, 8:50 AM Central, 10 minutes before the start/);
    expect($('cp-iroom-consent-btn')).toBeNull();
    expect($('cp-iroom-open')).toBeNull();
  });
  it('a failed load is an alert with Try again, never an empty room', async () => {
    (fetchRoomApi as jest.Mock).mockResolvedValueOnce({ kind: 'failed', message: 'The interview room could not load. Check your connection and try again.' }).mockResolvedValueOnce({ kind: 'ok', room: room() });
    await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/could not load/);
    await act(async () => { $('cp-iroom-retry')?.click(); });
    await flush();
    expect($('cp-iroom-consent')).not.toBeNull();
  });
});

describe('the consent screen (E3)', () => {
  it('names recording AND AI scoring of the voice and words, from the audio only; says any no = unrecorded, no replay', async () => {
    await mount();
    const yes = $('cp-iroom-consent-yes')?.textContent || '';
    const no = $('cp-iroom-consent-no')?.textContent || '';
    expect(yes).toMatch(/recorded/); expect(yes).toMatch(/AI scores your voice and words/); expect(yes).toMatch(/scores the audio only; it never analyzes the video/);
    expect(no).toMatch(/If anyone says no, you included, the interview still goes ahead/); expect(no).toMatch(/not recorded, nothing is scored, and there is no replay/);
    expect($('cp-iroom-rec')?.textContent).toBe('RECORDING 0 OF 2 CONSENTED');
    expect($('cp-iroom-title')?.textContent).toBe('Northwind · ML Engineer');
  });
  it('"No" has the same weight as "Yes": the same element, the same class, both enabled, side by side', async () => {
    await mount();
    const y = $('cp-iroom-consent-btn') as HTMLButtonElement;
    const n = $('cp-iroom-decline-btn') as HTMLButtonElement;
    expect([y.tagName, y.className, y.disabled]).toEqual([n.tagName, n.className, n.disabled]);
    expect(y.parentElement).toBe(n.parentElement);
    expect([y.textContent, n.textContent]).toEqual([CONSENT_COPY.consent, CONSENT_COPY.decline]);
  });
  it('no meeting link anywhere before the decision', async () => {
    await mount();
    expect($('cp-iroom-open')).toBeNull();
    expect(host.innerHTML).not.toContain('zoom');
  });
});

describe('deciding', () => {
  it('a double click on Yes sends ONE decision, then Open the meeting appears (new tab, no referrer)', async () => {
    let finish: (v: unknown) => void = () => undefined;
    (decideRoomApi as jest.Mock).mockReturnValue(new Promise((r) => { finish = r; }));
    await mount();
    await act(async () => { $('cp-iroom-consent-btn')?.click(); $('cp-iroom-consent-btn')?.click(); });
    expect(decideRoomApi).toHaveBeenCalledTimes(1);
    expect(decideRoomApi).toHaveBeenCalledWith(ID, 'consent');
    expect(($('cp-iroom-decline-btn') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish({ kind: 'ok', room: ready('consent') }); });
    await flush();
    const a = $('cp-iroom-open') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe(ZOOM);
    expect([a.target, a.rel]).toEqual(['_blank', 'noopener noreferrer']);
    expect($('cp-iroom-mine')?.textContent).toBe('You said yes to recording.');
  });
  it('No: the interview still goes ahead, unrecorded, with no replay, and the link is given', async () => {
    (decideRoomApi as jest.Mock).mockResolvedValue({ kind: 'ok', room: ready('decline') });
    await mount();
    await act(async () => { $('cp-iroom-decline-btn')?.click(); });
    await flush();
    expect(decideRoomApi).toHaveBeenCalledWith(ID, 'decline');
    expect($('cp-iroom-mine')?.textContent).toMatch(/You said no to recording. The interview goes ahead unrecorded, with no replay/);
    expect($('cp-iroom-recnote')?.textContent).toMatch(/no replay/);
    expect($('cp-iroom-open')).not.toBeNull();
  });
  it('withheld: the reason and Try again, no link', async () => {
    (fetchRoomApi as jest.Mock).mockResolvedValue({ kind: 'ok', room: room({ yourDecision: 'consent', join: { status: 'withheld', url: null, reason: 'A recruiter is checking it.' } }) });
    await mount();
    expect($('cp-iroom-withheld')?.textContent).toMatch(/A recruiter is checking it/);
    expect($('cp-iroom-open')).toBeNull();
  });
  it(`'starting' re-reads every ${POLL_MS / 1000} s at most ${MAX_POLLS} times, then stops and offers Try again`, async () => {
    jest.useFakeTimers();
    (fetchRoomApi as jest.Mock).mockResolvedValue({ kind: 'ok', room: room({ yourDecision: 'consent', join: { status: 'starting', url: null, reason: 'Turning the recording on.' } }) });
    await mount();
    for (let i = 0; i < MAX_POLLS + 3; i += 1) await act(async () => { jest.advanceTimersByTime(POLL_MS); await Promise.resolve(); });
    expect(fetchRoomApi).toHaveBeenCalledTimes(1 + MAX_POLLS);
    expect($('cp-iroom-withheld')?.textContent).toMatch(/taking longer than usual/);
  });
});

describe('the prep panel (only the candidate sees it)', () => {
  it('readiness, ready-at, the questions and the two lowest skills; it can be hidden', async () => {
    await mount();
    await flush();
    const body = $('cp-iroom-prep-body')?.textContent || '';
    expect($('cp-iroom-readiness')?.textContent).toBe('61');
    expect(body).toMatch(/Ready at65/); expect(body).toMatch(/Tell me about a model you shipped/); expect(body).toMatch(/Lean on: Pace and clarity, Few filler words/);
    expect(fetchPrepDashboard).toHaveBeenCalledWith('i7');
    await act(async () => { $('cp-iroom-prep-toggle')?.click(); });
    expect($('cp-iroom-prep-body')).toBeNull();
    expect($('cp-iroom-prep-toggle')?.getAttribute('aria-expanded')).toBe('false');
  });
  it('no prep row: says so; a failed load: an alert, and the room still works', async () => {
    (fetchPlacementInterviewsApi as jest.Mock).mockResolvedValue({ kpis: {}, interviews: [] });
    await mount(); await flush();
    expect($('cp-iroom-prep-none')).not.toBeNull();
    act(() => root.unmount()); host.remove();
    (fetchPlacementInterviewsApi as jest.Mock).mockRejectedValue(new Error('down'));
    await mount(); await flush();
    expect($('cp-iroom-prep')?.querySelector('[role="alert"]')?.textContent).toMatch(/could not load/);
    expect($('cp-iroom-consent')).not.toBeNull();
  });
});

describe('roomAnswer (every server answer to one page state)', () => {
  it('maps 200, 403, 410, 409, 404, 429 and anything else', () => {
    expect(roomAnswer(200, { room: room() }).kind).toBe('ok');
    expect(roomAnswer(200, {}).kind).toBe('failed');
    expect(roomAnswer(403, { opensAt: 'x' })).toEqual({ kind: 'not_open', opensAt: 'x' });
    expect(roomAnswer(410, { reason: 'moved', error: 'Moved.' })).toEqual({ kind: 'gone', reason: 'moved', message: 'Moved.' });
    expect(roomAnswer(410, { reason: 'odd' }).kind).toBe('failed');
    expect(roomAnswer(409, {}).kind).toBe('not_ready');
    expect(roomAnswer(404, {}).kind).toBe('not_found');
    expect(roomAnswer(429, {}).kind).toBe('busy');
    for (const s of [0, 500, 401]) expect(roomAnswer(s, null).kind).toBe('failed');
  });
});

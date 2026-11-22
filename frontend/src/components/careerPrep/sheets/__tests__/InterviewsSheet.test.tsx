import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import type { PlacementInterview, PlacementInterviews } from '../../interviewsApi';
import { AVAILABILITY_LINK, InterviewsSheet, joinIsOpen, readAsText } from '../InterviewsSheet';
import { foldLine, interviewIcs } from '../../logic/interviewIcs';

/** CP8.3 (kit F4): the #interviews sheet shows only what the server says; a failed load is an alert, never an empty list. */
const mockFetch = jest.fn();
const mockReplay = jest.fn();
jest.mock('../../interviewsApi', () => ({ fetchPlacementInterviewsApi: (...a: unknown[]) => mockFetch(...a), fetchReplayApi: (...a: unknown[]) => mockReplay(...a),
  replayMediaUrl: (p: string) => `https://api.example${p}` }));

const START = '2026-11-23T15:00:00.000Z'; // Mon 9:00 AM CST
const booked: PlacementInterview = { id: 'iv-1', company: 'Acme', role: 'Data Analyst', state: 'booked', stateLabel: 'Booked', startsAt: START, minutes: 45,
  readAs: 'Technical', confidence: 0.97, roomPage: '/portal/career/interview/iv-1', joinOpensAt: '2026-11-23T14:50:00.000Z', joinClosesAt: '2026-11-23T15:45:00.000Z',
  prepId: 'prep-1', history: [{ at: '2026-11-20T16:05:00.000Z', label: 'Found in your job-search inbox' }, { at: '2026-11-21T19:30:00.000Z', label: 'Booked' }] };
const waiting: PlacementInterview = { ...booked, id: 'iv-2', company: 'Beta', role: null, state: 'awaiting', stateLabel: 'Waiting on employer', startsAt: null,
  readAs: null, confidence: 0.96, roomPage: null, joinOpensAt: null, joinClosesAt: null, prepId: null, history: [] };
const DATA: PlacementInterviews = { kpis: { upcoming: 1, waiting: 1, recruiter: 0, held: 0 }, interviews: [booked, waiting] };

let host: HTMLDivElement | null = null;
let root: Root | null = null;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function mount(now: number, children?: React.ReactNode): Promise<HTMLDivElement> {
  const h = document.createElement('div'); document.body.appendChild(h);
  const r = createRoot(h); host = h; root = r;
  act(() => { r.render(<MemoryRouter><InterviewsSheet now={now}>{children}</InterviewsSheet></MemoryRouter>); });
  await flush();
  return h;
}
const q = (h: HTMLElement, id: string) => h.querySelector(`[data-testid="${id}"]`);
const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });
beforeEach(() => { mockFetch.mockReset(); mockReplay.mockReset(); });

describe('the #interviews sheet (CP8.3)', () => {
  it('the four KPIs and the next interview in Central; Join waits until 10 minutes before', async () => {
    mockFetch.mockResolvedValue(DATA);
    const h = await mount(Date.parse('2026-11-23T14:49:00Z'));
    expect([...h.querySelectorAll('[data-testid^="cp-ivs-kpi-"]')].map((e) => e.textContent)).toEqual(['1', '1', '0', '0']);
    expect(q(h, 'cp-ivs-kpis')?.textContent).toContain('With your recruiter');
    const next = q(h, 'cp-ivs-next')?.textContent ?? '';
    expect(next).toContain('Acme · Data Analyst');
    expect(next).toContain('Mon, Nov 23, 9:00 AM Central · 45 min');
    expect(q(h, 'cp-ivs-join')).toBeNull();
    expect(q(h, 'cp-ivs-join-later')?.textContent).toBe('Join opens Mon, Nov 23, 8:50 AM Central');
  });
  it('from 10 minutes before: Join live is the consent-room page; Continue prep anchors the room; Add to calendar carries the page', async () => {
    mockFetch.mockResolvedValue(DATA);
    const h = await mount(Date.parse('2026-11-23T14:50:00Z'));
    expect(q(h, 'cp-ivs-join')?.getAttribute('href')).toBe('/portal/career/interview/iv-1');
    expect(q(h, 'cp-ivs-prep')?.getAttribute('href')).toBe('/portal/career/room?anchor=prep-1');
    const ics = decodeURIComponent(String(q(h, 'cp-ivs-ics')?.getAttribute('href')).replace(/^data:text\/calendar;charset=utf-8,/, ''));
    expect(ics).toContain('URL:http://localhost/portal/career/interview/iv-1');
    expect(ics).toContain('DTSTART:20261123T150000Z');
    expect(ics).toContain('DTEND:20261123T154500Z');
    expect(q(h, 'cp-ivs-ics')?.getAttribute('download')).toBe('interview.ics');
  });
  it('every interview with its state and how it was read; History opens in Central and Close returns focus', async () => {
    mockFetch.mockResolvedValue(DATA);
    const h = await mount(Date.parse('2026-11-22T12:00:00Z'));
    expect(q(h, 'cp-ivs-row-iv-1')?.textContent).toContain('Technical 97%');
    expect(q(h, 'cp-ivs-row-iv-2')?.textContent).toContain('Not booked yet');
    expect(q(h, 'cp-ivs-row-iv-2')?.textContent).toContain('Waiting on employer');
    expect(q(h, 'cp-ivs-row-iv-2')?.textContent).toContain('Interview 96%');
    click(q(h, 'cp-ivs-history-iv-1'));
    const drawer = q(h, 'cp-ivs-history');
    expect(drawer?.textContent).toContain('History: Acme · Data Analyst');
    expect([...(drawer?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'Fri, Nov 20, 10:05 AM Central Found in your job-search inbox', 'Sat, Nov 21, 1:30 PM Central Booked']);
    expect(document.activeElement?.id).toBe('cp-ivs-history-title');
    click(q(h, 'cp-ivs-history-close'));
    expect(q(h, 'cp-ivs-history')).toBeNull();
    expect(document.activeElement).toBe(q(h, 'cp-ivs-history-iv-1'));
    click(q(h, 'cp-ivs-history-iv-2'));
    expect(q(h, 'cp-ivs-history')?.textContent).toContain('Nothing recorded for this interview yet.');
  });
  it('nothing yet: an honest empty line, how interviews work, the availability link, and the sections below', async () => {
    mockFetch.mockResolvedValue({ kpis: { upcoming: 0, waiting: 0, recruiter: 0, held: 0 }, interviews: [] });
    const h = await mount(Date.parse('2026-11-22T12:00:00Z'), <p data-testid="below">below</p>);
    expect(q(h, 'cp-ivs-empty')?.textContent).toContain('No interview has come through your job-search inbox yet.');
    expect(q(h, 'cp-ivs-next')).toBeNull();
    expect(q(h, 'cp-ivs-how')?.querySelectorAll('li')).toHaveLength(4);
    expect(q(h, 'cp-ivs-availability')?.getAttribute('href')).toBe(AVAILABILITY_LINK);
    expect(q(h, 'below')).not.toBeNull();
  });
  it('a failed load is an alert, never an empty list', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const h = await mount(Date.parse('2026-11-22T12:00:00Z'));
    expect(q(h, 'cp-ivs-failed')?.getAttribute('role')).toBe('alert');
    expect(q(h, 'cp-ivs-empty')).toBeNull();
    expect(q(h, 'cp-ivs-kpis')).toBeNull();
  });
  it('CP9.2: once a replay is scored the KPI reads "Held and scored", the row shows the score, the drawer the replay', async () => {
    const held: PlacementInterview = { ...waiting, id: 'iv-3', company: 'Gamma', state: 'done', stateLabel: 'Held', startsAt: START,
      replay: { status: 'scored', note: 'Scored from the audio and the words only, never the video.', score: 81 } };
    const unrecorded: PlacementInterview = { ...held, id: 'iv-4', replay: { status: 'not_recorded', note: 'Not recorded: someone chose not to be recorded, so there is no replay.', score: null } };
    mockReplay.mockResolvedValue({ interviewId: 'iv-3', company: 'Gamma', role: null, startsAt: START, status: 'scored', note: 'x', score: 81,
      recording: '/api/public/replays/iv-3/recording?x=1&t=sig', questions: [{ n: 1, question: 'Tell me about a pipeline.', answer: 'I built one.', at: 67, seconds: 20,
        pace: { score: 100, value: '117 wpm', target: '100 to 165 wpm' }, fillers: { score: 90, value: '1 (2%)', target: 'under 3% of words' }, content: { score: 50, covered: 1, of: 2 } }] });
    mockFetch.mockResolvedValue({ kpis: { upcoming: 0, waiting: 0, recruiter: 0, held: 2, scored: 1 }, interviews: [held, unrecorded] });
    const h = await mount(Date.parse('2026-11-24T12:00:00Z'));
    expect(q(h, 'cp-ivs-kpis')?.textContent).toContain('Held and scored');
    expect(q(h, 'cp-ivs-kpi-scored')?.textContent).toBe('1 scored');
    expect(q(h, 'cp-ivs-score-iv-3')?.textContent).toBe(' Score 81');
    expect(q(h, 'cp-ivs-score-iv-4')).toBeNull();
    click(q(h, 'cp-ivs-history-iv-3'));
    await flush();
    expect(mockReplay).toHaveBeenCalledWith('iv-3');
    expect(q(h, 'cp-ivs-replay')?.textContent).toContain('Replay: score 81');
    expect(q(h, 'cp-ivs-replay-video')?.getAttribute('src')).toBe('https://api.example/api/public/replays/iv-3/recording?x=1&t=sig');
    expect(q(h, 'cp-ivs-q-1')?.textContent).toContain('Question 1: Tell me about a pipeline.');
    expect(q(h, 'cp-ivs-q-1')?.textContent).toContain('At 1:07, 20 seconds. You said: I built one.');
    expect(q(h, 'cp-ivs-q-1')?.textContent).toContain('Covered the question 50: 1 of 2 key words');
    click(q(h, 'cp-ivs-history-iv-4'));
    expect(q(h, 'cp-ivs-replay-note')?.textContent).toBe('Not recorded: someone chose not to be recorded, so there is no replay.');
    expect(mockReplay).toHaveBeenCalledTimes(1); // nothing to load for an unrecorded interview
  });
  it('CP9.2: no replay scored yet keeps the KPI "Held"; a failed replay load is an alert', async () => {
    const held: PlacementInterview = { ...waiting, id: 'iv-3', state: 'done', stateLabel: 'Held', replay: { status: 'no_score', note: 'Recorded, but nothing was scored.', score: null } };
    mockFetch.mockResolvedValue({ kpis: { upcoming: 0, waiting: 0, recruiter: 0, held: 1, scored: 0 }, interviews: [held] });
    mockReplay.mockRejectedValue(new Error('offline'));
    const h = await mount(Date.parse('2026-11-24T12:00:00Z'));
    expect(q(h, 'cp-ivs-kpis')?.textContent).not.toContain('scored');
    click(q(h, 'cp-ivs-history-iv-3'));
    await flush();
    expect(q(h, 'cp-ivs-replay-failed')?.getAttribute('role')).toBe('alert');
    expect(q(h, 'cp-ivs-replay-video')).toBeNull();
  });
  it('a booked interview that is over is not "next"; nothing to join for one not booked', async () => {
    mockFetch.mockResolvedValue(DATA);
    const h = await mount(Date.parse('2026-11-23T15:46:00Z'));
    expect(q(h, 'cp-ivs-next')).toBeNull();
    expect(joinIsOpen(waiting, Date.parse('2026-11-23T15:00:00Z'))).toBe(false);
    expect(readAsText({ ...waiting, confidence: null })).toBe('Not read yet');
  });
});

describe('interviewIcs (CP8.3)', () => {
  it('only for a booked interview; text escaped; the link is this site\'s room page', () => {
    expect(interviewIcs(waiting, 'https://enterprise.colaberry.ai', 0)).toBeNull();
    const ics = interviewIcs({ ...booked, company: 'Acme, Inc; East', role: null }, 'https://enterprise.colaberry.ai/', Date.parse('2026-11-21T00:00:00Z')) as string;
    expect(ics).toContain('SUMMARY:Interview: Acme\\, Inc\\; East');
    expect(ics).toContain('URL:https://enterprise.colaberry.ai/portal/career/interview/iv-1');
    expect(ics).toContain('UID:placement-iv-1@refactored.ai');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
  it('folds every line to at most 75 octets (continuations start with a space, no character split) and unfolds to the original', () => {
    const E = String.fromCharCode(0xe9); // a 2-octet character, so a fold must never split it
    const company = `Acme ${'Long Name '.repeat(12)}Caf${E} ${E}tudes`;
    const ics = interviewIcs({ ...booked, company }, 'https://enterprise.colaberry.ai', 0) as string;
    const lines = ics.split('\r\n').filter((l) => l !== '');
    const bytes = (l: string) => [...l].reduce((n, ch) => { const c = ch.codePointAt(0) as number; return n + (c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4); }, 0);
    expect(Math.max(...lines.map(bytes))).toBeLessThanOrEqual(75);
    expect(lines.filter((l) => l.startsWith(' ')).length).toBeGreaterThanOrEqual(2);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:Interview: ${company.replace(/,/g, '\\,')}\\, Data Analyst`);
    expect(unfolded).toContain('URL:https://enterprise.colaberry.ai/portal/career/interview/iv-1');
    expect(foldLine('x'.repeat(75))).toBe('x'.repeat(75));
    expect(foldLine('x'.repeat(76))).toBe(`${'x'.repeat(75)}\r\n x`);
  });
});

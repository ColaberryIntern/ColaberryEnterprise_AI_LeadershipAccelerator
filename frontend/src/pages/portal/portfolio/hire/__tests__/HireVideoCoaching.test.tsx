import React from 'react';
import { act } from 'react';
import HireIntroVideo from '../HireIntroVideo';
import * as api from '../../../../../services/hireStudioApi';
import * as H from '../../../../admin/__fixtures__/domHarness';
import { hasLive, liveAt, marks, scoreTone } from '../hireCoachModel';

/**
 * Live coaching (2026-11-14): the coach view updates with playback, every moment can be jumped to,
 * scores name their source, and a failed run offers "Try again". The futuristic frame is
 * decoration only: nothing in it claims to read the face.
 */
jest.mock('../../../../../services/hireStudioApi', () => ({
  ...jest.requireActual('../../../../../services/hireStudioApi'),
  fetchHireVideo: jest.fn(), uploadHireVideo: jest.fn(), updateHireVideo: jest.fn(), deleteHireVideo: jest.fn(),
}));
const m = api as jest.Mocked<typeof api>;
afterEach(() => { H.unmount(); jest.clearAllMocks(); });

const COACHING: api.VideoCoaching = {
  version: 2, seconds: 60, notes: ['You said "um" 3 times. A short pause works better than a filler.'], words: 140, wordsPerMinute: 140,
  pace: [{ t: 5, wpm: 90 }, { t: 10, wpm: 140 }, { t: 15, wpm: 180 }],
  fillerTotal: 3, hedgeTotal: 1, pauses: { short: 2, medium: 1, long: 1 },
  events: [
    { t: 2, kind: 'filler', label: 'um' }, { t: 6, kind: 'pause', label: 'long', dur: 2.4 }, { t: 7, kind: 'pause', label: 'short', dur: 0.6 },
    { t: 12, kind: 'hedge', label: 'i think' }, { t: 20, kind: 'filler', label: 'um' }, { t: 30, kind: 'filler', label: 'like' },
  ],
  scores: [{ key: 'pace', label: 'Pace', score: 100, value: '140 wpm', target: '100 to 165 wpm', source: 'Microsoft Speaker Coach: 100 to 165 words a minute' }],
  voice: { energy: Array.from({ length: 120 }, (_, i) => (i % 10) / 10), pitchVariation: 2.4, loudnessRange: 9 },
  content: { topTip: 'Lead with the result.', points: [{ key: 'proof', label: 'One problem, and what changed', level: 'strong', note: 'Clear result.', quote: 'cut it to 20 minutes' }] },
};

const VIDEO: api.HireVideo = {
  status: 'draft', seconds: 60, streamUrl: '/s?t=1', posterUrl: '/p?t=1', captionsUrl: '/c?t=1', captionsWanted: true, analysis: 'done', coaching: COACHING,
};

async function open(video: api.HireVideo) {
  m.fetchHireVideo.mockResolvedValue(video);
  H.mount(<HireIntroVideo onChanged={jest.fn()} />, '/');
  await H.settle();
}

function playTo(t: number) {
  const v = H.el('hs-video-player') as HTMLVideoElement;
  Object.defineProperty(v, 'currentTime', { value: t, writable: true, configurable: true });
  act(() => { v.dispatchEvent(new Event('timeupdate')); });
}

describe('liveAt', () => {
  it('counts only what has been said by now, and flashes a filler for about a second', () => {
    expect(liveAt(COACHING, 1)).toMatchObject({ fillers: 0, hedges: 0, wpm: null, flash: null });
    expect(liveAt(COACHING, 2.5)).toMatchObject({ fillers: 1, flash: { label: 'um' } });
    expect(liveAt(COACHING, 4).flash).toBeNull();
    expect(liveAt(COACHING, 12)).toMatchObject({ fillers: 1, hedges: 1, wpm: 140, paceBand: 'good' });
    expect(liveAt(COACHING, 16)).toMatchObject({ wpm: 180, paceBand: 'fast' });
  });

  it('knows when the speaker is pausing, and reads the real voice level', () => {
    expect(liveAt(COACHING, 7).pausing).toBe(true);
    expect(liveAt(COACHING, 9).pausing).toBe(false);
    expect(liveAt(COACHING, 1.6).energy).toBe(0.3);
  });

  it('marks fillers, hedges and long pauses, not short ones; old coaching has no live view', () => {
    expect(marks(COACHING).map((e) => e.t)).toEqual([2, 6, 12, 20, 30]);
    expect(hasLive({ seconds: 60, notes: ['x'] })).toBe(false);
    expect([scoreTone(90), scoreTone(60), scoreTone(10)]).toEqual(['good', 'ok', 'low']);
  });
});

describe('coach view', () => {
  it('updates the tiles as the video plays', async () => {
    await open(VIDEO);
    expect(H.el('hs-hud')).toBeTruthy();
    playTo(2.4);
    expect(H.el('hud-fillers').textContent).toContain('1 / 3');
    expect(H.el('hud-flash').textContent).toBe('“um”');
    playTo(12);
    expect(H.el('hud-pace').textContent).toContain('140');
    expect(H.el('hud-pace').textContent).toContain('In the zone');
    expect(H.el('hud-hedges').textContent).toContain('1 / 1');
  });

  it('never claims to read the face', async () => {
    await open(VIDEO);
    expect(H.el('hs-hud').textContent).not.toMatch(/face|eye|emotion|expression|smile/i);
  });

  it('scores show their source; a moment jumps playback to just before it', async () => {
    await open(VIDEO);
    expect(H.el('hs-score-pace').textContent).toContain('Microsoft Speaker Coach');
    expect(H.el('hs-toptip').textContent).toContain('Lead with the result.');
    expect(H.el('hs-point-proof').textContent).toContain('cut it to 20 minutes');
    const v = H.el('hs-video-player') as HTMLVideoElement;
    const jump = [...document.querySelectorAll('.hs-moment')].find((b) => b.textContent!.includes('0:20')) as HTMLButtonElement;
    act(() => { jump.click(); });
    await H.settle();
    expect(v.currentTime).toBeCloseTo(19.5);
  });

  it('a failed run says the video is fine and offers Try again', async () => {
    m.updateHireVideo.mockResolvedValue({ ...VIDEO, analysis: 'pending', coaching: null });
    await open({ ...VIDEO, analysis: 'failed', coaching: null });
    expect(H.el('hs-coaching').textContent).toContain('Your video is fine');
    H.click('hs-reanalyze');
    await H.settle();
    expect(m.updateHireVideo).toHaveBeenCalledWith({ reanalyze: true });
    expect(H.el('hs-coaching').textContent).toContain('Listening to your video');
  });
});

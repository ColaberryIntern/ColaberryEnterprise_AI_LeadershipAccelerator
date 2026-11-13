import React from 'react';
import { act } from 'react';
import HireIntroVideo from '../HireIntroVideo';
import * as api from '../../../../../services/hireStudioApi';
import * as H from '../../../../admin/__fixtures__/domHarness';
import { pickRecorderType, recClock, recordingName, uploadProblem } from '../hireVideoModel';

/** The intro video section (kit §3.2): draft until Publish, honest about analysis, and safe to get wrong. */
jest.mock('../../../../../services/hireStudioApi', () => ({
  ...jest.requireActual('../../../../../services/hireStudioApi'),
  fetchHireVideo: jest.fn(), uploadHireVideo: jest.fn(), updateHireVideo: jest.fn(), deleteHireVideo: jest.fn(),
}));
const m = api as jest.Mocked<typeof api>;
afterEach(() => { H.unmount(); jest.clearAllMocks(); });

const DRAFT: api.HireVideo = {
  status: 'draft', seconds: 84, streamUrl: '/api/public/hire/video/abc/stream?t=1', posterUrl: '/api/public/hire/video/abc/poster?t=1',
  captionsUrl: null, captionsWanted: true, analysis: 'off', coaching: null,
};

async function open(video: api.HireVideo | null, onChanged = jest.fn()) {
  m.fetchHireVideo.mockResolvedValue(video);
  H.mount(<HireIntroVideo onChanged={onChanged} />, '/');
  await H.settle();
  return onChanged;
}

function pick(file: File) {
  const input = H.el('hs-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('Intro video', () => {
  it('with no video: the three prompts, Start recording and Upload, and no status', async () => {
    await open(null);
    expect(H.text()).toContain('Who you are, and the role you want next.');
    expect(H.el('hs-rec-start').textContent).toBe('Start recording');
    expect(H.el('hs-upload').textContent).toBe('Upload a video');
    expect(H.query('hs-video-status')).toBeNull();
  });

  it('an upload becomes a draft that only the candidate sees, and the studio hears about it', async () => {
    m.uploadHireVideo.mockResolvedValue(DRAFT);
    const onChanged = await open(null);
    pick(new File(['x'], 'take.mov', { type: 'video/quicktime' }));
    await H.settle();
    expect(m.uploadHireVideo.mock.calls[0][1]).toBe('take.mov');
    expect(H.el('hs-video-status').textContent).toBe('Draft, only you can see it');
    expect(H.el('hs-publish').textContent).toBe('Publish to Hire');
    expect(onChanged).toHaveBeenCalledWith({ status: 'draft', seconds: 84 });
  });

  it('refuses a non-video before sending it, and shows the server\'s sentence when it refuses', async () => {
    await open(null);
    pick(new File(['%PDF'], 'resume.pdf', { type: 'application/pdf' }));
    expect(H.el('hs-video-msg').textContent).toContain('not a video');
    expect(m.uploadHireVideo).not.toHaveBeenCalled();
    m.uploadHireVideo.mockRejectedValue({ response: { status: 400, data: { error: 'That video is too short. Aim for about 90 seconds.' } } });
    pick(new File(['x'], 'a.mp4', { type: 'video/mp4' }));
    await H.settle();
    expect(H.el('hs-video-msg').textContent).toBe('That video is too short. Aim for about 90 seconds.');
  });

  it('Publish puts it on Hire; Unpublish takes it off', async () => {
    m.updateHireVideo.mockResolvedValueOnce({ ...DRAFT, status: 'published' }).mockResolvedValueOnce(DRAFT);
    const onChanged = await open(DRAFT);
    H.click('hs-publish');
    await H.settle();
    expect(m.updateHireVideo).toHaveBeenCalledWith({ published: true });
    expect(H.el('hs-video-status').textContent).toBe('Live on Hire');
    expect(onChanged).toHaveBeenLastCalledWith({ status: 'published', seconds: 84 });
    H.click('hs-publish');
    await H.settle();
    expect(m.updateHireVideo).toHaveBeenLastCalledWith({ published: false });
  });

  it('captions are a saved choice, and coaching says plainly when analysis is not on', async () => {
    m.updateHireVideo.mockResolvedValue({ ...DRAFT, captionsWanted: false });
    await open(DRAFT);
    expect(H.el('hs-coaching').textContent).toContain('not switched on yet');
    expect(H.el('hs-coaching').textContent).toContain('never on Hire');
    H.toggle('hs-captions');
    await H.settle();
    expect(m.updateHireVideo).toHaveBeenCalledWith({ captionsWanted: false });
  });

  it('shows coaching notes once analysis is done', async () => {
    await open({ ...DRAFT, analysis: 'done', coaching: { seconds: 125, notes: ['2:05, over the 90s target. Try trimming it to 90 seconds.', 'You said "um" 9 times.'] } });
    expect(H.el('hs-coaching').textContent).toContain('You said "um" 9 times.');
  });

  it('delete asks once more, then removes it', async () => {
    m.deleteHireVideo.mockResolvedValue(undefined);
    const onChanged = await open(DRAFT);
    H.click('hs-delete');
    expect(m.deleteHireVideo).not.toHaveBeenCalled();
    H.click('hs-delete-confirm');
    await H.settle();
    expect(m.deleteHireVideo).toHaveBeenCalled();
    expect(onChanged).toHaveBeenLastCalledWith(null);
    expect(H.el('hs-rec-start').textContent).toBe('Start recording');
  });

  it('a browser that cannot record says so and points at upload', async () => {
    await open(null);
    H.click('hs-rec-start');
    await H.settle();
    expect(H.el('hs-rec-problem').textContent).toContain('Upload a video');
  });

  it('a failed read offers a retry and loses nothing', async () => {
    m.fetchHireVideo.mockRejectedValueOnce(new Error('net'));
    H.mount(<HireIntroVideo onChanged={jest.fn()} />, '/');
    await H.settle();
    expect(H.text()).toContain('Nothing you saved is lost');
  });
});

describe('the video rules', () => {
  it('picks the first format the browser can record, or none', () => {
    expect(pickRecorderType((t) => t === 'video/mp4')).toBe('video/mp4'); // Safari
    expect(pickRecorderType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickRecorderType(() => false)).toBeNull();
    expect(pickRecorderType(undefined)).toBeNull();
    expect(recordingName('video/mp4')).toBe('intro.mp4');
    expect(recordingName('video/webm;codecs=vp8,opus')).toBe('intro.webm');
  });

  it('checks size and type before an upload, and formats the REC clock', () => {
    expect(uploadProblem({ name: 'a.mov', type: '', size: 10 })).toBeNull(); // some browsers send no type
    expect(uploadProblem({ name: 'a.mp4', type: 'video/mp4', size: 101 * 1024 * 1024 })).toMatch(/over 100 MB/);
    expect(uploadProblem({ name: 'a.mp4', type: 'video/mp4', size: 0 })).toMatch(/empty/);
    expect(recClock(42.9)).toBe('0:42');
    expect(recClock(90)).toBe('1:30');
  });
});

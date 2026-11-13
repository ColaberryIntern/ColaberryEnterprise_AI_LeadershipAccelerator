import React from 'react';
import HireIntroVideo from '../HireIntroVideo';
import * as api from '../../../../../services/hireStudioApi';
import * as H from '../../../../admin/__fixtures__/domHarness';

/**
 * A recorded take is shown back before anything is uploaded, and an EMPTY take (a camera that
 * never delivered frames) is caught here instead of being uploaded. The recorder itself needs a
 * camera, so it is replaced by two buttons that hand back a take of a chosen size.
 */
jest.mock('../HireVideoRecorder', () => ({
  __esModule: true,
  default: ({ onTake }: { onTake: (b: Blob, n: string) => void }) => (
    <>
      <button type="button" data-testid="fake-empty" onClick={() => onTake(new Blob([new Uint8Array(201)], { type: 'video/webm' }), 'intro.webm')}>empty</button>
      <button type="button" data-testid="fake-real" onClick={() => onTake(new Blob([new Uint8Array(200_000)], { type: 'video/webm' }), 'intro.webm')}>real</button>
    </>
  ),
}));
jest.mock('../../../../../services/hireStudioApi', () => ({
  ...jest.requireActual('../../../../../services/hireStudioApi'),
  fetchHireVideo: jest.fn(), uploadHireVideo: jest.fn(),
}));
const m = api as jest.Mocked<typeof api>;

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:take');
  URL.revokeObjectURL = jest.fn();
});
afterEach(() => { H.unmount(); jest.clearAllMocks(); });

it('an empty take is refused with a sentence and never uploaded', async () => {
  m.fetchHireVideo.mockResolvedValue(null);
  H.mount(<HireIntroVideo onChanged={jest.fn()} />, '/');
  await H.settle();
  H.click('hs-rec-start');
  H.click('fake-empty');
  expect(H.el('hs-video-msg').textContent).toContain('came out empty');
  expect(H.query('hs-review')).toBeNull();
  expect(m.uploadHireVideo).not.toHaveBeenCalled();
});

it('a real take is shown back first, and uploaded only on Use this take', async () => {
  m.fetchHireVideo.mockResolvedValue(null);
  m.uploadHireVideo.mockResolvedValue(null);
  H.mount(<HireIntroVideo onChanged={jest.fn()} />, '/');
  await H.settle();
  H.click('hs-rec-start');
  H.click('fake-real');
  expect(H.el('hs-review')).toBeTruthy();
  expect(m.uploadHireVideo).not.toHaveBeenCalled();
  H.click('hs-use-take');
  await H.settle();
  expect(m.uploadHireVideo.mock.calls[0][1]).toBe('intro.webm');
});

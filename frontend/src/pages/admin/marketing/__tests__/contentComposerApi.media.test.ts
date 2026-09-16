/**
 * The attach call must hand the browser's upload events to the caller and must send multipart,
 * not JSON. Both are properties of the axios config this function builds, so the test captures
 * that config and drives it.
 */

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn(), delete: jest.fn() } }));

import api from '../../../../utils/api';
import { attachMedia } from '../../../../services/contentComposerApi';

const post = api.post as jest.Mock;
const get = api.get as jest.Mock;

beforeEach(() => { post.mockReset(); get.mockReset(); get.mockResolvedValue({ data: { media: [] } }); });

it('sends multipart with the file and alt text, and relays upload progress to the caller', async () => {
  post.mockResolvedValue({ data: { media: {} } });
  const seen: Array<[number, number]> = [];
  const file = new File([new Uint8Array(1000)], 'clip.mp4', { type: 'video/mp4' });

  const pending = attachMedia('11111111-1111-4111-8111-111111111111', file, 'A clip', (sent, total) => seen.push([sent, total]));
  const [url, body, config] = post.mock.calls[0];
  expect(url).toBe('/api/admin/content/11111111-1111-4111-8111-111111111111/media');
  expect(body).toBeInstanceOf(FormData);
  expect((body as FormData).get('alt_text')).toBe('A clip');
  expect(((body as FormData).get('file') as File).name).toBe('clip.mp4');
  // Without this override the shared instance's JSON content type makes axios serialise the
  // FormData to JSON and the file arrives as {}.
  expect(config.headers['Content-Type']).toBe('multipart/form-data');

  config.onUploadProgress({ loaded: 250, total: 1000 });
  config.onUploadProgress({ loaded: 1000, total: 1000 });
  config.onUploadProgress({ loaded: 300 });           // a browser that does not know the total
  await pending;
  expect(seen).toEqual([[250, 1000], [1000, 1000], [300, 1000]]); // fallback is the file size
  expect(get).toHaveBeenCalledWith('/api/admin/content/11111111-1111-4111-8111-111111111111/media');
});

it('works without a progress callback', async () => {
  post.mockResolvedValue({ data: { media: {} } });
  await attachMedia('11111111-1111-4111-8111-111111111111', new File(['x'], 'a.png', { type: 'image/png' }), 'Alt');
  expect(() => post.mock.calls[0][2].onUploadProgress({ loaded: 1, total: 1 })).not.toThrow();
});

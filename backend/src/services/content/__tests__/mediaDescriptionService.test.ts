import { describeItemMedia } from '../mediaDescriptionService';

jest.mock('../../media/mediaAssetService', () => ({ listItemMedia: jest.fn() }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

const { listItemMedia } = require('../../media/mediaAssetService') as { listItemMedia: jest.Mock };
const { getInstrumentedOpenAI } = require('../../openaiInstrumented') as { getInstrumentedOpenAI: jest.Mock };

/**
 * The failure this exists to prevent is not "no description" - it is a CONFIDENT one.
 *
 * A vision model reads a still image. It cannot watch an mp4. If a video were handed to it and
 * the result passed along as though the footage had been reviewed, the composer would produce
 * copy describing things that may not be in the video at all, and the operator would have no
 * way to tell. That is worse than having no description, because it reads exactly like having a
 * good one.
 *
 * So most of these tests are about what is NOT claimed.
 */

const view = (over: Partial<Record<string, unknown>> = {}) => ({
  mediaAssetId: 'm-1',
  mimeType: 'image/jpeg',
  byteSize: 1000,
  width: 1200,
  height: 800,
  altText: null,
  position: 0,
  originalFilename: 'workshop.jpg',
  durationMs: null,
  pages: null,
  url: 'https://example.test/m/abc?e=1&s=sig',
  ...over,
});

function mockVision(content: string) {
  getInstrumentedOpenAI.mockReturnValue({
    chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content } }] }) } },
  });
}

beforeEach(() => {
  listItemMedia.mockReset();
  getInstrumentedOpenAI.mockReset();
});

describe('a video is never described as though it was watched', () => {
  it('reports basis "metadata" and does not call the vision model', async () => {
    listItemMedia.mockResolvedValue([view({ mimeType: 'video/mp4', durationMs: 32000, width: 1080, height: 1920 })]);
    const create = jest.fn();
    getInstrumentedOpenAI.mockReturnValue({ chat: { completions: { create } } });

    const out = await describeItemMedia('item-1');

    expect(out.basis).toBe('metadata');
    expect(create).not.toHaveBeenCalled();
    // What it DOES say is true and useful: shape and length matter for a reel.
    expect(out.text).toContain('A video');
    expect(out.text).toContain('32 seconds');
    expect(out.text).toContain('vertical');
  });

  it('prefers the uploader\'s own words over the filename', async () => {
    listItemMedia.mockResolvedValue([view({
      mimeType: 'video/mp4', altText: 'Ali closing the open house', originalFilename: 'IMG_4417.mov',
    })]);
    getInstrumentedOpenAI.mockReturnValue({ chat: { completions: { create: jest.fn() } } });

    const out = await describeItemMedia('item-1');
    expect(out.text).toContain('Ali closing the open house');
    expect(out.text).not.toContain('IMG_4417');
  });
});

describe('an image is actually read', () => {
  it('returns the description and reports basis "vision"', async () => {
    listItemMedia.mockResolvedValue([view()]);
    mockVision('A group of people seated at tables with laptops. A screen at the front reads "Open House".');

    const out = await describeItemMedia('item-1');
    expect(out.basis).toBe('vision');
    expect(out.text).toContain('Open House');
    // Metadata is kept alongside, because shape and filename still matter downstream.
    expect(out.text).toContain('An image');
  });

  it('sends the signed URL, which is what makes it readable at all', async () => {
    listItemMedia.mockResolvedValue([view()]);
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'A room.' } }] });
    getInstrumentedOpenAI.mockReturnValue({ chat: { completions: { create } } });

    await describeItemMedia('item-1');
    const body = JSON.stringify(create.mock.calls[0][0]);
    expect(body).toContain('https://example.test/m/abc');
  });
});

describe('nothing here can break a draft', () => {
  it('a vision failure falls back to metadata rather than throwing', async () => {
    listItemMedia.mockResolvedValue([view()]);
    getInstrumentedOpenAI.mockReturnValue({
      chat: { completions: { create: jest.fn().mockRejectedValue(new Error('timeout')) } },
    });

    const out = await describeItemMedia('item-1');
    expect(out.basis).toBe('metadata');
    expect(out.text).toContain('An image');
  });

  it('an empty vision answer falls back rather than describing nothing', async () => {
    listItemMedia.mockResolvedValue([view()]);
    mockVision('   ');
    const out = await describeItemMedia('item-1');
    expect(out.basis).toBe('metadata');
  });

  it('a lookup failure yields an empty description, not an error', async () => {
    listItemMedia.mockRejectedValue(new Error('db down'));
    await expect(describeItemMedia('item-1')).resolves.toEqual({ text: '', basis: 'none', mediaCount: 0 });
  });

  it('no attachments means nothing to say', async () => {
    listItemMedia.mockResolvedValue([]);
    const out = await describeItemMedia('item-1');
    expect(out).toEqual({ text: '', basis: 'none', mediaCount: 0 });
  });

  it('an image with no usable URL is not sent anywhere', async () => {
    // A signed URL can be null when signing fails. Posting `null` to the vision API would be a
    // request that cannot succeed, and the metadata answer is already correct.
    listItemMedia.mockResolvedValue([view({ url: null })]);
    const create = jest.fn();
    getInstrumentedOpenAI.mockReturnValue({ chat: { completions: { create } } });

    const out = await describeItemMedia('item-1');
    expect(create).not.toHaveBeenCalled();
    expect(out.basis).toBe('metadata');
  });
});

describe('several attachments', () => {
  it('counts them all and caps how many images are sent', async () => {
    listItemMedia.mockResolvedValue([
      view({ mediaAssetId: 'a' }), view({ mediaAssetId: 'b' }),
      view({ mediaAssetId: 'c' }), view({ mediaAssetId: 'd' }),
      view({ mediaAssetId: 'e', mimeType: 'video/mp4' }),
    ]);
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Images.' } }] });
    getInstrumentedOpenAI.mockReturnValue({ chat: { completions: { create } } });

    const out = await describeItemMedia('item-1');
    expect(out.mediaCount).toBe(5);
    // Four images attached, three sent: a carousel should not become an unbounded bill.
    //
    // Counts the message PARTS, not occurrences of the string "image_url" - each part serialises
    // that token twice (`type` and the payload key), so a naive match reported six for three
    // images and failed against a working cap.
    const parts = create.mock.calls[0][0].messages[1].content as Array<{ type: string }>;
    expect(parts.filter((c) => c.type === 'image_url')).toHaveLength(3);
  });
});

/**
 * toAnthropicContent — the provider bridge. Callers speak the OpenAI content
 * shape; Claude takes a different one. A malformed block here is a 400 that
 * costs the student their whole turn, so anything that cannot be converted is
 * dropped rather than sent — and a turn whose every block was dropped still
 * has to be a legal message.
 */
// `virtual: true` because this suite only exercises the pure conversion
// function; the SDK is never constructed (client() is lazy), and the mock must
// resolve whether or not the package happens to be installed in the sandbox
// the tests run in.
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: class {} }), { virtual: true });

import { toAnthropicContent } from '../anthropicClient';

const PNG = 'data:image/png;base64,AAAA';

describe('toAnthropicContent', () => {
  it('passes a plain string straight through', () => {
    expect(toAnthropicContent('just text')).toBe('just text');
  });

  it('converts a text part to a Claude text block', () => {
    expect(toAnthropicContent([{ type: 'text', text: 'hello' }]))
      .toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('converts a data-URL image to a Claude base64 image block', () => {
    expect(toAnthropicContent([{ type: 'image_url', image_url: { url: PNG } }])).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    ]);
  });

  it('preserves order across mixed text and image parts', () => {
    const out = toAnthropicContent([
      { type: 'text', text: 'look at this' },
      { type: 'image_url', image_url: { url: PNG } },
    ]) as any[];
    expect(out.map((b) => b.type)).toEqual(['text', 'image']);
  });

  it('carries the media type through rather than assuming PNG', () => {
    const out = toAnthropicContent([
      { type: 'image_url', image_url: { url: 'data:image/webp;base64,BBBB' } },
    ]) as any[];
    expect(out[0].source.media_type).toBe('image/webp');
  });

  it('drops a remote URL — Claude takes base64, not a link', () => {
    const out = toAnthropicContent([
      { type: 'text', text: 'hi' },
      { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
    ]) as any[];
    expect(out).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('drops an unsupported image type instead of sending a malformed block', () => {
    const out = toAnthropicContent([
      { type: 'text', text: 'hi' },
      { type: 'image_url', image_url: { url: 'data:image/bmp;base64,CCCC' } },
    ]) as any[];
    expect(out.map((b) => b.type)).toEqual(['text']);
  });

  it('never yields an empty content array — the API rejects those', () => {
    const out = toAnthropicContent([
      { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
    ]) as any[];
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('text');
    expect(out[0].text).toContain('could not be included');
  });
});

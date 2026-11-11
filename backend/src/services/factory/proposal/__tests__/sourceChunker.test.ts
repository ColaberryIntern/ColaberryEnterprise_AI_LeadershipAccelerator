import { chunkText, estimateTokens } from '../sourceChunker';

describe('sourceChunker.chunkText', () => {
  it('returns no chunks for empty or whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  \t ')).toEqual([]);
  });

  it('keeps short text as a single chunk at index 0', () => {
    const out = chunkText('A short briefing paragraph.');
    expect(out).toHaveLength(1);
    expect(out[0].index).toBe(0);
    expect(out[0].text).toBe('A short briefing paragraph.');
    expect(out[0].tokenEstimate).toBe(estimateTokens('A short briefing paragraph.'));
  });

  it('packs paragraphs into sequential, order-preserving chunks within the token budget', () => {
    const paras = [
      'Alpha paragraph about asset management and lifecycle tracking.',
      'Beta paragraph about the public permitting portal for residents.',
      'Gamma paragraph about migrating ten years of Cityworks history.',
    ];
    const out = chunkText(paras.join('\n\n'), { targetTokens: 10, hardTokens: 20 });

    // indices are 0..n-1 with no gaps, and no chunk is empty
    out.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.text.trim().length).toBeGreaterThan(0);
    });
    // every chunk respects the hard ceiling
    out.forEach((c) => expect(c.tokenEstimate).toBeLessThanOrEqual(20));
    // order is preserved across chunks
    const joined = out.map((c) => c.text).join('\n');
    expect(joined.indexOf('Alpha')).toBeLessThan(joined.indexOf('Beta'));
    expect(joined.indexOf('Beta')).toBeLessThan(joined.indexOf('Gamma'));
  });

  it('splits a single oversized paragraph so no chunk exceeds the ceiling, losing no text', () => {
    const big = 'x'.repeat(200); // one block, no sentence breaks
    const out = chunkText(big, { targetTokens: 10, hardTokens: 20 }); // hard ceiling = 80 chars
    expect(out.length).toBeGreaterThan(1);
    out.forEach((c) => expect(c.text.length).toBeLessThanOrEqual(80));
    // every character is preserved, in order
    expect(out.map((c) => c.text).join('')).toBe(big);
  });
});

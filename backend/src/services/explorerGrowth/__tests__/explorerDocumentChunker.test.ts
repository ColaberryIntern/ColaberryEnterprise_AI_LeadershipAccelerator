import {
  chunkDocument,
  chunkKeywords,
  CHUNK_TARGET_CHARS,
  CHUNK_OVERLAP_CHARS,
} from '../explorerDocumentChunker';

/**
 * The first text chunker in this repo, driven on the cases that make a chunker wrong in
 * ways that still look right.
 *
 * The failure this is mostly about: a chunk is what a reviewer sees quoted back and what
 * the fact guard judges. A cut taken mid-sentence hands the guard a fragment whose dates
 * have lost the clause that qualified them, so "prefers a boundary" is a correctness
 * property here, not tidiness — and it is asserted by checking that chunks END on one.
 *
 * Determinism gets its own test because ingestion is content-addressed: a chunker whose
 * output varied would write a new set of rows for an unchanged file on every upload.
 */

const SENTENCE = 'The cohort begins on 3 November and runs for twelve weeks. ';

/** Text of roughly `n` characters, made of whole sentences. */
function prose(n: number): string {
  return SENTENCE.repeat(Math.ceil(n / SENTENCE.length)).slice(0, n).trim();
}

describe('chunkDocument — the empty and small cases', () => {
  it('returns nothing for empty text', () => {
    expect(chunkDocument('')).toEqual([]);
  });

  it('returns nothing for whitespace only, which the caller must not read as "unreadable"', () => {
    expect(chunkDocument('   \n\n \t ')).toEqual([]);
  });

  it('returns one chunk for text under the target', () => {
    const chunks = chunkDocument('A short document.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ index: 0, text: 'A short document.', hardCut: false });
  });

  it('indexes chunks from zero, in document order', () => {
    const chunks = chunkDocument(prose(5000));
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });
});

describe('chunkDocument — it breaks on boundaries, not on the budget', () => {
  it('ends chunks on a sentence rather than mid-sentence', () => {
    const chunks = chunkDocument(prose(4000));

    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk but the last ends a sentence. A chunker that simply sliced every N
    // characters would fail this on nearly all of them.
    for (const c of chunks.slice(0, -1)) {
      expect(c.text).toMatch(/[.!?]$/);
      expect(c.hardCut).toBe(false);
    }
  });

  it('prefers a paragraph break over a sentence break', () => {
    const head = `${prose(300)}\n\n`;
    const tail = prose(300);
    const chunks = chunkDocument(head + tail, { targetChars: 400, overlapChars: 0 });

    // The blank line is the strongest signal the author gave, so the first chunk is the
    // paragraph, even though a later sentence end would have filled the budget better.
    expect(chunks[0].text).toBe(head.trim());
  });

  it('breaks after a closing quote, not before it', () => {
    // The target is sized so the quoted sentence is the LAST boundary in the window.
    // With a larger budget the scan correctly prefers a later sentence end — filling the
    // chunk is the point — and the quote case would never be the candidate under test.
    const text = `She said "we start in November." ${prose(600)}`;
    const chunks = chunkDocument(text, { targetChars: 40, overlapChars: 0 });

    expect(chunks[0].text).toBe('She said "we start in November."');
    expect(chunks[0].text.endsWith('."')).toBe(true);
  });

  it('falls back to a line break when there is no sentence end', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `Row ${i} column value`).join('\n');
    const chunks = chunkDocument(lines, { targetChars: 200, overlapChars: 0 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.hardCut).toBe(false);
  });

  it('REPORTS a hard cut rather than hiding it', () => {
    // One unbroken run with no boundary at all — a table dump or a minified blob. The cut
    // has to happen, and a reviewer approving quotes from it should know what kind of text
    // it was.
    const blob = 'x'.repeat(3000);
    const chunks = chunkDocument(blob, { targetChars: 500, overlapChars: 0 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.hardCut)).toBe(true);
  });

  it('never exceeds the target on a hard cut', () => {
    const chunks = chunkDocument('y'.repeat(2500), { targetChars: 400, overlapChars: 0 });
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(400);
  });
});

describe('chunkDocument — overlap', () => {
  it('repeats the end of one chunk at the start of the next', () => {
    const chunks = chunkDocument(prose(4000), {
      targetChars: 600,
      overlapChars: 120,
      minChars: 0,
    });

    expect(chunks.length).toBeGreaterThan(2);
    // A fact that straddles a boundary must belong to both sides or it belongs to neither.
    // Taking the tail of one chunk, some of it must reappear in the next.
    const tailWords = chunks[0].text.split(' ').slice(-4).join(' ');
    expect(chunks[1].text).toContain(tailWords.split(' ').slice(-2).join(' '));
  });

  it('makes progress even when the only boundary is at position zero', () => {
    // A boundary at 0 with overlap would advance by nothing and loop forever. The guard is
    // `Math.max(1, ...)`, and this is the input that exercises it.
    const text = `\n\n${'z'.repeat(2000)}`;
    const chunks = chunkDocument(text, { targetChars: 100, overlapChars: 99 });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(500);
  });

  it('clamps an overlap that is larger than the target', () => {
    // Would otherwise be a negative advance.
    const chunks = chunkDocument(prose(2000), { targetChars: 200, overlapChars: 10_000 });
    expect(chunks.length).toBeGreaterThan(0);
  });
});

describe('chunkDocument — short tails', () => {
  it('folds a too-short tail into its predecessor rather than storing it alone', () => {
    const chunks = chunkDocument(`${prose(1000)}\n\nPage 2`, {
      targetChars: 500,
      overlapChars: 0,
      minChars: 80,
    });

    // "Page 2" is a heading or a page number: unquotable alone, and short enough that a
    // single matched word would be a large fraction of it under keyword scoring.
    expect(chunks.some((c) => c.text === 'Page 2')).toBe(false);
    expect(chunks[chunks.length - 1].text).toContain('Page 2');
  });

  it('keeps a short document that is the ONLY chunk', () => {
    // Folding has nothing to fold into, and dropping it would lose the document.
    const chunks = chunkDocument('Tiny.', { minChars: 80 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Tiny.');
  });
});

describe('chunkDocument — normalization and determinism', () => {
  it('is deterministic, because the store is content-addressed', () => {
    const text = prose(5000);
    expect(chunkDocument(text)).toEqual(chunkDocument(text));
  });

  it('normalizes the characters a PDF extractor leaves behind', () => {
    // Non-breaking and zero-width characters would otherwise make two visually identical
    // documents hash differently and store twice.
    const withJunk = `The cohort​ begins.`;
    const clean = 'The cohort begins.';

    expect(chunkDocument(withJunk)[0].text).toBe(clean);
  });

  it('collapses runs of blank lines without joining paragraphs', () => {
    const chunks = chunkDocument('One.\n\n\n\n\nTwo.');
    expect(chunks[0].text).toBe('One.\n\nTwo.');
  });

  it('emits no empty or whitespace-only chunk', () => {
    const chunks = chunkDocument(`${prose(3000)}\n\n\n\n${prose(500)}`);
    for (const c of chunks) expect(c.text.trim()).not.toBe('');
  });

  it('has sane defaults', () => {
    expect(CHUNK_OVERLAP_CHARS).toBeLessThan(CHUNK_TARGET_CHARS);
    expect(CHUNK_TARGET_CHARS).toBeGreaterThan(200);
  });
});

describe('chunkKeywords', () => {
  it('ranks by frequency, so the chunk gets tags like a hub entry has by hand', () => {
    const words = chunkKeywords('cohort cohort cohort seats seats enrolment');
    expect(words[0]).toBe('cohort');
    expect(words[1]).toBe('seats');
  });

  it('drops short words, which match everything and discriminate nothing', () => {
    expect(chunkKeywords('the and for cohort')).toEqual(['cohort']);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    expect(chunkKeywords(many, 5)).toHaveLength(5);
  });

  it('is deterministic on ties', () => {
    const text = 'alpha bravo charlie delta';
    expect(chunkKeywords(text)).toEqual(chunkKeywords(text));
  });

  it('returns nothing for text with no scorable words', () => {
    expect(chunkKeywords('a an of to')).toEqual([]);
  });
});

/**
 * verifyQuotes — the trust rail. An AI candidate is KEPT only if its quote literally exists in the source text; a
 * paraphrase or a fabricated quote is DROPPED. These pin that guarantee (a mutant that accepts without matching, or
 * matches a paraphrase, fails) plus the normalization, the min-length floor, and the document correction. Pure.
 */
import { verifyQuotes, normalizeForMatch, MIN_QUOTE_LEN } from '../verifyQuotes';

const SRC = [{ name: 'rfp.pdf', text: 'The Offeror shall maintain $2,000,000 per-occurrence general liability insurance, naming the College as additional insured.' }];
const cand = (over: any = {}) => ({ statement: 'Carry $2M liability insurance', quote: 'shall maintain $2,000,000 per-occurrence general liability insurance', document: 'rfp.pdf', ...over });

describe('verifyQuotes — a quote must LITERALLY exist in the source', () => {
  it('KEEPS a candidate whose quote appears verbatim in the cited document', () => {
    const { kept, dropped } = verifyQuotes([cand()], SRC);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
    expect(kept[0].document).toBe('rfp.pdf');
    expect(kept[0].documentCorrected).toBe(false);
  });

  it('DROPS a paraphrase that is not literally in the source (the anti-fabrication guarantee)', () => {
    const { kept, dropped } = verifyQuotes([cand({ quote: 'the vendor must carry two million dollars of liability coverage' })], SRC);
    expect(kept).toHaveLength(0);
    expect(dropped[0].reason).toBe('not_found');
  });

  it('matches across light normalization (curly quotes, soft hyphens, line-wrap hyphenation, whitespace)', () => {
    const src = [{ name: 'd.pdf', text: 'The contractor shall provide asset manage-\nment and work order tracking as a single system.' }];
    const { kept } = verifyQuotes([cand({ quote: 'provide asset management and work order tracking', document: 'd.pdf' })], src);
    expect(kept).toHaveLength(1); // the "manage-\nment" wrap is undone before matching
  });

  it('CORRECTS the document when the quote is found in a DIFFERENT provided file', () => {
    const src = [{ name: 'cover.pdf', text: 'nothing relevant here' }, { name: 'terms.pdf', text: 'The Offeror shall maintain $2,000,000 per-occurrence general liability insurance.' }];
    const { kept } = verifyQuotes([cand({ document: 'cover.pdf' })], src);
    expect(kept).toHaveLength(1);
    expect(kept[0].document).toBe('terms.pdf');
    expect(kept[0].documentCorrected).toBe(true);
  });

  it('DROPS a too-short quote (cannot smuggle a paraphrase through a few common words)', () => {
    const { kept, dropped } = verifyQuotes([cand({ quote: 'shall maintain' })], SRC); // < MIN_QUOTE_LEN
    expect('shall maintain'.length).toBeLessThan(MIN_QUOTE_LEN);
    expect(kept).toHaveLength(0);
    expect(dropped[0].reason).toBe('too_short');
  });

  it('DROPS a malformed candidate (missing quote/statement) and reports no_source when there is no text', () => {
    expect(verifyQuotes([{ statement: 'x' } as any], SRC).dropped[0].reason).toBe('malformed');
    expect(verifyQuotes([cand()], []).dropped[0].reason).toBe('no_source');
  });

  it('is total — garbage in yields all-dropped / empty, never throws', () => {
    expect(verifyQuotes(undefined as any, undefined as any)).toEqual({ kept: [], dropped: [] });
    expect(normalizeForMatch(null as any)).toBe('');
  });
});

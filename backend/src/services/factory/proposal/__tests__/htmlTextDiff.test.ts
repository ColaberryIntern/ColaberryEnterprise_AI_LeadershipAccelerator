/**
 * htmlTextDiff — the in-repo HTML-aware word diff. Strips tags, tokenizes, LCS-diffs into same/add/del segments.
 */
import { diffVersionsHtml, stripToWords, diffWords } from '../htmlTextDiff';

describe('stripToWords', () => {
  it('strips tags and tokenizes', () => {
    expect(stripToWords('<p>Hello <strong>world</strong></p>')).toEqual(['Hello', 'world']);
    expect(stripToWords('')).toEqual([]);
    expect(stripToWords('<script>evil()</script><p>ok</p>')).toEqual(['ok']);
  });
});

describe('diffWords', () => {
  it('marks inserted, deleted and unchanged words', () => {
    const d = diffWords(['the', 'quick', 'fox'], ['the', 'slow', 'fox']);
    expect(d.find((s) => s.type === 'del')?.text).toBe('quick');
    expect(d.find((s) => s.type === 'add')?.text).toBe('slow');
    expect(d.filter((s) => s.type === 'same').map((s) => s.text)).toEqual(['the', 'fox']);
  });
  it('coalesces consecutive same-type tokens', () => {
    const d = diffWords(['a', 'b'], ['a', 'b', 'c', 'd']);
    const adds = d.filter((s) => s.type === 'add');
    expect(adds).toHaveLength(1);
    expect(adds[0].text).toBe('c d');
  });
  it('identical input is all same', () => {
    expect(diffWords(['x', 'y'], ['x', 'y'])).toEqual([{ type: 'same', text: 'x y' }]);
  });
});

describe('diffVersionsHtml', () => {
  it('diffs two HTML versions by their readable text', () => {
    const d = diffVersionsHtml('<p>Our approach is <b>fast</b>.</p>', '<p>Our approach is <b>robust</b>.</p>');
    expect(d.some((s) => s.type === 'del' && /fast/.test(s.text))).toBe(true);
    expect(d.some((s) => s.type === 'add' && /robust/.test(s.text))).toBe(true);
  });
  it('is total on null input', () => {
    expect(diffVersionsHtml(null, null)).toEqual([]);
  });
});

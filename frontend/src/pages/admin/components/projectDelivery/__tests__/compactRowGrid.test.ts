import { ROW_GRID } from '../CompactRow';

/**
 * The row grid, pinned — because both defects it encodes were invisible to every other check.
 *
 * Ali, 2026-09-09: "Why is there such a big gap in the middle. And then you have Case cutoff
 * on the right. Use more the space and don't separate it so much."
 *
 * Neither is a crash, a type error, or a failing assertion anywhere. The page rendered, the
 * numbers were right, and the score still read "60 /10" because a 52px track sat inside a
 * container with `overflow: hidden`. A clipped number is worse than a missing one: it is a
 * different, plausible number.
 */

const tracks = (g: string): string[] => {
  // minmax(220px,1.2fr) contains a comma, so split on top-level spaces only.
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of g) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ' ' && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
};

describe('ROW_GRID', () => {
  const t = tracks(ROW_GRID);

  it('has one track per column in the header', () => {
    // chevron, Project, Tasks, Releases, Late, Case
    expect(t).toHaveLength(6);
  });

  it('does not leave Project as the only flexible track', () => {
    // THE GAP. When Project was the sole `fr`, every spare pixel on a wide screen landed
    // between the student name and the Tasks column.
    const flexible = t.filter((x) => x.includes('fr'));
    expect(flexible.length).toBeGreaterThan(1);
  });

  it('gives the Releases column room to grow', () => {
    // ReleaseStrip segments are flex:1, so this width is drawn, not padding.
    expect(t[3]).toContain('fr');
  });

  it('gives Case enough width for the compact pill', () => {
    // THE CUTOFF. Icon + score + "/100" does not fit in 52px, and the card clips.
    const px = Number((t[5].match(/(\d+)px/) || [])[1]);
    expect(px).toBeGreaterThanOrEqual(88);
  });

  it('keeps every column non-collapsing', () => {
    // A 0-minimum track lets content vanish rather than scroll.
    t.forEach((track) => expect(track).not.toMatch(/minmax\(\s*0\s*(px)?\s*,/));
  });
});

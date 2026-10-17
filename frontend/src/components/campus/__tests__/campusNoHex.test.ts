import fs from 'fs';
import path from 'path';

/**
 * frontend/CLAUDE.md: never hard-code hex colors. Every campus color is a shell token
 * (TodayShell.css), so dark mode and future palette changes reach the campus for free.
 */
const DIR = path.join(__dirname, '..');
const FILES = fs.readdirSync(DIR).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => path.join(DIR, f));
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/g;

// Comments may mention a color by name; only code and CSS rules count.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const hexIn = (src: string) => (stripComments(src).match(HEX) ?? []);

describe('campus has no hard-coded hex colors', () => {
  it('scans the real files', () => {
    expect(FILES.some((f) => f.endsWith('campus.css'))).toBe(true);
    expect(FILES.length).toBeGreaterThan(8);
  });

  it.each(FILES.map((f) => [path.basename(f), f]))('%s', (_name, file) => {
    expect(hexIn(fs.readFileSync(file, 'utf8'))).toEqual([]);
  });

  it('mutation control: a hex color is caught in CSS and in TSX', () => {
    expect(hexIn('.cm-x{color:#fff}')).toEqual(['#fff']);
    expect(hexIn("const s = { fill: '#1f6f78' };")).toEqual(['#1f6f78']);
    expect(hexIn('/* brand #FB2832 */ .a{color:var(--cherry)}')).toEqual([]);
  });
});

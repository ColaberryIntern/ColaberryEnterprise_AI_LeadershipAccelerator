import fs from 'fs';
import path from 'path';

/**
 * frontend/CLAUDE.md: never hard-code hex colors. Every campus color is a token, so dark mode and future palette changes reach
 * the campus for free.
 *
 * C11b: RECURSIVE (the old scan read only the top folder, so art/, interior/ and games/ files escaped it) and with EXACTLY ONE
 * exception, compared by relative path: campusArtTokens.css, the single file that defines the prototype's art colors as
 * --cm-art-* tokens (Ali's decision, 2026-10-20). Everything else, at any depth, must use tokens.
 */
const DIR = path.join(__dirname, '..');
export const EXCEPTION = 'campusArtTokens.css';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(path.join(dir, e.name));
    return /\.(tsx?|css)$/.test(e.name) ? [path.join(dir, e.name)] : [];
  });
}
const rel = (f: string) => path.relative(DIR, f).split(path.sep).join('/');
const ALL = walk(DIR);
const FILES = ALL.filter((f) => rel(f) !== EXCEPTION);
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/g;

// Comments may mention a color by name; only code and CSS rules count.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const hexIn = (src: string) => (stripComments(src).match(HEX) ?? []);

describe('campus has no hard-coded hex colors', () => {
  it('scans the real files, recursively', () => {
    expect(FILES.some((f) => rel(f) === 'campus.css')).toBe(true);
    expect(FILES.some((f) => rel(f).includes('/'))).toBe(true); // a nested file is in the scan
    expect(FILES.length).toBeGreaterThan(8);
  });

  it('the one exception exists, is the only file skipped, and is matched by its exact relative path', () => {
    expect(ALL.map(rel)).toContain(EXCEPTION);
    expect(ALL.length - FILES.length).toBe(1);
    // A same-named file anywhere else would NOT be excepted.
    expect(rel(path.join(DIR, 'art', EXCEPTION))).not.toBe(EXCEPTION);
  });

  it.each(FILES.map((f) => [rel(f), f]))('%s', (_name, file) => {
    expect(hexIn(fs.readFileSync(file, 'utf8'))).toEqual([]);
  });

  it('mutation control: a hex color is caught in CSS and in TSX', () => {
    expect(hexIn('.cm-x{color:#fff}')).toEqual(['#fff']);
    expect(hexIn("const s = { fill: '#1f6f78' };")).toEqual(['#1f6f78']);
    expect(hexIn('/* brand #FB2832 */ .a{color:var(--cherry)}')).toEqual([]);
  });

  it('mutation control: the walk finds a file in a nested folder', () => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'nohex-'));
    fs.mkdirSync(path.join(tmp, 'art'));
    fs.writeFileSync(path.join(tmp, 'art', 'Roof.tsx'), "const c = '#123456';");
    fs.mkdirSync(path.join(tmp, '__tests__'));
    fs.writeFileSync(path.join(tmp, '__tests__', 'x.test.ts'), "const c = '#abcdef';");
    const found = walk(tmp).map((f) => path.relative(tmp, f).split(path.sep).join('/'));
    expect(found).toEqual(['art/Roof.tsx']);
    expect(hexIn(fs.readFileSync(path.join(tmp, 'art', 'Roof.tsx'), 'utf8'))).toEqual(['#123456']);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

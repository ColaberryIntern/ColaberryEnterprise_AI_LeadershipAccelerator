/**
 * The platform-only token layer that lets src/colaberry/ stay identical to upstream.
 *
 * src/colaberry/ is synced from github.com/aleemcolaberry/colaberry-design-system by
 * backend/src/scripts/syncDesignSystems.js. Tokens the platform needs but the design
 * system does not publish live in styles/colaberry-platform-tokens.css. Three things can
 * go wrong silently, and each is pinned here:
 *
 *  1. The file stops being imported, or is imported BEFORE the design system, and every
 *     var(--status-violet) / var(--z-player) quietly resolves to nothing.
 *  2. Someone re-adds one of these names inside the vendored copy; the next sync deletes
 *     it again and the nightly PR shows a "design change" that is really a revert.
 *  3. Someone uses this file to override a design-system token, which is a design change
 *     made outside the design owner's repository.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

const PLATFORM = read(path.join('styles', 'colaberry-platform-tokens.css'));
const INDEX = read('index.tsx');
const VENDORED = ['styles.css', 'base.css', 'colors.css', 'fonts.css', 'spacing.css', 'typography.css']
  .map((f) => (f === 'styles.css' ? path.join('colaberry', f) : path.join('colaberry', 'tokens', f)))
  .map(read)
  .join('\n');

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const declared = (css: string): string[] =>
  Array.from(stripComments(css).matchAll(/(--[a-z0-9-]+)\s*:/g)).map((m) => m[1]);

describe('colaberry-platform-tokens.css', () => {
  it('declares exactly the platform-only tokens', () => {
    expect(declared(PLATFORM).sort()).toEqual([
      '--status-teal',
      '--status-teal-bg',
      '--status-violet',
      '--status-violet-bg',
      '--z-player',
    ]);
  });

  it('is imported once, directly after the design system entry point', () => {
    const lines = INDEX.split('\n').map((l) => l.trim());
    const ds = lines.indexOf("import './colaberry/styles.css';");
    const platform = lines.indexOf("import './styles/colaberry-platform-tokens.css';");
    expect(ds).toBeGreaterThanOrEqual(0);
    expect(platform).toBe(ds + 1);
    expect(lines.filter((l) => l.includes('colaberry-platform-tokens.css'))).toHaveLength(1);
  });

  it('redefines no design-system token, so it can never restyle the brand', () => {
    const vendored = new Set(declared(VENDORED));
    expect(declared(PLATFORM).filter((name) => vendored.has(name))).toEqual([]);
  });

  it('references only tokens the design system defines', () => {
    const vendored = new Set(declared(VENDORED));
    const used = Array.from(stripComments(PLATFORM).matchAll(/var\((--[a-z0-9-]+)/g)).map((m) => m[1]);
    expect(used.filter((name) => !vendored.has(name))).toEqual([]);
  });
});

describe('the vendored design system stays hermetic', () => {
  it('fetches nothing from a third-party host', () => {
    // Upstream fonts.css @imports Google Fonts, which fired before consent. The sync
    // strips external imports; this catches a hand edit or a sync run without it.
    expect(stripComments(VENDORED)).not.toMatch(/@import[^;]*\/\//);
  });
});

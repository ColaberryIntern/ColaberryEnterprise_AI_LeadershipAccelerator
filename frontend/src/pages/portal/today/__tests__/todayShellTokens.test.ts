/**
 * D15 — the Today shell stops hardcoding the cherry hex.
 *
 * Two assertions that have to hold together, because either alone is satisfiable by a
 * mistake:
 *
 *   - the literals are gone from `.te-shell` (otherwise nothing changed), AND
 *   - the ramp they now point at is actually in the rendered cascade (otherwise the shell
 *     renders with no brand colour at all).
 *
 * The second one is the trap this file exists for. `src/styles/tokens.css` also defines
 * `--cherry`, and nothing in the app imports it. A reference resolved against that file
 * would read as correct in a diff and paint nothing in a browser.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf8');

const SHELL = read('pages', 'portal', 'today', 'TodayShell.css');
/** The `.te-shell` declaration block, where the local aliases are defined. */
const TE_SHELL_BLOCK = SHELL.slice(SHELL.indexOf('.te-shell{'), SHELL.indexOf('}', SHELL.indexOf('.te-shell{')));

describe('the .te-shell block was actually located', () => {
  it('found a block containing the cherry aliases', () => {
    // Without this, a slice that came back empty would make every `not.toMatch` below pass.
    expect(TE_SHELL_BLOCK.length).toBeGreaterThan(200);
    expect(TE_SHELL_BLOCK).toContain('--cherry:');
    expect(TE_SHELL_BLOCK).toContain('--cherry-deep:');
    expect(TE_SHELL_BLOCK).toContain('--cherry-text:');
  });
});

describe('D15: no hardcoded cherry hex in the Today shell', () => {
  it.each([
    ['--cherry', '#FB2832'],
    ['--cherry-deep', '#C20E1E'],
    ['--cherry-text', '#E5121D'],
  ])('%s is a token reference, not %s', (name, hex) => {
    const decl = new RegExp(`${name}\\s*:\\s*([^;]+);`);
    const match = TE_SHELL_BLOCK.match(decl);

    expect(match).not.toBeNull();
    expect(match![1].trim()).toMatch(/^var\(--/);
    expect(match![1]).not.toContain(hex);
  });
});

describe('the tokens it points at are in the cascade that actually renders', () => {
  const LIVE_COLORS = read('colaberry', 'tokens', 'colors.css');
  const INDEX = read('index.tsx');

  it('index.tsx imports the design system entry point', () => {
    expect(INDEX).toContain("import './colaberry/styles.css'");
    expect(read('colaberry', 'styles.css')).toContain("@import url('./tokens/colors.css')");
  });

  it('does NOT rely on styles/tokens.css, which nothing imports', () => {
    // Guarding the trap directly: if someone ever wires that file up, this flips and the
    // comment in TodayShell.css needs rewriting rather than quietly going stale.
    expect(INDEX).not.toContain("styles/tokens.css");
  });

  it.each([
    ['--red-500', '#FB2832'],
    ['--red-700', '#C20E1E'],
    ['--red-600', '#E5121D'],
  ])('%s is defined as %s, so the colour is unchanged', (token, hex) => {
    expect(LIVE_COLORS).toMatch(new RegExp(`${token}\\s*:\\s*${hex}`, 'i'));
  });

  it('each alias points at one of those three tokens', () => {
    for (const token of ['--red-500', '--red-700', '--red-600']) {
      expect(TE_SHELL_BLOCK).toContain(`var(${token})`);
    }
  });
});

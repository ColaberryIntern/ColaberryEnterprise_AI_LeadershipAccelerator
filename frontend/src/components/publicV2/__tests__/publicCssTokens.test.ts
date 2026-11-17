/**
 * publicCssTokens.test.ts -- every design token the public site's CSS reads must exist.
 *
 * WHY: `var(--space-7)` with no fallback, where --space-7 is defined nowhere, does not
 * fall back to anything. The browser drops the whole declaration. The spacing ramp goes
 * 6, 8, 10, 12; --space-7 was used in 12 public stylesheets, so every card padded with it
 * rendered with NO padding, its text flush against the border. Nothing failed. The
 * fidelity audit found it on 7 pages, 2026-11-16 (Ali: "there is no border at all and it
 * doesn't look professional"). fidelityV5.css now defines the missing tokens; this keeps
 * a new one from shipping the same way.
 *
 * A use passes if the token is defined in any stylesheet under src/, set inline from a
 * component (style={{ '--x': ... }}), or written with a fallback: var(--x, 12px).
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', '..');
const walk = (dir: string, ext: RegExp): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' || d.name === '__tests__' ? [] : walk(p, ext);
    return ext.test(d.name) ? [p] : [];
  });

const allCss = walk(SRC, /\.css$/);
const defined = new Set<string>();
for (const f of allCss) for (const m of fs.readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
for (const f of walk(SRC, /\.tsx?$/)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"](--[\w-]+)['"]/g)) defined.add(m[1]);

const PUBLIC = allCss.filter((f) => /[\\/]publicV2[\\/]/.test(f));

/** `var(--x)` uses with no fallback, per file. */
function undefinedUses(files: string[], known: Set<string>): string[] {
  const out: string[] = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
      if (!m[2] && !known.has(m[1])) out.push(`${path.basename(f)}: ${m[1]}`);
    }
  }
  return [...new Set(out)].sort();
}

describe('public CSS tokens', () => {
  it('reads no token that is undefined and has no fallback', () => {
    expect(PUBLIC.length).toBeGreaterThan(20);
    expect(undefinedUses(PUBLIC, defined)).toEqual([]);
  });

  it('would catch the --space-7 hole if its definition went missing again', () => {
    const without = new Set(defined);
    without.delete('--space-7');
    expect(undefinedUses(PUBLIC, without).some((u) => u.endsWith('--space-7'))).toBe(true);
  });

  it('defines the shared model layer in the stylesheet the public layout loads on every page', () => {
    const layout = fs.readFileSync(path.join(__dirname, '..', 'PublicLayoutV2.tsx'), 'utf8');
    expect(layout).toMatch(/import '\.\/fidelityV5\.css';/);
    const layer = fs.readFileSync(path.join(__dirname, '..', 'fidelityV5.css'), 'utf8');
    /* The service cards and closing band are shared components (named -svc5 because
       servicesV2.css already owns `.cbv2-svc`, its row layout, which this test caught); their styles must not live
       in a page's own chunk, which loads only with that page (the pricingV2.css fault). */
    for (const cls of ['.cbv2-svc5 ', '.cbv2-svc5__verb', '.cbv2-svc5__terms', '.cbv2-cta5 ', '.cbv2-proc__step ']) {
      expect(layer).toContain(`.cbv2-shell ${cls}`);
    }
    for (const f of PUBLIC.filter((p) => !p.endsWith('fidelityV5.css'))) {
      expect(fs.readFileSync(f, 'utf8')).not.toMatch(/\.cbv2-svc5\b|\.cbv2-svcs5\b|\.cbv2-cta5\b/);
    }
  });
});

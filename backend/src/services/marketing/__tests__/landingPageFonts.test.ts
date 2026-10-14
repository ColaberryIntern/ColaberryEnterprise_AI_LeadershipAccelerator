import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { BRAND_FONTS, fontCssFor } from '../landingPageFonts';

/**
 * A brand's typeface is pinned to its design system, the same way its palette is.
 *
 * Ali, 2026-10-13, on a CPN page: "it didn't even use the correct branding." The palette was the
 * loud half of that; the quiet half is that every page was set in Roboto, which is Colaberry's
 * typeface. Wiring a stack by hand and never checking it is how the palette drifted in the first
 * place, so the stacks are read back out of the source here.
 *
 * THE SECOND CHECK IS THE ONE THAT WOULD HAVE CAUGHT A REAL OUTAGE: a @font-face whose file is
 * not actually in `frontend/public/fonts/` fails SILENTLY. The browser requests it, 404s, and
 * falls back - so the page looks almost right and nothing errors. Every declared src is asserted
 * to exist on disk.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const PUBLIC = join(REPO_ROOT, 'frontend', 'public');

/**
 * The `--font-heading` / `--font-body` declarations from a vendored typography.css.
 *
 * THE `:root` BLOCK ONLY, never `[data-variant="..."]`. CPN's file declares Bitter and Atkinson
 * Hyperlegible in `:root` and then Source Serif 4 and Public Sans under `[data-variant="vestry"]`,
 * which is an alternate skin and not what an unmarked page renders. Reading the whole file and
 * letting the last match win reports the variant as the brand's typeface - it did, and it failed
 * this test against correct wiring. `deliveryBrandThemes.test.ts` scopes its colour parser the
 * same way and says so for the same reason.
 */
function sourceStacks(app: string): Record<string, string> {
  const css = readFileSync(
    join(REPO_ROOT, 'apps', app, 'src', 'assets', 'design', 'tokens', 'typography.css'), 'utf8',
  );
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) throw new Error(`no :root block in ${app} typography.css`);
  const out: Record<string, string> = {};
  for (const [, name, value] of root[1].matchAll(/(--font-(?:heading|body))\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

/** The first family in a stack, unquoted - the thing the brand actually chose. */
function firstFamily(stack: string): string {
  return (stack.split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '');
}

describe('each wired brand uses its own typeface', () => {
  it('CPN takes both families from its vendored typography.css', () => {
    const src = sourceStacks('cpn-public');
    // Positive control: a parser that matched nothing would make the two below vacuous.
    expect(Object.keys(src)).toEqual(expect.arrayContaining(['--font-heading', '--font-body']));

    expect(firstFamily(BRAND_FONTS.cpn.heading)).toEqual(firstFamily(src['--font-heading']));
    expect(firstFamily(BRAND_FONTS.cpn.body)).toEqual(firstFamily(src['--font-body']));

    // Control on the scoping itself: `[data-variant="vestry"]` sets Source Serif 4 / Public Sans
    // later in the same file. If the parser ever stops honouring `:root`, it reads those instead,
    // and the two assertions above would start demanding the wrong typeface.
    expect(firstFamily(src['--font-heading'])).not.toEqual('Source Serif 4');
    expect(firstFamily(src['--font-body'])).not.toEqual('Public Sans');
  });

  it('CPN is not set in Colaberry\'s typeface, which is the whole point', () => {
    expect(BRAND_FONTS.cpn.heading).not.toMatch(/Roboto/);
    expect(BRAND_FONTS.cpn.body).not.toMatch(/Roboto/);
    expect(firstFamily(BRAND_FONTS.cpn.heading)).toBe('Bitter');
    expect(firstFamily(BRAND_FONTS.cpn.body)).toBe('Atkinson Hyperlegible');
  });

  it('an unwired brand still gets Roboto, so nothing regressed', () => {
    // `enterprise` has no design system in the repo. It must render exactly as it did before
    // this file existed rather than falling back to a browser default.
    expect(fontCssFor('enterprise')).toContain('Roboto');
    expect(fontCssFor(null)).toContain('Roboto');
    expect(fontCssFor('training')).toContain('Roboto');
  });
});

describe('every font file a page asks for actually exists', () => {
  const faces = Object.entries(BRAND_FONTS).flatMap(
    ([key, f]) => f.faces.map((face) => [key, face.family, face.src] as const),
  );

  it('there are faces to check', () => {
    expect(faces.length).toBeGreaterThan(2);
  });

  it.each(faces)('%s: %s is served from %s', (_key, _family, src) => {
    // A missing woff2 does not throw - it 404s and the page silently renders the fallback.
    expect([src, existsSync(join(PUBLIC, src.replace(/^\//, '')))]).toEqual([src, true]);
  });
});

describe('the stylesheet actually uses the tokens', () => {
  /**
   * h2 did NOT take the heading face for several hours, and a screenshot did not reveal it:
   * Colaberry's heading and body stacks are both Roboto, so the two are indistinguishable there.
   * On CPN - a serif display over a humanist body - every section heading rendered in the BODY
   * face while the hero rendered correctly, and I described that screenshot as "serif headings".
   *
   * The cause was a scripted edit anchored on the literal `h2{`, which matched `.band--cool h2{`
   * earlier in the file. Anchored to start-of-line here, so a scoped selector cannot satisfy it.
   */
  const { STYLES } = require('../landingPageStyles') as { STYLES: string };

  it.each(['h1', 'h2'])('the global %s rule takes the heading face', (tag) => {
    const rule = new RegExp(`^${tag}\\{[^}]*font-family:var\\(--font-heading\\)`, 'm');
    expect(rule.test(STYLES)).toBe(true);
  });

  it('body text takes the body face', () => {
    expect(/^body\{[^}]*font:[^;}]*var\(--font-body\)/m.test(STYLES)).toBe(true);
  });

  it('no typeface is named directly in the stylesheet any more', () => {
    // A hardcoded family is how every page ended up in Colaberry's Roboto regardless of brand.
    const css = STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/font-family:\s*['"]?(Roboto|Bitter|Atkinson)/i);
  });
});

describe('the CSS it emits', () => {
  it('declares the families as tokens the stylesheet can read', () => {
    const css = fontCssFor('cpn');
    expect(css).toContain('--font-heading:');
    expect(css).toContain('--font-body:');
    expect(css).toMatch(/@font-face\{[^}]*Bitter/);
  });

  it('every face swaps rather than blocking the render', () => {
    Object.keys(BRAND_FONTS).forEach((key) => {
      const css = fontCssFor(key);
      const declared = (css.match(/@font-face\{/g) ?? []).length;
      const swapping = (css.match(/font-display:swap/g) ?? []).length;
      expect([key, declared]).toEqual([key, swapping]);
    });
  });
});

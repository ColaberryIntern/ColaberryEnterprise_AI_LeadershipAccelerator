/**
 * TodayShell — "Your timeline" stylesheet-import regression test.
 *
 * Reported by Swati Raman 2026-08-24: "The 'Your Timeline' section is not
 * displaying correctly."
 *
 * Root cause: `TodayShell.tsx` renders the timeline section with the classes
 * `.te-feed`, `.te-feed-head`, `.te-feed-filter` and `.fchip`, but every rule
 * for those classes lives in `pages/portal/feed/feed.css` — which TodayShell
 * never imported. `feed.css` reached the bundle only via three OTHER lazy route
 * chunks (CommunityPage, RoomsPage, FeedCard), so on a cold load of
 * /portal/today none of those rules were in the document.
 *
 * Measured on production 2026-08-24 as ali@colaberry.com:
 *   - no loaded stylesheet contained a `.te-feed-head` rule
 *   - the header SVG (no width/height attributes, relying on
 *     `.te-feed-head .h svg{width:16px;height:16px}`) computed to 462x462px,
 *     against a correctly-styled control SVG elsewhere on the page at 13x13
 *   - the filter chips computed to `border-style: outset; border-radius: 0px`
 *     — i.e. raw UA default buttons rather than pills
 *   - `.te-feed` computed `max-width: none`, losing the 600px column
 *
 * jest's CRA config stubs `.css` imports to an empty module, so importing the
 * component proves nothing about styling. This test therefore asserts the
 * source-level contract that actually broke: every class the timeline section
 * renders must be defined in a stylesheet TodayShell itself imports.
 */
import fs from 'fs';
import path from 'path';

const HERE = __dirname;
const SHELL = path.join(HERE, '..', 'TodayShell.tsx');

/** Resolve every relative `import './x.css'` in a module to its file contents. */
function importedCss(modulePath: string): { files: string[]; css: string } {
  const src = fs.readFileSync(modulePath, 'utf8');
  const dir = path.dirname(modulePath);
  const files: string[] = [];
  let css = '';
  const re = /import\s+['"]([^'"]+\.css)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const resolved = path.resolve(dir, m[1]);
    if (fs.existsSync(resolved)) {
      files.push(path.relative(path.join(HERE, '..', '..', '..', '..'), resolved).replace(/\\/g, '/'));
      css += `\n/* ${m[1]} */\n` + fs.readFileSync(resolved, 'utf8');
    }
  }
  return { files, css };
}

/** Does the stylesheet text define a rule whose selector mentions `cls`? */
function definesClass(css: string, cls: string): boolean {
  // strip comments so a class named only in prose does not count as a rule
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,{:.>~\\[]`).test(bare);
}

describe('TodayShell — the "Your timeline" section ships with its own stylesheet', () => {
  const { files, css } = importedCss(SHELL);

  it('imports the stylesheet that defines the timeline section chrome', () => {
    expect(files.some((f) => f.endsWith('feed/feed.css'))).toBe(true);
  });

  // These are the exact class names TodayShell renders around <TodayFeedV2>.
  it.each(['te-feed', 'te-feed-head', 'te-feed-filter', 'fchip'])(
    'has a rule for .%s among its imported stylesheets',
    (cls) => {
      expect(definesClass(css, cls)).toBe(true);
    },
  );

  it('the rules that were missing in production are the ones now guaranteed present', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // the 16px cap that stops the header icon falling back to the UA default
    expect(bare).toMatch(/\.te-feed-head\s+\.h\s+svg\s*\{[^}]*width:\s*16px/);
    // the 600px centered column
    expect(bare).toMatch(/\.te-feed\s*\{[^}]*max-width:\s*600px/);
    // pill chips rather than default buttons
    expect(bare).toMatch(/\.fchip\s*\{[^}]*border-radius:\s*999px/);
  });

  it('renders the classes it styles (guards against the test drifting from the JSX)', () => {
    const shell = fs.readFileSync(SHELL, 'utf8');
    expect(shell).toContain('className="te-feed"');
    expect(shell).toContain('className="te-feed-head"');
  });
});

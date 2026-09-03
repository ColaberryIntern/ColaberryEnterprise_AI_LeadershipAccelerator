import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Asset URLs must change when the asset changes.
 *
 * WHY THIS EXISTS. On 2026-09-02 an accessibility fix shipped to production and stayed
 * invisible. The container served the corrected CSS, but Cloudflare held the previous
 * copy at the edge (`cf-cache-status: HIT`, `max-age=14400`) and kept handing it to real
 * visitors. Every signal said the deploy had worked: the container was running, the file
 * on disk was right, CI was green. Only fetching the public URL showed otherwise.
 *
 * The build now content-addresses assets so a changed file gets a URL that has never been
 * cached. The part that is easy to get wrong, and the reason this test exists rather than
 * a manual check, is the CHAIN: index.html references site.css, and site.css imports
 * design/colors.css. If colors.css changes but site.css's URL does not, the stale CSS is
 * still served and the fix is still invisible - with everything looking correct.
 */

const { fingerprintAssets } = require(path.resolve(__dirname, '..', '..', '..', 'packages', 'app-build'));

function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fingerprint-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body, 'utf8');
  }
  return dir;
}

const stamp = (html: string, file: string): string | null => {
  const m = new RegExp(`${file.replace('.', '\\.')}\\?v=([0-9a-f]+)`).exec(html);
  return m ? m[1] : null;
};

describe('built asset URLs are content-addressed', () => {
  const page = '<link rel="stylesheet" href="/assets/site.css" /><a href="/about/">About</a>';
  const site = "@import url('design/colors.css');\nbody { color: var(--fg); }";

  it('stamps stylesheets and scripts, and leaves page links alone', () => {
    const dir = tree({
      'index.html': `${page}<script src="/assets/track-v2.js"></script>`,
      'assets/site.css': site,
      'assets/track-v2.js': 'console.log(1);',
      'assets/design/colors.css': ':root { --fg: #1A1917; }',
    });
    fingerprintAssets(dir);
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

    expect(stamp(html, 'site.css')).toMatch(/^[0-9a-f]{8}$/);
    expect(stamp(html, 'track-v2.js')).toMatch(/^[0-9a-f]{8}$/);
    // A directory URL is a page, not an asset. Stamping it would 404.
    expect(html).toContain('href="/about/"');
    expect(html).not.toContain('/about/?v=');
  });

  it('changes an imported file\'s URL when that file changes', () => {
    const build = (colors: string) => {
      const dir = tree({ 'index.html': page, 'assets/site.css': site, 'assets/design/colors.css': colors });
      fingerprintAssets(dir);
      return fs.readFileSync(path.join(dir, 'assets', 'site.css'), 'utf8');
    };

    const before = build(':root { --fg: #1A1917; }');
    const after = build(':root { --fg: #000000; }');

    expect(stamp(before, 'colors.css')).not.toBeNull();
    expect(stamp(after, 'colors.css')).not.toEqual(stamp(before, 'colors.css'));
  });

  it('changes the stylesheet URL when only an imported file changes', () => {
    // The chain. colors.css is not referenced by the page at all, so if the stamp on
    // site.css did not move, the browser would keep the cached site.css - and with it the
    // cached import URL - and never learn that colors.css changed.
    const build = (colors: string) => {
      const dir = tree({ 'index.html': page, 'assets/site.css': site, 'assets/design/colors.css': colors });
      fingerprintAssets(dir);
      return fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    };

    const before = build(':root { --fg: #1A1917; }');
    const after = build(':root { --fg: #000000; }');

    expect(stamp(after, 'site.css')).not.toEqual(stamp(before, 'site.css'));
  });

  it('is idempotent - re-running replaces the stamp instead of appending', () => {
    const dir = tree({ 'index.html': page, 'assets/site.css': site, 'assets/design/colors.css': ':root{}' });
    fingerprintAssets(dir);
    const once = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    fingerprintAssets(dir);
    const twice = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

    expect(twice).toEqual(once);
    expect(twice).not.toMatch(/\?v=[0-9a-f]+\?v=/);
  });

  it('leaves external URLs untouched', () => {
    const dir = tree({
      'index.html': '<link href="https://fonts.googleapis.com/css2?family=Archivo" /><link href="/assets/site.css" />',
      'assets/site.css': 'body{}',
    });
    fingerprintAssets(dir);
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

    expect(html).toContain('href="https://fonts.googleapis.com/css2?family=Archivo"');
    expect(stamp(html, 'site.css')).toMatch(/^[0-9a-f]{8}$/);
  });
});

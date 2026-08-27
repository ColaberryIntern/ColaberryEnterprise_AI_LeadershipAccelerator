#!/usr/bin/env node
/**
 * Generate src/ from legacy-capture/ — the faithful rebuild of the current site.
 *
 * WHY A SCRIPT RATHER THAN HAND-EDITED PAGES. The captured pages are 78KB–486KB each.
 * Hand-editing eleven files that size makes the diff unreviewable and the transformation
 * unrepeatable. This way the change to each page is one readable function, and when the
 * capture is refreshed the port can simply be re-run.
 *
 * WHAT IT DOES, and deliberately nothing more:
 *   1. copies each captured page into src/
 *   2. injects the v2 tracker before </body>
 *   3. rewrites the hard-coded https://www.refactored.ai origin to protocol-relative
 *      paths, so the page works on any host it is served from
 *
 * WHAT IT DOES NOT DO, on purpose:
 *   - It does not rewire the forms. Their handlers live in an external CloudFront bundle
 *     (dashboard_css/assets/js/main.js) with no inline post target, so the submit path is
 *     not visible from the HTML. Under the proxy configuration those posts continue to
 *     reach the existing backend and keep working exactly as they do today. Rewiring each
 *     form to /api/leads/ingest belongs with that page's redesign, where the field mapping
 *     can actually be verified, rather than guessed at from a minified bundle.
 *   - It does not restyle anything. The brief was to rebuild the current site in place and
 *     redesign later; a "faithful" port that quietly changed the design would be neither.
 */
const fs = require('fs');
const path = require('path');

const APP = __dirname;
const CAPTURE = path.join(APP, 'legacy-capture', 'pages');
const SRC = path.join(APP, 'src');

// capture filename -> page served. The skeleton's own form page is preserved separately
// as platform-interest.html; it is the one form this app actually owns.
const PAGES = {
  'index.html': 'index.html',
  'individuals.html': 'individuals.html',
  'enterprise.html': 'enterprise.html',
  'organizations.html': 'organizations.html',
  'public-library.html': 'public-library.html',
  'contact-us.html': 'contact-us.html',
  'feedback.html': 'feedback.html',
  'enterprise-feedback.html': 'enterprise-feedback.html',
  'thank-you.html': 'thank-you.html',
  'privacy.html': 'privacy.html',
  'terms.html': 'terms.html',
};

const TRACKER =
  '\n<!-- Refactored.ai platform tracking. Added by the rebuild: the point of taking over\n' +
  '     this front door is that visits attribute to the refactored brand instead of being\n' +
  '     invisible. Server resolves tenant from the source slug; no ids are sent from here. -->\n' +
  '<script src="/assets/track-v2.js" data-site="{{brand.sourceSlug}}" data-api="{{brand.platformApiBase}}" defer></script>\n';

/**
 * Absolute self-links pin the page to one hostname. Making them root-relative means the
 * same file serves correctly from refactored.ai, www.refactored.ai, or a staging host —
 * which matters because the whole point is to preview this before the DNS cutover.
 *
 * ONLY URLs WITH A PATH ARE REWRITTEN, and that is load-bearing rather than incidental.
 * `terms.html` contains the sentence `...use of https://training.colaberry.com/,
 * http://refactored.ai ("Refactored")...` — that is the Terms of Use naming the site in
 * prose. Rewriting text inside a legal document to satisfy a build script would be
 * changing the terms themselves. Requiring the trailing `/` keeps the rewrite to things
 * that are actually links.
 */
function relativiseSelfLinks(html) {
  return html
    .split('https://www.refactored.ai/').join('/')
    .split('https://refactored.ai/').join('/')
    .split('http://www.refactored.ai/').join('/')
    .split('http://refactored.ai/').join('/');
}

/**
 * Count absolute self-references that are actually LINKS (href/src), so the expected
 * prose mention in the legal pages does not read as a defect in the report.
 */
function countAbsoluteSelfLinks(html) {
  return (html.match(/(?:href|src)="https?:\/\/(?:www\.)?refactored\.ai/g) || []).length;
}

function injectTracker(html) {
  if (html.includes('track-v2.js')) return html;
  const i = html.lastIndexOf('</body>');
  if (i === -1) return html + TRACKER; // malformed page: append rather than lose the tag
  return html.slice(0, i) + TRACKER + html.slice(i);
}

/**
 * Mark the reCAPTCHA site key so the secret scanner stops blocking on it.
 *
 * It is a `data-sitekey`, which Google requires to be embedded in the HTML of every page
 * rendering the widget — it is already served to every visitor of the live site. The half
 * that must stay private is the reCAPTCHA SECRET key, which is server-side.
 *
 * Injected by the generator rather than recorded as a .gitleaksignore fingerprint,
 * because a fingerprint is anchored to a line number and these pages are regenerated: a
 * re-port that shifted the line would silently un-exempt it, or worse, exempt whatever
 * moved into line 195. Keeping the marker attached to the actual element means it moves
 * with the thing it describes.
 */
function markRecaptchaSiteKey(html) {
  return html
    .split(/\r?\n/)
    .map((line) => {
      if (!line.includes('data-sitekey=')) return line;
      if (line.includes('gitleaks:allow')) return line;
      // Must be on the SAME line as the value for gitleaks to honour it.
      return line + ' <!-- gitleaks:allow reCAPTCHA site key: public by design -->';
    })
    .join('\n');
}

function main() {
  if (!fs.existsSync(CAPTURE)) {
    console.error(`no capture at ${CAPTURE} — run legacy-capture/capture.js first`);
    process.exit(2);
  }
  fs.mkdirSync(SRC, { recursive: true });

  let ported = 0;
  const report = [];
  for (const [from, to] of Object.entries(PAGES)) {
    const source = path.join(CAPTURE, from);
    if (!fs.existsSync(source)) {
      console.log(`  SKIP ${from} (not in capture)`);
      continue;
    }
    const original = fs.readFileSync(source, 'utf8');
    const out = markRecaptchaSiteKey(injectTracker(relativiseSelfLinks(original)));
    fs.writeFileSync(path.join(SRC, to), out, 'utf8');

    const hasTracker = out.includes('track-v2.js');
    const absLeft = countAbsoluteSelfLinks(out);
    report.push({ page: to, bytes: Buffer.byteLength(out, 'utf8'), tracker: hasTracker, absoluteSelfLinksLeft: absLeft });
    console.log(`  ${to.padEnd(26)} ${String(Buffer.byteLength(out, 'utf8')).padStart(7)} bytes  tracker=${hasTracker ? 'yes' : 'NO'}  abs-self-links=${absLeft}`);
    ported++;
  }

  fs.writeFileSync(path.join(SRC, '.ported.json'), JSON.stringify({
    generated_by: 'port-from-capture.js',
    source: 'legacy-capture/pages',
    note: 'Faithful port of the site as captured. Forms are intentionally untouched — see the header of port-from-capture.js.',
    pages: report,
  }, null, 2) + '\n', 'utf8');

  console.log(`\n  ported ${ported}/${Object.keys(PAGES).length} pages into src/`);
  const missingTracker = report.filter((r) => !r.tracker);
  if (missingTracker.length) {
    console.error(`  FAILED: ${missingTracker.length} page(s) did not get the tracker`);
    process.exit(1);
  }
}

main();

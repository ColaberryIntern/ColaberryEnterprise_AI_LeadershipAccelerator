/**
 * platformBuild/serveMap - which bytes answer which path under a project's view link. PURE.
 *
 * The platform serves one project's Command Center and Demo under
 * `/api/platform-view/<token>/`, laid out exactly as they would sit in a repo so every relative
 * path the agent wrote keeps working:
 *
 *   <base>/                           the Command Center (stored artifact, index.html)
 *   <base>/command-center/**          its scripts, styles and data model (stored artifact)
 *   <base>/.colaberry/*.json          LIVE: rendered from the platform's records on every request,
 *                                     so progress the portal shows and the page shows never differ
 *   <base>/demo/                      the Connected Demo engine (shipped with the platform)
 *   <base>/demo/demo-spec.json        the demo's spec (stored artifact)
 *   <base>/__platform/storage-shim.js an in-memory storage fallback, see below
 *
 * ## Why everything is served sandboxed
 *
 * The Command Center's HTML and JavaScript were written by a model, from a student's plan, and
 * they are served from OUR origin. Unsandboxed, that script could read a signed-in student's
 * portal token from localStorage. `Content-Security-Policy: sandbox allow-scripts ...` without
 * `allow-same-origin` gives the page an opaque origin: it runs, it cannot touch our storage or
 * cookies. Two consequences are handled here rather than left to the agent:
 *
 *   - Its fetches of `.colaberry/*.json` are now cross-origin (Origin: null), so those responses
 *     carry `Access-Control-Allow-Origin: *`. They are only reachable with a valid token anyway.
 *   - `localStorage` throws in an opaque origin. The shim, injected first into every HTML page,
 *     replaces it with an in-memory store so a Command Center that never guarded its storage
 *     calls still renders.
 */

export type ServeTarget =
  | { kind: 'cc_file'; path: string }
  | { kind: 'live'; path: string }
  | { kind: 'demo_engine' }
  | { kind: 'demo_spec' }
  | { kind: 'shim' }
  | { kind: 'redirect'; to: string };

export const SHIM_PATH = '__platform/storage-shim.js';

const LIVE_FILES = new Set([
  '.colaberry/plan.json',
  '.colaberry/progress.json',
  '.colaberry/manifest.json',
  '.colaberry/profile.json',
]);
const LIVE_ENRICHMENT = /^\.colaberry\/enrichment\/[A-Za-z0-9._-]+\.json$/;
const CC_FILE = /^command-center\/[a-z0-9._\-/]+\.(html|css|js|json|md)$/;

/** `rest` is everything after `<base>/`, already URL-decoded by the router. Null means 404. */
export function resolveServePath(rest: string): ServeTarget | null {
  if (typeof rest !== 'string' || rest.length > 200) return null;
  if (rest.includes('\\') || rest.includes('\0') || rest.split('/').some((s) => s === '..')) return null;
  if (rest === '' || rest === 'index.html') return { kind: 'cc_file', path: 'index.html' };
  if (rest === 'demo') return { kind: 'redirect', to: 'demo/' };
  if (rest === 'demo/' || rest === 'demo/index.html') return { kind: 'demo_engine' };
  if (rest === 'demo/demo-spec.json') return { kind: 'demo_spec' };
  if (rest === SHIM_PATH) return { kind: 'shim' };
  if (LIVE_FILES.has(rest) || LIVE_ENRICHMENT.test(rest)) return { kind: 'live', path: rest };
  if (CC_FILE.test(rest) && !rest.split('/').some((s) => s.startsWith('.'))) return { kind: 'cc_file', path: rest };
  return null;
}

export function contentTypeFor(path: string): string {
  if (path.endsWith('.html') || path.endsWith('/')) return 'text/html; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'application/octet-stream';
}

/**
 * The response policy. `nonce` is passed for the platform's own engine (a trusted template);
 * the agent-written Command Center is served with 'unsafe-inline' instead, because a nonce
 * protects a trusted template from injected data, and here the whole document is the untrusted
 * part. The sandbox is what contains it.
 */
export function viewHeaders(opts: { html: boolean; nonce?: string }): Record<string, string> {
  const scriptSrc = opts.nonce ? `'self' 'nonce-${opts.nonce}'` : "'self' 'unsafe-inline'";
  return {
    'Content-Security-Policy': [
      'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads',
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      // The platform's own engine loads its web font over https, exactly as the public demo route
      // allows; the agent-written Command Center is asked for no external loads and gets none.
      opts.nonce ? "style-src 'self' https: 'unsafe-inline'" : "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      opts.nonce ? "font-src 'self' https: data:" : "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "object-src 'none'",
    ].join('; '),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    // Helmet's app-wide default is `same-origin`, and a sandboxed page's origin is opaque, so its
    // own scripts and styles would be blocked. Safe to relax: every byte here needs a valid token.
    'Cross-Origin-Resource-Policy': 'cross-origin',
    // Fetches from the sandboxed page arrive with Origin: null.
    ...(opts.html ? {} : { 'Access-Control-Allow-Origin': '*' }),
  };
}

/** Runs before any page script. Replaces storage that an opaque origin refuses with memory. */
export const STORAGE_SHIM_JS = [
  '(function () {',
  '  function memory() {',
  '    var d = {};',
  '    return {',
  '      getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },',
  '      setItem: function (k, v) { d[k] = String(v); },',
  '      removeItem: function (k) { delete d[k]; },',
  '      clear: function () { d = {}; },',
  '      key: function (i) { return Object.keys(d)[i] || null; },',
  '      get length() { return Object.keys(d).length; }',
  '    };',
  '  }',
  '  ["localStorage", "sessionStorage"].forEach(function (name) {',
  '    try { window[name].getItem("__probe__"); }',
  '    catch (e) { try { Object.defineProperty(window, name, { value: memory(), configurable: true }); } catch (e2) {} }',
  '  });',
  '})();',
  '',
].join('\n');

/** Put the shim first in the document, before any script the page brings. */
export function injectShim(html: string, shimSrc: string = SHIM_PATH): string {
  const tag = `<script src="${shimSrc}"></script>`;
  const head = html.match(/<head\b[^>]*>/i);
  if (head && head.index !== undefined) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }
  return tag + html;
}

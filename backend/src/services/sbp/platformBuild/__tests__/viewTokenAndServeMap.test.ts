import { mintViewToken, verifyViewToken, VIEW_TOKEN_TTL_SECONDS } from '../viewToken';
import { resolveServePath, viewHeaders, injectShim, injectDemoLink, contentTypeFor, SHIM_PATH } from '../serveMap';

const SECRET = 'test-secret-value';
const PROJECT = '3f2b6c1e-8a1d-4c2b-9d3e-1a2b3c4d5e6f';
const NOW = 1_800_000_000;

describe('viewToken', () => {
  it('round-trips a project id until it expires', () => {
    const t = mintViewToken(PROJECT, SECRET, NOW);
    expect(verifyViewToken(t, SECRET, NOW + 1)).toBe(PROJECT);
    expect(verifyViewToken(t, SECRET, NOW + VIEW_TOKEN_TTL_SECONDS - 1)).toBe(PROJECT);
    expect(verifyViewToken(t, SECRET, NOW + VIEW_TOKEN_TTL_SECONDS)).toBeNull();
  });

  it('refuses a token signed with another secret, a tampered payload, and junk', () => {
    const t = mintViewToken(PROJECT, SECRET, NOW);
    expect(verifyViewToken(t, 'other-secret', NOW)).toBeNull();
    const [payload, sig] = t.split('.');
    const other = Buffer.from(JSON.stringify({ p: '00000000-0000-4000-8000-000000000000', e: NOW + 999 })).toString('base64url');
    expect(verifyViewToken(`${other}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifyViewToken(`${payload}.`, SECRET, NOW)).toBeNull();
    expect(verifyViewToken('nonsense', SECRET, NOW)).toBeNull();
    expect(verifyViewToken('', SECRET, NOW)).toBeNull();
  });

  it('is not a session JWT: three-part tokens are refused', () => {
    expect(verifyViewToken('a.b.c', SECRET, NOW)).toBeNull();
  });

  it('only mints for a project uuid', () => {
    expect(() => mintViewToken('not-a-uuid', SECRET, NOW)).toThrow();
  });
});

describe('serveMap.resolveServePath', () => {
  it('lays the build out exactly as a repo would', () => {
    expect(resolveServePath('')).toEqual({ kind: 'cc_file', path: 'index.html' });
    expect(resolveServePath('index.html')).toEqual({ kind: 'cc_file', path: 'index.html' });
    expect(resolveServePath('command-center/js/core.js')).toEqual({ kind: 'cc_file', path: 'command-center/js/core.js' });
    expect(resolveServePath('.colaberry/plan.json')).toEqual({ kind: 'live', path: '.colaberry/plan.json' });
    expect(resolveServePath('.colaberry/enrichment/STORY-001.json')).toEqual({ kind: 'live', path: '.colaberry/enrichment/STORY-001.json' });
    expect(resolveServePath('demo')).toEqual({ kind: 'redirect', to: 'demo/' });
    expect(resolveServePath('demo/')).toEqual({ kind: 'demo_engine' });
    expect(resolveServePath('demo/demo-spec.json')).toEqual({ kind: 'demo_spec' });
    expect(resolveServePath(SHIM_PATH)).toEqual({ kind: 'shim' });
  });

  it.each([
    '../index.html', 'command-center/../../x.js', '.colaberry/../x.json', '.colaberry/secret.json',
    'docs/STORIES.md', 'command-center/a.svg', 'CLAUDE.md', 'command-center/.env.js', 'a\\b.js',
  ])('serves nothing for %s', (p) => {
    expect(resolveServePath(p)).toBeNull();
  });
});

describe('serveMap headers and shim', () => {
  it('sandboxes every page without allow-same-origin, and opens data files to the opaque origin', () => {
    const html = viewHeaders({ html: true });
    expect(html['Content-Security-Policy']).toMatch(/^sandbox allow-scripts/);
    expect(html['Content-Security-Policy']).not.toMatch(/allow-same-origin/);
    expect(html['Content-Security-Policy']).toMatch(/form-action 'none'/);
    expect(html['Access-Control-Allow-Origin']).toBeUndefined();
    expect(html['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    expect(viewHeaders({ html: false })['Access-Control-Allow-Origin']).toBe('*');
    expect(viewHeaders({ html: true, nonce: 'abc' })['Content-Security-Policy']).toMatch(/script-src 'self' 'nonce-abc'/);
    expect(html['Cache-Control']).toBe('no-store');
    expect(html['Referrer-Policy']).toBe('no-referrer');
  });

  it('puts the shim before every other script', () => {
    const out = injectShim('<html><head><script src="a.js"></script></head></html>');
    expect(out.indexOf(SHIM_PATH)).toBeLessThan(out.indexOf('a.js'));
    expect(injectShim('<p>no head</p>', '../x.js').startsWith('<script src="../x.js">')).toBe(true);
  });

  it('types each file', () => {
    expect(contentTypeFor('a.js')).toMatch(/javascript/);
    expect(contentTypeFor('a.json')).toMatch(/json/);
    expect(contentTypeFor('a.css')).toMatch(/css/);
    expect(contentTypeFor('index.html')).toMatch(/html/);
  });
});

describe('injectDemoLink', () => {
  it('goes last in the body, once, with the href it was given', () => {
    const out = injectDemoLink('<html><body><p>hi</p></BODY></html>', '../demo/');
    expect(out).toMatch(/<a id="platform-demo-link" href="\.\.\/demo\/">Open the demo<\/a><\/BODY><\/html>$/);
    expect(out.match(/<a id="platform-demo-link"/g)).toHaveLength(1);
  });

  it('is appended when the page has no closing body tag', () => {
    expect(injectDemoLink('<p>hi', 'demo/')).toContain('href="demo/"');
  });
});

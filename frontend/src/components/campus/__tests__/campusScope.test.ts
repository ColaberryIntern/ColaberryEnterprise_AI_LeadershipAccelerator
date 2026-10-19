import fs from 'fs';
import path from 'path';

/**
 * C3 `.cm-scope`: the legacy PortalLayout and Showcase pages have no .te-shell, so the shell tokens the
 * campus reads do not exist there. .cm-scope must define EVERY variable the campus stylesheets read
 * (except per-building --cm-c, set inline), and only by pointing at global tokens that really exist.
 */
const DIR = path.join(__dirname, '..');
const TOKENS = path.join(__dirname, '..', '..', '..', 'colaberry', 'tokens');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = ['campus.css', 'campusBanner.css', 'campusPeople.css', 'campusAudiences.css', 'campusLive.css'].map((f) => strip(fs.readFileSync(path.join(DIR, f), 'utf8'))).join('\n');
const GLOBAL = fs.readdirSync(TOKENS).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(TOKENS, f), 'utf8')).join('\n');

const scopeBody = (css: string) => (css.match(/\.cm-scope\{([^}]*)\}/) ?? [])[1] ?? '';
const declared = (body: string) => new Map(Array.from(body.matchAll(/(--[\w-]+):([^;]+);/g)).map((m) => [m[1], m[2].trim()]));
const used = (css: string) => new Set(Array.from(css.matchAll(/var\((--[\w-]+)/g)).map((m) => m[1]));
const definedGlobally = (name: string) => new RegExp(`${name}\\s*:`).test(GLOBAL);

/** Variables the campus reads that .cm-scope does not define (computed for any stylesheet text). */
export function missingFromScope(css: string): string[] {
  const scope = declared(scopeBody(css));
  return Array.from(used(css)).filter((v) => v !== '--cm-c' && !scope.has(v) && !definedGlobally(v)).sort();
}

describe('.cm-scope maps the campus onto global tokens', () => {
  it('found the scope and a real set of variables', () => {
    expect(scopeBody(CSS).length).toBeGreaterThan(100);
    expect(used(CSS).size).toBeGreaterThan(15);
  });

  it('defines every variable the campus stylesheets read', () => {
    expect(missingFromScope(CSS)).toEqual([]);
  });

  it('every color mapping points at a global token that exists (no dangling var)', () => {
    for (const [name, value] of Array.from(declared(scopeBody(CSS)))) {
      const target = value.match(/^var\((--[\w-]+)\)$/);
      if (!target) continue; // shadow is a literal rgba (no hex), checked by campusNoHex
      expect({ name, target: target[1], exists: definedGlobally(target[1]) }).toEqual({ name, target: target[1], exists: true });
    }
  });

  it('mutation control: dropping a mapping is caught', () => {
    const broken = CSS.replace('--muted:var(--text-muted);', '');
    expect(missingFromScope(broken)).toEqual(['--muted']);
  });
});

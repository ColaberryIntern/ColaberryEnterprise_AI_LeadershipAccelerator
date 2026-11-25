import fs from 'fs';
import path from 'path';

/**
 * EVERY FILE-UPLOAD ROUTE NEEDS ITS OWN NGINX LOCATION, OR IT IS CAPPED AT 1 MB.
 *
 * nginx's default `client_max_body_size` is 1 MB, and the plain `/api/` proxy block does
 * not raise it. A route whose multer cap is 50 MB is therefore refused at the edge at
 * 1 MB, with an HTML 413 the backend never sees and the uploader cannot interpret.
 *
 * This has shipped FOUR times: the content-media path (2026-09-15), the gov qualification
 * ZIPs (2026-10-02, and again 2026-10-05 when `attest-zip` was added after the block and
 * missed the list), the build-lab artifact upload that reached students, and the media
 * library upload (2026-11-18, LIB-3).
 *
 * THE FOURTH ONE GOT PAST THIS TEST, which was green the whole time. That is the thing
 * worth understanding, because a guard that misses silently is worse than no guard: it
 * is a guard somebody trusts. The old detector matched exactly one spelling —
 * `<something>Upload.single(` directly inside a `router.post('literal'`. Six other
 * spellings are in use in this repo, and every one of them was invisible:
 *
 *   1. a local wrapper          `uploadSingle('file')`      contentLibraryRoutes
 *   2. a wrapper by reference   `acceptUploads`             caseStudyOutsideIntakeRoutes
 *   3. multer called in-handler `x.single(f)(req,res,cb)`   govQualificationRoutes
 *   4. the path in a constant   `router.post(VIDEO, ...)`   careerPortfolioRoutes
 *   5. a template-literal path  `` `${BASE}/documents` ``   explorerKnowledgeRoutes
 *   6. multer in a CONTROLLER   `c.uploadResourceFile`      communityRoomsController
 *
 * Shapes 4 and 6 were not even reachable: the old walk covered `routes/` only, and the
 * handler lives in `controllers/`. Fourteen routes were checked; twenty-six exist.
 *
 * So this version does two things differently. It follows multer through the module
 * graph instead of pattern-matching one spelling, and - the part that actually matters -
 * it FAILS WHEN IT CANNOT SEE, rather than passing on an empty list. Any file that uses
 * multer and yields no route is a detector blind spot, and is reported as a failure
 * unless it is written down below as a file that deliberately mounts nothing.
 *
 * It reads source text rather than booting nginx because CI has no nginx and the config
 * references includes that only exist in our image. Syntax is checked against the real
 * image before deploy.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const NGINX = path.join(ROOT, 'nginx', 'nginx.conf');
const SRC = path.join(__dirname, '..');

/**
 * Upload routes KNOWN to be left at the 1 MB default.
 *
 * EMPTY as of 2026-11-21, and that is the list doing its job rather than falling out of
 * use. Every upload route in this repo is now raised to its own multer cap.
 *
 * It was never a suppression list - it is a decision list, and the decision each entry
 * recorded was "we know this cannot accept a real file, and we have not fixed it."
 * Seventeen routes sat in that state. Eleven had been accepted since 2026-10-12, because
 * the only nginx raise ever approved covered the build-lab path, and seven of those
 * eleven were ones a STUDENT hits: a submission, a NotebookLM export, a certificate, a
 * signed internship document, a community photo. A student who gets an HTML 413 from the
 * edge cannot interpret it and will not file a useful bug. They just stop.
 *
 * Adding an entry back is allowed and sometimes right - it means writing down why a route
 * is being left broken. It should be hard to do QUIETLY, which is what the assertions
 * below are for.
 */
const KNOWN_UNRAISED: Array<{ route: string; multerCap: string; note: string }> = [];

/**
 * Files that use multer but mount no route of their own, and why. Anything NOT listed here
 * that uses multer and yields no route is a blind spot in the detector below, and fails.
 */
const MULTER_FILES_WITHOUT_ROUTES: Record<string, string> = {
  'backend/src/config/upload.ts': 'defines the shared upload middlewares; mounts nothing',
  'backend/src/config/caseStudyExternalUpload.ts': 'middleware definition only',
  'backend/src/config/hireVideoUpload.ts': 'middleware definition only',
  'backend/src/config/prepAttemptUpload.ts': 'middleware definition only',
  'backend/src/controllers/adminImportController.ts': 'exports handlers mounted by leadRoutes; its multer instance is used inside a handler the route file imports',
  'backend/src/controllers/communityRoomsController.ts': 'exports uploadResourceFile, mounted by communityRoomsRoutes',
  'backend/src/config/enterpriseIntakeUpload.ts': 'middleware definition only (added 2026-11-21 by the Enterprise intake v2 work)',
  'backend/src/controllers/enterpriseIntakeScheduleController.ts': 'exports handleUploadClientFile, mounted by leadRoutes; its route /api/enterprise/intake/:token/files is raised to 26m',
  'backend/src/controllers/hireVideoController.ts': 'exports handleUploadHireVideo, mounted by careerPortfolioRoutes',
};

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Blank out quoted strings and comments before looking for an identifier.
 *
 * Without this, a handler containing `row.source === 'upload'` is tainted by the word
 * inside the quotes and reported as a file-upload route. That happened: the comms-hub
 * thumbnail "change" route has no multer middleware at all and was still flagged. A false
 * positive here is the safe direction - it asks for a raise that is not needed - but it
 * costs the suite its credibility, and a guard nobody believes gets switched off.
 *
 * Template literals are left intact on purpose: a route path is often written as
 * `` `${BASE}/documents` ``, and the `${...}` parts are real code that may name a tainted
 * middleware. Blanking them would trade this false positive for a false negative, which is
 * the direction that actually ships broken uploads.
 */
const stripLiterals = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') tsFiles(p, out);
      continue;
    }
    if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const FILES = tsFiles(SRC);
const TEXT = new Map(FILES.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base, path.join(base, 'index')]) {
    if (fs.existsSync(`${cand}.ts`)) return cand;
  }
  return null;
}

/** Module path (no extension) -> exported names that are multer-derived. */
const taintedExports = new Map<string, Set<string>>();
for (const f of FILES) {
  const names = new Set<string>();
  for (const m of TEXT.get(f)!.matchAll(/export\s+const\s+([A-Za-z0-9_]+)\s*=\s*multer\(/g)) names.add(m[1]);
  if (names.size) taintedExports.set(f.replace(/\.ts$/, ''), names);
}

/**
 * Names in one file that carry multer: local instances, imported instances, namespace
 * imports, and anything whose own definition references one of those. Iterated to a
 * fixpoint so a wrapper around a wrapper is still caught.
 */
function localTaint(f: string): Set<string> {
  const s = TEXT.get(f)!;
  const tainted = new Set<string>();

  for (const m of s.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*multer\(/g)) tainted.add(m[1]);

  for (const m of s.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const exported = taintedExports.get(resolveImport(f, m[2]) ?? '');
    if (!exported) continue;
    for (const piece of m[1].split(',')) {
      const parts = piece.trim().split(/\s+as\s+/);
      const orig = parts[0].trim();
      const local = (parts[1] ?? parts[0]).trim();
      if (orig && exported.has(orig)) tainted.add(local);
    }
  }

  // `import * as c from './x'` makes `c.handler` the usable name.
  for (const m of s.matchAll(/import\s*\*\s*as\s+([A-Za-z0-9_]+)\s*from\s*'([^']+)'/g)) {
    const exported = taintedExports.get(resolveImport(f, m[2]) ?? '');
    if (!exported) continue;
    for (const name of exported) tainted.add(`${m[1]}.${name}`);
  }

  for (let i = 0; i < 6; i += 1) {
    const before = tainted.size;
    const defs = [
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([\s\S]*?\n\}/g,
      /(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(?:async\s*)?\([\s\S]*?\n\};?/g,
    ];
    for (const re of defs) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        if (tainted.has(m[1])) continue;
        for (const t of tainted) {
          if (new RegExp(`\\b${esc(t)}\\b`).test(stripLiterals(m[0]))) { tainted.add(m[1]); break; }
        }
      }
    }
    if (tainted.size === before) break;
  }
  return tainted;
}

const TAINT = new Map(FILES.map((f) => [f, localTaint(f)]));

// A file's tainted exports feed its importers, so a controller's handler taints the route
// file that mounts it. Repeated until nothing new appears.
for (let round = 0; round < 6; round += 1) {
  let changed = false;
  for (const f of FILES) {
    const key = f.replace(/\.ts$/, '');
    const s = TEXT.get(f)!;
    const exported = new Set(taintedExports.get(key) ?? []);
    for (const name of TAINT.get(f)!) {
      if (name.includes('.')) continue;
      const isExported = new RegExp(`export\\s+(?:const|async\\s+function|function)\\s+${esc(name)}\\b`).test(s)
        || new RegExp(`export\\s*\\{[^}]*\\b${esc(name)}\\b`).test(s);
      if (isExported && !exported.has(name)) { exported.add(name); changed = true; }
    }
    if (exported.size) taintedExports.set(key, exported);
  }
  if (!changed) break;
  for (const f of FILES) TAINT.set(f, localTaint(f));
}

/** Every POST/PUT/PATCH mount whose argument list carries multer, with its full path. */
function uploadRoutes(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const f of FILES) {
    const tainted = TAINT.get(f)!;
    if (!tainted.size) continue;
    const s = TEXT.get(f)!;

    const consts = new Map<string, string>();
    for (const m of s.matchAll(/(?:const|let)\s+([A-Za-z0-9_]+)\s*(?::\s*string\s*)?=\s*'([^']+)'/g)) consts.set(m[1], m[2]);
    for (const m of s.matchAll(/(?:const|let)\s+([A-Za-z0-9_]+)\s*(?::\s*string\s*)?=\s*`([^`]*)`/g)) {
      if (!m[2].includes('${')) consts.set(m[1], m[2]);
    }
    const fromTemplate = (lit: string): string | null => {
      let out = lit;
      for (let i = 0; i < 4 && out.includes('${'); i += 1) {
        out = out.replace(/\$\{\s*([A-Za-z0-9_]+)\s*\}/g, (full, name: string) => consts.get(name) ?? full);
      }
      return out.includes('${') ? null : out;
    };

    for (const m of s.matchAll(/\brouter\.(?:post|put|patch)\(\s*(`[^`]*`|[A-Za-z0-9_]+|'[^']+')\s*,/g)) {
      const raw = m[1];
      let route: string | null | undefined;
      if (raw.startsWith("'")) route = raw.slice(1, -1);
      else if (raw.startsWith('`')) route = fromTemplate(raw.slice(1, -1));
      else route = consts.get(raw);
      if (!route || !route.startsWith('/')) continue;

      // The argument list, read to its balanced closing paren, so a handler body counts too.
      const start = m.index! + m[0].length - 1;
      let depth = 1;
      let i = start;
      while (i < s.length && depth > 0) {
        i += 1;
        if (s[i] === '(') depth += 1;
        else if (s[i] === ')') depth -= 1;
      }
      const args = s.slice(start, i);
      const argCode = stripLiterals(args);
      const hit = [...tainted].some((t) => new RegExp(`\\b${esc(t)}\\b`).test(argCode));
      if (!hit) continue;
      if (!found.has(route)) found.set(route, new Set());
      found.get(route)!.add(rel(f));
    }
  }
  return found;
}

type Loc = { op: string; pattern: string; limit: string | null };

/** Every location block, with its match operator and any body-size raise. */
function locations(): Loc[] {
  const conf = fs.readFileSync(NGINX, 'utf8');
  const out: Loc[] = [];
  // A QUOTED pattern may contain braces (`[0-9a-f-]{36}`) - which is why nginx requires the
  // quotes, since it would otherwise read `{` as a block opener. One character class that
  // excludes `{` truncates every quoted regex and reports raised paths as unraised.
  const re = /location\s+(=|\^~|~\*|~)?\s*(?:"([^"]+)"|([^"\s{]+))\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(conf)) !== null) {
    const start = m.index + m[0].length - 1;
    let depth = 1;
    let i = start;
    while (i < conf.length && depth > 0) {
      i += 1;
      if (conf[i] === '{') depth += 1;
      else if (conf[i] === '}') depth -= 1;
    }
    const lim = /client_max_body_size\s+([0-9]+[kmg]?)/i.exec(conf.slice(start, i));
    out.push({ op: m[1] ?? 'prefix', pattern: m[2] ?? m[3], limit: lim ? lim[1] : null });
  }
  return out;
}

const LOCS = locations();

/**
 * nginx's real selection order: an exact `=` wins outright; then the longest `^~` prefix;
 * then the FIRST matching regex in file order; then the longest plain prefix. Modelling
 * this matters, because "some regex in the file raises it" is not the same question as
 * "the block nginx actually picks raises it".
 */
function winner(p: string): Loc | null {
  const exact = LOCS.find((l) => l.op === '=' && l.pattern === p);
  if (exact) return exact;
  const prefixes = LOCS
    .filter((l) => (l.op === 'prefix' || l.op === '^~') && p.startsWith(l.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  if (prefixes[0]?.op === '^~') return prefixes[0];
  for (const l of LOCS) {
    if (l.op !== '~' && l.op !== '~*') continue;
    try {
      if (new RegExp(l.pattern, l.op === '~*' ? 'i' : '').test(p)) return l;
    } catch { /* an unparseable pattern is not a match */ }
  }
  return prefixes[0] ?? null;
}

/**
 * An express path with its params filled in. A 36-character uuid, because real ids are
 * uuids and several nginx patterns spell that length out (`[0-9a-f-]{36}`); a shorter
 * stand-in fails those and reports a raised route as unraised.
 */
const concrete = (route: string) => route.replace(/:[A-Za-z0-9_]+/g, '0123abcd-0123-4abc-8abc-0123456789ab');

const ROUTE_MAP = uploadRoutes();
const ROUTES = [...ROUTE_MAP.keys()].sort();
const covered = (route: string) => {
  const w = winner(concrete(route));
  return w && w.limit ? w : undefined;
};

describe('nginx body-size coverage for upload routes', () => {
  it('found the routes and the locations - a parse that returned nothing must fail loudly', () => {
    // Positive control. Without it, a changed route shape or a reformatted nginx file makes
    // every assertion below compare empty lists and pass. The floor is deliberately close to
    // the real count: the old floor of 5 was met while 12 routes were invisible.
    expect(ROUTES.length).toBeGreaterThanOrEqual(24);
    expect(LOCS.filter((l) => l.limit).length).toBeGreaterThanOrEqual(6);
  });

  it('sees every spelling of an upload mount that this repo actually uses', () => {
    // The real control. Each of these is a DIFFERENT shape, and each was invisible to the
    // previous version of this test. If a refactor breaks one, this fails by name instead of
    // quietly shrinking the set that gets checked.
    const shapes: Array<[string, string]> = [
      ['/api/admin/marketing/library/file', 'local wrapper: uploadSingle(field)'],
      ['/api/admin/factory/case-studies/external', 'wrapper passed by reference: acceptUploads'],
      ['/api/admin/factory/qualification/:canonicalOpportunityId/attest-zip', 'multer invoked inside the handler'],
      ['/api/portal/career/portfolio-page/hire-video', 'path in a const, handler in a controller'],
      ['/api/admin/explorer-growth/knowledge/documents', 'template-literal path'],
      ['/api/portal/community/rooms/:id/resources/file', 'namespace import of a controller handler'],
      ['/api/portal/runtime/cards/:cardId/build-artifact', 'plain upload.single() in the mount'],
    ];
    const missing = shapes.filter(([r]) => !ROUTE_MAP.has(r)).map(([r, why]) => `${r} (${why})`);
    expect(missing).toEqual([]);
  });

  it('does not mistake a handler that merely mentions "upload" for an upload route', () => {
    // The comms-hub thumbnail "change" route carries no multer middleware, but its handler
    // contains `row.source === 'upload'`. An identifier matcher that reads inside string
    // literals taints it and demands an nginx block for a route that never carries a file.
    // That is the safe direction to be wrong in, which is exactly why it would have survived
    // unnoticed - and a suite that cries wolf gets switched off.
    expect(ROUTE_MAP.has('/api/admin/comms-hub/events/:id/thumbnails/:thumbId/change')).toBe(false);
    // Paired control: the sibling that DOES carry multer is still found. Without it, this
    // assertion would also pass if the detector stopped reading the file at all.
    expect(ROUTE_MAP.has('/api/admin/comms-hub/events/:id/thumbnails/upload')).toBe(true);
  });

  it('every file that uses multer is accounted for', () => {
    // THE ANTI-BLIND-SPOT CONTROL, and the reason the library upload got through. A file that
    // carries multer but yields no route is either a definition-only module - which must be
    // written down - or a shape the detector cannot see. Silence is not allowed to mean safety.
    const attributed = new Set<string>();
    for (const files of ROUTE_MAP.values()) for (const f of files) attributed.add(f);
    const unexplained = FILES
      .filter((f) => TAINT.get(f)!.size > 0)
      .map(rel)
      .filter((r) => !attributed.has(r) && !(r in MULTER_FILES_WITHOUT_ROUTES));
    expect(unexplained).toEqual([]);
  });

  it('THE FIX: the build-lab artifact upload is raised, with the envelope margin', () => {
    const hit = covered('/api/portal/runtime/cards/:cardId/build-artifact');
    expect(hit).toBeDefined();
    // 101m = MAX_BUILD_ARTIFACT_SIZE (100MB) + 1m, the margin every other route here uses.
    //
    // THIS SAID 100m UNTIL 2026-11-25, with a comment claiming "a file between the two
    // limits should be refused by the backend with a readable error, never by nginx with
    // an HTML 413." The limits were EQUAL, so there was no band between them: the comment
    // described a margin that did not exist, and a near-100MB artifact got precisely the
    // HTML 413 the sentence promised it would not. Three sibling routes were set the same
    // way and are fixed in the same change - see the pairing table below, which now
    // governs all four so none of them can drift back to the cap alone.
    expect(hit!.limit!.toLowerCase()).toBe('101m');
  });

  it('the content-media raise is seen, quoted braces and all', () => {
    // Regression guard for the parser itself. This pattern is `[0-9a-f-]{36}`, and a location
    // reader that stops at `{` silently drops it and calls a raised path unraised.
    const hit = covered('/api/admin/content/:id/media');
    expect(hit).toBeDefined();
    expect(hit!.limit!.toLowerCase()).toBe('200m');
  });

  it('the raise does not leak to every other API route', () => {
    // A blanket raise on `/api/` would let any endpoint accept a 100 MB body. The whole point
    // of a per-path location is that it applies to one path.
    const apiPrefix = LOCS.find((l) => l.op === 'prefix' && l.pattern === '/api/');
    expect(apiPrefix).toBeDefined();
    expect(apiPrefix!.limit).toBeNull();
  });

  it('every upload route is either raised or listed as a known exception', () => {
    // THE GUARD. A new upload route added without an nginx block fails here, instead of
    // failing silently in production the first time somebody uploads a real file.
    const listed = new Set(KNOWN_UNRAISED.map((k) => k.route));
    const unaccounted = ROUTES.filter((r) => !covered(r) && !listed.has(r));
    expect(unaccounted).toEqual([]);
  });

  it('EVERY upload route is raised, with the exception list empty', () => {
    // The end state, asserted directly rather than inferred from an empty list. Without
    // this, emptying KNOWN_UNRAISED would make the assertion above pass trivially, and the
    // suite would be at its greenest precisely when it was checking least.
    //
    // This is deliberately stricter than the guard above: a new upload route cannot be
    // shipped unraised even WITH a written-down reason, without someone also editing this
    // test. That is the point - the reason should be argued, not appended.
    const unraised = ROUTES.filter((r) => !covered(r));
    expect(unraised).toEqual([]);
    expect(KNOWN_UNRAISED).toEqual([]);
  });

  it('every raise matches its route, not merely some route', () => {
    // Guards the pairing rather than the count. A block that raises the wrong path still
    // leaves a real upload broken while every other assertion here stays green.
    // Each is the route's multer cap PLUS 1m. client_max_body_size is measured against the
    // whole request body - file, multipart boundaries, and any text fields - so a limit set
    // exactly equal to multer's fileSize refuses a file at the TOP of the range multer would
    // have accepted, at the edge, as HTML. The margin keeps the app's cap the binding one.
    const expected: Array<[string, string]> = [
      ['/api/portal/runtime/cards/:cardId/field-guide', '6m'],
      ['/api/portal/community/upload', '9m'],
      ['/api/admin/comms-hub/events/:id/photos', '11m'],
      ['/api/portal/certifications', '16m'],
      ['/api/admin/flotation/intake/document', '16m'],
      ['/api/portal/internship/documents/:documentType/signed', '26m'],
      ['/api/admin/gov-contracts/:projectId/package/signatures/:formKey', '26m'],
      ['/api/portal/submissions/:id/upload', '51m'],
      ['/api/strategy-prep/:token/upload', '51m'],
      ['/api/admin/marketing/library/file', '201m'],
      // The four 100MB routes. Every one of them was set to exactly 100m until
      // 2026-11-25 - the cap with no envelope margin - so a file at the top of the
      // range multer would have accepted was refused at the edge as HTML instead.
      // Two are video uploads a student makes, where a near-cap file is the norm
      // rather than the exception, and one takes gov solicitation ZIPs.
      ['/api/portal/runtime/cards/:cardId/build-artifact', '101m'],
      ['/api/admin/factory/qualification/:canonicalOpportunityId/attest-zip', '101m'],
      ['/api/portal/career-prep/sessions/:sessionId/attempts', '101m'],
      ['/api/portal/career/portfolio-page/hire-video', '101m'],
      // Not ours - the L12.2 intake block, whose author worked out the envelope margin
      // first. Pinned here so a change to it is noticed by this suite rather than by a
      // person failing to upload a scope document.
      ['/api/portal/sbp/intake/extract', '26m'],
    ];
    const wrong = expected
      .map(([route, limit]) => {
        const hit = covered(route);
        const got = hit ? hit.limit!.toLowerCase() : 'UNRAISED';
        return got === limit ? null : `${route}: expected ${limit}, got ${got}`;
      })
      .filter(Boolean);
    expect(wrong).toEqual([]);
  });

  it('the exception list contains no route that has since been raised', () => {
    // Keeps the list honest: once a route is fixed, its entry must go, or the list stops
    // describing reality and starts hiding it.
    const stale = KNOWN_UNRAISED.filter((k) => covered(k.route)).map((k) => k.route);
    expect(stale).toEqual([]);
  });

  it('the exception list contains no route that no longer exists', () => {
    const live = new Set(ROUTES);
    const ghosts = KNOWN_UNRAISED.filter((k) => !live.has(k.route)).map((k) => k.route);
    expect(ghosts).toEqual([]);
  });

  it('the definition-only list contains no file that has since gained a route', () => {
    const attributed = new Set<string>();
    for (const files of ROUTE_MAP.values()) for (const f of files) attributed.add(f);
    const stale = Object.keys(MULTER_FILES_WITHOUT_ROUTES).filter((f) => attributed.has(f));
    expect(stale).toEqual([]);
  });

  it('the definition-only list contains no file that no longer uses multer', () => {
    const using = new Set(FILES.filter((f) => TAINT.get(f)!.size > 0).map(rel));
    const ghosts = Object.keys(MULTER_FILES_WITHOUT_ROUTES).filter((f) => !using.has(f));
    expect(ghosts).toEqual([]);
  });
});

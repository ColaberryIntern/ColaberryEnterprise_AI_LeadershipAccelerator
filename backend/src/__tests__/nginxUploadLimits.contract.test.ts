import fs from 'fs';
import path from 'path';

/**
 * EVERY FILE-UPLOAD ROUTE NEEDS ITS OWN NGINX LOCATION, OR IT IS CAPPED AT 1 MB.
 *
 * nginx's default `client_max_body_size` is 1 MB, and the plain `/api/` proxy block
 * does not raise it. A route whose multer cap is 50 MB is therefore refused at the
 * edge at 1 MB, with an HTML 413 the backend never sees and the uploader cannot
 * interpret. Only a regex location — which outranks the `/api/` prefix — fixes it.
 *
 * This has now shipped THREE times: the content-media path (2026-09-15), the gov
 * qualification ZIPs (2026-10-02, and again on 2026-10-05 when `attest-zip` was added
 * after the block and missed the list), and the build-lab artifact upload, which is
 * the one that reached students — Weeks 5 and 7 ask for a screen recording and no
 * recording is under 1 MB.
 *
 * Three occurrences is a pattern, not bad luck. So this test enumerates the upload
 * routes from source and fails when one is neither covered by an nginx location nor
 * listed below as a deliberate, stated exception. A new upload route now cannot be
 * added silently — somebody has to write down which it is.
 *
 * It reads source text rather than booting nginx because CI has no nginx and the
 * config references includes that only exist in our image. The syntax itself is
 * checked against the real image before deploy.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const NGINX = path.join(ROOT, 'nginx', 'nginx.conf');
const ROUTES_DIR = path.join(__dirname, '..', 'routes');

/**
 * Upload routes KNOWN to be left at the 1 MB default.
 *
 * Not a suppression list — a decision list. Each entry is a route whose multer cap is
 * well above 1 MB and which therefore cannot accept a real file today. They are left
 * alone here because `nginx/` is escalation territory under CLAUDE.md and the raise
 * approved on 2026-10-12 covered the build-lab path only, which is the one blocking
 * students. Removing an entry means fixing it; adding one means saying why.
 */
const KNOWN_UNRAISED: Array<{ route: string; multerCap: string; note: string }> = [
  // Learner-facing. These are the ones that will bite first.
  { route: '/api/portal/submissions/:id/upload', multerCap: '50MB', note: 'strategyPrepUpload' },
  { route: '/api/portal/curriculum/lessons/:lessonId/notebooklm-upload', multerCap: '50MB', note: 'strategyPrepUpload' },
  { route: '/api/portal/runtime/cards/:cardId/certificate', multerCap: '15MB', note: 'certificateUpload' },
  { route: '/api/portal/runtime/cards/:cardId/field-guide', multerCap: '5MB', note: 'fieldGuideUpload' },
  { route: '/api/portal/certifications', multerCap: '15MB', note: 'certificateUpload' },
  { route: '/api/portal/internship/documents/:documentType/signed', multerCap: '25MB', note: 'signedDocumentUpload' },
  { route: '/api/portal/community/upload', multerCap: '8MB', note: 'communityMediaUpload' },
  // /api/portal/agent-attachments was here until 2026-10-28. Removed because it is now
  // raised to 10m in nginx.conf — reported from the Gov Contracts build as refusing
  // anything over ~1 MB while documented as 10 MB, which is this trap exactly.
  // Public and staff-facing.
  { route: '/api/strategy-prep/:token/upload', multerCap: '50MB', note: 'strategyPrepUpload; public token flow' },
  { route: '/api/admin/accelerator/submissions/:id/upload', multerCap: '50MB', note: 'strategyPrepUpload; staff' },
  { route: '/api/admin/flotation/intake/document', multerCap: '15MB', note: 'intakeDocumentUpload; staff' },
];

/** Every `router.post|put|patch('<path>', … <x>Upload.single|array|fields(` in the route tree. */
function uploadRoutes(): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(p);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const src = fs.readFileSync(p, 'utf8');
      const re = /router\.(?:post|put|patch)\(\s*'([^']+)'[^;]*?[A-Za-z]*[Uu]pload\.(?:single|array|fields)\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) found.add(m[1]);
    }
  };
  walk(ROUTES_DIR);
  return Array.from(found).sort();
}

/** Each nginx regex location that raises the body size, as a live RegExp. */
function raisedLocations(): Array<{ pattern: RegExp; limit: string }> {
  const conf = fs.readFileSync(NGINX, 'utf8');
  const out: Array<{ pattern: RegExp; limit: string }> = [];
  const re = /location\s+~\s+"([^"]+)"\s*\{([\s\S]*?)\n    \}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(conf)) !== null) {
    const limit = /client_max_body_size\s+([0-9]+[kmg]?)/i.exec(m[2]);
    if (limit) out.push({ pattern: new RegExp(m[1]), limit: limit[1] });
  }
  return out;
}

/** An express path with its params filled in, so it can be matched like a real request. */
const concrete = (route: string) => route.replace(/:[A-Za-z0-9_]+/g, '0123456789abcdef');

const ROUTES = uploadRoutes();
const RAISED = raisedLocations();
const covered = (route: string) => RAISED.find((r) => r.pattern.test(concrete(route)));

describe('nginx body-size coverage for upload routes', () => {
  it('found the routes and the locations — a parse that returned nothing must fail loudly', () => {
    // Positive control. Without this, a changed route shape or a reformatted nginx
    // file makes every assertion below compare empty lists and pass.
    expect(ROUTES.length).toBeGreaterThanOrEqual(5);
    expect(RAISED.length).toBeGreaterThanOrEqual(3);
  });

  it('THE FIX: the build-lab artifact upload is raised, and to the multer cap', () => {
    const hit = covered('/api/portal/runtime/cards/:cardId/build-artifact');
    expect(hit).toBeDefined();
    // 100m matches MAX_BUILD_ARTIFACT_SIZE exactly. A file between the two limits
    // should be refused by the backend with a readable error, never by nginx with an
    // HTML 413 the student cannot act on.
    expect(hit!.limit.toLowerCase()).toBe('100m');
  });

  it('the raise does not leak to every other API route', () => {
    // A blanket raise on `/api/` would let any endpoint accept a 100 MB body. The
    // whole point of a regex location is that it applies to one path.
    const conf = fs.readFileSync(NGINX, 'utf8');
    const apiPrefix = /location\s+\/api\/\s*\{([\s\S]*?)\n    \}/.exec(conf);
    expect(apiPrefix).not.toBeNull();
    expect(apiPrefix![1]).not.toMatch(/client_max_body_size/);
  });

  it('every upload route is either raised or listed as a known exception', () => {
    // THE GUARD. A new upload route added without an nginx block fails here, instead
    // of failing silently in production the first time somebody uploads a real file.
    const listed = new Set(KNOWN_UNRAISED.map((k) => k.route));
    const unaccounted = ROUTES.filter((r) => !covered(r) && !listed.has(r));
    expect(unaccounted).toEqual([]);
  });

  it('the exception list contains no route that has since been raised', () => {
    // Keeps the list honest: once a route is fixed, its entry must go, or the list
    // stops describing reality and starts hiding it.
    const staleEntries = KNOWN_UNRAISED.filter((k) => covered(k.route)).map((k) => k.route);
    expect(staleEntries).toEqual([]);
  });

  it('the exception list contains no route that no longer exists', () => {
    const routes = new Set(ROUTES);
    const ghosts = KNOWN_UNRAISED.filter((k) => !routes.has(k.route)).map((k) => k.route);
    expect(ghosts).toEqual([]);
  });
});

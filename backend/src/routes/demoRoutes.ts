import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';

/**
 * The public Connected Demo link. Unauthenticated: anyone holding the token can open it.
 *
 * ## One path, and why not the prettier one
 *
 * `/api/public/demo/:token` works today: nginx already proxies `/api/` to this service, so the
 * link is live the moment this merges. `/demo/:token` is the address this should eventually have
 * and it needs a new nginx `location` block, which is an ESCALATE-tier change in this run's
 * contract. It is therefore NOT registered here at all - see the note above the one `router.get`
 * at the bottom of this file for why registering it "harmlessly" is the shape of a production
 * incident this repo has already had. `publicDemoUrl()` emits the `/api/public/` form, so no link
 * anybody publishes depends on a decision that has not been made.
 *
 * ## One 404, four ways to get it
 *
 * An unknown token, a disabled demo, an archived project and an enabled row whose spec is NULL
 * all return the SAME bytes. Distinguishing them would turn this route into an oracle: a guesser
 * learns that a token is real but switched off, which is exactly the fact revocation was meant to
 * take away. The fourth case is not hypothetical - it is the state the documented rollback
 * (`UPDATE projects SET demo_spec = NULL`) produces, so the invariant is enforced at the READ
 * rather than trusted at the enable.
 */

const router = Router();

/**
 * The single 404 body. One constant, so the four negative cases cannot drift apart into
 * something an attacker can tell apart.
 */
const NOT_FOUND_HTML = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="robots" content="noindex, nofollow">',
  '<title>Demo not found</title>',
  '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F6F5;',
  'color:#12211F;font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}',
  'main{max-width:34rem;padding:2rem}h1{font-size:1.25rem;margin:0 0 .5rem}',
  'p{margin:0;color:#55635F}</style></head>',
  '<body><main><h1>This demo is not available.</h1>',
  '<p>The link may have been turned off, or it may never have pointed anywhere. ',
  'If someone shared it with you, ask them for a current link.</p></main></body></html>',
].join('');

/**
 * Headers every response from this route carries, found or not.
 *
 * `nonce` is the one difference between the two bodies: the demo page runs the engine inline and
 * needs a policy that allows exactly that script, while the 404 body has no script at all and is
 * sent under `script-src 'none'`. Passing no nonce therefore does not mean "no policy", it means
 * the stricter one.
 */
function publicHeaders(res: Response, nonce?: string): void {
  res.set('Content-Type', 'text/html; charset=utf-8');
  /*
   * OVERRIDES Helmet's app-wide policy for this response, deliberately.
   *
   * Helmet sends `script-src 'self'`. The engine is inline, inline is not `'self'`, so the
   * browser blocked it and the public demo served a banner above a permanent
   * "Loading the demo..." while returning 200 with correct bytes. A nonce is the narrow fix:
   * `'unsafe-inline'` would also unblock any script an attacker got into the page, and this page
   * renders student-authored strings.
   *
   * Everything else is tighter than the app default, because this is the one route in the
   * product that answers an unauthenticated stranger: no objects, no framing, no form posts, no
   * base rewriting, and images and fonts only from here (plus the engine's web font over https).
   */
  res.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
      "script-src-attr 'none'",
      "style-src 'self' https: 'unsafe-inline'",
      "font-src 'self' https: data:",
      "img-src 'self' data:",
      /*
       * `'self'`, not `'none'`.
       *
       * The demo itself makes no network call: its spec is inline and the engine is
       * self-contained, so `'none'` was correct about THIS page and wrong about the page as
       * served. Cloudflare sits in front of production and injects its own bot-detection beacon,
       * which posts to `/cdn-cgi/challenge-platform/...` on this same origin. Under `'none'` that
       * post was blocked and every visitor's console carried an error for a request the demo
       * never made, on a page meant to be shown to outsiders.
       *
       * `'self'` is the narrow answer: same origin only, so the beacon works and a demo still
       * cannot phone anywhere else. Observed on the live page 2026-11-22, after the nonce fix.
       */
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  // The token is unguessable, but a link pasted into a public place would otherwise be indexed,
  // and an indexed demo is one a search engine keeps serving after it is revoked.
  res.set('X-Robots-Tag', 'noindex, nofollow');
  // Never cached. A revocable link that a CDN or a browser keeps serving is not revocable.
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Referrer-Policy', 'no-referrer');
}

function notFound(res: Response): void {
  publicHeaders(res);
  res.status(404).send(NOT_FOUND_HTML);
}

/**
 * The canonical public address for a demo.
 *
 * Exported so the Command Center and the admin panel build the link the same way. One function,
 * so when the nginx block lands the short form is a one-line change here rather than a search for
 * every place a URL was assembled by hand.
 */
export function publicDemoUrl(token: string, origin = ''): string {
  return `${origin}/api/public/demo/${encodeURIComponent(token)}`;
}

async function serveDemo(req: Request, res: Response): Promise<void> {
  const token = String(req.params.token || '');
  // Cheap rejection before a database round trip. The token is 32 bytes of base64url.
  if (!token || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    notFound(res);
    return;
  }

  try {
    const { default: Project } = await import('../models/Project');
    const { DEMO_PUBLIC_COLUMNS, demoPublicProjection } = await import(
      '../services/sbp/demoPublicProjection'
    );
    const { demoKitFiles } = await import('../services/sbp/demoKit');
    const { DEMO_KIT_ENGINE_PATH } = await import('../services/sbp/connectedDemoStory');
    const { renderConnectedDemo } = await import('../services/sbp/demoRender');

    const row = await Project.findOne({
      where: {
        demo_share_token: token,
        demo_share_enabled: true,
        archived_at: null,
        // Load bearing. The documented rollback sets demo_spec = NULL, which leaves an ENABLED
        // row with nothing to render; without this clause that row reaches the renderer.
        demo_spec: { [Op.ne]: null },
      },
      // The allow-list, enforced at the database. Columns not named here never enter the process.
      attributes: [...DEMO_PUBLIC_COLUMNS],
    });

    const projected = demoPublicProjection(row ? row.get({ plain: true }) : null);
    if (!projected || !projected.demo_spec) {
      notFound(res);
      return;
    }

    const engine = demoKitFiles().find((f) => f.path === DEMO_KIT_ENGINE_PATH)?.content;
    if (!engine) {
      // Our bug, not a missing resource, but it still answers 404: a 500 here would tell a
      // guesser that this particular token is real.
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'backend',
          event: 'public_demo_engine_missing',
          error_class: 'DemoEngineUnusable',
          outcome: 'failure',
          context: { detail: 'the demo engine is absent from the shipped kit bundle' },
        }),
      );
      notFound(res);
      return;
    }

    // Fresh per response. A nonce reused across responses is a nonce an attacker can predict,
    // which is the whole reason the header is not simply `'unsafe-inline'`.
    const nonce = crypto.randomBytes(16).toString('base64');
    res.status(200);
    publicHeaders(res, nonce);
    res.send(renderConnectedDemo(projected.demo_spec, engine, nonce));
  } catch (err: unknown) {
    // Includes DemoRenderError for a spec that no longer passes its contract. Logged with its
    // class so it is findable, answered with the same bytes as every other failure so the route
    // stays silent about which tokens exist.
    const error = err as { error_class?: string; message?: string };
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'backend',
        event: 'public_demo_failed',
        error_class: error?.error_class || 'UnknownError',
        outcome: 'failure',
        // Never the token: this line goes to a log a lot of people can read.
        context: { message: error?.message },
      }),
    );
    notFound(res);
  }
}

router.get('/api/public/demo/:token', serveDemo);

/*
 * `/demo/:token` IS DELIBERATELY NOT REGISTERED, and the reason is a standing rule of this repo
 * rather than an oversight.
 *
 * It was registered here, with a comment calling it "harmless until an nginx location exists".
 * That was wrong on both counts. `__tests__/nginxFilenameRouteLocations.test.ts` discovers every
 * public non-`/api` prefix a router registers and FAILS until somebody classifies it in writing,
 * because `/m/` shipped as an unguarded prefix once and 404'd every signed image in production
 * for a day. Registering a prefix with no `location` block is the exact shape of that incident:
 * the handler is correct, the edge never reaches it, and nothing in the build says so.
 *
 * Adding the `location` block is an `nginx/` change, which this run's contract puts at
 * ESCALATE tier. So the route is not registered at all, the escalation stays a written proposal
 * (`.loop-architect/runs/.../escalation-nginx-demo-path.md`), and `publicDemoUrl()` emits the
 * `/api/public/` form that nginx already routes. When the block is approved, this becomes one
 * `router.get` plus one entry in that test's EXTENSIONLESS map, and every link already published
 * keeps working because they were never written in the short form.
 */

export default router;
export { NOT_FOUND_HTML };

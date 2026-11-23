import { DemoSpecSchema, validateDemoSpecShape, type SpecProblem } from './demoSpec/contract';

/**
 * demoRender - put a demo spec inside the demo engine and return one servable HTML document.
 *
 * ## Why this is a pure function
 *
 * Everything this does is string work: validate, serialize, substitute. Keeping it free of I/O
 * means the public route (which serves it to anyone holding a link) is testable without a
 * database, and means the same spec provably produces the same bytes. The route's job is to find
 * the project and decide whether the link resolves; this module's job is only to render, and it
 * refuses rather than guesses when the input is wrong.
 *
 * ## Why not reuse the kit's `build-standalone.mjs`
 *
 * The kit ships a builder that does the same substitution inside a student's own repository. It
 * escapes `</` so a spec string cannot close the script tag early. That is correct for the file a
 * student double-clicks. This module serves UNAUTHENTICATED traffic from our own domain, so it
 * escapes every `<`, which is strictly stronger and removes the need to reason about whether the
 * HTML tokenizer's script-data-escaped states can be reached through `<!--`. The two are allowed
 * to differ; they are not allowed to differ by accident, which is why the reason is written here.
 */

/** The empty slot the engine ships with. Byte-exact, including the `{}`. */
export const DEMO_SPEC_SLOT = '<script type="application/json" id="demo-spec">{}</script>';

/** The engine's shipped title, replaced with the app's name at render time. */
export const DEMO_TITLE_SLOT = '<title>Connected demo</title>';

export class DemoRenderError extends Error {
  readonly name = 'DemoRenderError';

  constructor(
    readonly error_class: 'DemoSpecInvalid' | 'DemoEngineUnusable',
    message: string,
    readonly problems: SpecProblem[] = [],
  ) {
    super(message);
  }
}

/**
 * Recursively sort object keys.
 *
 * `demo_spec` comes back from a JSONB column, and Postgres does not promise the key order it
 * stored. Without this, the same logical spec could render different bytes on different reads,
 * which would quietly break caching, ETags, and any test asserting determinism. Arrays are left
 * alone: their order is the producer's meaning, not an implementation detail (the engine renders
 * `events` in exactly the order it is given).
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    // `Object.create(null)`, not `{}`. On a normal object literal, `sorted['__proto__'] = v` sets
    // the prototype instead of creating an own property, so a spec with a screen named
    // `__proto__` had that screen silently vanish from the rendered demo. A null-prototype object
    // has no `__proto__` setter to hit, so the key is stored like any other.
    const sorted = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Make a JSON string safe to sit inside a `<script>` element.
 *
 * `<` cannot appear outside a string in JSON, and `<` parses back to `<`, so replacing every
 * one of them changes nothing a reader of the spec would notice while making `</script>`
 * unreachable. U+2028 and U+2029 are escaped as well: they are legal in JSON text but are line
 * terminators to a JavaScript parser, and this document is read by both.
 */
function escapeForScriptTag(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render one demo.
 *
 * Throws `DemoRenderError` rather than returning a partial page. A demo that renders with a
 * half-valid spec is worse than one that does not render: the viewer cannot tell which parts of
 * what they are looking at the system actually stood behind.
 *
 * Note what this does NOT check. `demoSpec/contentPolicy.ts` decides whether a spec contains
 * restricted project data, and that check belongs at the WRITE boundary, where the project row is
 * in hand to compare against. By the time a spec reaches this function there is nothing left to
 * compare it to, so a check here could only ever be a weaker guess.
 *
 * @param spec       the demo spec, as stored on `projects.demo_spec`
 * @param engineHtml the engine asset, from `demoKitFiles()`
 */
/**
 * Stamp a CSP nonce onto every `<script` in a TRUSTED template.
 *
 * ## Why this exists at all
 *
 * The engine ships its JavaScript inline, and the API sends Helmet's `script-src 'self'`. An
 * inline script is not `'self'`, so the browser blocked it and the public demo rendered a banner
 * above a permanent "Loading the demo..." - a 200 response, correct bytes on the wire, and a page
 * that never came up. Found by opening the deployed URL in a real browser on 2026-11-22; no test
 * that asserts on HTML strings can see this, because the bytes were right and the POLICY was not.
 *
 * ## Why the template and not the rendered page
 *
 * This runs BEFORE the spec is injected, and it must stay that way. The spec is student data: a
 * label reading `<script` is not an attack, but stamping it would edit the JSON payload, so a
 * regex over the finished page would corrupt data in the one case nobody would think to test.
 * Here the input is a repo-versioned constant with a known script count.
 *
 * Refuses rather than returning the input unchanged when there is nothing to stamp or the
 * template is already stamped: a silent no-op here is the blank page coming back, and double
 * stamping would emit two `nonce` attributes on one tag.
 */
export function withScriptNonce(engineHtml: string, nonce: string): string {
  if (!/^[A-Za-z0-9+/_-]{16,}={0,2}$/.test(nonce)) {
    throw new DemoRenderError('DemoEngineUnusable', 'the CSP nonce is not a plausible nonce');
  }
  if (/<script[^>]*\snonce=/i.test(engineHtml)) {
    throw new DemoRenderError('DemoEngineUnusable', 'the engine asset is already nonce-stamped');
  }
  const expected = (engineHtml.match(/<script\b/gi) || []).length;
  if (!expected) {
    throw new DemoRenderError('DemoEngineUnusable', 'the engine asset carries no script tag');
  }
  let stamped = 0;
  const out = engineHtml.replace(/<script\b/gi, () => {
    stamped += 1;
    return `<script nonce="${nonce}"`;
  });
  if (stamped !== expected) {
    throw new DemoRenderError(
      'DemoEngineUnusable',
      `nonce stamped ${stamped} of ${expected} script tags`,
    );
  }
  return out;
}

export function renderConnectedDemo(spec: unknown, engineHtml: string, nonce?: string): string {
  const problems = validateDemoSpecShape(spec);
  if (problems.length) {
    throw new DemoRenderError(
      'DemoSpecInvalid',
      `demo spec failed its contract: ${problems.map((p) => p.path).join(', ')}`,
      problems,
    );
  }

  // Parse rather than cast: `validateDemoSpecShape` proves the shape, and this gives us the
  // narrowed value to read `app.name` from without an `as`.
  const parsed = DemoSpecSchema.parse(spec);

  // Stamped BEFORE the spec goes in, so the nonce can only ever touch the repo's own template.
  // See `withScriptNonce` for why doing this to the finished page would be a data bug.
  const template = nonce ? withScriptNonce(engineHtml, nonce) : engineHtml;
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
  // The slot as it looks AFTER stamping. Deriving it from the one constant rather than writing a
  // second literal means the two cannot drift apart.
  const slot = nonce ? DEMO_SPEC_SLOT.replace('<script ', `<script${nonceAttr} `) : DEMO_SPEC_SLOT;

  if (!template.includes(slot)) {
    throw new DemoRenderError(
      'DemoEngineUnusable',
      'the engine asset has no empty demo-spec slot, so there is nowhere to put the spec',
    );
  }

  const json = escapeForScriptTag(JSON.stringify(sortKeys(parsed)));
  let html = template.replace(
    slot,
    // A function, not a string: `$&` and `$1` in a spec value would otherwise be interpreted as
    // replacement patterns, silently corrupting the JSON.
    () => `<script${nonceAttr} type="application/json" id="demo-spec">${json}</script>`,
  );

  if (html.includes(DEMO_TITLE_SLOT)) {
    html = html.replace(
      DEMO_TITLE_SLOT,
      () => `<title>${escapeHtml(parsed.app.name)} demo (simulated)</title>`,
    );
  }

  return html;
}

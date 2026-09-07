/**
 * Explorer Growth OS — strict template renderer. Plan §11.2, §18; EPIC 5.
 *
 * ONE JOB: substitute `{{dotted.path}}` tokens from a resolved context, and
 * THROW rather than let an unresolved token reach a human.
 *
 * WHY THIS EXISTS AT ALL. The outbound copy paths in this repo substitute
 * tokens with ad-hoc `.replace()` chains, duplicated in two places, with no
 * shared renderer. Their failure mode is silent: an unknown token passes
 * through to the recipient verbatim, so a learner gets an email that literally
 * reads "Hi {{first_name}}". That is the behaviour this module refuses to have.
 * A thrown error stops one message; a leaked token is seen by a person and
 * cannot be taken back.
 *
 * NOT TO BE CONFLATED with `services/variableService.ts`. That is the
 * curriculum's own, unrelated `{{}}` system (plan §11.1). Same syntax, different
 * vocabulary, different consumers. Neither should import the other.
 *
 * DELIBERATELY NOT AN AI PATH. Explorer copy is AI-generated from the composite
 * context (§11.2) precisely so business logic never depends on exact wording.
 * This renderer serves the small set of §18 cases needing deterministic
 * fallback copy — the place where a fixed string is the correct answer.
 */

/** A token that appeared in the template but could not be resolved. */
export interface UnresolvedToken {
  /** The dotted path as written, e.g. `learner.first_name`. */
  path: string;
  /** Why it did not resolve — a missing branch reads differently from a null leaf. */
  reason: 'missing' | 'null' | 'not_primitive';
}

/**
 * Thrown when any token cannot be resolved.
 *
 * Carries EVERY unresolved token, not just the first. A renderer that throws on
 * token one sends whoever is fixing it back for another round per token; the
 * whole list is one round.
 */
export class UnresolvedTokenError extends Error {
  /** Stable classification for structured logs (CLAUDE.md observability). */
  readonly error_class = 'UnresolvedTokenError';
  readonly tokens: readonly UnresolvedToken[];

  constructor(tokens: readonly UnresolvedToken[]) {
    const detail = tokens.map((t) => `${t.path} (${t.reason})`).join(', ');
    super(`Explorer template has ${tokens.length} unresolved token(s): ${detail}`);
    this.name = 'UnresolvedTokenError';
    this.tokens = tokens;
  }
}

/**
 * Token syntax: `{{ dotted.path }}`, surrounding whitespace tolerated.
 *
 * The path charset is deliberately narrow — letters, digits, underscore, dot.
 * A permissive pattern would match `{{ 1 + 1 }}` or `{{a.b()}}` and invite the
 * expectation that this evaluates expressions. It does not, and never should:
 * template copy is data, and an evaluator here would be an injection surface
 * reachable from learner-controlled fields.
 */
const TOKEN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\}\}/g;

/** Values a token may legitimately render as. */
type Primitive = string | number | boolean;

function isPrimitive(v: unknown): v is Primitive {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/**
 * Walk a dotted path. Returns the value, or a reason it is unusable.
 *
 * `null` and `undefined` are NOT rendered as "null"/"undefined" — that is the
 * exact class of leak this module exists to prevent. A learner with no recorded
 * streak must not be emailed "your 'null' day streak"; the caller either
 * supplies a real value or supplies the fallback the §11.3 catalog specifies.
 */
function resolvePath(
  context: Record<string, unknown>,
  path: string,
): { ok: true; value: Primitive } | { ok: false; reason: UnresolvedToken['reason'] } {
  const segments = path.split('.');
  let cursor: unknown = context;

  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return { ok: false, reason: 'missing' };
    if (typeof cursor !== 'object') return { ok: false, reason: 'missing' };
    // Own properties only. Without this, `{{constructor.name}}` and friends
    // resolve off the prototype chain and render internals into copy.
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return { ok: false, reason: 'missing' };
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  if (cursor === null || cursor === undefined) return { ok: false, reason: 'null' };
  if (!isPrimitive(cursor)) return { ok: false, reason: 'not_primitive' };
  return { ok: true, value: cursor };
}

/**
 * Render `template` against `context`, or throw `UnresolvedTokenError`.
 *
 * SINGLE PASS, AND THAT IS A SECURITY PROPERTY, not an optimisation. Substituted
 * values are never re-scanned for tokens. A learner whose display name is
 * literally `{{internal.secret}}` gets that string printed back at them, which
 * is merely odd — whereas a second pass would resolve it, turning any
 * learner-controlled field into a read primitive over the whole context.
 *
 * PURE. Same inputs always produce the same output and it writes nothing, so it
 * is trivially safe to retry — which matters because it sits on a path whose
 * callers retry (CLAUDE.md idempotency).
 */
export function renderExplorerTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  const unresolved: UnresolvedToken[] = [];
  const seen = new Set<string>();

  // Collect first, substitute second. Throwing mid-substitution would report
  // only the tokens before the failure and hide the rest.
  const out = template.replace(TOKEN, (whole, path: string) => {
    const resolution = resolvePath(context, path);
    if (resolution.ok) return String(resolution.value);

    // One entry per distinct path: a token repeated eight times is one problem
    // to fix, not eight.
    if (!seen.has(path)) {
      seen.add(path);
      unresolved.push({ path, reason: resolution.reason });
    }
    return whole;
  });

  if (unresolved.length > 0) throw new UnresolvedTokenError(unresolved);
  return out;
}

/**
 * The tokens a template requires, deduped and in order of first appearance.
 *
 * Lets a caller check a template against a context BEFORE committing to send —
 * and lets a test assert that a seeded template's vocabulary matches what the
 * context builder actually produces, which is where the two drift apart.
 */
export function explorerTemplateTokens(template: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(TOKEN)) {
    const path = match[1];
    if (!seen.has(path)) {
      seen.add(path);
      found.push(path);
    }
  }
  return found;
}

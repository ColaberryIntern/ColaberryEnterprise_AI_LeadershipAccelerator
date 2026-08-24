/**
 * clientProjection — choosing which shape an audience receives. PURE, no I/O.
 *
 * Gate 0's CLIENT_PORTAL_MAP states the rule this module implements:
 *
 *   GET /api/refactored/projects/:id         builder shape
 *   GET /api/refactored/client/projects/:id  client shape — a DIFFERENT serializer
 *
 * The projection happens server-side and produces a different object. A client-role check
 * applied in React would put a mentor's private assessment of an intern into a network
 * payload that anyone can open DevTools and read — the data would already have left the
 * building by the time the UI decided not to draw it.
 *
 * ## Fail safe, not fail open
 *
 * `projectForAudience` returns the CLIENT shape when the audience is unknown or has no
 * roles at all. An unknown caller is not a trusted caller, and the failure of a
 * role-lookup must not be the thing that widens access. The builder shape requires a
 * positive, present, non-client role.
 */

import {
  findForbiddenFields,
  toClientShape,
  type ClientObjectKind,
  type ForbiddenFieldHit,
} from '../../modules/delivery/clientVisibility';
import { isClientOnly } from '../../modules/delivery/deliveryRoles';

export type ProjectionAudience = 'client' | 'builder';

/**
 * Decide which shape a caller gets.
 *
 * Uses `isClientOnly` rather than "holds any client role", because a Colaberry delivery
 * lead who is also listed as a client reviewer on their own demo project is still staff,
 * and serving them the client shape would hide their own work from them. The reverse
 * mistake — a client who somehow also holds a builder role — is the dangerous one, and it
 * is a membership bug to fix at Gate 2, not something to paper over here.
 */
export function audienceFor(roles: readonly string[]): ProjectionAudience {
  if (!roles || roles.length === 0) return 'client';
  return isClientOnly(roles) ? 'client' : 'builder';
}

export interface ProjectionResult {
  audience: ProjectionAudience;
  payload: Record<string, unknown>;
  /** Populated only when the tripwire caught something. Never expected to be non-empty. */
  forbidden: ForbiddenFieldHit[];
}

/**
 * Project one object for a caller.
 *
 * When the audience is a client the payload is rebuilt from the allowlist, then run
 * through the tripwire. The tripwire is redundant by design: the allowlist is the control,
 * and this catches the case the allowlist cannot — a forbidden field added *to* an
 * allowlist by someone who did not know what it carried.
 */
export function projectForAudience<T extends Record<string, unknown>>(
  kind: ClientObjectKind,
  source: T,
  roles: readonly string[],
): ProjectionResult {
  const audience = audienceFor(roles);

  if (audience === 'builder') {
    return { audience, payload: source, forbidden: [] };
  }

  const payload = toClientShape(kind, source);
  return { audience, payload, forbidden: findForbiddenFields(payload) };
}

export class ClientPayloadLeakError extends Error {
  readonly hits: ForbiddenFieldHit[];

  constructor(hits: ForbiddenFieldHit[]) {
    super(
      `client payload contains forbidden fields: ${hits
        .map((h) => `${h.path} (${h.category})`)
        .join(', ')}`,
    );
    this.name = 'ClientPayloadLeakError';
    this.hits = hits;
  }
}

/**
 * The route-boundary guard.
 *
 * CLAUDE.md's contract rule for outbound responses is "in development, fail loud; in
 * production, log and continue." **Continuing unchanged is not an option here** — the
 * thing being continued *is* the leak. So production strips the offending keys and logs,
 * which preserves the request while removing the harm; development throws, so the bug is
 * fixed rather than quietly sanitized forever.
 *
 * The caller supplies the logger. This module stays pure and testable, and the logging
 * shape stays the caller's concern.
 */
export function guardClientPayload(
  payload: Record<string, unknown>,
  options: {
    isProduction: boolean;
    onLeak?: (hits: ForbiddenFieldHit[]) => void;
  },
): Record<string, unknown> {
  const hits = findForbiddenFields(payload);
  if (hits.length === 0) return payload;

  options.onLeak?.(hits);

  if (!options.isProduction) throw new ClientPayloadLeakError(hits);

  return stripForbidden(payload);
}

/**
 * Remove every forbidden key from a payload, at any depth.
 *
 * Rebuilds rather than deleting, for the same reason `toClientShape` does: deletion leaves
 * the original object and anything the deleting code did not walk.
 */
export function stripForbidden(value: unknown, maxDepth = 8): any {
  const forbiddenPaths = new Set(findForbiddenFields(value, maxDepth).map((h) => h.path));

  const rebuild = (node: unknown, path: string, depth: number): unknown => {
    if (node === null || typeof node !== 'object' || depth > maxDepth) return node;

    if (Array.isArray(node)) {
      return node.map((item, i) => rebuild(item, `${path}[${i}]`, depth + 1));
    }

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (forbiddenPaths.has(childPath)) continue;
      out[key] = rebuild(child, childPath, depth + 1);
    }
    return out;
  };

  return rebuild(value, '', 0);
}

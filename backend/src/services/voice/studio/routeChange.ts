/**
 * Route changes (VS3.4), pure. A route change is two steps, and the second refuses without the first:
 *   1. validate: check the proposed change against the rules below and show its impact. A valid
 *      change gets a validation token: an HMAC over (route id or path key, the change's canonical
 *      hash, expiry), valid VALIDATION_TTL_MS.
 *   2. apply: refused unless it carries a token for THIS route and THIS exact change, unexpired.
 *      Changing anything after validating (even one field) makes the token not match.
 *
 * Rules (the directive: no automatic purchase or porting; staged rollout; safe fallback):
 *   - mode is one of legacy, shadow, test, canary, live, disabled;
 *   - canary needs 1..50 percent; any other mode forces canary_percent 0;
 *   - test, canary and live need a PUBLISHED profile version for this route;
 *   - live additionally needs a fallback (legacy or a human line reference), and an explicit
 *     confirmation phrase, because it moves real callers;
 *   - nothing here buys, ports or releases a number: routes only point at numbers we hold.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { canonicalJson } from '../profiles/versionContent';

export const ROUTE_MODES = ['legacy', 'shadow', 'test', 'canary', 'live', 'disabled'] as const;
export const VALIDATION_TTL_MS = 10 * 60 * 1000;
export const LIVE_CONFIRMATION = 'MOVE REAL CALLERS';

export const RouteChangeSchema = z.object({
  pathKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,99}$/),
  callType: z.string().regex(/^[a-z_]{2,50}$/),
  brandSlug: z.string().regex(/^[a-z0-9-]{2,100}$/),
  mode: z.enum(ROUTE_MODES),
  canaryPercent: z.number().int().min(0).max(100),
  versionId: z.string().uuid().nullable(),
  fallback: z.object({ kind: z.enum(['legacy', 'human_line', 'voicemail', 'none']), ref: z.string().max(100).optional() }).strict(),
  confirm: z.string().max(40).optional(),
}).strict();
export type RouteChange = z.infer<typeof RouteChangeSchema>;

export interface RouteFacts {
  /** Is versionId a PUBLISHED version? (looked up by the caller) */
  versionPublished: boolean;
}

export type ValidationResult = { ok: true; change: RouteChange } | { ok: false; issues: string[] };

export function validateRouteChange(input: unknown, facts: RouteFacts): ValidationResult {
  const p = RouteChangeSchema.safeParse(input);
  if (!p.success) return { ok: false, issues: p.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  const c = p.data;
  const issues: string[] = [];
  if (c.mode === 'canary' && (c.canaryPercent < 1 || c.canaryPercent > 50)) issues.push('canary needs between 1 and 50 percent');
  if (c.mode !== 'canary' && c.canaryPercent !== 0) issues.push('canary_percent must be 0 unless the mode is canary');
  if (['test', 'canary', 'live'].includes(c.mode) && (!c.versionId || !facts.versionPublished)) issues.push(`${c.mode} needs a published agent version`);
  if (c.mode === 'live') {
    if (c.fallback.kind === 'none') issues.push('live needs a fallback (legacy, a human line or voicemail)');
    if (c.confirm !== LIVE_CONFIRMATION) issues.push(`live needs the confirmation phrase "${LIVE_CONFIRMATION}"`);
  }
  if (c.fallback.kind === 'human_line' && !c.fallback.ref) issues.push('a human-line fallback needs the number reference (not the number)');
  return issues.length ? { ok: false, issues } : { ok: true, change: c };
}

const subjectOf = (routeId: string | null, c: RouteChange): string => `${routeId ?? `new:${c.pathKey}`}|${canonicalJson(c)}`;
const b64 = (b: Buffer) => b.toString('base64url');

export function mintValidationToken(key: Buffer, routeId: string | null, c: RouteChange, now = Date.now()): string {
  const exp = now + VALIDATION_TTL_MS;
  const mac = createHmac('sha256', key).update(`${subjectOf(routeId, c)}|${exp}`).digest();
  return `${exp}.${b64(mac)}`;
}

export type TokenCheck = { ok: true } | { ok: false; reason: 'validation_required' | 'validation_expired' | 'validation_mismatch' };

/** The token must exist, be unexpired, and match this route and this exact change. */
export function checkValidationToken(key: Buffer, token: unknown, routeId: string | null, c: RouteChange, now = Date.now()): TokenCheck {
  if (typeof token !== 'string' || !/^\d{10,16}\.[A-Za-z0-9_-]{20,}$/.test(token)) return { ok: false, reason: 'validation_required' };
  const [expRaw, mac] = token.split('.');
  const exp = Number(expRaw);
  if (!(exp > now)) return { ok: false, reason: 'validation_expired' };
  const want = createHmac('sha256', key).update(`${subjectOf(routeId, c)}|${exp}`).digest();
  const got = Buffer.from(mac, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want) ? { ok: true } : { ok: false, reason: 'validation_mismatch' };
}

export interface RouteImpact { callsLast7Days: number; currentMode: string | null; movesRealCallers: boolean; summary: string }

export function describeImpact(currentMode: string | null, c: RouteChange, callsLast7Days: number): RouteImpact {
  const moves = c.mode === 'live' || (c.mode === 'canary' && c.canaryPercent > 0);
  const share = c.mode === 'canary' ? `${c.canaryPercent}% of new calls on this route` : c.mode === 'live' ? 'every new call on this route' : 'no real callers';
  return {
    callsLast7Days, currentMode, movesRealCallers: moves,
    summary: `${currentMode ?? 'new route'} -> ${c.mode}: ${share} would use the new engine. ${callsLast7Days} call(s) used this route in the last 7 days.`,
  };
}

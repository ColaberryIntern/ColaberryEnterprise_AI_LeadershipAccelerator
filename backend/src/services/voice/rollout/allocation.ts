/**
 * Route allocation (VS4.5), pure: which ONE provider carries a logical call, decided once, before dialing.
 *
 *   - Deterministic and sticky: the bucket (0..99) is a hash of the route and the recipient, so the same
 *     person on the same route always lands on the same side, on every process, without stored state.
 *   - Raising the canary percentage only ADDS people (bucket < percent); nobody already moved is moved back.
 *   - A canary reaches only an explicit audience (recipient references the owner approved). No audience, no canary.
 *   - Anything missing, unknown, unpublished or mismatched goes to legacy. Only `disabled` blocks.
 *   - Shadow is evaluation only: it allocates legacy and never causes a second call.
 *   - A logical call that was already dispatched keeps its provider, whatever the route says now; one whose
 *     outcome is unknown is never dialed again by anyone.
 *   - Engine B has no transcript yet, so it cannot hear an opt-out: test calls only.
 */
import { createHash } from 'crypto';

export type Mode = 'legacy' | 'shadow' | 'test' | 'canary' | 'live' | 'disabled';
export type DirectEngine = 'conversation_relay' | 'openai_realtime';

export interface RouteFacts {
  id: string;
  brandSlug: string;
  profileId: string | null;
  mode: string;
  canaryPercent: number;
  /** Recipient references approved for the canary, e.g. "lead:42". */
  audience: readonly string[];
}
export interface VersionFacts { id: string; profileId: string; brandSlug: string; status: string; engine: string }
export interface AllocationInput {
  route: RouteFacts | null;
  version: VersionFacts | null;
  recipientRef: string;
  brandSlug: string;
  testMode: boolean;
  /** Direct engines switched on and configured on this server. */
  directReady: boolean;
  /** The provider this exact logical call was already dispatched through, if any. */
  prior: { engine: string; state: string } | null;
}

export type Allocation =
  | { provider: 'direct'; engine: DirectEngine; routeId: string; versionId: string; reason: string; bucket: number }
  | { provider: 'synthflow_legacy'; reason: string; bucket: number | null }
  | { provider: 'none'; reason: string; bucket: number | null };

export function bucketOf(routeId: string, recipientRef: string): number {
  return createHash('sha256').update(`${routeId}|${recipientRef}`).digest().readUInt32BE(0) % 100;
}

export function allocate(i: AllocationInput): Allocation {
  const bucket = i.route ? bucketOf(i.route.id, i.recipientRef) : null;
  const legacy = (reason: string): Allocation => ({ provider: 'synthflow_legacy', reason, bucket });
  const none = (reason: string): Allocation => ({ provider: 'none', reason, bucket });

  if (i.prior) return none(i.prior.state === 'dispatch_unknown' ? 'outcome_unknown_never_redialed' : 'already_dispatched');
  if (!i.route) return legacy('no_route');
  const r = i.route;
  if (r.mode === 'disabled') return none('route_disabled');
  if (!['test', 'canary', 'live'].includes(r.mode)) return legacy(r.mode === 'shadow' ? 'shadow_is_evaluation_only' : r.mode === 'legacy' ? 'legacy_mode' : 'unknown_mode');
  if (r.mode === 'test' && !i.testMode) return legacy('test_mode_route');
  if (r.brandSlug !== i.brandSlug) return legacy('brand_mismatch');
  if (r.mode === 'canary') {
    if (!r.audience.includes(i.recipientRef)) return legacy('outside_audience');
    if ((bucket as number) >= r.canaryPercent) return legacy('outside_canary');
  }
  if (!i.directReady) return legacy('direct_not_ready');
  const v = i.version;
  if (!v || v.status !== 'published') return legacy('version_not_published');
  if (v.brandSlug !== r.brandSlug || (r.profileId !== null && v.profileId !== r.profileId)) return legacy('version_not_for_this_route');
  if (v.engine !== 'conversation_relay' && v.engine !== 'openai_realtime') return legacy('engine_unknown');
  if (v.engine === 'openai_realtime' && !i.testMode) return legacy('engine_b_test_only');
  return { provider: 'direct', engine: v.engine, routeId: r.id, versionId: v.id, reason: r.mode, bucket: bucket as number };
}

import { GATED_FEATURES } from '../paywall/gatedFeatures';
import type { CampusAudience, CampusBuilding, ExplorerAccess } from './campusMap';

/**
 * What a learner can do in a building (Campus C2).
 *
 * No new rule: an Explorer without a paid seat gets the catalog's explorer access
 * (open / preview / demo / locked), which mirrors PageGate and the classic nav's lock
 * badge; everyone else, and any learner with full access, finds every building open.
 * `hasFullAccess` comes from useEntitlement, the same signal PageGate reads.
 */
export function buildingAccess(b: Pick<CampusBuilding, 'explorer'>, audience: CampusAudience, hasFullAccess: boolean): ExplorerAccess {
  if (audience !== 'explorer' || hasFullAccess) return 'open';
  return b.explorer;
}

/** The enroll call to action for a gated building, reused from the paywall copy. */
export function enrollCta(b: Pick<CampusBuilding, 'gate'>): { label: string; to: string } {
  const copy = GATED_FEATURES[b.gate ?? 'classroom'];
  return { label: copy.ctaLabel, to: copy.ctaTo };
}

/** Short, plain label for the access state, or null when open. */
export function accessLabel(a: ExplorerAccess): string | null {
  if (a === 'locked') return 'Members only';
  if (a === 'demo') return 'Demo';
  if (a === 'preview') return 'Preview';
  return null;
}

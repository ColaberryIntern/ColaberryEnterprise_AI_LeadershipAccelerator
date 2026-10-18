import { GATED_FEATURES } from '../paywall/gatedFeatures';
import type { CampusBuilding, ExplorerAccess } from './campusMap';

/**
 * What a learner can do in a building (Campus C2; rewritten in C6 to invent no rule).
 *
 * The state is what the building's page itself does for this viewer, from the SAME signals the page reads:
 *  - locked  : the route is wrapped in PageGate and PageGate would show its paywall. Same condition as
 *              components/paywall/PageGate.tsx (`if (isStaff || hasFullAccess) return children`), with PageGate's own
 *              isStaff (useEntitlement), never the campus's wider definition of staff.
 *  - demo    : the page runs a demo for Explorers (Projects reads useIsExplorer), and the viewer is an Explorer.
 *  - preview : the page shows Explorers a preview (the Classroom feed is week 0 only), and the viewer is an Explorer.
 *  - open    : anything else.
 * isExplorer is the portal's is_explorer (useIsExplorer), not the campus audience: an org manager on an Explorer account
 * sees Project Studio in demo mode because Projects really runs in demo mode for them.
 */
export interface AccessSignals {
  /** PageGate's staff signal: useEntitlement().isStaff. */
  isStaff: boolean;
  /** useEntitlement().hasFullAccess (true for everyone while the page gate is off). */
  hasFullAccess: boolean;
  /** The portal's is_explorer (useIsExplorer). */
  isExplorer: boolean;
}

export function buildingState(b: Pick<CampusBuilding, 'explorer' | 'gate'>, s: AccessSignals): ExplorerAccess {
  if (b.gate && !(s.isStaff || s.hasFullAccess)) return 'locked';
  if (s.isExplorer && (b.explorer === 'demo' || b.explorer === 'preview')) return b.explorer;
  return 'open';
}

/** The enroll call to action for a building, reused from the paywall copy (its own gate's copy when it has one). */
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

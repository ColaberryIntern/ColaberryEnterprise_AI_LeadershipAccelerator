/**
 * useActivePath — derives the SINGLE most-relevant continuation for the
 * operator's current operational path.
 *
 * Continuity + Resume Flow Sprint, 2026-05-12.
 *
 * The workspace already captures intent fragments across surfaces:
 *   - active_build (Cory authority — accepted/in-progress)
 *   - next_action (Cory's recommended next move)
 *   - visualWorkspace:pendingBuildPrompt (Critique handoff pending in Blueprint)
 *   - visualWorkspace:lastSessionTouchedAt (recent Critique session)
 *   - memory.lastDrawerOpen (last contextual breakdown the operator opened)
 *   - memory.lastSystemTab + lastBpId (last understanding focus)
 *   - memory.lastVisitedSurface (where the operator was last)
 *
 * Hard rules:
 *   - Return AT MOST one continuation. Never a list.
 *   - Priority order is fixed below (most operational → most ambient).
 *   - Return null when no continuation is meaningful (genuinely first visit).
 *
 * The output is consumed by ContinuationCard on Cory Home + by future
 * context-bar accents. Pure derivation; no fetches.
 */
import { useMemo } from 'react';
import type { UnifiedProjectState } from './useUnifiedProjectState';
import type { WorkspaceMemory } from './useWorkspaceMemory';

export type ActivePathKind =
  | 'active_build'           // Cory authority — an accepted build is in progress
  | 'critique_handoff'       // Critique compiled a prompt; Blueprint is waiting
  | 'recent_critique'        // operator was in Critique recently, queue might benefit from revisit
  | 'last_drawer'            // operator opened a contextual breakdown (Coverage / Readiness / etc.)
  | 'last_system_tab'        // operator was understanding a specific BP / tab on System
  | 'next_action';           // fallback to Cory's recommended next move

export interface ActivePath {
  kind: ActivePathKind;
  label: string;             // short verb-led phrase
  detail?: string;           // one-line context underneath
  target_route: string;      // where clicking lands the operator
  icon: string;              // bi-* icon name
  /** "fresh" continuations get a softer green halo; ambient ones stay neutral. */
  freshness: 'fresh' | 'ambient';
}

interface Args {
  state: UnifiedProjectState | null;
  memory: WorkspaceMemory;
  pendingCritiquePrompt?: string | null;
  pendingCritiqueRoute?: string | null;
  lastCritiqueAt?: string | null;
}

const DRAWER_LABEL: Record<string, string> = {
  readiness: 'Readiness breakdown',
  coverage: 'Coverage breakdown',
  'why-this-next': 'Why-this-next reasoning',
  cory: 'Cory drawer',
};

export function useActivePath(args: Args): ActivePath | null {
  const { state, memory, pendingCritiquePrompt, pendingCritiqueRoute, lastCritiqueAt } = args;

  return useMemo<ActivePath | null>(() => {
    if (!state) return null;

    // 1. Active build (Cory authority) — always the top continuation when present.
    if (state.active_build) {
      return {
        kind: 'active_build',
        label: 'Continue active build',
        detail: state.active_build.title,
        target_route: '/portal/project/blueprint',
        icon: 'bi-flag-fill',
        freshness: 'fresh',
      };
    }

    // 2. Critique handoff pending — Blueprint is waiting on a compiled prompt.
    if (pendingCritiquePrompt) {
      return {
        kind: 'critique_handoff',
        label: 'Run compiled critique prompt',
        detail: pendingCritiqueRoute ? `from ${pendingCritiqueRoute}` : 'ready in Blueprint',
        target_route: '/portal/project/blueprint?build=visual-workspace',
        icon: 'bi-clipboard-check',
        freshness: 'fresh',
      };
    }

    // 3. Last drawer the operator opened — soft restore affordance.
    if (memory.lastDrawerOpen) {
      const drawerLabel = DRAWER_LABEL[memory.lastDrawerOpen] || memory.lastDrawerOpen;
      return {
        kind: 'last_drawer',
        label: `Reopen ${drawerLabel}`,
        detail: 'you were inspecting this last visit',
        target_route: `/portal/home?drawer=${memory.lastDrawerOpen}`,
        icon: 'bi-window',
        freshness: 'ambient',
      };
    }

    // 4. Operator-domain focus — if the operator was shaping a specific
    // operational domain on System, frame the continuation as impact
    // ("Continue shaping Lead Intelligence") rather than navigation
    // ("Return to System"). Operator Orientation Sprint, 2026-05-14.
    if (memory.lastBpDomain && memory.lastBpDomainLabel) {
      return {
        kind: 'last_system_tab',
        label: `Continue shaping ${memory.lastBpDomainLabel}`,
        detail: 'you were last working in this operational area',
        target_route: `/portal/project/system?tab=${memory.lastSystemTab || 'bps'}`,
        icon: 'bi-diagram-3',
        freshness: 'ambient',
      };
    }

    // 4b. Last System View focus — if the operator was deep in a BP, offer return.
    if (memory.lastSystemTab && memory.lastBpId) {
      return {
        kind: 'last_system_tab',
        label: 'Return to System understanding',
        detail: `last on ${memory.lastSystemTab} tab · BP ${memory.lastBpId.slice(0, 8)}`,
        target_route: `/portal/project/system?tab=${memory.lastSystemTab}`,
        icon: 'bi-grid-3x3-gap',
        freshness: 'ambient',
      };
    }
    if (memory.lastSystemTab) {
      return {
        kind: 'last_system_tab',
        label: `Return to System · ${memory.lastSystemTab}`,
        detail: 'last surface you were on',
        target_route: `/portal/project/system?tab=${memory.lastSystemTab}`,
        icon: 'bi-grid-3x3-gap',
        freshness: 'ambient',
      };
    }

    // 5. Recent critique session — fresh enough that returning may be valuable.
    if (lastCritiqueAt) {
      const minutesSince = Math.floor((Date.now() - new Date(lastCritiqueAt).getTime()) / 60_000);
      if (minutesSince < 120) {  // within 2h is "recent"
        return {
          kind: 'recent_critique',
          label: 'Return to Critique',
          detail: `last session ${minutesSince}m ago`,
          target_route: '/portal/visual-workspace',
          icon: 'bi-bullseye',
          freshness: minutesSince < 30 ? 'fresh' : 'ambient',
        };
      }
    }

    // 6. Fallback — Cory's recommended next move. Only surface as a
    // continuation if the operator has visited before (lastSnapshotAt exists);
    // otherwise it duplicates the priority card.
    if (state.next_action && memory.lastSnapshotAt) {
      return {
        kind: 'next_action',
        label: 'Pick up next priority',
        detail: state.next_action.title,
        target_route: state.next_action.target_route,
        icon: 'bi-arrow-right-circle',
        freshness: 'ambient',
      };
    }

    return null;
  }, [state, memory.lastDrawerOpen, memory.lastSystemTab, memory.lastBpId, memory.lastBpDomain, memory.lastBpDomainLabel, memory.lastSnapshotAt, pendingCritiquePrompt, pendingCritiqueRoute, lastCritiqueAt]);
}

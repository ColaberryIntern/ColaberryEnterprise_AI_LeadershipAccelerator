import { GATED_FEATURES } from '../paywall/gatedFeatures';
import { buildingName } from './campusMap';
import type { CampusBuilding, ExplorerAccess } from './campusMap';

/**
 * "Your path to enrolling" (Colaberry Campus C6), as pure data.
 *
 * Built only from what is real for THIS viewer: each building's state (campusAccess.buildingState, from the pages' own
 * signals), the catalog's names and routes, and the paywall's own call to action (GATED_FEATURES). It is a guide, not
 * progress: there is no reliable per-step completion data, so nothing is ticked off. It never says "free".
 */
export interface PathStep { kind: 'try'; label: string; route: string }
export interface ExplorerPathModel {
  steps: PathStep[];
  /** Buildings enrolling opens or fully opens (locked, demo or preview for this viewer). */
  opens: string[];
  cta: { label: string; to: string };
  /** True when Maya's desk is on duty (the server decides from ENABLE_CHAT). */
  askMaya: boolean;
}

export function explorerPath(
  buildings: CampusBuilding[], accessOf: (b: CampusBuilding) => ExplorerAccess, workplaceNames: boolean, mayaOnDuty: boolean,
): ExplorerPathModel {
  const steps: PathStep[] = [];
  const opens: string[] = [];
  for (const b of buildings) {
    const state = accessOf(b);
    const name = buildingName(b, workplaceNames);
    if (state === 'preview') steps.push({ kind: 'try', label: `Watch the preview in the ${name}`, route: b.primary.route });
    if (state === 'demo') steps.push({ kind: 'try', label: `Try the ${name} in demo mode`, route: b.primary.route });
    if (state !== 'open') opens.push(name);
  }
  const copy = GATED_FEATURES.classroom;
  return { steps, opens, cta: { label: copy.ctaLabel, to: copy.ctaTo }, askMaya: mayaOnDuty };
}

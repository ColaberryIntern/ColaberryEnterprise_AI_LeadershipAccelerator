/**
 * bpRowDedup — 2026-05-20.
 *
 * Collapses BP rows that share a frontend_route into one row. Operator
 * surfaced the issue: "Lead Management" + "Lead Management Dashboard"
 * both rendering on the Lead Intelligence domain, both pointing to
 * /admin/leads, looks like a duplicate.
 *
 * Strategy:
 *   - Group by frontend_route when non-empty (caps with no route never
 *     collapse — they may legitimately share names but represent
 *     different services).
 *   - Pick a primary cap per group: most linked code wins, tie-break by
 *     shortest name (the canonical name usually omits "Dashboard").
 *   - Primary inherits MAX of each linked-layer count (caps in a group
 *     tend to attribute overlapping files; summing double-counts).
 *   - Carries _dupe_count + _dupe_names so the row can surface "+1 cap"
 *     without hiding the merge.
 */
import type { BPLike } from './bpDomainClassifier';

export function dedupByFrontendRoute(processes: ReadonlyArray<BPLike>): BPLike[] {
  const grouped = new Map<string, BPLike[]>();
  const ungrouped: BPLike[] = [];

  for (const p of processes) {
    const route = (p.frontend_route || '').trim();
    if (!route) { ungrouped.push(p); continue; }
    const existing = grouped.get(route);
    if (existing) existing.push(p); else grouped.set(route, [p]);
  }

  const merged: BPLike[] = [...ungrouped];
  for (const group of grouped.values()) {
    if (group.length === 1) { merged.push(group[0]); continue; }
    merged.push(mergeGroup(group));
  }
  return merged;
}

function mergeGroup(group: BPLike[]): BPLike {
  // Score: linked-code richness, tie-break by shorter name (canonical wins
  // over Dashboard/Service/etc suffixed variants).
  const scored = group.map(p => ({
    p,
    code: layerSum(p),
    nameLen: p.name.length,
  }));
  scored.sort((a, b) => b.code - a.code || a.nameLen - b.nameLen);
  const primary = scored[0].p;
  const others = scored.slice(1).map(s => s.p);

  return {
    ...primary,
    linked_backend_services: pickLongest(group.map(p => p.linked_backend_services)),
    linked_frontend_components: pickLongest(group.map(p => p.linked_frontend_components)),
    linked_agents: pickLongest(group.map(p => p.linked_agents)),
    matched_requirements: Math.max(...group.map(p => p.matched_requirements || 0)),
    total_requirements: Math.max(...group.map(p => p.total_requirements || 0)),
    _dupe_count: others.length,
    _dupe_names: others.map(p => p.name),
    maturity: pickHighestMaturity(group),
  };
}

function layerSum(p: BPLike): number {
  return (p.linked_backend_services?.length || 0)
    + (p.linked_frontend_components?.length || 0)
    + (p.linked_agents?.length || 0);
}

function pickLongest(lists: (string[] | undefined)[]): string[] | undefined {
  let best: string[] | undefined;
  for (const l of lists) {
    if (!l) continue;
    if (!best || l.length > best.length) best = l;
  }
  return best;
}

function pickHighestMaturity(group: BPLike[]): BPLike['maturity'] {
  let best: BPLike['maturity'] | undefined;
  for (const p of group) {
    const lvl = p.maturity?.level ?? -1;
    const bestLvl = best?.level ?? -1;
    if (lvl > bestLvl) best = p.maturity;
  }
  return best;
}

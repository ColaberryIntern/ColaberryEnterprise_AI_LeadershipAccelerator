/**
 * bpNameDedup — 2026-05-21.
 *
 * Collapses BP rows whose normalized name stems are identical. Operator
 * caught: "Campaigns Management" (page shell, L1) and "Campaign Management"
 * (full service, L4) both rendering in Marketing Operations — same
 * capability, two extracted caps because brownfield discovery pulled them
 * from a `CampaignsManagementPage.tsx` and a `campaignManagementService.ts`
 * stem. `dedupByFrontendRoute` couldn't connect them because their routes
 * differ (or one has no route).
 *
 * Strategy:
 *   - Normalize names: lowercase → singularize first-token plurals →
 *     strip generic suffixes (Service, Page, Controller, Handler, Engine,
 *     Agent, Manager, Component, View, Util, Helper) → hyphenate
 *   - Group within a single domain only (caller passes per-domain arrays)
 *   - Picks primary = most layers + highest maturity
 *   - Merges others into `_dupe_caps` so the existing MergedCapsModal +N
 *     pill surfaces the merge instead of hiding it
 *
 * Safety guards:
 *   - Never merge if one cap has user_status='verified' and another
 *     doesn't (operator intent must not be collapsed away)
 *   - Never merge across is_page_bp boundaries (a page and a service
 *     with similar names are genuinely different kinds)
 */
import type { BPLike } from './bpDomainClassifier';

const GENERIC_SUFFIXES = new Set<string>([
  'service', 'services',
  'page', 'pages',
  'controller', 'controllers',
  'handler', 'handlers',
  'engine', 'engines',
  'agent', 'agents',
  'manager', 'managers',
  'component', 'components',
  'view', 'views',
  'util', 'utils',
  'helper', 'helpers',
]);

/**
 * Normalize a BP name to a stable comparison stem.
 *
 *   "Campaigns Management"          → "campaign-management"
 *   "Campaign Management Service"   → "campaign-management"
 *   "Lead Classification Service"   → "lead-classification"
 *   "Lead Classifier"               → "lead-classifier"  // not a generic suffix
 */
export function normalizeNameStem(name: string): string {
  if (!name) return '';
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return '';
  // Strip trailing generic suffixes (one or more, in case of "Page Service").
  while (tokens.length > 1 && GENERIC_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  // Singularize the first token (plurals are the most common dupe source —
  // "Campaigns" vs "Campaign"). Naive but conservative: trailing s only.
  if (tokens[0].length > 3 && tokens[0].endsWith('s') && !tokens[0].endsWith('ss')) {
    tokens[0] = tokens[0].slice(0, -1);
  }
  return tokens.join('-');
}

/**
 * Merge BPs in a domain that share a normalized name stem.
 * Pass-through for caps that don't dupe.
 */
export function dedupByNameStem(processes: ReadonlyArray<BPLike>): BPLike[] {
  if (processes.length < 2) return [...processes];

  const grouped = new Map<string, BPLike[]>();
  for (const p of processes) {
    const stem = normalizeNameStem(p.name);
    if (!stem) {
      grouped.set(`__ungrouped_${p.id}`, [p]);
      continue;
    }
    const existing = grouped.get(stem);
    if (existing) existing.push(p); else grouped.set(stem, [p]);
  }

  const out: BPLike[] = [];
  for (const group of grouped.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    if (!isSafeToMerge(group)) {
      // Split the group: emit each member separately, no merge.
      for (const p of group) out.push(p);
      continue;
    }
    out.push(mergeGroup(group));
  }
  return out;
}

/**
 * Don't merge if it would erase operator intent (verified status differs)
 * or cross a kind boundary (page vs service).
 */
function isSafeToMerge(group: BPLike[]): boolean {
  let anyVerified = false;
  let anyUnverified = false;
  let anyPage = false;
  let anyNotPage = false;
  for (const p of group) {
    const verified = (p as any).user_status === 'verified';
    if (verified) anyVerified = true; else anyUnverified = true;
    if (p.is_page_bp) anyPage = true; else anyNotPage = true;
  }
  if (anyVerified && anyUnverified) return false;
  if (anyPage && anyNotPage) return false;
  return true;
}

function mergeGroup(group: BPLike[]): BPLike {
  // Primary = most-layers-attributed, tie-break by highest maturity, then
  // by shortest name (canonical "Campaign Management" beats "Campaigns
  // Management Service").
  const scored = group.map(p => ({
    p,
    code: layerSum(p),
    maturity: p.maturity?.level ?? -1,
    nameLen: p.name.length,
  }));
  scored.sort((a, b) =>
    b.code - a.code
    || b.maturity - a.maturity
    || a.nameLen - b.nameLen
  );
  const primary = scored[0].p;
  const others = scored.slice(1).map(s => s.p);

  // Merge metadata so the row shows the union signal (e.g. green F dot
  // from one + green A dot from another → row shows both).
  return {
    ...primary,
    linked_backend_services: pickLongest(group.map(p => p.linked_backend_services)),
    linked_frontend_components: pickLongest(group.map(p => p.linked_frontend_components)),
    linked_agents: pickLongest(group.map(p => p.linked_agents)),
    matched_requirements: Math.max(...group.map(p => p.matched_requirements || 0)),
    total_requirements: Math.max(...group.map(p => p.total_requirements || 0)),
    // Carry-forward any existing dupe metadata from prior dedup passes —
    // we may run after dedupByFrontendRoute, so the primary may already
    // have _dupe_caps populated from route dedup. Append, don't replace.
    _dupe_count: ((primary as any)._dupe_count || 0) + others.length,
    _dupe_names: [
      ...((primary as any)._dupe_names || []),
      ...others.map(p => p.name),
    ],
    _dupe_caps: [
      ...((primary as any)._dupe_caps || []),
      ...group
        .filter(p => p.id !== primary.id)
        .map(p => ({
          id: p.id,
          name: p.name,
          source: p.source,
          linked_backend_services_count: (p.linked_backend_services || []).length,
          linked_frontend_components_count: (p.linked_frontend_components || []).length,
          linked_agents_count: (p.linked_agents || []).length,
        })),
    ],
    maturity: pickHighestMaturity(group),
  };
}

function layerSum(p: BPLike): number {
  return (p.linked_backend_services?.length || 0)
    + (p.linked_frontend_components?.length || 0)
    + (p.linked_agents?.length || 0);
}

function pickLongest(lists: (readonly string[] | string[] | undefined | null)[]): string[] | undefined {
  let best: string[] | undefined;
  for (const l of lists) {
    if (!l) continue;
    const arr = l as string[];
    if (!best || arr.length > best.length) best = [...arr];
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

/**
 * visualHierarchyAnalyzer — derive hierarchy quality signals from a DOM
 * snapshot.
 *
 * Reads the structured DOM (via domSemanticAnalyzer first) plus the optional
 * visual_weight values per node to score hierarchy clarity.
 *
 * Phase 6 §1.
 */
import type { DOMNode } from './domSemanticAnalyzer';

export interface HierarchyReport {
  /** 0-100; 100 = clear hierarchy, 0 = flat / chaotic. */
  readonly hierarchy_score: number;
  /** Number of distinct visual weight tiers present (≤4 is healthy). */
  readonly weight_tiers: number;
  /** True when the page has multiple high-weight elements competing for attention. */
  readonly competing_primaries: number;
  /** Heading levels in order they actually appeared. */
  readonly heading_path: ReadonlyArray<string>;
  /** Findings for the contradiction system. */
  readonly findings: ReadonlyArray<{ kind: 'no_primary' | 'competing_primaries' | 'flat_hierarchy' | 'heading_skip'; severity: 'low' | 'medium' | 'high'; description: string }>;
}

const HIGH_WEIGHT_THRESHOLD = 70;
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export function analyzeVisualHierarchy(root: DOMNode | null | undefined): HierarchyReport {
  const empty: HierarchyReport = {
    hierarchy_score: 100,
    weight_tiers: 0,
    competing_primaries: 0,
    heading_path: [],
    findings: [],
  };
  if (!root) return empty;

  const weightSet = new Set<number>();
  const heading_path: string[] = [];
  let competing_primaries = 0;
  let actionCount = 0;
  let primaryActionCount = 0;

  const visit = (n: DOMNode): void => {
    const w = n.visual_weight ?? 0;
    if (w > 0) weightSet.add(bucketWeight(w));
    if (HEADING_TAGS.has((n.tag || '').toLowerCase())) heading_path.push(n.tag);

    const role = (n.role || '').toLowerCase();
    const tag = (n.tag || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || role === 'button' || role === 'link') {
      actionCount++;
      if (w >= HIGH_WEIGHT_THRESHOLD) {
        primaryActionCount++;
      }
    }

    if (n.children) for (const c of n.children) visit(c);
  };
  visit(root);

  if (primaryActionCount > 1) competing_primaries = primaryActionCount;

  const findings: Array<{ kind: 'no_primary' | 'competing_primaries' | 'flat_hierarchy' | 'heading_skip'; severity: 'low' | 'medium' | 'high'; description: string }> = [];
  if (actionCount > 0 && primaryActionCount === 0) {
    findings.push({ kind: 'no_primary', severity: 'medium', description: 'No high-weight primary action found. Strengthen the CTA.' });
  }
  if (competing_primaries > 1) {
    findings.push({ kind: 'competing_primaries', severity: 'high', description: `${competing_primaries} high-weight actions compete. Reduce to one primary.` });
  }
  if (weightSet.size <= 1 && actionCount > 3) {
    findings.push({ kind: 'flat_hierarchy', severity: 'medium', description: 'Visual weights are flat — actions look equally important.' });
  }

  // Heading skip check (similar to DOM semantic analyzer but produces a finding)
  const order = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  let prev = -1;
  for (let i = 0; i < heading_path.length; i++) {
    const idx = order.indexOf(heading_path[i].toLowerCase());
    if (idx === -1) continue;
    if (prev !== -1 && idx - prev > 1) {
      findings.push({ kind: 'heading_skip', severity: 'low', description: `Heading skipped: ${order[prev]} → ${order[idx]}.` });
      break;
    }
    prev = idx;
  }

  // Score: start at 100, subtract penalties.
  let score = 100;
  for (const f of findings) {
    if (f.severity === 'high') score -= 25;
    else if (f.severity === 'medium') score -= 12;
    else score -= 5;
  }
  if (score < 0) score = 0;

  return {
    hierarchy_score: score,
    weight_tiers: weightSet.size,
    competing_primaries,
    heading_path,
    findings,
  };
}

/** Bucket the 0-100 weight into 5-point bins so visually similar weights collapse. */
function bucketWeight(w: number): number {
  return Math.floor(Math.min(100, Math.max(0, w)) / 5) * 5;
}

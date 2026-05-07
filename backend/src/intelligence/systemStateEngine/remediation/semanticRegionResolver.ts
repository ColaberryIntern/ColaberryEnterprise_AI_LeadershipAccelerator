/**
 * semanticRegionResolver — DOM-linked semantic regions for replay overlays.
 *
 * Reads the latest DOMSnapshot for a (capability_id, route), runs the
 * cluster_type-appropriate analyzer, and extracts bbox coordinates from
 * the DOM nodes the analyzer identifies as "the region that matters."
 *
 * IMPORTANT: results get persisted on UXRemediationOutcome.semantic_regions
 * at write time so replay reads them back unchanged forever. Re-running
 * analyzers on a later DOMSnapshot would shift bboxes after the user
 * re-fixes the page, which would make replays non-deterministic.
 *
 * Cluster_type → analyzer mapping:
 *   accessibility / hierarchy        → analyzeVisualHierarchy + walk for missing-aria nodes
 *   cta                              → analyzeCTAProminence + locate weak primary candidates
 *   spacing / cognition_overload     → density-derived bboxes (dense regions)
 *   navigation                       → walk for nav landmarks
 *   workflow                         → can't infer from DOM alone — return empty
 *
 * Phase 11 §E.
 */

import type { DOMNode } from '../vision/domSemanticAnalyzer';
import type { ClusterType } from './issueClusterEngine';

export interface SemanticRegion {
  cluster_signature: string;
  cluster_type: ClusterType;
  bbox: { x: number; y: number; width: number; height: number } | null;
  resolved: boolean;
  regressed: boolean;
  /** Free-form selector or label of the element this region maps to (debug). */
  selector_hint: string;
}

/**
 * DB-backed entry point. Reads the latest DOMSnapshot for a BP+route,
 * runs the cluster_type-specific extractor, returns regions with bboxes
 * (or bbox=null when the DOM didn't carry position data for the matched
 * elements).
 */
export async function resolveSemanticRegions(opts: {
  capability_id: string;
  cluster_signature: string;
  cluster_type: ClusterType;
  page_route: string;
  resolved: boolean;
  regressed: boolean;
}): Promise<SemanticRegion[]> {
  try {
    const { default: DOMSnapshot } = await import('../../../models/DOMSnapshot');
    const { Op } = await import('sequelize');
    const snapshot: any = await DOMSnapshot.findOne({
      where: {
        bp_id: opts.capability_id,
        route: { [Op.eq]: opts.page_route },
      },
      order: [['captured_at', 'DESC']],
    });
    if (!snapshot || !snapshot.dom_tree) {
      // No DOM snapshot available — return one placeholder region with bbox=null
      // so the replay overlay still renders the cluster identity.
      return [placeholderRegion(opts)];
    }
    const regions = extractRegionsByClusterType(snapshot.dom_tree as DOMNode, opts);
    return regions.length > 0 ? regions : [placeholderRegion(opts)];
  } catch (err: any) {
    console.warn('[semanticRegionResolver] read failed:', err?.message);
    return [placeholderRegion(opts)];
  }
}

function placeholderRegion(opts: { cluster_signature: string; cluster_type: ClusterType; resolved: boolean; regressed: boolean }): SemanticRegion {
  return {
    cluster_signature: opts.cluster_signature,
    cluster_type: opts.cluster_type,
    bbox: null,
    resolved: opts.resolved,
    regressed: opts.regressed,
    selector_hint: 'no-dom-snapshot',
  };
}

function extractRegionsByClusterType(
  root: DOMNode,
  opts: { cluster_signature: string; cluster_type: ClusterType; resolved: boolean; regressed: boolean },
): SemanticRegion[] {
  const t = opts.cluster_type;
  if (t === 'accessibility') return walkForAccessibility(root, opts);
  if (t === 'hierarchy') return walkForHierarchy(root, opts);
  if (t === 'cta') return walkForCTA(root, opts);
  if (t === 'navigation') return walkForNavigation(root, opts);
  if (t === 'spacing' || t === 'cognition_overload') return walkForDensity(root, opts);
  // workflow — DOM alone doesn't carry workflow signal; placeholder only.
  return [];
}

function walkForAccessibility(root: DOMNode, opts: any): SemanticRegion[] {
  const out: SemanticRegion[] = [];
  visit(root, node => {
    const isActionable = node.tag === 'button' || node.tag === 'a' || (node.role || '').includes('button');
    if (!isActionable) return;
    const hasLabel = !!(node.label && node.label.trim().length > 0);
    if (!hasLabel) {
      out.push(makeRegion(node, opts, `<${node.tag} unlabeled>`));
    }
  });
  return out.slice(0, 8);
}

function walkForHierarchy(root: DOMNode, opts: any): SemanticRegion[] {
  const out: SemanticRegion[] = [];
  let lastHeadingLevel = 0;
  visit(root, node => {
    const m = /^h([1-6])$/i.exec(node.tag);
    if (!m) return;
    const level = parseInt(m[1], 10);
    // Headings that skip levels are the ones the analyzer flags
    if (lastHeadingLevel > 0 && level - lastHeadingLevel > 1) {
      out.push(makeRegion(node, opts, `<${node.tag}>${(node.label || '').slice(0, 40)}`));
    }
    lastHeadingLevel = level;
  });
  return out.slice(0, 8);
}

function walkForCTA(root: DOMNode, opts: any): SemanticRegion[] {
  const out: SemanticRegion[] = [];
  visit(root, node => {
    const isCTACandidate = (node.tag === 'button' || node.tag === 'a') && (node.label || '').length > 0;
    if (!isCTACandidate) return;
    const weight = node.visual_weight ?? 0;
    if (weight < 50) {
      out.push(makeRegion(node, opts, `<${node.tag}>${(node.label || '').slice(0, 40)}`));
    }
  });
  return out.slice(0, 8);
}

function walkForNavigation(root: DOMNode, opts: any): SemanticRegion[] {
  const out: SemanticRegion[] = [];
  visit(root, node => {
    const role = node.role || '';
    if (node.tag === 'nav' || role === 'navigation' || role === 'menubar' || role === 'menu') {
      out.push(makeRegion(node, opts, `<${node.tag} role="${role}">`));
    }
  });
  return out.slice(0, 4);
}

function walkForDensity(root: DOMNode, opts: any): SemanticRegion[] {
  // Dense regions: nodes with > 6 actionable children.
  const out: SemanticRegion[] = [];
  visit(root, node => {
    const children = node.children || [];
    const actionableChildren = children.filter(c => c.tag === 'button' || c.tag === 'a' || (c.role || '').includes('button')).length;
    if (actionableChildren > 6) {
      out.push(makeRegion(node, opts, `<${node.tag}> with ${actionableChildren} actions`));
    }
  });
  return out.slice(0, 4);
}

function makeRegion(node: DOMNode, opts: any, hint: string): SemanticRegion {
  return {
    cluster_signature: opts.cluster_signature,
    cluster_type: opts.cluster_type,
    bbox: node.position ? { x: node.position.x, y: node.position.y, width: node.position.width, height: node.position.height } : null,
    resolved: opts.resolved,
    regressed: opts.regressed,
    selector_hint: hint,
  };
}

function visit(node: DOMNode | undefined, fn: (n: DOMNode) => void): void {
  if (!node) return;
  fn(node);
  if (!node.children) return;
  for (const c of node.children) visit(c, fn);
}

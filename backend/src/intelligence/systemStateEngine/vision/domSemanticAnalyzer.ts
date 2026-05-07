/**
 * domSemanticAnalyzer — pure structural analysis of a serialized DOM tree.
 *
 * Takes a simplified DOM snapshot (the JSON shape we accept via POST
 * /vision/dom) and produces a structured report that downstream analyzers
 * (visualHierarchy, ctaProminence, etc.) consume.
 *
 * The DOM snapshot intentionally carries only structure + roles + landmark
 * tags — never user content text. That keeps it small, privacy-safe, and
 * cheap to send.
 *
 * Phase 6 §5.
 */

export interface DOMNode {
  /** Tag name (lower-case): div, button, a, h1, ... */
  readonly tag: string;
  /** ARIA role when present. */
  readonly role?: string;
  /** Visible label text (for buttons/links/headings only — content text excluded). */
  readonly label?: string;
  /** Whether the element is keyboard-focusable. */
  readonly focusable?: boolean;
  /** Computed visual prominence 0-100 (caller-supplied; 0 if unknown). */
  readonly visual_weight?: number;
  /** Approximate position within the viewport (for layout reasoning). */
  readonly position?: { x: number; y: number; width: number; height: number };
  /** Class list as an array (CSS classes). */
  readonly classes?: ReadonlyArray<string>;
  readonly children?: ReadonlyArray<DOMNode>;
}

export interface DOMSemanticReport {
  readonly action_count: number;          // total clickable + form elements
  readonly primary_action_candidates: ReadonlyArray<{ label: string; weight: number; tag: string }>;
  readonly heading_levels: Record<string, number>;     // h1: count, h2: count, ...
  readonly focusable_count: number;
  readonly missing_aria_labels: ReadonlyArray<string>; // labels of icon-only buttons w/o aria-label
  readonly nav_landmarks: number;
  readonly form_count: number;
  readonly nested_action_zones: ReadonlyArray<{ depth: number; action_count: number }>;
  readonly semantic_warnings: ReadonlyArray<string>;
}

const ACTION_TAGS = new Set(['button', 'a']);
const FORM_TAGS = new Set(['form', 'input', 'select', 'textarea']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const NAV_LANDMARK_ROLES = new Set(['navigation', 'menubar', 'menu', 'tablist']);

/**
 * Pure: walks the tree, returns structured report.
 */
export function analyzeDOMSemantics(root: DOMNode | null | undefined): DOMSemanticReport {
  const empty: DOMSemanticReport = {
    action_count: 0,
    primary_action_candidates: [],
    heading_levels: {},
    focusable_count: 0,
    missing_aria_labels: [],
    nav_landmarks: 0,
    form_count: 0,
    nested_action_zones: [],
    semantic_warnings: [],
  };
  if (!root) return empty;

  const heading_levels: Record<string, number> = {};
  let action_count = 0;
  let focusable_count = 0;
  let nav_landmarks = 0;
  let form_count = 0;
  const missing_aria_labels: string[] = [];
  const candidates: Array<{ label: string; weight: number; tag: string }> = [];
  const zoneDepths = new Map<number, number>();      // depth -> action count at that depth
  const semanticWarnings: string[] = [];

  let actionStack: number[] = [];   // count of actions at each depth as we descend

  const visit = (n: DOMNode, depth: number): void => {
    const tag = (n.tag || '').toLowerCase();
    const role = (n.role || '').toLowerCase();

    if (HEADING_TAGS.has(tag)) {
      heading_levels[tag] = (heading_levels[tag] || 0) + 1;
    }
    if (NAV_LANDMARK_ROLES.has(role) || tag === 'nav') nav_landmarks++;
    if (FORM_TAGS.has(tag) && tag === 'form') form_count++;
    if (n.focusable === true) focusable_count++;

    if (ACTION_TAGS.has(tag) || role === 'button' || role === 'link') {
      action_count++;
      // Track per-depth density
      zoneDepths.set(depth, (zoneDepths.get(depth) || 0) + 1);
      // Candidate primary action: button-like with visible label and high
      // visual weight.
      const w = n.visual_weight ?? 0;
      if (w >= 50 && n.label) {
        candidates.push({ label: n.label, weight: w, tag });
      }
      // Icon-only button without aria-label
      if (!n.label && !n.role && tag === 'button') {
        missing_aria_labels.push(`<${tag}> at depth ${depth}`);
      }
    }

    if (n.children && n.children.length > 0) {
      actionStack.push(action_count);
      for (const c of n.children) visit(c, depth + 1);
      actionStack.pop();
    }
  };

  visit(root, 0);

  // Heading discipline: should be exactly one h1
  const h1Count = heading_levels.h1 || 0;
  if (h1Count === 0) semanticWarnings.push('No <h1> found — page is missing a primary heading.');
  if (h1Count > 1) semanticWarnings.push(`${h1Count} <h1> elements found — only one h1 per page is recommended.`);

  // Heading skip detection
  const headingOrder = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  let prevSeen = -1;
  for (let i = 0; i < headingOrder.length; i++) {
    const h = headingOrder[i];
    if ((heading_levels[h] || 0) > 0) {
      if (prevSeen !== -1 && i - prevSeen > 1) {
        semanticWarnings.push(`Heading level skipped: ${headingOrder[prevSeen]} → ${h}.`);
      }
      prevSeen = i;
    }
  }

  // Sort candidates by weight desc, take top 3
  candidates.sort((a, b) => b.weight - a.weight);
  const primary_action_candidates = candidates.slice(0, 3);

  // Build nested_action_zones report (top 5 deepest densities)
  const nested_action_zones = Array.from(zoneDepths.entries())
    .map(([depth, count]) => ({ depth, action_count: count }))
    .sort((a, b) => b.action_count - a.action_count)
    .slice(0, 5);

  return {
    action_count,
    primary_action_candidates,
    heading_levels,
    focusable_count,
    missing_aria_labels,
    nav_landmarks,
    form_count,
    nested_action_zones,
    semantic_warnings: semanticWarnings,
  };
}

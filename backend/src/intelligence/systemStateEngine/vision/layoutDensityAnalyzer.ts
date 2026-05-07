/**
 * layoutDensityAnalyzer — actions / interactive elements per visible area.
 *
 * Density too high → cognitive overload. Too low → looks unfinished.
 * The healthy band depends on screen class but V1 uses simple thresholds.
 *
 * Phase 6 §1.
 */
import type { DOMNode } from './domSemanticAnalyzer';

export interface DensityReport {
  /** Total interactive elements counted. */
  readonly action_count: number;
  /** Approximate visible area (viewport pixels²). */
  readonly viewport_area: number;
  /** actions per 100k px². 1 = sparse, 10 = dense. */
  readonly density_per_100k_px: number;
  /** 0-100; 100 = healthy density, 0 = severely overloaded or empty. */
  readonly density_health: number;
  readonly category: 'sparse' | 'comfortable' | 'busy' | 'overloaded';
  readonly findings: ReadonlyArray<{ kind: string; description: string }>;
}

// Healthy band: 1.5–5 actions per 100k pixels.
const SPARSE_THRESHOLD = 1.5;
const COMFORTABLE_THRESHOLD = 5;
const BUSY_THRESHOLD = 9;

const ACTION_TAGS = new Set(['button', 'a']);

export function analyzeLayoutDensity(
  root: DOMNode | null | undefined,
  viewport?: { width: number; height: number },
): DensityReport {
  const vw = viewport?.width ?? 1280;
  const vh = viewport?.height ?? 720;
  const viewport_area = vw * vh;
  if (!root || viewport_area === 0) {
    return {
      action_count: 0,
      viewport_area,
      density_per_100k_px: 0,
      density_health: 100,
      category: 'comfortable',
      findings: [],
    };
  }

  let action_count = 0;
  const visit = (n: DOMNode): void => {
    const tag = (n.tag || '').toLowerCase();
    const role = (n.role || '').toLowerCase();
    if (ACTION_TAGS.has(tag) || role === 'button' || role === 'link') action_count++;
    if (n.children) for (const c of n.children) visit(c);
  };
  visit(root);

  const density_per_100k_px = (action_count / viewport_area) * 100000;

  let category: DensityReport['category'];
  let density_health: number;
  if (density_per_100k_px < SPARSE_THRESHOLD) {
    category = 'sparse';
    density_health = Math.round(60 + (density_per_100k_px / SPARSE_THRESHOLD) * 35);
  } else if (density_per_100k_px <= COMFORTABLE_THRESHOLD) {
    category = 'comfortable';
    density_health = 100;
  } else if (density_per_100k_px <= BUSY_THRESHOLD) {
    category = 'busy';
    const overflow = (density_per_100k_px - COMFORTABLE_THRESHOLD) / (BUSY_THRESHOLD - COMFORTABLE_THRESHOLD);
    density_health = Math.round(80 - overflow * 35);
  } else {
    category = 'overloaded';
    const overflow = Math.min(2, (density_per_100k_px - BUSY_THRESHOLD) / BUSY_THRESHOLD);
    density_health = Math.max(0, Math.round(45 - overflow * 35));
  }

  const findings: Array<{ kind: string; description: string }> = [];
  if (category === 'overloaded') {
    findings.push({ kind: 'overloaded_action_zone', description: `Page declares ${action_count} interactive elements in a ${vw}×${vh} viewport — overloaded.` });
  }
  if (category === 'sparse' && action_count <= 1) {
    findings.push({ kind: 'sparse_layout', description: `Only ${action_count} interactive element(s) on the entire page — verify the page is actionable.` });
  }

  return {
    action_count,
    viewport_area,
    density_per_100k_px: Math.round(density_per_100k_px * 10) / 10,
    density_health,
    category,
    findings,
  };
}

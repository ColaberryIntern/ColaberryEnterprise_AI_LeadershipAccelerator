/**
 * ctaProminenceAnalyzer — discoverability check for the primary CTA.
 *
 * Hidden / non-obvious primary CTAs are the #1 cause of conversion drop in
 * enterprise UX studies. This analyzer asks: is the most important action
 * visually + structurally dominant?
 *
 * Phase 6 §1.
 */
import type { DOMNode } from './domSemanticAnalyzer';

export interface CTAReport {
  readonly primary_label: string | null;
  /** Visual weight of the primary candidate (0-100). */
  readonly primary_weight: number;
  /** Position in the viewport: 'above_fold' | 'below_fold' | 'unknown'. */
  readonly primary_position: 'above_fold' | 'below_fold' | 'unknown';
  /** Whether the primary is visibly dominant (large weight gap to next). */
  readonly is_dominant: boolean;
  /** 0-100; 100 = clearly dominant + above-fold + labeled. */
  readonly cta_score: number;
  readonly findings: ReadonlyArray<{ kind: 'hidden_primary_cta' | 'weak_primary_cta' | 'unlabeled_primary' | 'no_cta_at_all'; severity: 'low' | 'medium' | 'high'; description: string }>;
}

const FOLD_Y = 720;     // typical viewport baseline
const ACTION_TAGS = new Set(['button', 'a']);

interface Candidate {
  label: string;
  weight: number;
  y: number;
  has_label: boolean;
}

export function analyzeCTAProminence(
  root: DOMNode | null | undefined,
  viewport?: { width: number; height: number },
): CTAReport {
  const empty: CTAReport = {
    primary_label: null,
    primary_weight: 0,
    primary_position: 'unknown',
    is_dominant: false,
    cta_score: 0,
    findings: [],
  };
  if (!root) return empty;

  const fold = viewport?.height ?? FOLD_Y;
  const candidates: Candidate[] = [];
  const visit = (n: DOMNode): void => {
    const tag = (n.tag || '').toLowerCase();
    const role = (n.role || '').toLowerCase();
    if (ACTION_TAGS.has(tag) || role === 'button' || role === 'link') {
      candidates.push({
        label: n.label ?? '',
        weight: n.visual_weight ?? 0,
        y: n.position?.y ?? -1,
        has_label: !!n.label && n.label.trim().length > 0,
      });
    }
    if (n.children) for (const c of n.children) visit(c);
  };
  visit(root);

  if (candidates.length === 0) {
    return {
      ...empty,
      findings: [{ kind: 'no_cta_at_all', severity: 'high', description: 'Page has no clickable actions.' }],
    };
  }

  candidates.sort((a, b) => b.weight - a.weight);
  const primary = candidates[0];
  const secondary = candidates[1];
  const gap = secondary ? primary.weight - secondary.weight : primary.weight;
  const is_dominant = gap >= 20;

  let primary_position: CTAReport['primary_position'] = 'unknown';
  if (primary.y >= 0) primary_position = primary.y < fold ? 'above_fold' : 'below_fold';

  const findings: Array<{ kind: 'hidden_primary_cta' | 'weak_primary_cta' | 'unlabeled_primary' | 'no_cta_at_all'; severity: 'low' | 'medium' | 'high'; description: string }> = [];

  if (primary.weight < 30) {
    findings.push({ kind: 'hidden_primary_cta', severity: 'high', description: `Top action only carries weight ${primary.weight}/100 — primary CTA is hard to find.` });
  } else if (primary.weight < 50) {
    findings.push({ kind: 'weak_primary_cta', severity: 'medium', description: `Top action weight is ${primary.weight}/100 — primary CTA could be stronger.` });
  }
  if (primary_position === 'below_fold') {
    findings.push({ kind: 'hidden_primary_cta', severity: 'high', description: `Primary CTA "${primary.label || '(unlabeled)'}" sits below the fold (y=${primary.y}).` });
  }
  if (!primary.has_label) {
    findings.push({ kind: 'unlabeled_primary', severity: 'medium', description: 'Primary action has no visible label.' });
  }

  // Score: 100 - findings penalties + dominance bonus
  let score = 100;
  for (const f of findings) {
    if (f.severity === 'high') score -= 30;
    else if (f.severity === 'medium') score -= 15;
    else score -= 5;
  }
  if (!is_dominant) score -= 10;
  if (score < 0) score = 0;

  return {
    primary_label: primary.label || null,
    primary_weight: primary.weight,
    primary_position,
    is_dominant,
    cta_score: score,
    findings,
  };
}

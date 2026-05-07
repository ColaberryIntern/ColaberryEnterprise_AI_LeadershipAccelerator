/**
 * aestheticHarmonyAnalyzer — pure heuristic baseline for aesthetic
 * dimensions when an LLM analysis is unavailable.
 *
 * Looks at: visual weight tier distribution, heading discipline, missing
 * aria labels, density category, and competing primaries. Returns a
 * structured score with sub-dimensions.
 *
 * Phase 7 §5.
 */
import type { VisionAnalysisReport } from '../vision/visionAnalysisEngine';

export interface AestheticIntelligenceScore {
  readonly spacing_rhythm: number;          // 0-100
  readonly visual_balance: number;          // 0-100
  readonly typography_consistency: number;  // 0-100
  readonly alignment_harmony: number;       // 0-100
  readonly interaction_consistency: number; // 0-100
  readonly layout_coherence: number;        // 0-100
  readonly aggregate: number;               // 0-100
  readonly findings: ReadonlyArray<{ kind: string; severity: 'low' | 'medium' | 'high'; description: string }>;
}

export function analyzeAestheticHarmony(report: VisionAnalysisReport): AestheticIntelligenceScore {
  const findings: Array<{ kind: string; severity: 'low' | 'medium' | 'high'; description: string }> = [];
  // Spacing rhythm — proxy: density category. Comfortable = 100. Sparse / busy
  // shave points; overloaded shaves more.
  let spacing_rhythm = 100;
  if (report.density.category === 'busy') spacing_rhythm = 70;
  if (report.density.category === 'overloaded') {
    spacing_rhythm = 35;
    findings.push({ kind: 'spacing_rhythm', severity: 'high', description: 'Action density overloads the spacing rhythm — too many elements per visible area.' });
  }
  if (report.density.category === 'sparse' && report.density.action_count <= 1) {
    spacing_rhythm = 60;
    findings.push({ kind: 'spacing_rhythm', severity: 'low', description: 'Very sparse layout — confirm the page is intended to be this empty.' });
  }

  // Visual balance — proxy: weight tier distribution. ≤4 tiers = healthy. 0 or 1 = flat.
  let visual_balance = 100;
  if (report.hierarchy.weight_tiers === 0) visual_balance = 30;
  else if (report.hierarchy.weight_tiers === 1) {
    visual_balance = 50;
    findings.push({ kind: 'visual_balance', severity: 'medium', description: 'Only one visual weight tier present — UI reads as flat.' });
  } else if (report.hierarchy.weight_tiers > 5) {
    visual_balance = 60;
    findings.push({ kind: 'visual_balance', severity: 'low', description: `${report.hierarchy.weight_tiers} weight tiers — too many subtle gradations.` });
  }

  // Typography consistency — proxy: heading discipline.
  let typography_consistency = 100;
  const semWarnings = report.dom_semantic.semantic_warnings || [];
  for (const w of semWarnings) {
    if (w.includes('h1')) {
      typography_consistency -= 20;
    } else if (w.includes('skipped')) {
      typography_consistency -= 12;
    }
  }
  if (typography_consistency < 0) typography_consistency = 0;

  // Alignment harmony — proxy: nested action zones depth distribution.
  // If the deepest zone has many actions, alignment is likely chaotic.
  const deepestZone = (report.dom_semantic.nested_action_zones || [])[0];
  let alignment_harmony = 100;
  if (deepestZone && deepestZone.action_count > 10) {
    alignment_harmony = 55;
    findings.push({ kind: 'alignment_harmony', severity: 'medium', description: `Action zone at depth ${deepestZone.depth} carries ${deepestZone.action_count} actions — alignment likely chaotic.` });
  }

  // Interaction consistency — proxy: focusable count vs action count.
  const focusableRatio = report.dom_semantic.action_count > 0
    ? report.dom_semantic.focusable_count / report.dom_semantic.action_count
    : 1;
  let interaction_consistency = Math.round(Math.min(1, focusableRatio) * 100);
  if (interaction_consistency < 80) {
    findings.push({ kind: 'interaction_consistency', severity: 'medium', description: `Only ${Math.round(focusableRatio * 100)}% of actions are keyboard-focusable.` });
  }

  // Layout coherence — proxy: hierarchy + density blended.
  const layout_coherence = Math.round(report.hierarchy.hierarchy_score * 0.6 + report.density.density_health * 0.4);

  const dims = [spacing_rhythm, visual_balance, typography_consistency, alignment_harmony, interaction_consistency, layout_coherence];
  const aggregate = Math.round(dims.reduce((s, n) => s + n, 0) / dims.length);

  return {
    spacing_rhythm,
    visual_balance,
    typography_consistency,
    alignment_harmony,
    interaction_consistency,
    layout_coherence,
    aggregate,
    findings,
  };
}

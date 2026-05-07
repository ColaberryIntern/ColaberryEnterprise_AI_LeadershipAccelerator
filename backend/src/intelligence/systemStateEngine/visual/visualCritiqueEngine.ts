/**
 * visualCritiqueEngine — turns user critique items into AI suggestions.
 *
 * Phase 5 V1: rule-based templates. Each (kind, severity) combo maps to a
 * suggestion preset that's parameterized with the critique's description +
 * target_selector. Phase 6 will plug in OpenAI vision for richer output.
 *
 * Pure: takes a critique, returns suggestions. No DB.
 *
 * Phase 5 §4.
 */
import type { CritiqueKind, CritiqueSeverity } from '../../../models/VisualCritiqueItem';
import type { SuggestionKind } from '../../../models/VisualAISuggestion';

export interface CritiqueInput {
  readonly id: string;
  readonly kind: CritiqueKind;
  readonly severity: CritiqueSeverity;
  readonly description: string;
  readonly target_selector?: string | null;
  readonly expected_outcome?: string | null;
}

export interface SuggestionDraft {
  readonly kind: SuggestionKind;
  readonly title: string;
  readonly body: string;
  readonly rationale: string;
  readonly confidence: number;
  readonly expected_ux_impact: number;
}

interface Template {
  readonly kind: SuggestionKind;
  readonly title: string;
  readonly body: string;
  readonly rationale: string;
  readonly confidence: number;        // base confidence
  readonly expected_ux_impact: number; // base impact
}

const TEMPLATES: Partial<Record<CritiqueKind, ReadonlyArray<Template>>> = {
  spacing: [{
    kind: 'layout',
    title: 'Increase whitespace around clustered elements',
    body: 'Apply consistent vertical rhythm using a 4-pt or 8-pt baseline grid. Replace tight margins (<8px) with system tokens (margin-1, margin-2, margin-3) so spacing scales predictably across breakpoints.',
    rationale: 'Tight spacing reduces scannability and increases perceived density.',
    confidence: 80, expected_ux_impact: 25,
  }],
  alignment: [{
    kind: 'layout',
    title: 'Snap elements to a shared baseline',
    body: 'Confirm every visible element is anchored to one of two columns: the content column or the action column. Misalignments add visual noise; users perceive misaligned UI as unfinished.',
    rationale: 'Alignment is the cheapest professionalism signal in any interface.',
    confidence: 78, expected_ux_impact: 22,
  }],
  hierarchy: [
    {
      kind: 'hierarchy',
      title: 'Establish a single primary action per view',
      body: 'Reduce competing CTAs to one primary (filled) and at most two secondary (outlined). Demote remaining actions to ghost buttons or hide behind progressive disclosure.',
      rationale: 'Multiple primaries create decision paralysis and dilute conversion.',
      confidence: 85, expected_ux_impact: 35,
    },
    {
      kind: 'cta',
      title: 'Strengthen the primary CTA visual weight',
      body: 'Use a saturated brand color, larger size (44px+ touch target), and unambiguous verb labeling ("Save Changes" not "Submit").',
      rationale: 'Weak primary CTAs read as optional; conversion drops measurably.',
      confidence: 80, expected_ux_impact: 30,
    },
  ],
  typography: [{
    kind: 'hierarchy',
    title: 'Reduce font size variance',
    body: 'Pick at most 4 type sizes (display, heading, body, caption). Each plays a clear role; overlap creates hierarchy ambiguity.',
    rationale: 'Too many sizes flatten hierarchy and read as "designed by committee."',
    confidence: 75, expected_ux_impact: 18,
  }],
  color: [{
    kind: 'simplification',
    title: 'Collapse to 3 semantic colors + neutrals',
    body: 'Limit non-neutral palette to: primary (brand), secondary (warning/CTA accent), accent (success). Greys handle structure.',
    rationale: 'Color overload makes meaning ambiguous.',
    confidence: 72, expected_ux_impact: 18,
  }],
  interaction: [
    {
      kind: 'simplification',
      title: 'Surface the primary action above the fold',
      body: 'Reorder the layout so the user\'s most likely action is visible without scrolling. Test with a 1280×720 viewport.',
      rationale: 'Buried primary actions cause completion drop-offs >40%.',
      confidence: 82, expected_ux_impact: 32,
    },
  ],
  accessibility: [
    {
      kind: 'accessibility',
      title: 'Ensure all interactive elements are keyboard-operable',
      body: 'Verify Tab order, focus-visible outlines (3px primary-light), and ARIA labels on icon-only buttons. Run an axe-core pass.',
      rationale: 'WCAG 2.1 AA compliance is non-negotiable for enterprise sales.',
      confidence: 90, expected_ux_impact: 40,
    },
  ],
  responsiveness: [{
    kind: 'layout',
    title: 'Verify mobile layout at 375px',
    body: 'Check that touch targets are ≥44px, navigation collapses to a single rail, and tables become cards. Test at 375×667.',
    rationale: 'Executives demo on phones; broken mobile is a hard-stop perception.',
    confidence: 85, expected_ux_impact: 28,
  }],
  hierarchy_secondary: [],   // Handled by 'hierarchy' above
  workflow: [
    {
      kind: 'workflow',
      title: 'Reduce step count for the affected workflow',
      body: 'Audit the steps required to complete this workflow. Combine sequential single-input screens into one. Defer optional inputs to a "more options" disclosure.',
      rationale: 'Each unnecessary screen drops completion ~7-15%.',
      confidence: 80, expected_ux_impact: 35,
    },
  ],
  copy: [
    {
      kind: 'copy',
      title: 'Rewrite copy in active voice',
      body: 'Replace passive constructions ("Your application has been received") with active ("We received your application"). Use second-person ("you") for instructions and first-person plural ("we") for system actions.',
      rationale: 'Active voice raises read-comprehension scores by ~20% in enterprise UX studies.',
      confidence: 78, expected_ux_impact: 18,
    },
  ],
} as any;

export function generateSuggestionsFromCritique(critique: CritiqueInput): SuggestionDraft[] {
  const templates = TEMPLATES[critique.kind] || [];
  if (templates.length === 0) return [];

  // Adjust confidence + impact based on severity.
  const severityBoost: Record<CritiqueSeverity, number> = {
    low: -10,
    medium: 0,
    high: +10,
  };

  return templates.map(t => ({
    kind: t.kind,
    title: t.title,
    body: t.body,
    rationale: critique.description
      ? `${t.rationale} User noted: "${critique.description.substring(0, 200)}".`
      : t.rationale,
    confidence: clamp(t.confidence + severityBoost[critique.severity]),
    expected_ux_impact: clamp(t.expected_ux_impact + severityBoost[critique.severity]),
  }));
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

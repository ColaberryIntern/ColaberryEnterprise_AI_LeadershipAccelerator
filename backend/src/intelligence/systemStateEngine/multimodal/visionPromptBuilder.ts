/**
 * visionPromptBuilder — produces the structured analysis prompt for a
 * vision-capable LLM call.
 *
 * Pure: takes context, returns a prompt string + a JSON schema description
 * the model is instructed to fill.
 *
 * Phase 7 §1.
 */

export interface VisionPromptInput {
  readonly route: string;
  readonly viewport?: { width: number; height: number; label?: 'desktop' | 'tablet' | 'mobile' };
  readonly user_intent?: string;        // free-form description of what the page is for
  readonly known_critical_actions?: ReadonlyArray<string>;
  readonly known_workflows?: ReadonlyArray<string>;
  /** Whether a comparison with a previous screenshot is requested. */
  readonly comparing?: boolean;
  /** Caller's annotated regions to focus the model on. */
  readonly focus_regions?: ReadonlyArray<{ x: number; y: number; width: number; height: number; note?: string }>;
}

export interface BuiltVisionPrompt {
  readonly system: string;
  readonly user: string;
  /** The shape we ask the model to return (used by the normalizer). */
  readonly response_schema_keys: ReadonlyArray<string>;
}

const RESPONSE_SCHEMA = [
  'overall_assessment',
  'cognition_score',
  'visual_hierarchy_score',
  'cta_prominence_score',
  'aesthetic_harmony_score',
  'workflow_intuitiveness_score',
  'accessibility_score',
  'observations',
  'concerns',
  'suggested_improvements',
  'highlight_regions',
  'confidence',
] as const;

export function buildVisionPrompt(input: VisionPromptInput): BuiltVisionPrompt {
  const viewport = input.viewport;
  const viewportLabel = viewport?.label
    ? `${viewport.label} (${viewport.width}×${viewport.height})`
    : viewport
      ? `${viewport.width}×${viewport.height}`
      : 'unknown viewport';

  const system = [
    'You are a senior UX critique analyst integrated into the Colaberry orchestration engine.',
    'You receive a screenshot of a single page and produce a structured, machine-readable assessment.',
    '',
    'Your job:',
    '1. Score the page on six dimensions (0-100, where 100 = excellent): visual hierarchy, CTA prominence, aesthetic harmony, workflow intuitiveness, accessibility, and an overall cognition score.',
    '2. List concrete observations and concerns (not vague platitudes).',
    '3. Suggest 1-3 specific improvements with their expected impact.',
    '4. Highlight up to 5 specific regions in the image that demand attention, each with x,y,width,height as percentages of the image dimensions.',
    '5. Provide a confidence score 0-100 based on image clarity + your certainty.',
    '',
    'Constraints:',
    '- Do NOT include any text outside the JSON object.',
    '- Use lowercase keys exactly as specified.',
    '- Keep observation/concern strings under 240 chars each.',
    '- region.kind must be one of: cta_weakness, hierarchy_failure, overload, accessibility_gap, alignment_break, contrast_issue.',
  ].join('\n');

  const userParts: string[] = [];
  userParts.push(`Page route: \`${input.route}\``);
  userParts.push(`Viewport: ${viewportLabel}`);
  if (input.user_intent) userParts.push(`Stated intent of this page: ${input.user_intent}`);
  if (input.known_critical_actions && input.known_critical_actions.length > 0) {
    userParts.push(`Known critical actions: ${input.known_critical_actions.map(a => `\`${a}\``).join(', ')}`);
  }
  if (input.known_workflows && input.known_workflows.length > 0) {
    userParts.push(`Known workflows: ${input.known_workflows.map(w => `\`${w}\``).join('; ')}`);
  }
  if (input.focus_regions && input.focus_regions.length > 0) {
    userParts.push('Focus regions (caller annotations): ' + input.focus_regions
      .map(r => `(${r.x},${r.y},${r.width}x${r.height}) ${r.note ?? ''}`).join(' | '));
  }
  if (input.comparing) {
    userParts.push('A previous screenshot of the same route is also provided. Compare them and call out improvements OR regressions explicitly in concerns / observations.');
  }
  userParts.push('');
  userParts.push('Return ONLY a single JSON object with the following keys:');
  userParts.push(`  ${RESPONSE_SCHEMA.join(', ')}`);
  userParts.push('Where:');
  userParts.push('  overall_assessment: 1-2 sentence summary');
  userParts.push('  cognition_score, visual_hierarchy_score, cta_prominence_score, aesthetic_harmony_score, workflow_intuitiveness_score, accessibility_score: integers 0-100');
  userParts.push('  observations: array of strings');
  userParts.push('  concerns: array of strings');
  userParts.push('  suggested_improvements: array of { title: string, body: string, expected_ux_impact: integer 0-100, kind: string }');
  userParts.push('  highlight_regions: array of { kind: string, x_pct: number, y_pct: number, width_pct: number, height_pct: number, label: string }');
  userParts.push('  confidence: integer 0-100');

  return {
    system,
    user: userParts.join('\n'),
    response_schema_keys: RESPONSE_SCHEMA as unknown as string[],
  };
}

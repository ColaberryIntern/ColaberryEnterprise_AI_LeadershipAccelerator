/**
 * screenshotSemanticAnalyzer — narrow interface that wraps
 * (eventually) an OpenAI vision call.
 *
 * V1: rule-based stub returning a structured analysis from any caption /
 * description text the user supplied alongside the screenshot. The
 * interface is shaped so a Phase 7 swap to GPT-4o vision is non-breaking.
 *
 * Phase 6 §3.
 */

export interface ScreenshotAnalysisInput {
  readonly screenshot_path: string;
  /** Caller-supplied description / context. The LLM swap will replace this. */
  readonly caller_description?: string | null;
  /** Optional viewport to bias geometry interpretation. */
  readonly viewport?: { width: number; height: number };
}

export interface ScreenshotAnalysis {
  readonly source: 'rule_based' | 'llm';
  readonly observations: ReadonlyArray<string>;
  readonly suggested_focus_areas: ReadonlyArray<string>;
  /** 0-100 confidence in the analysis. Rule-based baseline is 30. */
  readonly confidence: number;
  readonly raw_metadata: Record<string, unknown>;
}

const KEYWORD_HINTS: Record<string, string[]> = {
  'too many': ['cognitive overload', 'progressive disclosure', 'group similar actions'],
  'cluttered': ['cognitive overload', 'whitespace audit'],
  'tight': ['spacing audit', 'baseline grid'],
  'crowded': ['cognitive overload', 'whitespace audit'],
  'small': ['typography hierarchy', 'touch target sizing'],
  'unclear': ['CTA labeling', 'visual hierarchy'],
  'hidden': ['primary CTA discoverability'],
  'below the fold': ['primary CTA position'],
  'mobile': ['responsiveness', 'touch target audit'],
  'contrast': ['accessibility', 'WCAG AA color contrast'],
  'overlap': ['layout collision', 'z-index audit'],
};

export function analyzeScreenshot(input: ScreenshotAnalysisInput): ScreenshotAnalysis {
  const desc = (input.caller_description || '').toLowerCase();
  const observations: string[] = [];
  const suggested_focus_areas = new Set<string>();

  if (desc.length === 0) {
    observations.push('No caller description provided. V1 cannot analyze the image directly; LLM vision will be wired in Phase 7.');
  } else {
    observations.push(`Caller described the screen with: "${input.caller_description}".`);
  }

  for (const [keyword, focuses] of Object.entries(KEYWORD_HINTS)) {
    if (desc.includes(keyword)) {
      observations.push(`Detected keyword "${keyword}".`);
      for (const f of focuses) suggested_focus_areas.add(f);
    }
  }

  if (suggested_focus_areas.size === 0) {
    suggested_focus_areas.add('visual hierarchy');
    suggested_focus_areas.add('CTA prominence');
  }

  return {
    source: 'rule_based',
    observations,
    suggested_focus_areas: Array.from(suggested_focus_areas),
    confidence: desc.length === 0 ? 10 : 30,
    raw_metadata: {
      screenshot_path: input.screenshot_path,
      viewport: input.viewport ?? null,
      description_length: desc.length,
    },
  };
}

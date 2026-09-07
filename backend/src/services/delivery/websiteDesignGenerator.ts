/**
 * websiteDesignGenerator — one real design of their product, not three abstract dashboards.
 *
 * ## What changed and why
 *
 * The first version generated §20's three concepts: Operational, Command Center, Executive.
 * They were product-specific and passed every gate, and they were still the wrong artifact -
 * three variations on an internal dashboard, when what a prospect wants to see is THEIR
 * THING, as a page they could navigate.
 *
 *   "I should see the website design where a user can navigate a one page design. They
 *    should also have a smaller, smart phone view as well. We only need one QR code just
 *    so they can view it on their phone."  (Ali, 2026-09-06)
 *
 * So: one design, generated once, shown at two widths. The two views are the SAME document
 * at different viewports, which is what responsive means - generating two files would let
 * them drift, and a phone view that disagrees with the desktop view is worse than none.
 *
 * ## It has to work without JavaScript
 *
 * A generated document is served under a sandbox CSP that executes nothing, so in-page
 * navigation is anchors and `:target`, not script. That is a real constraint on the design
 * and it is stated in the prompt rather than discovered at render time.
 */

import { chatJson } from '../runtime/runtimeAi';
import {
  executableViolation,
  contactLeakViolation,
  labelViolation,
  craftViolation,
  CONCEPT_LABEL,
  type ConceptContactDetails,
} from './uiConceptGenerator';
import { genericnessViolation, type DesignBrief } from './designBrief';

export interface WebsiteDesign {
  /** What this design is, in one sentence, shown beside it. */
  rationale: string;
  html: string;
}

export type WebsiteDesignResult =
  | { ok: true; design: WebsiteDesign; runtime_ms: number; cost_usd: number }
  | { ok: false; error_class: 'EmptyModelResponse' | 'ContractViolation'; error: string };

/**
 * The design instructions. Deterministic, so the prompt behind any design can be
 * reconstructed rather than guessed at.
 */
export function buildWebsiteDesignPrompt(brief: DesignBrief): string {
  return [
    `Design the actual website for a real product: ${brief.project_title}.`,
    '',
    'This is a ONE-PAGE site that a visitor can navigate end to end. Not a dashboard, not a mockup of an admin panel — the page this business would put on the internet.',
    '',
    'WHAT THEY TOLD US',
    brief.roles.length ? `Who it is for: ${brief.roles.join(' | ')}` : '',
    brief.workflows.length ? `What happens: ${brief.workflows.join(' | ')}` : '',
    brief.actions.length ? `What they want: ${brief.actions.join(' | ')}` : '',
    brief.surfaces.length ? `Surfaces discussed: ${brief.surfaces.join(' | ')}` : '',
    '',
    `THEIR VOCABULARY — use these words on the page: ${brief.distinctive_terms.join(', ')}`,
    brief.not_discussed.length ? `NEVER DISCUSSED, so do not invent it: ${brief.not_discussed.join(', ')}.` : '',
    '',
    'RETURN STRICT JSON: { "rationale": "<one sentence on what this design is>", "html": "<the complete page>" }',
    '',
    'THE PAGE MUST HAVE:',
    '- A header with the product name and in-page navigation links to the sections below.',
    '- A hero that says what this does for the person using it, in their language, not in marketing language.',
    '- A "how it works" section with the real steps, in order.',
    '- A section for each audience you were told about, saying what they get.',
    '- A closing call to action that matches what this business would actually ask for.',
    '- Section ids that the header links to, so the nav works.',
    '',
    'RULES THAT ARE CHECKED MECHANICALLY AND WILL REJECT THE DESIGN:',
    `- It must contain the word "${CONCEPT_LABEL}" visibly, so nobody mistakes it for a live product.`,
    '- NO <script>, no inline event handlers (onclick and friends), no javascript: URLs, no iframes. It is served sandboxed and none of it would run.',
    '- In-page navigation must therefore be plain anchor links to section ids. Do not write a single line of JavaScript.',
    '- No email addresses and no phone numbers anywhere. Invent nothing that looks like contact details.',
    '- It must use at least two of their words verbatim. A generic template with renamed headers will be refused.',
    '',
    'RESPONSIVE, AND THIS IS NOT OPTIONAL:',
    'The same document is shown at 1200px and at 390px. It must be genuinely good at BOTH.',
    '- Use CSS grid or flex with wrapping, never fixed pixel widths on containers.',
    '- At 390px: one column, the nav stacks or wraps, type stays at least 15px, nothing scrolls sideways.',
    '- Use a media query rather than hoping it reflows.',
    '',
    'CRAFT. THIS IS THE LAST THING THEY SEE BEFORE DECIDING WHETHER TO PAY.',
    '- Set font-family explicitly. A system stack is fine; the browser default serif is not.',
    '- A real type scale: distinct sizes and weights for hero, section heading, body and label.',
    '- Consistent spacing on a rhythm (4 / 8 / 16 / 24 / 48px).',
    '- A restrained palette: one neutral ground, one text colour, ONE accent. No stock green and blue buttons.',
    '- Inline CSS in a <style> block. No external stylesheets, fonts, scripts or images.',
    '- No emoji as icons. If you need a mark, draw it in inline SVG.',
    '',
    'Write real copy for this specific business. Placeholder text, lorem ipsum, and "Feature One / Feature Two" are failures.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Generate the design, checked before it is returned.
 *
 * Runs the same gates as the concept generator - a design is a concept with a bigger job,
 * and the reasons those gates exist do not change because the artifact got more ambitious.
 */
export async function generateWebsiteDesign(params: {
  brief: DesignBrief;
  contact?: ConceptContactDetails;
  max_tokens?: number;
}): Promise<WebsiteDesignResult> {
  const system = buildWebsiteDesignPrompt(params.brief);

  const { parsed, runtime_ms, cost_usd } = await chatJson(
    'website-design',
    system,
    `Design the one-page site for ${params.brief.project_title}.`,
    undefined,
    // A whole page needs room. Too small a budget truncates mid-markup, which reads as a
    // broken design rather than a truncated one.
    params.max_tokens ?? 8000,
  );

  const html = typeof (parsed as any)?.html === 'string' ? (parsed as any).html : '';
  const rationale = typeof (parsed as any)?.rationale === 'string' ? (parsed as any).rationale.trim() : '';

  if (!html.trim()) {
    return { ok: false, error_class: 'EmptyModelResponse', error: 'model returned no html' };
  }

  const violation =
    executableViolation(html) ||
    genericnessViolation(html, params.brief) ||
    labelViolation(html) ||
    craftViolation(html) ||
    contactLeakViolation(html, params.contact || {});

  if (violation) {
    return { ok: false, error_class: 'ContractViolation', error: violation };
  }

  return {
    ok: true,
    design: { rationale: rationale || `A one-page site for ${params.brief.project_title}.`, html },
    runtime_ms,
    cost_usd,
  };
}

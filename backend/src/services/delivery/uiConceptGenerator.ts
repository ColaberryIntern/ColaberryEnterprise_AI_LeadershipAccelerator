/**
 * uiConceptGenerator — §20's two-to-three interactive concepts, and §21's constraints on them.
 *
 * §21 is explicit that free UI concept code is TEMPORARY and is not the canonical paid repo:
 *
 *     synthetic/demo data only · no production data · no customer secrets
 *     isolated execution · expiry · cost/rate limits · clearly labeled concept
 *
 * Most of that list is enforced by where a concept is stored and served. Three items can be
 * checked on the artifact itself, and so they are - because "the prompt told it not to" has
 * been wrong at least four times in this build already.
 *
 *   1. It must speak the customer's language        (designBrief.genericnessViolation)
 *   2. It must carry no contact details             (contactLeakViolation, below)
 *   3. It must label itself a concept               (labelViolation, below)
 *
 * ## Names are domain vocabulary; contact details are not
 *
 * A concept SHOULD say "Ralph" - that is the entire point of §20, and a screen for this
 * business names the person who keeps the spreadsheet. What it must never carry is the
 * lead's email address or phone number.
 *
 * The distinction is not squeamishness. A concept link is shareable, the same as the
 * preview it hangs off, so anything inside it should be safe to forward to a colleague.
 * A first name in a mock table is; the phone number the prospect typed into a form is not.
 *
 * ## Why the label is checked rather than added
 *
 * It would be easy to staple a banner on after generation and call it labelled. But a
 * concept that does not know it is a concept tends to read like a finished product
 * throughout - real-looking totals, confident empty states, no hedging anywhere - and a
 * banner on top of that is a disclaimer nobody reads. Requiring the model to carry the
 * label means the framing is inside the artifact, and a generation that ignored the framing
 * is rejected rather than papered over.
 */

import { chatJson } from '../runtime/runtimeAi';
import {
  genericnessViolation,
  CONCEPT_VARIANTS,
  type DesignBrief,
  type ConceptKey,
} from './designBrief';

export interface ConceptContactDetails {
  email?: string | null;
  phone?: string | null;
}

export interface GeneratedConcept {
  key: ConceptKey;
  title: string;
  recommended: boolean;
  /** One sentence on what this concept is for, shown beside it. */
  rationale: string;
  html: string;
}

export interface RejectedConcept {
  key: string;
  reason: string;
}

export type ConceptResult =
  | { ok: true; concepts: GeneratedConcept[]; rejected: RejectedConcept[]; runtime_ms: number; cost_usd: number }
  | { ok: false; error_class: 'EmptyModelResponse' | 'ContractViolation'; error: string; rejected: RejectedConcept[] };

/** Text every concept must carry, so the framing lives inside the artifact. */
export const CONCEPT_LABEL = 'Concept';

/**
 * Contact details must not appear in a shareable artifact.
 *
 * Digits are compared with punctuation stripped, because "(682) 597-5784" and
 * "+16825975784" are the same phone number and only one of them would ever be caught by a
 * literal search.
 */
export function contactLeakViolation(html: string, contact: ConceptContactDetails): string | null {
  const haystack = (html || '').toLowerCase();

  const email = (contact.email || '').trim().toLowerCase();
  if (email && haystack.includes(email)) {
    return 'concept contains the customer’s email address';
  }

  const digits = (contact.phone || '').replace(/\D/g, '');
  if (digits.length >= 7) {
    const htmlDigits = haystack.replace(/\D/g, '');
    // Compare on the last 10 digits so a country code on one side does not hide a match.
    const needle = digits.slice(-10);
    if (needle.length >= 7 && htmlDigits.includes(needle)) {
      return 'concept contains the customer’s phone number';
    }
  }

  return null;
}

export function labelViolation(html: string): string | null {
  return (html || '').toLowerCase().includes(CONCEPT_LABEL.toLowerCase())
    ? null
    : `concept does not label itself a ${CONCEPT_LABEL.toLowerCase()}`;
}

/** Deterministic, so the instructions behind any concept can be reconstructed. */
export function buildConceptPrompt(brief: DesignBrief, conceptKey: ConceptKey): string {
  const concept = CONCEPT_VARIANTS.find((c) => c.key === conceptKey)!;

  return [
    `You are designing ONE interactive UI concept for a real business: ${brief.project_title}.`,
    '',
    `CONCEPT: ${concept.title}`,
    concept.intent,
    '',
    'WHAT THEY ACTUALLY TOLD US',
    brief.roles.length ? `People: ${brief.roles.join(' | ')}` : '',
    brief.workflows.length ? `Workflow: ${brief.workflows.join(' | ')}` : '',
    brief.actions.length ? `They want: ${brief.actions.join(' | ')}` : '',
    brief.surfaces.length ? `Surfaces discussed: ${brief.surfaces.join(' | ')}` : '',
    '',
    `THEIR VOCABULARY - use these words on screen: ${brief.distinctive_terms.join(', ')}`,
    brief.not_discussed.length
      ? `NEVER DISCUSSED, so do not invent it: ${brief.not_discussed.join(', ')}.`
      : '',
    '',
    'RETURN STRICT JSON: { "rationale": "<one sentence on what this concept is for>", "html": "<a complete self-contained HTML fragment>" }',
    '',
    'RULES THAT ARE CHECKED MECHANICALLY AND WILL REJECT THE CONCEPT:',
    `- It must use at least two of their words verbatim. A screen of "Overview / Users / Reports / Settings" is a renamed template and will be refused.`,
    `- It must contain the word "${CONCEPT_LABEL}" visibly, so nobody mistakes it for a finished product.`,
    '- It must contain NO email addresses and NO phone numbers. Invent nothing that looks like contact details.',
    '',
    'ALSO REQUIRED:',
    '- Realistic domain content and real action labels, not lorem ipsum and not "Button 1".',
    '- Demo data only, and it should look obviously illustrative rather than like a real record.',
    '- Inline CSS in a <style> block. No external stylesheets, fonts, scripts or images.',
    '- Responsive enough to be readable on a phone.',
    '- No <script>: this is a static concept and will be rendered sandboxed.',
    '',
    'Design for an operator who has done this job for years. Density and clarity over decoration.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Generate one concept, checked before it is returned.
 *
 * Each concept is a separate call rather than one call returning three. Three concepts in
 * one response makes them converge - the model writes a theme and varies the header - which
 * is the failure §20 describes from a different direction.
 */
export async function generateConcept(params: {
  brief: DesignBrief;
  conceptKey: ConceptKey;
  contact?: ConceptContactDetails;
  max_tokens?: number;
}): Promise<{ concept?: GeneratedConcept; rejected?: RejectedConcept; runtime_ms: number; cost_usd: number }> {
  const variant = CONCEPT_VARIANTS.find((c) => c.key === params.conceptKey)!;
  const system = buildConceptPrompt(params.brief, params.conceptKey);

  const { parsed, runtime_ms, cost_usd } = await chatJson(
    'ui-concept',
    system,
    `Design the ${variant.title} concept for ${params.brief.project_title}.`,
    undefined,
    params.max_tokens ?? 4000,
  );

  const html = typeof (parsed as any)?.html === 'string' ? (parsed as any).html : '';
  const rationale = typeof (parsed as any)?.rationale === 'string' ? (parsed as any).rationale.trim() : '';

  if (!html.trim()) {
    return { rejected: { key: params.conceptKey, reason: 'model returned no html' }, runtime_ms, cost_usd };
  }

  const violation =
    genericnessViolation(html, params.brief) ||
    labelViolation(html) ||
    contactLeakViolation(html, params.contact || {});

  if (violation) {
    return { rejected: { key: params.conceptKey, reason: violation }, runtime_ms, cost_usd };
  }

  return {
    concept: {
      key: params.conceptKey,
      title: variant.title,
      recommended: variant.recommended,
      rationale: rationale || variant.intent,
      html,
    },
    runtime_ms,
    cost_usd,
  };
}

export async function generateConcepts(params: {
  brief: DesignBrief;
  contact?: ConceptContactDetails;
  keys?: ConceptKey[];
}): Promise<ConceptResult> {
  const keys = params.keys || CONCEPT_VARIANTS.map((c) => c.key);
  const concepts: GeneratedConcept[] = [];
  const rejected: RejectedConcept[] = [];
  let runtime_ms = 0;
  let cost_usd = 0;

  for (const key of keys) {
    const result = await generateConcept({ brief: params.brief, conceptKey: key, contact: params.contact });
    runtime_ms += result.runtime_ms;
    cost_usd += result.cost_usd;
    if (result.concept) concepts.push(result.concept);
    if (result.rejected) rejected.push(result.rejected);
  }

  if (concepts.length === 0) {
    return {
      ok: false,
      error_class: 'ContractViolation',
      error:
        rejected.length > 0
          ? `every concept was refused: ${rejected.map((r) => `${r.key}: ${r.reason}`).join('; ')}`
          : 'no concepts were generated',
      rejected,
    };
  }

  return { ok: true, concepts, rejected, runtime_ms, cost_usd };
}

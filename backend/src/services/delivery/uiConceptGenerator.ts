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

/** Below this, a `<style>` block is a gesture rather than a design. */
export const MIN_CSS_CHARS = 400;

/**
 * Whether this looks designed, or merely rendered.
 *
 * §20 calls this moment the FINAL FREE WOW - the last thing a prospect sees before deciding
 * to pay. The first real generation passed every correctness check and still came back as
 * default-styled tables with stock green buttons, because the prompt demanded product
 * specificity and said nothing at all about craft. It got exactly what was asked for.
 *
 * "Beautiful" is not decidable. These four things are, and each maps to a specific way an
 * unstyled page announces itself:
 *
 *   no <style> at all      - browser defaults, every time
 *   a token amount of CSS  - a gesture at styling rather than a design
 *   no font-family         - Times New Roman, the single loudest "nobody designed this"
 *   no colour or spacing   - black text on white with default margins
 *
 * This cannot make a concept good. It can stop one that nobody styled from reaching a
 * customer at the moment they are deciding whether this company can build software.
 */
export function craftViolation(html: string): string | null {
  const source = html || '';
  const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');

  if (!styles.trim()) return 'concept has no <style> block — it will render as browser defaults';
  if (styles.length < MIN_CSS_CHARS) {
    return `concept has only ${styles.length} characters of CSS (needs ${MIN_CSS_CHARS}) — that is a gesture, not a design`;
  }
  if (!/font-family\s*:/i.test(styles)) {
    return 'concept never sets font-family — it will render in the browser default serif';
  }
  if (!/(background|background-color)\s*:/i.test(styles) || !/(padding|margin|gap)\s*:/i.test(styles)) {
    return 'concept sets no background or no spacing — black text on white with default margins';
  }

  return null;
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
    'CRAFT. THIS IS THE LAST THING THEY SEE BEFORE DECIDING WHETHER TO PAY.',
    'A correct screen that looks unstyled undersells everything behind it. Default browser',
    'styling reads as "nobody designed this", and it is the single fastest way to lose a room.',
    '',
    '- Set font-family explicitly on the page. A system stack is fine; the browser default serif is not.',
    '- Use a real type scale: distinct sizes and weights for page title, section heading, body and label. Do not set everything to 16px bold.',
    '- Use consistent spacing on a rhythm (for example 4 / 8 / 16 / 24 / 32px). Uneven padding is the tell of an unconsidered layout.',
    '- Pick a restrained palette: one neutral for surfaces, one for text, and ONE accent. Do not use stock green and blue buttons.',
    '- Give tables real treatment: aligned columns, a quiet header, readable row separation, and tabular figures for numbers.',
    '- Status deserves design, not a coloured word: a quiet pill or a dot with a label. Never colour alone, since colour alone fails anyone who cannot see it.',
    '- Include at least one considered empty or attention state — the screen when nothing needs doing, or when something is stuck. That is where a real product shows its thinking.',
    '- Dates and figures should read as obviously illustrative. Prefer relative phrasing like "this morning" over a specific stale date.',
    '',
    'Design for an operator who has done this job for years. Density and clarity over decoration.',
    'Restraint is the point: this should look like a serious internal tool, not a marketing page.',
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
    craftViolation(html) ||
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

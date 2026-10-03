import { Brand } from '../../models';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { WorkflowError } from '../content/contentWorkflowService';
import { findInventedSpecifics } from '../content/composerDraftService';
import {
  landingPageContentSchema,
  landingPageSectionSchema,
  parseLandingPageContent,
  type LandingPageContentShape,
} from '../../schemas/landingPageContentSchema';

/**
 * landingPageDraftService — turn the prose someone actually sends you into a structured page.
 *
 * WHY. Ali's real input was a long content draft from Sohail, pasted into a chat, which came
 * back as a designed landing page. That loop works but leaves nothing behind: no tracking, no
 * brand record, no reviewable artefact, and a link we did not build. This does the same
 * transformation inside the platform, producing the `LandingPageContent` the phase-2 renderer
 * already serves, so the output is a real page at a real URL rather than an image.
 *
 * THE SAME RULE AS THE CANONICAL-MESSAGE DRAFTER, AND IT MATTERS MORE HERE. A social post is
 * read once; a landing page is the page a stranger is asked to hand over an email on. So: never
 * invent a specific. No date, price, duration, seat count, percentage, statistic or testimonial
 * unless it appears in the source text. Where the page needs one, the model writes a visible
 * `[placeholder]`, and `findInventedSpecifics` - the same second reader the composer uses -
 * re-reads the result and reports anything that slipped past. Nothing is silently removed: the
 * judgement stays with the person whose brand is on the page.
 *
 * TESTIMONIALS AND STATS ARE THE TWO DANGEROUS SECTIONS. A fabricated quote attributed to a
 * named person is a different category of harm from clumsy copy, and a `stats` item cannot even
 * be written without a `source` (the schema refuses it). The prompt therefore tells the model to
 * OMIT those sections entirely rather than produce a weaker version - which is the repo's
 * standing rule about a figure you cannot stand behind.
 *
 * IT RETURNS CONTENT, IT DOES NOT PUBLISH. The result is validated against the same schema the
 * public route parses, so content that would make a published page 404 can never be stored. One
 * repair attempt is made with the validation errors fed back, because a model that produced
 * nearly-right JSON usually fixes it when told exactly what was wrong - and after that it fails
 * loudly rather than persisting something unrenderable.
 */

const MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 60_000;

export interface LandingPageDraftRequest {
  /** The raw brief, in whatever shape it arrived - prose, bullets, a pasted email. */
  source: string;
  brandId: string;
  /** On a revision: what the operator wants changed, in their words. */
  feedback?: string | null;
  /** On a revision: the content they are reacting to. */
  previous?: LandingPageContentShape | null;
}

export interface LandingPageDraftResult {
  content: LandingPageContentShape;
  /** Bracketed holes someone must fill before this page is fit to publish. */
  placeholders: string[];
  /** Specifics the model produced that the source text does not support. Reported, not removed. */
  unverifiedClaims: string[];
  model: string;
  /** True when the first attempt failed validation and the repair attempt succeeded. */
  repaired: boolean;
  /**
   * Sections dropped because they would not validate, after both attempts failed. Empty on the
   * normal path. Non-empty means the page came back usable but incomplete, and the operator is
   * told which parts are missing rather than being handed a working page that quietly lost a
   * third of the brief.
   */
  droppedSections: string[];
}

/** `[like this]` — the visible hole the prompt asks for instead of an invented fact. */
function findPlaceholders(text: string): string[] {
  return Array.from(new Set((text.match(/\[[^\]\n]{2,60}\]/g) ?? []).map((s) => s.trim())));
}

/**
 * Every string on the page, flattened, so the placeholder and invented-specific readers see what
 * a visitor would see. Walks the parsed object rather than the raw JSON, so key names and
 * punctuation from the wire format cannot be mistaken for copy.
 */
export function visibleText(content: LandingPageContentShape): string {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') { out.push(value); return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        // `href` and `src` are machine fields, not copy; `type` is a discriminator.
        if (key === 'href' || key === 'src' || key === 'type' || key === 'style') continue;
        walk(v);
      }
    }
  };
  walk(content);
  return out.join('\n');
}

const SECTION_GUIDE = `Each section is an object with a "type". The allowed types, and their fields:

- {"type":"hero","headline":str,"subhead":str?,"audience":str?,"cta":{"label":str,"href":str}?,"image":{"src":str,"alt":str}?}
- {"type":"text","heading":str?,"paragraphs":[str,...]}
- {"type":"bullets","heading":str?,"items":[{"label":str,"detail":str?},...]}
- {"type":"stats","heading":str?,"items":[{"value":str,"label":str,"source":str},...]}
- {"type":"quote","heading":str?,"items":[{"quote":str,"attribution":str,"role":str?},...]}
- {"type":"details","heading":str?,"rows":[{"label":str,"value":str},...]}
- {"type":"faq","heading":str?,"items":[{"question":str,"answer":str},...]}
- {"type":"cta","headline":str,"body":str?,"cta":{"label":str,"href":str}}

No other type exists. No HTML in any string. Links must be an absolute https URL or a path starting with "/".`;

const SYSTEM = `You turn a marketing brief into the structure of a landing page for a company that teaches AI and data skills to working adults. You return JSON only.

Return an object: {"title":str?,"description":str?,"sections":[...]}
"title" is the browser and link-preview title. "description" is the link-preview description, one sentence.

${SECTION_GUIDE}

RULES, in order of importance:

1. NEVER invent a specific fact. No dates, times, prices, durations, seat counts, percentages, statistics, company names or testimonials unless they appear in the brief. Where the page needs one, write a bracketed placeholder, for example [start date] or [price]. A placeholder is always better than a plausible guess.
2. OMIT a section rather than weaken it. Include "stats" ONLY if the brief gives both the figure and where it came from, because every stat must carry a "source" naming that origin. Include "quote" ONLY if the brief contains a real quote with a real attribution. If either is missing, leave the section out entirely. Do not write "[source]" to satisfy the field.
3. Use the brief's own substance. Do not add benefits, modules, guarantees or audiences it does not mention.
4. Write like a person, not a brochure. No "unlock", "supercharge", "game-changing", "dive into", "transform your career", "in today's fast-paced world". No em-dashes anywhere.
5. Structure follows the brief. A typical order is hero, who it is for, the problem, what you get, proof, logistics, FAQ, close - but only include what the brief supports. Between 3 and 10 sections.
6. One CTA label, used consistently. If the brief names no destination, use "/apply" as the href so a human can correct it.
7. THE HEADLINE CARRIES A CONCRETE DETAIL FROM THE BRIEF. A hero headline that would fit any
   course on any subject is a failed headline. Take the most specific thing the brief actually
   gives you - a duration, a format, the artefact someone leaves with, who reviews it - and put it
   in the words. Never a rhetorical question.
   Weak, because it fits anything:  "Build Your First AI Project"
   Strong, because only this brief could produce it:  "Ship an AI project in six weeks, reviewed
   by a mentor"
   The same applies to every section heading: say the thing, do not label the box. "What you get"
   is a label; "A working project in your own repo" is the thing.
8. DO NOT PUT THE BRAND NAME IN THE TITLE. The page already displays it. A title of
   "Acme Training: Data Course for Analysts" wastes the only line that shows in a search result
   and a link preview. Use that line for the promise instead.`;

function userMessage(input: LandingPageDraftRequest, brandName: string): string {
  const parts = [`Brand: ${brandName}`, '', 'BRIEF:', input.source.trim()];
  if (input.previous && input.feedback) {
    parts.push(
      '',
      'You previously produced this page:',
      JSON.stringify(input.previous),
      '',
      'The operator wants these changes. Apply them and leave everything else alone:',
      input.feedback.trim(),
    );
  }
  return parts.join('\n');
}

/** Em-dashes are banned repo-wide in outbound copy, and a model reaches for them constantly. */
function stripEmDashes(content: LandingPageContentShape): LandingPageContentShape {
  const clean = (value: unknown): unknown => {
    if (typeof value === 'string') return value.replace(/\s*[—–]\s*/g, ', ');
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        // Leave machine fields alone: an en-dash is legal in a URL.
        k === 'href' || k === 'src' ? v : clean(v),
      ]));
    }
    return value;
  };
  return clean(content) as LandingPageContentShape;
}

export async function draftLandingPage(input: LandingPageDraftRequest): Promise<LandingPageDraftResult> {
  const source = input.source.trim();
  if (source.length < 40) {
    throw new WorkflowError(
      'Paste the brief you want the page built from - a sentence or two is not enough to work with.',
      400,
      'ValidationError',
    );
  }

  const brand = await Brand.findByPk(input.brandId);
  if (!brand) throw new WorkflowError('Brand not found', 404, 'NotFound');

  const client = getInstrumentedOpenAI(
    { workflow_id: 'landing_page_draft', prompt_version: 'landing-page-draft-v2' },
    { timeout: TIMEOUT_MS, maxRetries: 1 },
  );

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userMessage(input, brand.name) },
  ];

  const ask = async (): Promise<string> => {
    try {
      const res = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages,
      });
      return res.choices[0]?.message?.content?.trim() ?? '';
    } catch (err: any) {
      // The operator can always write the sections by hand; this failing must not be opaque.
      throw new WorkflowError(
        'The page could not be generated. Try again, or build the sections by hand.',
        502,
        err?.name === 'APIConnectionTimeoutError' ? 'TimeoutError' : 'DraftUnavailable',
      );
    }
  };

  /**
   * Parse the model's JSON. A syntax error is treated exactly like a schema failure.
   *
   * The parsed object is kept even when validation fails, so a document that is mostly right can
   * be salvaged section by section rather than thrown away whole.
   */
  type Attempt =
    | { ok: true; content: LandingPageContentShape; json: unknown }
    | { ok: false; problems: string[]; json: unknown };

  const attempt = (raw: string): Attempt => {
    if (raw === '') return { ok: false, problems: ['the model returned nothing'], json: null };
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, problems: ['the response was not valid JSON'], json: null };
    }
    const parsed = parseLandingPageContent(json);
    return parsed.ok ? { ok: true, content: parsed.content, json } : { ok: false, problems: parsed.problems, json };
  };

  const first = attempt(await ask());
  let result = first;
  let repaired = false;

  if (!first.ok) {
    // One repair pass, with the exact validation errors handed back. A model that produced
    // nearly-right JSON almost always fixes it when told precisely what was wrong; a second
    // repair has never been the difference between working and not, and would double the wait.
    messages.push({ role: 'assistant', content: '(the previous response was rejected)' });
    messages.push({
      role: 'user',
      content: [
        'That response did not validate. Fix exactly these problems and return the whole object again:',
        ...first.problems.map((p) => `- ${p}`),
        '',
        'Remember: only the section types listed are allowed, a "stats" item needs a "source",',
        'and a section you cannot fill correctly should be omitted rather than padded.',
      ].join('\n'),
    });
    result = attempt(await ask());
    repaired = result.ok;
  }

  /**
   * Salvage: keep the sections that ARE valid rather than throwing the page away.
   *
   * Both attempts failing used to be a dead end - a 502 and nothing to show for it, which is what
   * the first real brief in production hit. Usually only one section is wrong (a `stats` item with
   * no `source`, a `quote` with no attribution), and discarding the other seven helps nobody. So
   * each section is validated on its own, the good ones are kept, and the dropped ones are NAMED
   * in the result so the operator sees an incomplete page described as incomplete rather than a
   * complete-looking page that quietly lost part of the brief.
   *
   * Nothing is repaired or invented here - a section either validates untouched or it is dropped.
   */
  let droppedSections: string[] = [];
  if (!result.ok) {
    const salvaged = salvageSections(result.json);
    if (salvaged === null) {
      throw new WorkflowError(
        `The generated page did not match the page format, twice, and no part of it could be used. ${result.problems.slice(0, 3).join('; ')}`,
        502,
        'DraftUnavailable',
      );
    }
    result = { ok: true, content: salvaged.content, json: result.json };
    droppedSections = salvaged.dropped;
  }

  const content = stripEmDashes(result.content);
  const text = visibleText(content);

  return {
    content,
    placeholders: findPlaceholders(text),
    // The source brief plus the brand name is the whole of what this page is allowed to assert.
    unverifiedClaims: findInventedSpecifics(text, `${source} ${brand.name}`),
    model: MODEL,
    repaired,
    droppedSections,
  };
}

/**
 * Keep whichever sections validate on their own.
 *
 * Returns null when nothing usable survives - a page with no sections cannot be stored (the
 * schema requires at least one) and would fail at publish time anyway, so that is still an error.
 */
function salvageSections(json: unknown): { content: LandingPageContentShape; dropped: string[] } | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as { title?: unknown; description?: unknown; socialImage?: unknown; sections?: unknown };
  if (!Array.isArray(raw.sections)) return null;

  const kept: unknown[] = [];
  const dropped: string[] = [];
  raw.sections.forEach((section, i) => {
    const parsed = landingPageSectionSchema.safeParse(section);
    if (parsed.success) {
      kept.push(section);
      return;
    }
    const type = (section && typeof section === 'object' && 'type' in section)
      ? String((section as { type: unknown }).type)
      : 'unknown';
    // Named by type and position, with the first reason - enough for an operator to decide
    // whether to re-run with a clearer brief or write the section by hand.
    dropped.push(`${type} (section ${i + 1}): ${parsed.error.issues[0]?.message ?? 'did not validate'}`);
  });

  if (kept.length === 0) return null;

  // Re-validate the whole document: the title, description and social image have to survive too,
  // and dropping those is better than returning something the public route would refuse.
  for (const candidate of [
    { title: raw.title, description: raw.description, socialImage: raw.socialImage, sections: kept },
    { sections: kept },
  ]) {
    const parsed = landingPageContentSchema.safeParse(candidate);
    if (parsed.success) return { content: parsed.data, dropped };
  }
  return null;
}

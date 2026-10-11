import { Brand } from '../../models';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { WorkflowError } from '../content/contentWorkflowService';
import { findInventedSpecifics } from '../content/composerDraftService';
import {
  landingPageContentSchema,
  landingPageSectionSchema,
  parseLandingPageContent,
  withoutNulls,
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

/**
 * The page's CONTENT model. Raised from gpt-4o-mini on 2026-10-08 at Ali's request, after
 * reading a generated page: "the landing page quality is just not as good as I want ... switch
 * to a different ChatGPT model that is better with design just for this change and no where
 * else". Scoped deliberately to this one service - every other caller in the repo keeps the
 * model it had.
 *
 * WHAT THIS CAN AND CANNOT FIX. The model writes CONTENT ONLY: a JSON document validated by
 * landingPageContentSchema. Every pixel - the bands, the type scale, the colours, the layout -
 * comes from landingPageRenderer.ts, which is deterministic TypeScript. So a stronger model
 * buys better words, sharper section choices and better use of the shapes the schema offers,
 * and CANNOT change how the page looks. Visual quality is a renderer change, not this line.
 */
const MODEL = 'gpt-4o';
const TIMEOUT_MS = 60_000;

export interface LandingPageDraftRequest {
  /** The raw brief, in whatever shape it arrived - prose, bullets, a pasted email. */
  source: string;
  brandId: string;
  /** On a revision: what the operator wants changed, in their words. */
  feedback?: string | null;
  /**
   * Where the buttons go, when the operator knows.
   *
   * Rule 6 refuses to invent a destination - "/apply" was once the instruction and it shipped a
   * live page whose only button 404'd. The rule is right, so the fix is not to loosen it but to
   * supply the fact: given this, the model may put real buttons on the page; absent it, the page
   * ships without them, which is the honest outcome.
   */
  ctaUrl?: string | null;
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

/**
 * Every field the schema has, and when to reach for it.
 *
 * WHY THIS IS LONGER THAN IT LOOKS IT SHOULD BE. The guide used to list a subset - no `eyebrow`,
 * no `headlineAccent`, no `tone`, no `variant`, no `kicker` - and ended with "Omit any field not
 * listed above". So the model was explicitly forbidden from using the exact fields that make a
 * page look designed, and every page came out as grey and white bands with every list drawn as
 * cards. The renderer supported all of it the whole time. Found 2026-10-09 by running the real
 * renderer over the same content with and without these fields.
 *
 * The lesson is the ordering: the prompt is the schema's consumer, so a field added to the
 * schema and not added here is a field that does not exist in practice.
 * `landingPagePromptCoverage.test.ts` fails when the two drift.
 */
const SECTION_GUIDE = `Each section is an object with a "type". The allowed types, and their fields:

- {"type":"hero","eyebrow":str?,"tone":str?,"headline":str,"headlineAccent":str?,"subhead":str?,"audience":str?,"cta":{"label":str,"href":str}?,"panel":{"title":str,"items":[{"label":str,"note":str?}],"footnote":str?}?}
- {"type":"text","eyebrow":str?,"tone":str?,"heading":str?,"paragraphs":[str,...],"kicker":str?}
- {"type":"bullets","eyebrow":str?,"tone":str?,"heading":str?,"intro":str?,"variant":"cards"|"checks"|"steps"?,"items":[{"label":str,"detail":str?},...]}
- {"type":"stats","eyebrow":str?,"tone":str?,"heading":str?,"items":[{"value":str,"label":str,"source":str},...]}
- {"type":"quote","eyebrow":str?,"tone":str?,"heading":str?,"items":[{"quote":str,"attribution":str,"role":str?},...]}
- {"type":"details","eyebrow":str?,"tone":str?,"heading":str?,"rows":[{"label":str,"value":str},...]}
- {"type":"faq","eyebrow":str?,"tone":str?,"heading":str?,"items":[{"question":str,"answer":str},...]}
- {"type":"cta","eyebrow":str?,"tone":str?,"headline":str,"body":str?,"cta":{"label":str,"href":str}}

HOW TO USE THE FIELDS THAT CONTROL HOW THE PAGE LOOKS. A page that sets none of these renders as
a stack of grey and white bands with every list as identical cards, which reads as a document
rather than as a page somebody designed. Use them.

"eyebrow" - two or three words in small caps above the heading, naming what the section is:
  WHY START NOW, WHAT YOU WILL LEARN, WHO THIS IS FOR, WHAT HAPPENS AFTER YOU SIGN UP. Put one on
  most sections. It is the single cheapest thing that makes a page look structured.

"headlineAccent" - a phrase COPIED EXACTLY from inside "headline", painted in the brand colour.
  Pick the two or three words carrying the promise. It is ignored unless it is a real substring,
  so copy it character for character. Example: headline "AI is no longer just a future skill"
  with headlineAccent "future skill".

"tone" - the band a section paints on: "default", "subtle", "inverse" (dark) or "accent" (brand
  colour). Leave it off and the page alternates sensibly on its own. Set "inverse" ONCE, on the
  section making the strongest argument, so the page has a dark band that holds the eye. A final
  "cta" section already takes the brand colour; do not also mark it "accent".

"variant" on bullets - how the list is drawn, and the most visible choice you make:
    "checks"  a ticked qualifying list. Use for "this is for you if" and for what is included.
    "steps"   numbered. Use ONLY for an actual sequence, where the order carries meaning.
    "cards"   a grid. Use for topics or capabilities that have no order.
  Choosing "cards" for everything is what makes a page monotonous. A page with three bullet
  sections should usually use more than one variant.

"intro" on bullets - a line of prose between the heading and the items, when the list needs
  setting up.

"kicker" on text - one short emphasised line after the paragraphs, in the brand colour. The beat
  a section lands on: "You just need a place to start."

"panel" on hero - a contents card beside the headline. See the panel rule below.

No other type exists. No HTML in any string. Links must be an absolute https URL or a path
starting with "/".

NEVER emit an image. There is no "image" field for you to fill and no way for you to know a URL
that exists, so any you wrote would be a guess that renders as a broken picture on a live page.
A human adds images afterwards. Omit any field not listed above rather than sending it as null.`;

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
6. One CTA label, used consistently. A destination is a FACT, so rule 1 applies to it. When a
   BUTTON DESTINATION is given below, use it for every button - a hero button and a closing
   one at minimum, because a page with nothing to click is a page that cannot convert. If the
   brief does not say where the button goes, omit the "cta" object entirely and let a human add
   it. Never invent a path. "/apply" was the old instruction here and it shipped a live page
   whose only button 404'd, which is worse than a page with no button on it.
6b. THE HERO PANEL IS A CONTENTS LIST, AND ONLY WHEN THE BRIEF HAS ONE. Use "panel" when the
   brief actually enumerates what is inside - modules, sessions, what is covered, what is
   included. 2 to 8 rows, each a short label; "note" is a marker like "Module 1" or "Week 2".
   NEVER a status: no "Complete", no "In progress", no percentage. The reader has done none of
   it, and the page must not imply otherwise. If the brief lists nothing, omit "panel" entirely
   rather than inventing rows to fill the space - an invented curriculum is the worst thing on
   this page, because it reads as a promise.

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
   and a link preview.
9. THE TITLE AND THE HERO HEADLINE ARE DIFFERENT SENTENCES, because they are read by different
   people in different places. The title is read by someone who has NOT seen the page - in a
   search result or a shared link - so it names the thing plainly: the format, and who it is for.
   The hero headline is read by someone who has just arrived, so it makes the promise. Never
   return the same sentence for both.
   For the six-week cohort brief above, a good pair is:
     title: "Six-week AI project cohort for working data analysts"
     hero : "Ship an AI project in six weeks, reviewed by a mentor"
   The title says what it IS. The headline says what you GET.`;

function userMessage(input: LandingPageDraftRequest, brandName: string): string {
  const parts = [`Brand: ${brandName}`, '', 'BRIEF:', input.source.trim()];
  const cta = (input.ctaUrl ?? '').trim();
  if (cta) {
    parts.push('', `BUTTON DESTINATION: ${cta}`,
      'This is where every button on this page goes. It is a fact from the operator, so rule 6 is',
      'satisfied: put a button in the hero and one in the closing section, both using this href.');
  }
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
    { workflow_id: 'landing_page_draft', prompt_version: 'landing-page-draft-v4' },
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
  raw.sections.forEach((rawSection, i) => {
    // A model writes `"intro": null` where it means "nothing here", and zod reads that as a type
    // error rather than as absence - so a section lost its whole list over one empty field.
    const section = withoutNulls(rawSection);
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

import { z } from 'zod';

/**
 * What a hosted landing page is made of.
 *
 * WHY A CLOSED SCHEMA. Phase 1 gave `landing_pages.content` the type
 * `{ sections?: Array<Record<string, unknown>> }` - deliberately loose, because nothing rendered
 * it yet. Now something does, and a renderer over `Record<string, unknown>` has to guess: an
 * unknown section either disappears silently or crashes the page. Both are worse than refusing
 * the write. So the shape is closed here, at the boundary, and the renderer below it is
 * exhaustive over the union - a ninth section type fails the build rather than rendering nothing.
 *
 * NO HTML, ANYWHERE. Every string in here is text, and the renderer escapes all of it. This is
 * the whole reason `content` is JSONB and not a `body_html` column: a landing-page builder that
 * accepts markup is an authenticated-user XSS on our own origin, and these pages are served from
 * the same hostname as the admin app. The one place a URL is allowed (`href`, `src`) is validated
 * against an http/https allowlist, because `javascript:` in an anchor is the same bug wearing a
 * different hat.
 *
 * SOHAIL'S DRAFT IS THE SHAPE. The section list is not invented - it is what the real input
 * Ali pasted on 2026-10-01 actually contained: a hero with one promise, who it is for, the
 * problem, what you get, proof, logistics, an FAQ, and a close. Anything that draft did not
 * need is not here.
 */

/** http/https only. `javascript:`, `data:` and protocol-relative `//evil.com` are all refused. */
const safeUrl = z.string().trim().min(1).max(2000).refine((raw) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    // A site-relative path is fine and common ("/apply"). A protocol-relative one is not.
    return raw.startsWith('/') && !raw.startsWith('//');
  }
}, { message: 'Links must be http(s) or a site-relative path starting with "/".' });

const text = (max: number) => z.string().trim().min(1).max(max);

/** A button. `label` is what it says; `href` is where it goes. */
const cta = z.object({
  label: text(80),
  href: safeUrl,
  /** Secondary buttons render quieter. Absent means primary. */
  style: z.enum(['primary', 'secondary']).optional(),
});

/**
 * The small uppercase label above a heading ("WHY START NOW?", "WHAT YOU'LL LEARN").
 *
 * This is not decoration invented by the renderer. A real brief already carries it: Sohail's
 * 2026-10-05 draft headed every block with BOTH a section label and a headline ("Section 3:
 * What You'll Learn" / "Learn AI Beyond Basic Prompts"). The schema had nowhere to put the
 * first, so the generator discarded half of each heading and the page lost its navigation.
 */
const eyebrow = text(60).optional();

/**
 * Which band a section paints on. The renderer alternates these so a long page reads as
 * chapters rather than one undifferentiated column.
 *
 * `inverse` is the dark band, `accent` the brand-coloured one - both carry their own
 * foreground colours, so contrast is a property of the tone rather than something each
 * section has to get right.
 */
/** `cool` is the pale blue-grey band the "ready to go further" step sits on. */
const tone = z.enum(['default', 'subtle', 'inverse', 'accent', 'cool']).optional();

/**
 * A one-line takeaway strip under a list, with up to three phrases painted in brand colours.
 *
 * Highlights are EXACT SUBSTRINGS of `text`, matched the same way `headlineAccent` is: a phrase
 * that is not found is ignored rather than appended, so a near-miss loses the emphasis and can
 * never corrupt the sentence or inject markup.
 */
const callout = z.object({
  lead: text(120).optional(),
  text: text(300),
  highlights: z.array(z.object({
    phrase: text(80),
    color: z.enum(['accent', 'accent-2', 'accent-3']),
  })).max(3).optional(),
  /** `success` is the pale green strip; absent is the plain bordered one. */
  tone: z.enum(['plain', 'success']).optional(),
}).optional();

/** A small supporting card beside a text section: "in the full program, learners...". */
const aside = z.object({
  title: text(80),
  items: z.array(text(160)).min(2).max(6),
}).optional();

/**
 * Today versus what is possible: a card of chips, then the result.
 *
 * The shape of the reference page's "what most people do with AI today" block. Only use it when
 * the brief actually draws that contrast - it asserts a claim about what most people do.
 */
const contrast = z.object({
  title: text(120),
  chips: z.array(text(60)).min(2).max(6),
  caption: text(120).optional(),
  resultEyebrow: text(40).optional(),
  resultLine: text(200),
}).optional();

/**
 * The closed icon set a card may carry. An ENUM rather than free text on purpose: a
 * model-supplied name would be a guess that renders as nothing, and a model-supplied SVG would
 * be markup from a language model on a public page.
 */
const iconName = z.enum([
  'bulb', 'chat', 'briefcase', 'search', 'document', 'flow',
  'wrench', 'trend', 'check', 'clock', 'layers', 'rocket',
]).optional();

const heroSection = z.object({
  type: z.literal('hero'),
  eyebrow,
  tone,
  /** One promise. Not a slogan and not a paragraph. */
  headline: text(160),
  /**
   * A phrase INSIDE `headline` to paint in the brand accent. Rendered only when it really is a
   * substring; anything else is ignored rather than appended, so a mismatch loses the emphasis
   * and never corrupts the sentence.
   */
  headlineAccent: text(160).optional(),
  subhead: text(400).optional(),
  /** The paragraph under the lead line. Longer and quieter than `subhead`. */
  body: text(600).optional(),
  /** One short emphasised line before the button: "No pressure. No confusion." */
  kicker: text(200).optional(),
  /** The reassurance under the button. Never a claim - it restates what pressing it does. */
  ctaNote: text(200).optional(),
  /** "Who this is for" - the line that disqualifies the wrong reader early. */
  audience: text(240).optional(),
  cta: cta.optional(),
  image: z.object({ src: safeUrl, alt: text(300) }).optional(),
  /**
   * A card beside the headline, listing what the thing CONTAINS.
   *
   * The shape Ali's reference page opens with, and the one thing the hero could not express:
   * a hero with only a headline and a button leaves half the fold empty at desktop width.
   *
   * DELIBERATELY NOT A PROGRESS CARD. The reference shows modules ticked off with "2 of 9
   * complete" and "In progress". On a page generated for a visitor who has done nothing, those
   * are claims about that visitor which are not true - and inventing is the one thing this
   * pipeline refuses to do. So the rows say what is inside, and `note` is a label like
   * "Module 1", never a state like "Complete".
   *
   * At most 8, because this sits beside a headline: a ninth row pushes the fold past the CTA.
   */
  panel: z.object({
    /** Small label above the panel title. */
    eyebrow: text(60).optional(),
    /** A short qualifier shown top-right, only when the brief states it. */
    badge: text(20).optional(),
    title: text(120),
    items: z.array(z.object({
      label: text(160),
      /** A short marker beside the row. Not a status. */
      note: text(60).optional(),
    })).min(2).max(8),
    footnote: text(160).optional(),
  }).optional(),
});

const richTextSection = z.object({
  type: z.literal('text'),
  eyebrow,
  tone,
  heading: text(160).optional(),
  /** Paragraphs as separate strings, so the renderer never has to interpret newlines as markup. */
  paragraphs: z.array(text(2000)).min(1).max(20),
  /** A single emphasised line under the paragraphs - the "You just need a place to start." beat. */
  kicker: text(300).optional(),
  /** A phrase inside `heading` painted in the accent. Exact substring, like headlineAccent. */
  headingAccent: text(160).optional(),
  /** Phrases inside the paragraphs to set bold in the tertiary colour. Exact substrings. */
  emphasis: z.array(text(120)).max(4).optional(),
  cta: cta.optional(),
  callout,
  aside,
  contrast,
});

const bulletsSection = z.object({
  type: z.literal('bullets'),
  eyebrow,
  tone,
  heading: text(160).optional(),
  /** A line of prose between the heading and the items. */
  intro: text(600).optional(),
  /**
   * How the items are drawn. `checks` for a qualifying list ("this is for you if"), `steps` for
   * an ordered sequence, `cards` for a capability grid. Absent means `cards`, which is the
   * layout that reads well whether or not the items carry a `detail`.
   */
  /** A phrase inside `heading` painted in the accent. Exact substring, like headlineAccent. */
  headingAccent: text(160).optional(),
  /** The emphasised beat under the intro, in the split head. */
  kicker: text(300).optional(),
  /** A small bold label directly above the items: "This platform is for you if:". */
  itemsLabel: text(120).optional(),
  /** Prose beside the heading, when the section argues before it lists. */
  paragraphs: z.array(text(2000)).max(6).optional(),
  cta: cta.optional(),
  callout,
  /**
   * How the items are drawn. `grid` is the bordered table-like block for 6+ ordered items;
   * `steps` stays the separate-card sequence for 3 to 5.
   */
  variant: z.enum(['cards', 'checks', 'steps', 'grid']).optional(),
  items: z.array(z.object({
    label: text(200),
    detail: text(600).optional(),
    icon: iconName,
  })).min(1).max(30),
});

/** The numbers. Each one needs a source, because an unsourced outcome claim is the thing we refuse to publish. */
const statsSection = z.object({
  type: z.literal('stats'),
  eyebrow,
  tone,
  heading: text(160).optional(),
  items: z.array(z.object({
    value: text(40),
    label: text(160),
    /** Where the figure comes from. Required: see the header. */
    source: text(300),
  })).min(1).max(8),
});

const quoteSection = z.object({
  type: z.literal('quote'),
  eyebrow,
  tone,
  heading: text(160).optional(),
  items: z.array(z.object({
    quote: text(1200),
    attribution: text(200),
    role: text(200).optional(),
  })).min(1).max(12),
});

/** Dates, price, format, location - the practical block a reader scans before deciding. */
const detailsSection = z.object({
  type: z.literal('details'),
  eyebrow,
  tone,
  heading: text(160).optional(),
  rows: z.array(z.object({ label: text(120), value: text(400) })).min(1).max(20),
});

const faqSection = z.object({
  type: z.literal('faq'),
  eyebrow,
  tone,
  heading: text(160).optional(),
  items: z.array(z.object({ question: text(300), answer: text(2000) })).min(1).max(30),
});

const ctaSection = z.object({
  type: z.literal('cta'),
  eyebrow,
  tone,
  headline: text(200),
  /** The bold line between headline and body. */
  subhead: text(300).optional(),
  body: text(800).optional(),
  cta,
  ctaNote: text(200).optional(),
});

export const landingPageSectionSchema = z.discriminatedUnion('type', [
  heroSection, richTextSection, bulletsSection, statsSection,
  quoteSection, detailsSection, faqSection, ctaSection,
]);

export const landingPageContentSchema = z.object({
  /** The <title> and the OG title. Falls back to the hero headline when absent. */
  title: text(200).optional(),
  /** The meta description and OG description. */
  description: text(400).optional(),
  /** OG image for the link preview a social post will render. */
  socialImage: z.object({ src: safeUrl, alt: text(300) }).optional(),
  /** The line beside the logo in the footer. */
  footerNote: text(160).optional(),
  sections: z.array(landingPageSectionSchema).min(1).max(40),
});

export type LandingPageSection = z.infer<typeof landingPageSectionSchema>;
export type LandingPageContentShape = z.infer<typeof landingPageContentSchema>;
export type LandingPageSectionType = LandingPageSection['type'];

/**
 * Is this row renderable? A published page whose content does not parse is a blank public URL,
 * so the answer has to be known before anything is served, not discovered mid-render.
 */
/**
 * Drop every null before validating.
 *
 * `z.optional()` accepts a MISSING key but refuses an explicit `null` - they are different things
 * to zod and the same thing to a language model. A generated section carrying `"intro": null`
 * failed with "Invalid input: expected string, received null" and the whole section was thrown
 * away, which is how Ali's page lost two of its bullet lists on 2026-10-07 while the copy that
 * mattered was sitting right there in the payload.
 *
 * Dropping the key is the correct reading rather than a lenient one: `null` here means "I had
 * nothing for this field", which is exactly what absence means. Nothing else is coerced - a
 * number stays a number and still fails, because that really is a malformed section.
 */
function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (inner === null) continue;
      out[key] = dropNulls(inner);
    }
    return out;
  }
  return value;
}

/** Exported for the generator, which validates section-by-section before this runs. */
export function withoutNulls(raw: unknown): unknown {
  return dropNulls(raw);
}

export function parseLandingPageContent(
  raw: unknown,
): { ok: true; content: LandingPageContentShape } | { ok: false; problems: string[] } {
  raw = dropNulls(raw);
  const parsed = landingPageContentSchema.safeParse(raw);
  if (parsed.success) return { ok: true, content: parsed.data };
  // Zod 4: `issues`, not `errors`.
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

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
const tone = z.enum(['default', 'subtle', 'inverse', 'accent']).optional();

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
  /** "Who this is for" - the line that disqualifies the wrong reader early. */
  audience: text(240).optional(),
  cta: cta.optional(),
  image: z.object({ src: safeUrl, alt: text(300) }).optional(),
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
  variant: z.enum(['cards', 'checks', 'steps']).optional(),
  items: z.array(z.object({
    label: text(200),
    detail: text(600).optional(),
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
  body: text(800).optional(),
  cta,
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
  sections: z.array(landingPageSectionSchema).min(1).max(40),
});

export type LandingPageSection = z.infer<typeof landingPageSectionSchema>;
export type LandingPageContentShape = z.infer<typeof landingPageContentSchema>;
export type LandingPageSectionType = LandingPageSection['type'];

/**
 * Is this row renderable? A published page whose content does not parse is a blank public URL,
 * so the answer has to be known before anything is served, not discovered mid-render.
 */
export function parseLandingPageContent(
  raw: unknown,
): { ok: true; content: LandingPageContentShape } | { ok: false; problems: string[] } {
  const parsed = landingPageContentSchema.safeParse(raw);
  if (parsed.success) return { ok: true, content: parsed.data };
  // Zod 4: `issues`, not `errors`.
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

import { z } from 'zod';

/**
 * The recap's visual overview (WL1.2, WL1.3): what the class covered, as a small structured object that
 * both the recap page and the email render. Ali edits it in the Studio recap panel before sending.
 */
export const RecapSummarySchema = z.object({
  headline: z.string().min(3).max(120),
  intro: z.string().max(400).default(''),
  ideas: z.array(z.object({
    icon: z.string().max(8).default(''),
    title: z.string().min(2).max(80),
    text: z.string().max(240).default(''),
  })).min(1).max(5),
  steps: z.array(z.string().min(2).max(160)).max(6).default([]),
  quote: z.string().max(200).default(''),
  homework: z.string().max(280).default(''),
});
export type RecapSummary = z.infer<typeof RecapSummarySchema>;

export const NextEventUrlSchema = z.string().url().max(500).refine((u) => u.startsWith('https://'), 'must be an https link');

/** A safe default when nothing was drafted yet: the class title and one idea to edit. */
export function defaultSummary(title: string): RecapSummary {
  return {
    headline: title.slice(0, 120) || 'Your class recap',
    intro: 'Thank you for joining the class. Here is what we covered, and your link back to the class page.',
    ideas: [{ icon: '', title: 'Edit this idea in Studio setup before sending', text: '' }],
    steps: [],
    quote: '',
    homework: '',
  };
}

/** Text of the class deck, for drafting the overview: tags, scripts and styles removed, capped. */
export function deckText(kitConfig: unknown, cap = 12000): string {
  const html = (kitConfig as { customDeck?: { html?: string } } | null)?.customDeck?.html;
  if (typeof html !== 'string') return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, cap);
}

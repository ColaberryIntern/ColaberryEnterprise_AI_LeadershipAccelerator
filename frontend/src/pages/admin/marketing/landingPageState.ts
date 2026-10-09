import type { LandingPage } from '../../../services/landingPageApi';

/**
 * What a landing page's state means, and what may be done to it.
 *
 * Pure, so the rules an operator argues with - "why can't I publish this?", "what is this row?" -
 * are decided from plain data and tested without mounting anything. Same shape as
 * `landingPageChoices` and `setupShape`, for the same reason.
 */

export interface PageActions {
  canPublish: boolean;
  canUnpublish: boolean;
  canRevise: boolean;
  /** Why publishing is unavailable, in words. Null when it is available. */
  publishBlocker: string | null;
}

/** A slug is lower-case letters, numbers and dashes, and cannot start with one. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,159}$/;

export function slugProblem(slug: string): string | null {
  const trimmed = slug.trim();
  if (trimmed === '') return 'Give the page a slug; the URL cannot be built without one.';
  if (!SLUG_PATTERN.test(trimmed)) {
    return 'Lower-case letters, numbers and dashes only, and it cannot start with a dash.';
  }
  return null;
}

/**
 * Turn a name into a usable slug suggestion.
 *
 * A suggestion, not a rule: the slug is in the public URL and outlives the name, so the operator
 * gets the final say. Offering nothing at all just means everyone types the same transformation
 * by hand.
 */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
    .replace(/-+$/, '');
}

export function pageActions(page: LandingPage | null, slugDraft: string): PageActions {
  if (!page) {
    return { canPublish: false, canUnpublish: false, canRevise: false, publishBlocker: null };
  }
  // A legacy path registry row is not a page this platform built, so none of this applies.
  if (page.kind !== 'hosted') {
    return {
      canPublish: false, canUnpublish: false, canRevise: false,
      publishBlocker: 'This is an external path, not a page built here. It cannot be edited or published.',
    };
  }
  if (page.status === 'published') {
    return { canPublish: false, canUnpublish: true, canRevise: true, publishBlocker: null };
  }

  const slug = slugDraft.trim() || page.slug || '';
  const problem = slugProblem(slug);
  return {
    canPublish: problem === null,
    canUnpublish: false,
    canRevise: true,
    publishBlocker: problem,
  };
}

/** The badge next to a row. */
export function statusLabel(page: LandingPage): { text: string; tone: 'success' | 'secondary' | 'warning' | 'info' } {
  if (page.kind !== 'hosted') return { text: 'External path', tone: 'info' };
  if (page.status === 'published') return { text: 'Live', tone: 'success' };
  if (page.status === 'archived') return { text: 'Archived', tone: 'warning' };
  return { text: 'Draft', tone: 'secondary' };
}

/**
 * The public URL of a page, or null when it does not have one yet.
 *
 * Read from `path`, which the backend keeps in step with the slug, rather than rebuilt here from
 * a brand slug this screen may not have loaded.
 */
export function publicUrl(page: LandingPage): string | null {
  if (page.kind !== 'hosted' || page.status !== 'published' || !page.path) return null;
  return page.path;
}

/**
 * What to say about a generated draft before anyone publishes it.
 *
 * Placeholders and unsupported claims are different problems and get different sentences: a
 * placeholder is a hole the operator must fill, an unsupported claim is something the model
 * asserted that the brief does not support. Collapsing them into one "issues" count would hide
 * which kind you have.
 */
export function draftWarnings(
  draft: { placeholders: string[]; unverifiedClaims: string[]; droppedSections?: string[] } | null,
): string[] {
  if (!draft) return [];
  const out: string[] = [];
  // First, because it means the page is missing something the brief asked for - a louder problem
  // than a hole to fill or a claim to check.
  if (draft.droppedSections && draft.droppedSections.length > 0) {
    out.push(
      `Some of the brief could not be turned into a section and was left out: ${draft.droppedSections.join('; ')}. Re-run with a clearer brief, or add those parts by hand.`,
    );
  }
  if (draft.placeholders.length > 0) {
    out.push(`Fill these in before publishing: ${draft.placeholders.join(', ')}.`);
  }
  if (draft.unverifiedClaims.length > 0) {
    out.push(
      `The brief does not support these, so check or remove them: ${draft.unverifiedClaims.join(', ')}.`,
    );
  }
  return out;
}

/** True when a brief is long enough for the server to accept it (it requires 40 characters). */
export function briefIsUsable(source: string): boolean {
  return source.trim().length >= 40;
}

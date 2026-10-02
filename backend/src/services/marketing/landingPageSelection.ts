import { env } from '../../config/env';
import { WorkflowError } from '../content/contentWorkflowService';

/**
 * Choosing a landing page as a post's destination.
 *
 * WHY THIS IS A SERVICE AND NOT TWO LINES IN A ROUTE. The rules are Ali's, they are not obvious,
 * and three callers need the same answer:
 *
 *   - "we should not be using landing page that wasn't built by this system" - so only a
 *     `hosted` page can be selected. The seventeen legacy `external_path` rows are paths on
 *     sites hosted elsewhere; pointing a tracked campaign at one means the click is counted and
 *     then the trail stops.
 *   - "of course linked to the brand and only shows for each brand" - so the page must belong to
 *     the SAME brand as the post. This is the check that matters most: nothing in the database
 *     stops a Training post pointing at an Enterprise page, and a picker is exactly the UI that
 *     would make it a single mis-click.
 *   - A draft cannot be a destination. Scheduling a post at a page that is not published yet
 *     means the post goes out pointing at a 404.
 *
 * THE URL IS DERIVED, NEVER STORED TWICE. `content_items.landing_page_id` is the fact;
 * `/p/:brandSlug/:slug` is computed from it. Storing the URL alongside the id would be two
 * sources of truth that disagree the moment a slug is edited.
 *
 * ABSOLUTE, BECAUSE A TRACKED LINK NEEDS IT. `generateItemLinks` re-validates its destination
 * against the brand-domain allowlist, which only works on an absolute URL - and the whole point
 * of selecting a page is that the click is tracked.
 */

export interface SelectableBrand {
  id: string;
  slug: string;
}

export interface SelectablePage {
  id: string;
  brand_id: string | null;
  slug: string | null;
  kind: string;
  status: string;
}

/** The public path of a hosted page. Relative - see `absoluteLandingPageUrl` for the tracked form. */
export function landingPagePath(brandSlug: string, pageSlug: string): string {
  return `/p/${brandSlug}/${pageSlug}`;
}

/**
 * The absolute URL a tracked link can point at.
 *
 * `env.publicAppUrl` is the same origin the short link itself is minted on, so a landing page
 * and the `/r/:shortCode` that leads to it are always on one host.
 */
export function absoluteLandingPageUrl(brandSlug: string, pageSlug: string): string {
  const origin = String(env.publicAppUrl ?? '').replace(/\/+$/, '');
  return `${origin}${landingPagePath(brandSlug, pageSlug)}`;
}

/**
 * May this post point at this page? Throws a WorkflowError the operator can read, rather than
 * returning a boolean the caller has to turn into a message. Returns the page so a caller that
 * needs its slug does not have to re-narrow it.
 *
 * NOT an `asserts page is SelectablePage` signature, deliberately: TypeScript refuses to call an
 * assertion function through a name it cannot statically annotate, and the route reaches this
 * through `await import(...)`. Returning the page gives the same safety without that constraint.
 */
export function assertSelectable(page: SelectablePage | null, brand: SelectableBrand | null): SelectablePage {
  if (!page) {
    throw new WorkflowError('That landing page does not exist.', 404, 'NotFound');
  }
  if (page.kind !== 'hosted') {
    throw new WorkflowError(
      'That is an external path, not a page this platform built. Only pages built here can be tracked end to end.',
      409,
      'NotHosted',
    );
  }
  if (!brand || page.brand_id !== brand.id) {
    // Deliberately the same wording whichever way it fails: a post with no brand and a post
    // whose brand differs are the same mistake from the operator's side.
    throw new WorkflowError(
      'That landing page belongs to a different brand. A post can only point at its own brand\'s pages.',
      409,
      'WrongBrand',
    );
  }
  if (page.status !== 'published') {
    throw new WorkflowError(
      'That landing page is not published yet, so the post would go out pointing at a 404. Publish it first.',
      409,
      'NotPublished',
    );
  }
  if (!page.slug) {
    throw new WorkflowError('That landing page has no slug, so it has no URL yet.', 409, 'NoSlug');
  }
  return page;
}

export interface ItemDestination {
  url: string | null;
  /** How the destination was decided, for the confirmation screen to state plainly. */
  source: 'landing_page' | 'external_url' | 'none';
  landingPageId: string | null;
}

/**
 * Where a post sends people, as the confirmation screen should state it.
 *
 * A selected landing page wins over a typed URL. Both can be set - an operator can type a URL,
 * then pick a page - and silently preferring one without saying which is how a post goes out
 * pointing somewhere nobody chose. The `source` is returned so the UI can name it.
 */
export function itemDestination(
  item: { landing_page_id: string | null; destination_url: string | null },
  page: { slug: string | null } | null,
  brand: SelectableBrand | null,
): ItemDestination {
  if (item.landing_page_id && page?.slug && brand) {
    return {
      url: absoluteLandingPageUrl(brand.slug, page.slug),
      source: 'landing_page',
      landingPageId: item.landing_page_id,
    };
  }
  if (item.destination_url) {
    return { url: item.destination_url, source: 'external_url', landingPageId: null };
  }
  return { url: null, source: 'none', landingPageId: null };
}

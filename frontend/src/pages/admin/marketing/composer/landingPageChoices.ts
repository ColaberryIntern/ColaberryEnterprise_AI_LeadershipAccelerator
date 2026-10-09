/**
 * The landing-page picker's rules, as pure functions.
 *
 * WHY A MODULE AND NOT JSX. These are the questions an operator argues with - "why can't I pick
 * that page?", "why is this list empty?" - and they are decided from plain data so they can be
 * tested without mounting anything. Same shape as `channelChoices`, for the same reason.
 *
 * WHAT THE SERVER ALREADY REFUSES. The backend validates the selection too (same brand, hosted,
 * published), so this is not the security boundary - it is the part that stops the operator
 * reaching a refusal in the first place. A picker that offers a choice the server will reject is
 * a worse bug than one that offers nothing.
 */

export interface LandingPageOption {
  id: string;
  name: string;
  slug: string | null;
  kind: string;
  status: string;
  brand_id: string | null;
  path: string | null;
}

/** What the destination field is currently set to. */
export type DestinationMode = 'none' | 'page' | 'url';

export function destinationMode(values: { landing_page_id: string | null; destination_url: string }): DestinationMode {
  if (values.landing_page_id) return 'page';
  if (values.destination_url.trim() !== '') return 'url';
  return 'none';
}

/**
 * The pages this post may actually point at.
 *
 * Only `hosted` and `published`, and only this brand's - the three things the server enforces.
 * A draft is excluded even though it exists, because selecting one would mean scheduling a post
 * at a URL that 404s until someone remembers to publish the page.
 */
export function selectablePages(pages: readonly LandingPageOption[], brandId: string): LandingPageOption[] {
  if (!brandId) return [];
  return pages
    .filter((p) => p.brand_id === brandId && p.kind === 'hosted' && p.status === 'published' && p.slug)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Pages that exist for this brand but cannot be chosen yet, with the reason. */
export function unselectablePages(
  pages: readonly LandingPageOption[],
  brandId: string,
): Array<{ page: LandingPageOption; reason: string }> {
  if (!brandId) return [];
  return pages
    .filter((p) => p.brand_id === brandId && p.kind === 'hosted' && (p.status !== 'published' || !p.slug))
    .map((page) => ({
      page,
      reason: !page.slug
        ? 'has no URL yet'
        : page.status === 'draft'
          ? 'still a draft'
          : `is ${page.status}`,
    }));
}

/**
 * The line above the picker. Null when there is nothing worth saying - a note that appears
 * always is a note nobody reads.
 */
export function pickerNote(
  pages: readonly LandingPageOption[],
  brandId: string,
): string | null {
  if (!brandId) return 'Choose a brand first; landing pages belong to one.';

  const selectable = selectablePages(pages, brandId);
  const waiting = unselectablePages(pages, brandId);

  if (selectable.length === 0 && waiting.length === 0) {
    return 'This brand has no landing pages yet. Build one, or give this post a plain URL.';
  }
  if (selectable.length === 0) {
    const names = waiting.map((w) => `${w.page.name} (${w.reason})`).join(', ');
    return `No landing page is ready to point at yet: ${names}.`;
  }
  if (waiting.length > 0) {
    // Named, not counted. "1 page is not ready" sends the operator hunting for which.
    return `Not shown because they are not ready: ${waiting.map((w) => `${w.page.name} (${w.reason})`).join(', ')}.`;
  }
  return null;
}

/**
 * The warning under a typed URL.
 *
 * Ali's rule is "we should not be using landing page that wasn't built by this system" because
 * the tracking stops at the click. This is where that is said, at the moment someone is about to
 * do it - not as a blanket refusal, because an external destination is sometimes the right
 * answer (a partner's registration page is not ours to build).
 */
export function externalUrlNote(mode: DestinationMode): string | null {
  if (mode !== 'url') return null;
  return 'A URL we did not build is tracked as far as the click and no further: no page views, no scroll depth, no conversion on the page itself. Prefer a landing page built here when there is one.';
}

/** Whether tracked links can be generated at all. */
export function canGenerateLinks(values: { landing_page_id: string | null; destination_url: string }): boolean {
  return destinationMode(values) !== 'none';
}

/**
 * Keep the two destination fields mutually exclusive.
 *
 * They are separate columns and both can hold a value, so the UI has to decide which one the
 * operator meant. Picking a page clears the URL and vice versa, because a post with both set
 * would silently publish with the page (the server prefers it) while the operator looks at the
 * URL they typed.
 */
export function applyDestination<T extends { landing_page_id: string | null; destination_url: string }>(
  values: T,
  choice: { kind: 'page'; id: string } | { kind: 'url'; url: string } | { kind: 'none' },
): T {
  if (choice.kind === 'page') return { ...values, landing_page_id: choice.id, destination_url: '' };
  if (choice.kind === 'url') return { ...values, landing_page_id: null, destination_url: choice.url };
  return { ...values, landing_page_id: null, destination_url: '' };
}

/**
 * A selection that is no longer valid must not survive a brand change.
 *
 * The brand selector and the page list are independent, so switching brand leaves the previous
 * brand's page id sitting in the form - and the server would refuse it on save with a message
 * about a different brand, which reads as a bug rather than as the consequence of switching.
 * Returns the same object when nothing is dropped, so a React effect using this cannot loop.
 */
export function pruneDestination<T extends { landing_page_id: string | null; destination_url: string; brand_id: string }>(
  values: T,
  pages: readonly LandingPageOption[],
): T {
  if (!values.landing_page_id) return values;
  const stillValid = selectablePages(pages, values.brand_id).some((p) => p.id === values.landing_page_id);
  return stillValid ? values : { ...values, landing_page_id: null };
}

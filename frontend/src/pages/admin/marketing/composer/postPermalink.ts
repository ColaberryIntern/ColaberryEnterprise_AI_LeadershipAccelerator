/**
 * postPermalink - turn a stored receipt link into one that actually opens the post.
 *
 * WHY. Ali, 2026-10-08: "the Receipt gives an error. We need a way to get a link to the actual
 * post." His reel published fine - Facebook object 2167527427309056, status live - but the link
 * 404'd, because what we stored was `/reel/2167527427309056/`.
 *
 * META RETURNS A RELATIVE PATH FOR REELS. `permalink_url` on an ordinary Page post is absolute
 * (`https://www.facebook.com/...`), and the adapter stored whatever came back verbatim. For a
 * reel the same field is a bare path, so an `<a href>` resolved it against the admin's own
 * hostname and sent the operator to enterprise.colaberry.ai/reel/... - a page that does not
 * exist. The post was fine the whole time; only its address was.
 *
 * NORMALISED ON READ as well as on write, deliberately. Fixing the adapter alone leaves every
 * row already in `external_publications` broken, including the one Ali is looking at, and a
 * backfill to repair stored data is a bigger and riskier change than resolving a relative path
 * at the point it is rendered.
 *
 * A HOST IS NEVER GUESSED. Anything that is neither absolute nor a rooted path returns null, and
 * the caller shows the bare id instead. A link that might go somewhere else is worse than no
 * link: this one is clicked to confirm that something real was published.
 */

/** Where a rooted path belongs, per provider. */
const PROVIDER_HOSTS: Record<string, string> = {
  meta_facebook_page: 'https://www.facebook.com',
  meta_instagram: 'https://www.instagram.com',
  linkedin: 'https://www.linkedin.com',
  linkedin_organization: 'https://www.linkedin.com',
};

export function postPermalink(permalink: string | null | undefined, provider: string): string | null {
  const raw = (permalink ?? '').trim();
  if (!raw) return null;

  // Already a full URL. Only http(s) - a stored `javascript:` or `data:` must never become an
  // href, and this value has round-tripped through a database.
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;

  // A rooted path, which is what Meta returns for a reel.
  if (raw.startsWith('/')) {
    const host = PROVIDER_HOSTS[provider];
    return host ? `${host}${raw}` : null;
  }

  // Anything else - a bare id, a fragment - is not an address, and guessing one would invent it.
  return null;
}

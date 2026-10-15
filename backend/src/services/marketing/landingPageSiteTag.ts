/**
 * Which analytics property a hosted landing page reports into.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. The renderer emits the tracker only when the row has a
 * `site_slug`; without one it writes `<!-- tracking omitted -->` and the page records nothing.
 * So a null here is not a missing label, it is a page that cannot be measured - and the create
 * route defaulted to null (`site_slug: parsed.data.site_slug ?? null`) while no screen ever sent
 * one. Every hosted page built through the product was therefore born untracked. Three of the
 * four existing ones are, and the only page with traffic is the one where somebody set it by hand.
 *
 * ── THE RULE IS DERIVED FROM THE DATA, NOT INVENTED ──
 *
 * On 2026-10-15 the estate's `visitor_sessions` carried ten site slugs - worldoftaxonomy,
 * colaberry, ai-flotation, enterprise, advisor, cpn, trustbeforeintelligence, refactored,
 * training, unknown - and `brands` carried eight slugs. Every brand slug matches a live site slug
 * exactly, except the two that carry a `colaberry-` prefix the property does not:
 *
 *     colaberry-training    -> training      (28 sessions, and the one landing page that works)
 *     colaberry-enterprise  -> enterprise    (680 sessions)
 *
 * So: strip a leading `colaberry-`, and the brand's own slug is the property. That was checked
 * against all eight brands before it was written down, which is the difference between a rule and
 * a guess. `colaberry-training -> training` is also confirmed by the only hosted page that has
 * ever recorded a visit.
 *
 * NO FALLBACK TO A MADE-UP VALUE. An unknown brand returns null and the page stays honestly
 * unmeasurable, rather than reporting into a property that does not exist - which would be worse
 * than no data, because it would look like data.
 */

/** Brand slugs whose analytics property is NOT simply the brand slug. */
const SITE_SLUG_EXCEPTIONS: Readonly<Record<string, string>> = {
  'colaberry-training': 'training',
  'colaberry-enterprise': 'enterprise',
};

/** The property a page for this brand reports into, or null when the brand is unknown. */
export function siteSlugForBrand(brandSlug: string | null | undefined): string | null {
  if (!brandSlug || typeof brandSlug !== 'string') return null;
  const slug = brandSlug.trim().toLowerCase();
  if (!slug) return null;

  const mapped = SITE_SLUG_EXCEPTIONS[slug] ?? slug.replace(/^colaberry-/, '');
  // The column is VARCHAR(64) and the tracker puts this in a `data-site` attribute, so the shape
  // is checked here rather than trusted from a brand row some other path may have written.
  return /^[a-z0-9-]{1,64}$/.test(mapped) ? mapped : null;
}

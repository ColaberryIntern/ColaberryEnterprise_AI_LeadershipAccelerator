import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import SEOHead from '../SEOHead';

/**
 * SeoV2 -- SEOHead plus the things it does not do: a canonical URL, a robots
 * directive, the OpenGraph card, and a structured-data block.
 *
 * WHY THIS WAS noindex BEFORE CUTOVER
 * This site is mounted at /v2 alongside the live public site, and the two say
 * overlapping things about the same company. Letting a search engine index both
 * produces duplicate content that competes with the real site for its own terms,
 * and /v2 URLs would start appearing in results for a preview that is expected to
 * move to "/" later -- so the indexed URLs would then 404 or redirect en masse.
 * Preview stays out of the index until cutover.
 *
 * AT CUTOVER: flip PREVIEW_NOINDEX to false in one place. It is a single constant
 * precisely so that switch is not a hunt through six page components.
 *
 * A deliberate non-change: `SEOHead` is shared with the live site, so this wraps
 * it rather than editing it. Adding a robots tag to the shared component would
 * have put a noindex risk on live pages that have nothing to do with this work.
 *
 * WHY EVERY OPTIONAL TAG IS ALSO REMOVED (added for /stories/:slug, T018).
 * This is a single-page app: the document head persists across navigations, so a
 * tag written by one page stays until something takes it away. A story with an
 * approved image would otherwise leave its `og:image` behind on the next story
 * that has none, and that next story would then be shared with a picture of a
 * different customer's work. Every field below is therefore upserted when
 * present and DELETED when absent, and the effect's cleanup removes the whole
 * set on unmount - the same rule the robots directive has always followed here,
 * applied to the tags that can misattribute rather than merely mis-index.
 */

/** Flip to false as part of the cutover that makes V2 the real "/". */
/*
 * CUTOVER 2026-08-13: V2 is the live site, so it must be indexable. While it was
 * a preview at /v2 this was true, to stop a shadow copy competing with the real
 * site for its own terms.
 */
export const PREVIEW_NOINDEX = false;

/** The marker on every element this component is currently driving. */
export const SEO_V2_OWNED_ATTRIBUTE = 'data-cbv2-seo';
/** Where the site-wide default is parked while a page overrides it. */
export const SEO_V2_PREVIOUS_ATTRIBUTE = 'data-cbv2-seo-prev';

export interface SeoV2Props {
  title: string;
  description: string;
  /** V2-relative route, used only for documentation of intent. */
  route?: string;
  /**
   * Absolute canonical URL. Defaults to origin + the current pathname, which is
   * right for every static page; a detail page passes the URL the API declared
   * so the canonical does not drift when the client route and the published
   * address differ.
   */
  canonical?: string;
  /**
   * An APPROVED image only. Never a generated or borrowed one: an OpenGraph card
   * is the picture a link carries into somebody else's feed, so a wrong image
   * here is a false claim made at the widest possible reach. Omit it and no
   * `og:image` is written at all.
   */
  ogImage?: string | null;
  /** e.g. `article` for one published record. Omitted means no `og:type`. */
  ogType?: string | null;
  /** schema.org JSON-LD. Serialised into a `<script>` this component owns. */
  jsonLd?: Record<string, unknown> | null;
  /**
   * For a page that is a not-found answer. An SPA cannot return a 404 status, so
   * the only way to keep a missing record out of the index is to say so in a
   * robots directive.
   */
  noindex?: boolean;
}

function upsertMeta(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * OpenGraph uses `property=`, not `name=`. Passing `null` UNDOES this page's
 * override, which is the half that stops one record's card leaking onto the
 * next page.
 *
 * IT RESTORES, IT DOES NOT DELETE. `public/index.html` already ships
 * `og:type` and a site-wide `og:image`, so a page that overrode one of them and
 * then removed the tag on the way out would strip the whole SPA of its default
 * card for the rest of the session - one visit to a story with a picture, and
 * every other page shares with no image at all. The previous value is therefore
 * parked on the element and put back; only a tag this component created from
 * nothing is removed.
 */
function setOgProperty(property: string, content: string | null): void {
  const existing = document.querySelector(`meta[property="${property}"]`);

  if (content === null) {
    if (!existing || !existing.hasAttribute(SEO_V2_OWNED_ATTRIBUTE)) return;
    const previous = existing.getAttribute(SEO_V2_PREVIOUS_ATTRIBUTE);
    if (previous === null) {
      existing.remove();
      return;
    }
    existing.setAttribute('content', previous);
    existing.removeAttribute(SEO_V2_OWNED_ATTRIBUTE);
    existing.removeAttribute(SEO_V2_PREVIOUS_ATTRIBUTE);
    return;
  }

  let el = existing;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  } else if (!el.hasAttribute(SEO_V2_OWNED_ATTRIBUTE)) {
    // First override of a tag we did not create: remember what was there.
    const prior = el.getAttribute('content');
    if (prior !== null) el.setAttribute(SEO_V2_PREVIOUS_ATTRIBUTE, prior);
  }
  el.setAttribute(SEO_V2_OWNED_ATTRIBUTE, 'true');
  el.setAttribute('content', content);
}

/** `textContent`, never `innerHTML`: the payload is data, not markup. */
function setJsonLd(serialised: string | null): void {
  const selector = `script[type="application/ld+json"][${SEO_V2_OWNED_ATTRIBUTE}]`;
  const existing = document.querySelector(selector);
  if (serialised === null) {
    if (existing) existing.remove();
    return;
  }
  let el = existing;
  if (!el) {
    el = document.createElement('script');
    el.setAttribute('type', 'application/ld+json');
    el.setAttribute(SEO_V2_OWNED_ATTRIBUTE, 'true');
    document.head.appendChild(el);
  }
  el.textContent = serialised;
}

function SeoV2({
  title,
  description,
  canonical,
  ogImage,
  ogType,
  jsonLd,
  noindex,
}: SeoV2Props): React.ReactElement {
  const location = useLocation();

  // Serialised outside the effect so the dependency is a value, not an object
  // identity that changes on every render of the calling page.
  const serialisedJsonLd = jsonLd ? JSON.stringify(jsonLd) : null;
  const image = ogImage ?? null;
  const type = ogType ?? null;

  useEffect(() => {
    // Canonical. SEOHead sets og:url but never a canonical link, so nothing was
    // telling a crawler which URL is authoritative.
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonical || window.location.origin + location.pathname);

    const blocked = noindex || PREVIEW_NOINDEX;
    upsertMeta('robots', blocked ? 'noindex, nofollow' : 'index, follow');

    setOgProperty('og:image', image);
    setOgProperty('og:type', type);
    setJsonLd(serialisedJsonLd);

    return () => {
      // A V2 page must not leave noindex behind on a live page navigated to next.
      // Without this, visiting /v2 then /pricing would de-index /pricing.
      upsertMeta('robots', 'index, follow');
      // Nor leave one record's picture and structured data on the next one.
      setOgProperty('og:image', null);
      setOgProperty('og:type', null);
      setJsonLd(null);
    };
  }, [location.pathname, canonical, image, type, serialisedJsonLd, noindex]);

  return <SEOHead title={title} description={description} />;
}

export default SeoV2;

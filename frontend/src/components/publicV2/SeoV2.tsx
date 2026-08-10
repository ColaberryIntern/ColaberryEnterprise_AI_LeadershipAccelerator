import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import SEOHead from '../SEOHead';

/**
 * SeoV2 -- SEOHead plus the two things it does not do: a canonical URL and a
 * robots directive.
 *
 * WHY V2 PAGES MUST BE noindex FOR NOW
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
 */

/** Flip to false as part of the cutover that makes V2 the real "/". */
export const PREVIEW_NOINDEX = true;

export interface SeoV2Props {
  title: string;
  description: string;
  /** V2-relative route, used only for documentation of intent. */
  route?: string;
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

function SeoV2({ title, description }: SeoV2Props): React.ReactElement {
  const location = useLocation();

  useEffect(() => {
    // Canonical. SEOHead sets og:url but never a canonical link, so nothing was
    // telling a crawler which URL is authoritative.
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', window.location.origin + location.pathname);

    upsertMeta('robots', PREVIEW_NOINDEX ? 'noindex, nofollow' : 'index, follow');

    return () => {
      // A V2 page must not leave noindex behind on a live page navigated to next.
      // Without this, visiting /v2 then /pricing would de-index /pricing.
      upsertMeta('robots', 'index, follow');
    };
  }, [location.pathname]);

  return <SEOHead title={title} description={description} />;
}

export default SeoV2;

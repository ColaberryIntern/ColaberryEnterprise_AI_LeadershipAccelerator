import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import {
  CaseStudyNotFoundError,
  describeCaseStudyError,
  fetchCaseStudyDetail,
} from '../../services/caseStudyApi';
import {
  trackCaseStudyArtifactClick,
  trackCaseStudyCtaClick,
  trackCaseStudyRepoClick,
  trackCaseStudyShare,
  trackCaseStudyView,
} from '../../utils/caseStudyTracking';
import { NOT_FOUND_BODY, NOT_FOUND_HEADING } from './storyDetailV2Model';
import type { DetailState } from './storyDetailV2Model';
import { storySeoExtras } from './storySeoModel';
import StoryDetailArticle from './StoryDetailArticle';
import './storyDetailV2.css';
/* The picture rules, split out when the page stylesheet passed CLAUDE.md's
   500-line ceiling. A second side-effect import rather than an `@import` from
   the first: the contract test forbids `@import` here, and an `@import` also
   costs a second serial round trip before either sheet can paint. */
import './storyMediaV2.css';

/**
 * StoryDetailV2 - the Enterprise detail surface at `/stories/:slug` (spec 23).
 *
 * WHAT THIS FILE STILL OWNS, AFTER THE ARTICLE MOVED OUT. The fetch, the four
 * load states, the tracking emitters and the SEO head. The rendered body is
 * `StoryDetailArticle`, which takes a record and a surface and nothing else.
 *
 * THE SPLIT IS A SEAM, NOT A TIDY-UP. The admin Story Studio's PREVIEW tab has
 * to show an operator the PAGE rather than a payload, and it already holds the
 * projection - `GET /api/admin/case-studies/:id/preview` returns exactly the
 * shape this page fetches. Mounting the same component there is what makes the
 * preview incapable of disagreeing with production. A second renderer would
 * drift one commit at a time, and the first person to notice would be whoever
 * approved something that turned out not to be what shipped.
 *
 * IT COMPOSES, IT DOES NOT REDRAW. Timeline, architecture, measurement,
 * roadmap, artifacts, the CTA and the two-axis verification badge are the
 * components `components/caseStudy/` already ships, and every one of them
 * decides its own emptiness. The three blocks that directory does not ship -
 * hero figures, contributors, and repositories/provenance - are page-local in
 * `storyDetailV2Sections.tsx`, because `caseStudyStyleContract.test.ts` asserts
 * that directory's exact ten filenames.
 *
 * SECTIONS HIDE WHEN UNSUPPORTED. `visibleSections()` answers from the DATA and
 * from the surface profile's order before anything mounts, so a section never
 * prints its heading and then discovers its component returned null. The order
 * is the server's, not this file's.
 *
 * NOT FOUND IS NOT A FAILURE. A 404 renders the V2 not-found treatment plus a
 * `noindex` directive, because a single-page app cannot answer with a status
 * code and an unpublished record must not enter the index. Everything else
 * renders a failure state with a retry, so "this does not exist" and "we could
 * not load it" never wear each other's words.
 *
 * TRACKING IS CONSENT-GATED AND OFF BY DEFAULT. `PublicLayoutV2` starts the
 * tracker only when `localStorage['cbv2_consent'] === 'granted'`, default
 * `'unset'`, so anything measured here counts consenting sessions and nothing on
 * this page may depend on an event arriving. `case_study_view` belongs to this
 * page and is emitted from an effect: the ingest has no event-level dedup, so a
 * render-path call would write one row per re-render.
 *
 * A KNOWN HEADING-ORDER DEVIATION, recorded rather than hidden: section
 * headings are `h2` and `CaseStudyArtifacts` prints each artifact title as a
 * fixed `h4`, so the artifacts section skips `h3`. The component is closed to
 * this task; the alternative was inventing a subsection heading that names
 * nothing.
 */

/* ---------------------------------------------------------------- page --- */

function StoryDetailV2(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');

  /* One record, keyed on the slug in the URL. A slug-less render can only
     happen if this component is mounted outside its route, which is a
     not-found answer rather than a crash or an empty page. */
  useEffect(() => {
    if (!slug) {
      setState({ status: 'not-found' });
      return undefined;
    }
    const controller = new AbortController();
    let live = true;
    setState({ status: 'loading' });

    fetchCaseStudyDetail(slug, { signal: controller.signal })
      .then((data) => {
        if (live) setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!live || controller.signal.aborted) return;
        if (err instanceof CaseStudyNotFoundError) {
          setState({ status: 'not-found' });
          return;
        }
        setState({ status: 'failed', message: describeCaseStudyError(err) });
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, [slug, reloadToken]);

  const ready = state.status === 'ready' ? state.data : null;
  const record = ready ? ready.caseStudy : null;
  const surface = ready ? ready.surface : null;

  /* Primitives, so the effect is keyed on values rather than on the identity of
     a response object, and re-runs only when the record actually changes. */
  const viewSlug = record ? record.slug : null;
  const surfaceKey = surface ? surface.key : undefined;
  const industry = record && record.industry ? record.industry : undefined;
  const capability = record && record.primaryCapability ? record.primaryCapability : undefined;
  const verification = record ? record.verificationClass : undefined;

  useEffect(() => {
    if (!viewSlug) return;
    // `markOncePerSession` inside the emitter keeps this to one row per slug per
    // session even under Strict Mode's double-invoked effects.
    trackCaseStudyView({
      slug: viewSlug,
      surface: surfaceKey,
      industry,
      capability,
      verification,
      source: 'stories-detail',
    });
  }, [viewSlug, surfaceKey, industry, capability, verification]);

  /**
   * One delegated handler for three zones.
   *
   * It is an OBSERVER, not a control: nothing focusable is created, no role is
   * assigned, and it returns early unless the click originated inside a real
   * anchor - a click on a section's whitespace navigates nowhere and must not be
   * recorded as if it had. Keyboard activation dispatches a click from the
   * anchor too, so this covers it.
   */
  const onStoryClick = useCallback(
    (event: React.MouseEvent<HTMLElement>): void => {
      const target = event.target as HTMLElement | null;
      if (!record || !target || typeof target.closest !== 'function') return;
      const anchor = target.closest('a[href]');
      if (!anchor) return;
      const zone = anchor.closest('[data-story-zone]')?.getAttribute('data-story-zone');
      if (!zone) return;
      const ref = {
        slug: record.slug,
        surface: surfaceKey,
        industry,
        capability,
        verification,
        source: 'stories-detail',
      };

      if (zone === 'repositories') {
        const role = anchor.closest('[data-repo-role]')?.getAttribute('data-repo-role');
        // Role and visibility class only. Identity - owner, name, address - is
        // not on the allowlist and is dropped by the emitter anyway; a public
        // record is the only kind that can reach this list at all.
        trackCaseStudyRepoClick({ ...ref, repo_role: role ?? undefined, repo_visibility: 'public' });
        return;
      }
      if (zone === 'artifacts') {
        const item = anchor.closest('.cbv2-cs-artifact');
        const siblings = item?.parentElement ? Array.from(item.parentElement.children) : [];
        const position = item ? siblings.indexOf(item) : -1;
        const artifact = position >= 0 ? record.artifacts[position] : undefined;
        trackCaseStudyArtifactClick({ ...ref, artifact_kind: artifact?.artifactType });
        return;
      }
      if (zone === 'cta') {
        trackCaseStudyCtaClick({ ...ref, cta: record.cta.href, placement: 'story-detail-footer' });
      }
    },
    [record, surfaceKey, industry, capability, verification],
  );

  /**
   * Share is a copy-link button and nothing else. A row of network buttons would
   * be five controls whose behaviour this page cannot verify; one control that
   * puts the canonical URL on the clipboard is a control that does what it says,
   * and it reports honestly when the browser refuses.
   */
  const onShare = useCallback((): void => {
    if (!record) return;
    trackCaseStudyShare({
      slug: record.slug,
      surface: surfaceKey,
      source: 'stories-detail',
      channel: 'copy-link',
    });
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      setShareState('failed');
      return;
    }
    clipboard.writeText(record.seo.canonicalUrl)
      .then(() => setShareState('copied'))
      .catch(() => setShareState('failed'));
  }, [record, surfaceKey]);

  /* ------------------------------------------------------- not found --- */

  if (state.status === 'not-found') {
    return (
      <>
        <SeoV2 title={NOT_FOUND_HEADING} description={NOT_FOUND_BODY} noindex />
        <section className="cbv2-section">
          <div className="cbv2-wrap cbv2-wrap--narrow cbv2-story__missing">
            <h1>{NOT_FOUND_HEADING}</h1>
            <p className="cbv2-lede">{NOT_FOUND_BODY}</p>
            <p>
              <Link className="cbv2-btn cbv2-btn--primary" to="/proof">
                All published projects
              </Link>
            </p>
          </div>
        </section>
      </>
    );
  }

  /* --------------------------------------------- loading and failure --- */

  if (!record || !surface) {
    return (
      <>
        <SeoV2 title="Project record" description="A published Colaberry project record." />
        <section className="cbv2-section">
          <div className="cbv2-wrap cbv2-wrap--narrow">
            {state.status === 'failed' ? (
              <div className="cbv2-story__state" role="alert" data-testid="story-failure">
                <p>{state.message}</p>
                <button
                  type="button"
                  className="cbv2-btn cbv2-btn--ghost cbv2-btn--sm"
                  onClick={() => setReloadToken((token) => token + 1)}
                  data-testid="story-retry"
                >
                  Try again
                </button>
              </div>
            ) : (
              <p className="cbv2-story__state" data-testid="story-loading">
                Loading this project record.
              </p>
            )}
          </div>
        </section>
      </>
    );
  }

  /* ------------------------------------------------------------ ready --- */

  const extras = storySeoExtras(record, surface);

  return (
    <>
      <SeoV2
        title={record.seo.title}
        description={record.seo.description}
        canonical={record.seo.canonicalUrl}
        ogImage={extras ? extras.ogImage : null}
        ogType={extras ? extras.ogType : null}
        jsonLd={extras ? extras.jsonLd : null}
      />

      {/* ONE RENDERER, TWO CALLERS. The markup lives in `StoryDetailArticle`
          because the admin Story Studio's PREVIEW tab mounts the same component
          with an already-fetched projection. A preview drawn by its own code
          would drift from this page and start lying about what ships. */}
      <StoryDetailArticle
        record={record}
        surface={surface}
        onStoryClick={onStoryClick}
        onShare={onShare}
        shareState={shareState}
      />
    </>
  );
}

export default StoryDetailV2;

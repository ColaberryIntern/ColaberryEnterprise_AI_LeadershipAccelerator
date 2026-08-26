import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import CaseStudyCTA from '../../components/caseStudy/CaseStudyCTA';
import CaseStudyVerificationBadge from '../../components/caseStudy/CaseStudyVerificationBadge';
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
import {
  NOT_FOUND_BODY,
  NOT_FOUND_HEADING,
  heroFacts,
  heroMetricsFor,
  storySeoExtras,
  visibleSections,
} from './storyDetailV2Model';
import type { DetailState } from './storyDetailV2Model';
import StoryHeroActions from './StoryHeroActions';
import { StoryHeroMetrics } from './storyDetailV2Sections';
import StorySectionList from './StorySectionList';
import { StoryIndicatorRail } from './StoryIndicators';
import { storyIndicators } from './storyIndicatorModel';
import { placeStoryFigures } from './storyFigurePlacement';
import './storyDetailV2.css';

/**
 * StoryDetailV2 - the Enterprise detail surface at `/stories/:slug` (spec 23).
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
              <Link className="cbv2-btn cbv2-btn--primary" to="/stories">
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

  const sections = visibleSections(record, surface);
  const extras = storySeoExtras(record, surface);
  const metrics = heroMetricsFor(record);
  const facts = heroFacts(record);
  const indicators = storyIndicators(record, sections);
  /* Pictures are placed BETWEEN sections, from the sections that actually
     survived `visibleSections`, so a figure can never follow a heading this
     record does not print. `placedHrefs` then goes down to the artifacts band,
     which subtracts them from its carousel - the same picture appearing inline
     and again in a track ten centimetres below reads as a rendering fault. */
  const figures = placeStoryFigures(record.artifacts, sections);

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

      {/* The click handler is an observer on a container, the pattern
          `StoriesV2` already uses on its results list. No eslint-disable
          comment: the production config does not load every plugin, and a
          disable for a rule it never enabled is itself a build failure. */}
      <article className="cbv2-story" onClick={onStoryClick}>
        <section className="cbv2-pagehero" aria-labelledby="cbv2-story-title">
          <div className="cbv2-wrap cbv2-story__hero">
            <p className="cbv2-story__crumb">
              <Link to="/stories">All published projects</Link>
            </p>
            <p className="cbv2-eyebrow cbv2-eyebrow--onDark">{surface.hero.eyebrow}</p>
            <h1 id="cbv2-story-title">{record.title}</h1>
            {record.standfirst ? (
              <p className="cbv2-pagehero__lede">{record.standfirst}</p>
            ) : null}

            <CaseStudyVerificationBadge
              className="cbv2-story__badge"
              verificationClass={record.verificationClass}
              verificationMethod={record.verificationMethod}
            />

            {/* Counts, never scores. Directly under the badge because the two
                answer the neighbouring questions - "is this checked" and "how
                much of it is here" - and a reader who is scanning stops after
                one of them. Empty for a record with nothing countable, and then
                nothing renders. */}
            <StoryIndicatorRail indicators={indicators} />

            {facts.length > 0 ? (
              <dl className="cbv2-story__facts">
                {facts.map((fact) => (
                  <div className="cbv2-story__fact" key={fact.term}>
                    <dt className="cbv2-story__term">{fact.term}</dt>
                    <dd className="cbv2-story__value">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <StoryHeroMetrics metrics={metrics} />

            {/* The surface's offer, and the repository when the projection was
                willing to publish one. Both are real destinations; the copy-link
                control keeps its own row below, with its own live region. */}
            <div className="cbv2-story__actions">
              <StoryHeroActions cta={record.cta} repositories={record.repositories} />
            </div>

            <div className="cbv2-story__share">
              <button
                type="button"
                className="cbv2-btn cbv2-btn--ghost cbv2-btn--sm"
                onClick={onShare}
                data-testid="story-share"
              >
                Copy link
              </button>
              <span className="cbv2-story__share-state" aria-live="polite">
                {shareState === 'copied' ? 'Link copied.' : null}
                {shareState === 'failed'
                  ? 'This browser would not let us copy. The address is in the address bar.'
                  : null}
              </span>
            </div>
          </div>
        </section>

        <StorySectionList record={record} sections={sections} figures={figures} />

        {sections.includes('cta') ? (
          <section className="cbv2-rv cbv2-section cbv2-section--inverse" data-section="cta">
            <div className="cbv2-wrap cbv2-wrap--narrow cbv2-story__cta" data-story-zone="cta">
              <CaseStudyCTA cta={record.cta} headingLevel={2} />
            </div>
          </section>
        ) : null}
      </article>
    </>
  );
}

export default StoryDetailV2;

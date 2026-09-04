import React from 'react';
import { Link } from 'react-router-dom';
import CaseStudyCTA from '../../components/caseStudy/CaseStudyCTA';
import CaseStudyVerificationBadge from '../../components/caseStudy/CaseStudyVerificationBadge';
import { heroFacts, heroMetricsFor, visibleSections } from './storyDetailV2Model';
import StoryHeroActions from './StoryHeroActions';
import StoryContextStrip from './StoryContextStrip';
import StorySectionList from './StorySectionList';
import { storyIndicators } from './storyIndicatorModel';
import { placeStoryFigures } from './storyFigurePlacement';
import { coverFor } from './storyCover';
import type {
  PublicCaseStudyDetail,
  PublicSurfaceView,
} from '../../services/caseStudyPublicTypes';
/* The page's own two stylesheets, imported HERE as well as in `StoryDetailV2`.
   Not redundant: this component is the thing that draws the markup, and it is
   now mounted from a second place - the admin Story Studio's PREVIEW tab, which
   never loads `PublicLayoutV2` and never renders `StoryDetailV2`. A side-effect
   CSS import is idempotent in webpack, so declaring the dependency where the
   markup lives costs nothing and stops the admin preview's styling from resting
   on which OTHER module happened to pull these in. */
import './storyDetailV2.css';
import './storyMediaV2.css';

/**
 * StoryDetailArticle - the rendered body of one published project record.
 *
 * WHY IT IS A SEPARATE COMPONENT, AND WHAT THAT SEAM IS FOR.
 *
 * This markup used to be the `ready` branch of `StoryDetailV2`, which also owns
 * the fetch, the four load states, the tracking effect and the SEO head. The
 * admin Story Studio's PREVIEW tab has to show an operator THE PAGE, not a
 * payload - and it already holds the projection in hand, fetched from
 * `GET /api/admin/case-studies/:id/preview`, which returns exactly the shape
 * `/stories/:slug` receives.
 *
 * THE ALTERNATIVE WAS A SECOND RENDERER, AND IT IS THE WHOLE REASON THIS FILE
 * EXISTS. A preview drawn by its own code drifts from the page it claims to
 * preview, silently, one commit at a time - and the moment it drifts, an
 * operator approves something that is not what ships. There is one renderer.
 * The public route and the admin preview are two callers of it.
 *
 * IT TAKES DATA, NEVER A SLUG. No fetching, no routing, no effects: everything
 * it needs arrives as props, which is what lets the admin hand it an
 * already-fetched projection for a surface that is not even published.
 *
 * THE THREE HANDLERS ARE OPTIONAL, AND THEIR ABSENCE IS THE READ-ONLY GUARANTEE.
 * `onStoryClick` is the delegated tracking observer, `onShare` copies the
 * canonical URL and emits a share event. The public page passes both. The admin
 * preview passes NEITHER, so rendering a record in the Story Studio emits no
 * analytics row and touches no clipboard - it cannot, because the code that
 * would do it is not wired in. That is a stronger property than a flag, because
 * there is no flag to get wrong.
 */

export type StoryShareState = 'idle' | 'copied' | 'failed';

export interface StoryDetailArticleProps {
  /** The public projection. Identical shape on the public route and in preview. */
  record: PublicCaseStudyDetail;
  /** The surface profile: band order, hidden set, attribution floor, framing copy. */
  surface: PublicSurfaceView;
  /** Delegated click observer. Omitted means nothing is tracked. */
  onStoryClick?: (event: React.MouseEvent<HTMLElement>) => void;
  /** Copy-link handler. Omitted means the control renders and does nothing. */
  onShare?: () => void;
  shareState?: StoryShareState;
}

export function StoryDetailArticle({
  record,
  surface,
  onStoryClick,
  onShare,
  shareState = 'idle',
}: StoryDetailArticleProps): React.ReactElement {
  const sections = visibleSections(record, surface);
  const metrics = heroMetricsFor(record);
  const facts = heroFacts(record);
  const indicators = storyIndicators(record, sections);
  /* Pictures are placed BETWEEN sections, from the sections that actually
     survived `visibleSections`, so a figure can never follow a heading this
     record does not print. `placedHrefs` then goes down to the artifacts band,
     which subtracts them from its carousel - the same picture appearing inline
     and again in a track ten centimetres below reads as a rendering fault.
     The COVER is subtracted for the same reason: the masthead has already spent
     it, so it must not also open the body. Null keeps the single-column hero
     exactly as it was, so a record with no picture is unaffected. */
  const cover = coverFor(record);
  const figures = placeStoryFigures(record.artifacts, sections, cover?.src ?? null);

  return (
    /* The click handler is an observer on a container, the pattern
       `StoriesV2` already uses on its results list. No eslint-disable
       comment: the production config does not load every plugin, and a
       disable for a rule it never enabled is itself a build failure. */
    <article className="cbv2-story" onClick={onStoryClick} data-testid="story-article">
      <section className="cbv2-pagehero" aria-labelledby="cbv2-story-title">
        <div
          className={`cbv2-wrap cbv2-story__hero${cover ? ' cbv2-story__hero--cover' : ''}`}
        >
          {/* The masthead's words, wrapped so the hero grid has exactly two
              children. Spanning the cover across the copy's rows instead does
              not work: with no `grid-template-rows` the explicit grid has a
              single line, so `grid-row: 1 / -1` collapses to row 1 and the
              image's height becomes that row's height - which pushed the title
              some 600px below the breadcrumb. Two children, two columns. */}
          <div className="cbv2-story__hero-copy">
            <p className="cbv2-story__crumb">
              <Link to="/proof">All published projects</Link>
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

            {/* The counts, the facts grid and the headline figures used to stack
                here. They are one band down now, on light ground - see
                `StoryContextStrip`. The masthead was measured at 1142px and
                2201px and is the heaviest thing on the page, so the format's
                rule for it is subtract, never add. */}

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

          {/* The cover, LAST in source order and second in the grid. A reader on
              a phone gets the title, the standfirst and the offer before the
              picture, which is the order that answers "what is this" fastest;
              at desktop widths CSS lifts it into the masthead's empty right
              half, where it costs no vertical space at all. */}
          {cover ? (
            <figure className="cbv2-story__cover">
              <img src={cover.src} alt={cover.alt} loading="eager" decoding="async" />
            </figure>
          ) : null}
        </div>
      </section>

      <StoryContextStrip indicators={indicators} facts={facts} metrics={metrics} />

      <StorySectionList record={record} sections={sections} figures={figures} />

      {sections.includes('cta') ? (
        <section className="cbv2-rv cbv2-section cbv2-section--inverse" data-section="cta">
          <div className="cbv2-wrap cbv2-wrap--narrow cbv2-story__cta" data-story-zone="cta">
            <CaseStudyCTA cta={record.cta} headingLevel={2} />
          </div>
        </section>
      ) : null}
    </article>
  );
}

export default StoryDetailArticle;

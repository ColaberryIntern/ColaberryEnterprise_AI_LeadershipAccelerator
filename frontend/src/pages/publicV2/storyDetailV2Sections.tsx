import React from 'react';
import { Metric } from '../../components/publicV2/Claim';
import CaseStudyArchitecture from '../../components/caseStudy/CaseStudyArchitecture';
import CaseStudyArtifacts from '../../components/caseStudy/CaseStudyArtifacts';
import CaseStudyMeasurement from '../../components/caseStudy/CaseStudyMeasurement';
import CaseStudyRoadmap from '../../components/caseStudy/CaseStudyRoadmap';
import CaseStudyTimeline from '../../components/caseStudy/CaseStudyTimeline';
import CaseStudyVerificationBadge from '../../components/caseStudy/CaseStudyVerificationBadge';
import { BUILT_BY_LABELS, REPO_ROLE_LABELS } from '../../config/caseStudySurfaces';
import StoryDiagram from './StoryDiagram';
import StoryMediaCarousel from './StoryMediaCarousel';
import StorySituation from './StorySituation';
import {
  anonymousContributorNote,
  contributorLabel,
  evidenceContextRows,
  formatPublishedDate,
  withheldRepositoryNote,
} from './storyDetailV2Model';
import { carouselSlides, diagramSourceOf } from './storyMediaModel';
import type {
  CaseStudySectionKey,
  PublicCaseStudyContributor,
  PublicCaseStudyDetail,
  PublicCaseStudyMetric,
  PublicCaseStudyRepository,
} from '../../services/caseStudyPublicTypes';

/**
 * storyDetailV2Sections - what each section of `/stories/:slug` renders.
 *
 * WHY IT IS PAGE-LOCAL. `caseStudyStyleContract.test.ts` asserts the exact ten
 * filenames in `components/caseStudy/`, so a component added there fails a test
 * belonging to another task. These blocks also have no second consumer yet: an
 * index card has no contributors list and no provenance list. If a second
 * surface ever needs them, moving a file is a smaller change than un-inventing a
 * premature abstraction.
 *
 * THE PROVENANCE LIST IS THE POINT OF THIS FILE - it is the one section spec
 * section 23 names that `components/caseStudy/` does not ship.
 */

/* ------------------------------------------------------------ hero metrics --- */

export interface StoryHeroMetricsProps {
  /** Already filtered by `heroMetricsFor`: every one carries evidence context. */
  metrics: readonly PublicCaseStudyMetric[];
}

/**
 * The headline figures, each with the context that makes it readable.
 *
 * The caller has already dropped any figure with no baseline, sample,
 * methodology or limitation (spec section 23). This renders the context it was
 * given rather than deciding again, but it renders ALL of it - a figure whose
 * context row was dropped for space is back to being a bare number.
 */
export function StoryHeroMetrics({
  metrics,
}: StoryHeroMetricsProps): React.ReactElement | null {
  if (metrics.length === 0) return null;

  return (
    <ul className="cbv2-story__metrics">
      {metrics.map((metric, index) => {
        const rows = evidenceContextRows(metric);
        return (
          <li
            className="cbv2-story__metric"
            key={`${metric.label}-${index}`}
            data-verification-class={metric.verificationClass}
          >
            <Metric
              value={metric.valueDisplay}
              label={metric.label}
              evidence={metric.verificationClass}
              badgeHidden
            />
            <CaseStudyVerificationBadge
              verificationClass={metric.verificationClass}
              verificationMethod={metric.verificationMethod}
            />
            {rows.length > 0 ? (
              <dl className="cbv2-story__metric-context">
                {rows.map((row) => (
                  <div key={row.term}>
                    <dt className="cbv2-story__term">{row.term}</dt>
                    <dd className="cbv2-story__value">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {metric.limitations.length > 0 ? (
              <div>
                <span className="cbv2-story__term">Limitations</span>
                <ul className="cbv2-story__limits">
                  {metric.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------- hero figure --- */

/**
 * The masthead's picture: the walkthrough player when the record has one, the cover
 * image otherwise.
 *
 * ONE SLOT, NOT TWO. This began as a band under the masthead, and that shipped a record
 * opening with two visuals doing the same job - a screenshot of the product, then a film
 * of the product, with the reader scrolling past the first to reach the second. The hero
 * already owns a picture slot and the masthead's right half was built for it.
 *
 * THE POSTER FALLS BACK TO THE COVER, so a record with a walkthrough looks exactly as it
 * did until somebody presses play, and a record without one is untouched.
 *
 * A NATIVE `video`, NOT AN EMBED. The platform serves the file, so no third party is
 * handed a record of who watched a client's delivery. `media-src` already allows the
 * platform origin here, where an embed would need `frame-src` and hand playback away.
 *
 * NOT AUTOPLAYED, and `preload="none"`. It carries narration, and a page that starts
 * talking at a reader who came to read is a page they leave; a multi-megabyte file should
 * not be fetched by every visitor who never presses play. The poster is what they see, so
 * nothing is lost by not preloading.
 */
export function StoryHeroFigure({
  video,
  cover,
}: {
  video: PublicCaseStudyDetail['walkthroughVideo'];
  cover: { src: string; alt: string } | null;
}): React.ReactElement | null {
  if (video) {
    return (
      <figure className="cbv2-story__cover cbv2-story__cover--video">
          {/* `crossorigin` is what makes the CAPTIONS work on the other two brands. A
              cross-origin `track` is refused unless the media element is a CORS request,
              and this file is served from the platform while the page may be
              training.colaberry.com or aiflotation.com. Without it the track's
              readyState goes to 3 (ERROR) and the cue list stays empty, while the video
              plays perfectly and the .vtt returns a healthy 200 — so nothing looks
              broken except the missing captions. nginx sends
              `Access-Control-Allow-Origin` on both the .vtt and the .mp4 to match; the
              attribute and the header are one change, not two. */}
        <video
          className="cbv2-story__walkthrough-player"
          controls
          preload="none"
          playsInline
          crossOrigin="anonymous"
          poster={video.posterUrl ?? cover?.src ?? undefined}
        >
          <source src={video.url} type="video/mp4" />
          {/* Separate from the captions burned into the picture: burned-in text cannot be
              resized, translated, turned off, or read by a screen reader. */}
          {video.captionsUrl ? (
            {/* NOT `default`: build_video.py burns the narration into the picture, so
                a shown track paints the same words a second time in the
                browser's own bar. The sidecar is the ACCESSIBLE copy -
                still reachable from the CC control and to assistive tech. */}
            <track kind="captions" srcLang="en" label="English" src={video.captionsUrl} />
          ) : null}
        </video>
        {/* Said on the page rather than left to be assumed. An unlabelled synthetic voice
            is a small deception, and this system's whole claim is that it does not make
            those. */}
        {video.narrationSource === 'synthetic' ? (
          <figcaption className="cbv2-story__walkthrough-note">
            {video.title}. Narrated by a synthetic voice; the figures it states are the
            verified metrics recorded below.
          </figcaption>
        ) : (
          <figcaption className="cbv2-story__walkthrough-note">{video.title}</figcaption>
        )}
      </figure>
    );
  }
  if (!cover) return null;
  return (
    <figure className="cbv2-story__cover">
      <img src={cover.src} alt={cover.alt} loading="eager" decoding="async" />
    </figure>
  );
}

/* ------------------------------------------------------------ contributors --- */

/**
 * Who built it, according to consent. A contributor who did not consent to be
 * named is not in this array at all - they arrive as `anonymousCount` - so
 * crediting people honestly never costs anybody their privacy, and the count
 * keeps the credit list from implying a smaller team than the one that worked.
 */
export function StoryContributors({
  contributors,
  anonymousCount,
}: {
  contributors: readonly PublicCaseStudyContributor[];
  anonymousCount: number;
}): React.ReactElement | null {
  const note = anonymousContributorNote(anonymousCount);
  if (contributors.length === 0 && !note) return null;

  return (
    <div className="cbv2-story__block">
      {contributors.length > 0 ? (
        <ul className="cbv2-story__people">
          {contributors.map((contributor, index) => (
            <li
              className="cbv2-story__person"
              key={`${contributorLabel(contributor)}-${index}`}
              data-display-mode={contributor.displayMode}
            >
              <span className="cbv2-story__person-name">{contributorLabel(contributor)}</span>
              {contributor.displayMode === 'named' ? (
                <span className="cbv2-story__person-role">{contributor.role}</span>
              ) : null}
              <span className="cbv2-cs-tag">{BUILT_BY_LABELS[contributor.kind]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="cbv2-story__note">{note}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------ repositories --- */

/**
 * Repositories and provenance.
 *
 * Every entry here is a repository a reader may actually open: the projection
 * required it to be public AND consented AND to carry a parseable http(s) URL
 * before it was given a shape at all, and a repository that failed any of the
 * three was DROPPED - it survives only as one increment of `withheldCount`.
 * Nothing is re-checked here, because `PublicCaseStudyRepository` has no owner,
 * no visibility flag and no url-for-a-withheld-repository to re-check.
 *
 * `lastCommitDate` is usually null on purpose: the snapshot knows when WE last
 * read the repository, which is not when it was last committed to.
 */
export function StoryRepositories({
  repositories,
  withheldCount,
}: {
  repositories: readonly PublicCaseStudyRepository[];
  withheldCount: number;
}): React.ReactElement | null {
  const note = withheldRepositoryNote(withheldCount);
  if (repositories.length === 0 && !note) return null;

  return (
    <div className="cbv2-story__block" data-story-zone="repositories">
      {repositories.length > 0 ? (
        <ul className="cbv2-story__repos">
          {repositories.map((repository, index) => (
            <li
              className="cbv2-story__repo"
              key={`${repository.label}-${index}`}
              data-repo-role={repository.role}
            >
              <a
                className="cbv2-story__repo-link"
                href={repository.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {repository.label}
                {/* A list of links all named after a folder is unusable out of
                    context, and the new-tab behaviour has to be announced. */}
                <span className="cbv2-cs-sr-only"> repository (opens in a new tab)</span>
              </a>
              <span className="cbv2-cs-tag">{REPO_ROLE_LABELS[repository.role]}</span>
              {/* A repository only reaches this list by being public AND
                  consented, so saying so is reading the wire back, not a claim
                  this file is making. It is the indicator a reader scanning for
                  "can I actually open the source" is looking for. */}
              <span className="cbv2-cs-tag cbv2-story__repo-visibility">Public</span>
              {repository.lastCommitDate ? (
                <span className="cbv2-story__repo-date">
                  <span className="cbv2-cs-sr-only">Last commit: </span>
                  <time dateTime={repository.lastCommitDate}>
                    {formatPublishedDate(repository.lastCommitDate)}
                  </time>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="cbv2-story__note">{note}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------- dispatcher --- */

/**
 * One section's body. The page decided WHICH sections exist and in what order;
 * this decides only what goes inside one of them, so the two questions stay in
 * different files. Every branch reaches for a shipped `components/caseStudy/`
 * component where one exists.
 */
export function StorySectionBody({
  sectionKey,
  record,
  placedHrefs = [],
}: {
  sectionKey: CaseStudySectionKey;
  record: PublicCaseStudyDetail;
  /** Pictures the page already showed between sections. Default: none. */
  placedHrefs?: readonly string[];
}): React.ReactElement | null {
  switch (sectionKey) {
    case 'situation':
      // The narrative plus `constraints` and `goals` - two fields that have
      // always been authored and gated and were never projected. Page-local for
      // the same reason everything here is.
      return <StorySituation situation={record.situation} />;
    case 'build':
      return <CaseStudyTimeline entries={record.timeline} />;
    case 'architecture':
      // The verified lists FIRST, the drawing second. A reader meets what the
      // repository evidenced before they meet what somebody sketched, and the
      // drawing is absent entirely on the records that have none.
      return record.architecture ? (
        <>
          <CaseStudyArchitecture architecture={record.architecture} headingLevel={3} />
          <StoryDiagram source={diagramSourceOf(record.architecture)} />
        </>
      ) : null;
    case 'measurement':
      return record.measurement ? (
        <CaseStudyMeasurement measurement={record.measurement} />
      ) : null;
    case 'roadmap':
      return <CaseStudyRoadmap items={record.roadmap} />;
    case 'contributors':
      return (
        <StoryContributors
          contributors={record.contributors}
          anonymousCount={record.anonymousContributorCount}
        />
      );
    case 'artifacts':
      // The carousel is a second VIEW of the same approved artifacts, not a
      // second set: it shows the ones that are images, and every artifact still
      // appears in the list beneath it. Below two images `carouselSlides`
      // returns nothing and only the list renders. Pictures the page already
      // placed between sections are subtracted first, so nothing appears twice.
      return (
        <div data-story-zone="artifacts">
          <StoryMediaCarousel slides={carouselSlides(record.artifacts, placedHrefs)} />
          {/* `headingLevel={3}` closes the h2 -> h4 skip this band used to
              carry. The component's default is still 4 for every other caller. */}
          <CaseStudyArtifacts
            artifacts={record.artifacts}
            requestHref={record.cta.href}
            headingLevel={3}
          />
        </div>
      );
    case 'repositories':
      return (
        <StoryRepositories
          repositories={record.repositories}
          withheldCount={record.privateRepositoryCount}
        />
      );
    default:
      return null;
  }
}

import React from 'react';
import {
  ARTIFACT_ACCESS_LABELS,
  ARTIFACT_REQUEST_LABEL,
  ARTIFACT_TYPE_LABELS,
  openArtifactLabel,
} from '../../config/caseStudySurfaces';
import type { PublicCaseStudyArtifact } from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyArtifacts - the approved deliverables a reader may actually reach.
 *
 * NO FAKE CONTROLS (spec section 23), AND THE REQUEST CONTROL IS THE HARD CASE.
 * The public contract gives a request-only artifact no url and no endpoint to
 * post to, so a "Request access" button that claimed to lodge a request would be
 * a control that cannot do the thing it names - the most corrosive kind of
 * interface lie, because a reader only discovers it after deciding to trust it.
 *
 * So the control exists only when the caller supplies `requestHref`, and it is a
 * LINK TO A PLACE A HUMAN CAN ASK - the surface's own contact route, the same
 * destination the page's closing call to action already points at. It navigates
 * somewhere real and it promises nothing about delivery. With no `requestHref`
 * the row degrades to `ARTIFACT_ACCESS_LABELS.request`, a sentence phrased as a
 * fact about the artifact rather than as an instruction, which is what this
 * component shipped before the control existed.
 *
 * ATMOSPHERE IS MARKED, NOT DESCRIBED. A `photo` arrives stamped
 * `presentation: 'atmosphere'` by the server, and the row carries that on a
 * `data-` attribute and shows the neutral type label "Photograph". The server has
 * already refused to send any photograph whose title or description claims to
 * show delivered work, so there is no caption to sanitise here - which is the
 * point of doing it there.
 *
 * NOTHING UNAPPROVED CAN REACH HERE. `PublicCaseStudyArtifact` has no `status`
 * field and no `private` access variant, so a candidate, a rejected or a private
 * artifact has no shape to arrive in. This component does not filter; it renders
 * a list that was already made safe upstream.
 *
 * PREVIEW IMAGES ARE DECORATIVE. The contract carries an approved preview url
 * and no alt text for it. The title sits immediately beside the image, so the
 * image is marked decorative rather than described by a sentence this code
 * invented about a picture it has never seen.
 */

export interface CaseStudyArtifactsProps {
  artifacts: readonly PublicCaseStudyArtifact[];
  /**
   * Where a reader goes to ask about a `request` artifact - the surface's own
   * contact route. Omitted, the request row stays the sentence it has always
   * been. There is no artifact-request endpoint, so this component must never
   * invent a destination of its own.
   */
  requestHref?: string;
  /**
   * The heading level for each artifact title.
   *
   * IT CLOSES A RECORDED OUTLINE BREAK. This component printed a fixed `h4`, and
   * `/stories/:slug` gives every section an `h2`, so the artifacts band skipped
   * `h3` - a real defect for anybody navigating by heading, documented at
   * `StoryDetailV2.tsx` rather than hidden, and left open because this component
   * belonged to a closed set another task owned. It is a prop rather than a new
   * file, so the set is still exactly ten.
   *
   * Default `4` keeps every existing caller rendering exactly what it rendered
   * before, which is what makes this a non-breaking contract change.
   */
  headingLevel?: 3 | 4 | 5;
  className?: string;
}

export function CaseStudyArtifacts({
  artifacts,
  requestHref,
  headingLevel = 4,
  className,
}: CaseStudyArtifactsProps): React.ReactElement | null {
  if (artifacts.length === 0) return null;
  const Heading = `h${headingLevel}` as 'h3' | 'h4' | 'h5';

  return (
    <ul className={`cbv2-cs-artifacts${className ? ` ${className}` : ''}`}>
      {artifacts.map((artifact, index) => (
        <li
          className="cbv2-cs-artifact"
          key={`${artifact.title}-${index}`}
          data-artifact-access={artifact.access}
          data-artifact-kind={artifact.artifactType}
          data-presentation={artifact.presentation}
        >
          <span className="cbv2-cs-artifact__type">
            {ARTIFACT_TYPE_LABELS[artifact.artifactType]}
          </span>

          {artifact.access === 'open' && artifact.previewUrl ? (
            <img className="cbv2-cs-card__media" src={artifact.previewUrl} alt="" loading="lazy" />
          ) : null}

          <Heading className="cbv2-cs-artifact__title">{artifact.title}</Heading>

          {artifact.description ? (
            <p className="cbv2-cs-artifact__desc">{artifact.description}</p>
          ) : null}

          {artifact.access === 'open' ? (
            <a
              className="cbv2-cs-artifact__link cbv2-btn cbv2-btn--secondary cbv2-btn--sm"
              href={artifact.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {openArtifactLabel(artifact.artifactType)}
              {/* The accessible name has to say WHICH artifact opens, because a
                  list of links all named "Open screenshot" is unusable out of
                  context. */}
              <span className="cbv2-cs-sr-only">
                {`: ${artifact.title} (opens in a new tab)`}
              </span>
            </a>
          ) : null}

          {artifact.access === 'request' && requestHref ? (
            <a
              className="cbv2-cs-artifact__request cbv2-btn cbv2-btn--secondary cbv2-btn--sm"
              href={requestHref}
            >
              {ARTIFACT_REQUEST_LABEL}
              {/* Says which artifact the errand is about, and does not claim the
                  artifact will be sent - the destination is a contact route. */}
              <span className="cbv2-cs-sr-only">
                {` to ${artifact.title}. Opens the contact page.`}
              </span>
            </a>
          ) : null}

          {artifact.access === 'request' && !requestHref ? (
            <span className="cbv2-cs-artifact__state">{ARTIFACT_ACCESS_LABELS.request}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default CaseStudyArtifacts;

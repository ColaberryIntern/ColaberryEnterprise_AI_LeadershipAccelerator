import React from 'react';
import { ARTIFACT_ACCESS_LABELS, ARTIFACT_TYPE_LABELS } from '../../config/caseStudySurfaces';
import type { PublicCaseStudyArtifact } from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyArtifacts - the approved deliverables a reader may actually reach.
 *
 * NO FAKE CONTROLS (spec section 23). `access: 'request'` renders a sentence,
 * not a button. The public contract gives a request-only artifact no url and no
 * endpoint to post to, so any button here would be a control that cannot do the
 * thing it names - the most corrosive kind of interface lie, because a reader
 * only discovers it after deciding to trust it. `ARTIFACT_ACCESS_LABELS.request`
 * is therefore phrased as a fact about the artifact rather than as an
 * instruction.
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
  className?: string;
}

export function CaseStudyArtifacts({
  artifacts,
  className,
}: CaseStudyArtifactsProps): React.ReactElement | null {
  if (artifacts.length === 0) return null;

  return (
    <ul className={`cbv2-cs-artifacts${className ? ` ${className}` : ''}`}>
      {artifacts.map((artifact, index) => (
        <li
          className="cbv2-cs-artifact"
          key={`${artifact.title}-${index}`}
          data-artifact-access={artifact.access}
        >
          <span className="cbv2-cs-artifact__type">
            {ARTIFACT_TYPE_LABELS[artifact.artifactType]}
          </span>

          {artifact.access === 'open' && artifact.previewUrl ? (
            <img className="cbv2-cs-card__media" src={artifact.previewUrl} alt="" loading="lazy" />
          ) : null}

          <h4 className="cbv2-cs-artifact__title">{artifact.title}</h4>

          {artifact.description ? (
            <p className="cbv2-cs-artifact__desc">{artifact.description}</p>
          ) : null}

          {artifact.access === 'open' ? (
            <a
              className="cbv2-cs-artifact__link"
              href={artifact.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {ARTIFACT_ACCESS_LABELS.open}
              {/* The accessible name has to say WHICH artifact opens, because a
                  list of links all named "Open" is unusable out of context. */}
              <span className="cbv2-cs-sr-only">
                {` ${artifact.title} (opens in a new tab)`}
              </span>
            </a>
          ) : (
            <span className="cbv2-cs-artifact__state">{ARTIFACT_ACCESS_LABELS.request}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default CaseStudyArtifacts;

import React from 'react';
import type { PublicCaseStudyBuilder, PublicCaseStudyDecision, PublicCaseStudyDetail } from '../../services/caseStudyPublicTypes';
import './storyPeopleV2.css';

/**
 * The three story sections on the Enterprise page: the decision cards, Meet
 * the builder, and the closing. Page-local, like every other section body
 * here, and drawn only where the surface profile places their keys.
 *
 * EVERYTHING HERE IS THE PROJECTION'S WORD. A builder's name, biography and
 * links cross the wire only when the projection matched the profile to a
 * named, consented contributor; otherwise `name` is null and the card credits
 * the role. This page never fills that gap, never invents a headshot (the
 * initials mark stands in), and never upgrades a demonstrated skill into a
 * certification.
 *
 * Structure, not pixels, is shared with training.colaberry.com: the same
 * parts in the same order (number, stage pin, problem, decision, evidence,
 * figure with the consequence as caption), dressed in this site's tokens.
 */

function BuilderMark({ builder }: { builder: PublicCaseStudyBuilder }): React.ReactElement {
  if (builder.photoUrl) {
    return <img className="cbv2-story__builder-photo" src={builder.photoUrl} alt={builder.name ?? builder.roleTitle} />;
  }
  return (
    <span className="cbv2-story__builder-mark" aria-hidden="true">
      {builder.initials ?? (builder.name ? builder.name.charAt(0) : '')}
    </span>
  );
}

const PROVENANCE_LINE: Readonly<Record<PublicCaseStudyBuilder['provenance']['source'], string>> = {
  user_confirmed: 'Career facts as confirmed to Colaberry; project contribution from the repository record.',
  approved_profile: 'From an approved profile; project contribution from the repository record.',
  repository: 'From the repository record.',
};

export function StoryBuilder({ builder }: { builder: PublicCaseStudyBuilder | null }): React.ReactElement | null {
  if (!builder) return null;
  const title = builder.name ?? builder.roleTitle;
  const role = builder.organization ? `${builder.roleTitle}, ${builder.organization}` : builder.roleTitle;
  return (
    <div className="cbv2-story__block cbv2-story__builder" data-testid="story-builder">
      <div className="cbv2-story__builder-card">
        <div className="cbv2-story__builder-who">
          <div className="cbv2-story__builder-head">
            <BuilderMark builder={builder} />
            <div>
              <p className="cbv2-story__builder-name">{title}</p>
              {builder.name ? <p className="cbv2-story__builder-role">{role}</p> : null}
            </div>
          </div>
          {builder.progression.length > 0 ? (
            <ol className="cbv2-story__progression" aria-label="Career progression">
              {builder.progression.map((step, i) => (
                <li key={step} data-current={i === builder.progression.length - 1 ? 'true' : 'false'}>{step}</li>
              ))}
            </ol>
          ) : null}
          <p className="cbv2-story__term">Project contribution</p>
          <p className="cbv2-story__builder-contribution">{builder.contribution}</p>
          {builder.profileUrl ? (
            <a className="cbv2-story__builder-link" href={builder.profileUrl} rel="noopener">Approved profile</a>
          ) : null}
        </div>
        {builder.skills.length > 0 ? (
          <div className="cbv2-story__builder-did">
            <p className="cbv2-story__term">Skills demonstrated</p>
            <ul className="cbv2-story__skills">
              {builder.skills.map((s) => (
                <li className="cbv2-story__skill" key={s.label}>
                  <strong>{s.label}</strong>
                  <span>{s.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <p className="cbv2-story__builder-provenance">{PROVENANCE_LINE[builder.provenance.source]}</p>
    </div>
  );
}

const COUNT_WORDS: Readonly<Record<number, string>> = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five' };

export function StoryDecisions({ decisions }: { decisions: readonly PublicCaseStudyDecision[] }): React.ReactElement | null {
  if (decisions.length === 0) return null;
  const pinned = decisions.every((d) => d.stage);
  return (
    <div className="cbv2-story__block cbv2-story__decisions" data-testid="story-decisions">
      <p className="cbv2-story__decisions-lead">
        {decisions.length === 1 ? 'One choice shaped the system.' : `${COUNT_WORDS[decisions.length] ?? decisions.length} choices shaped the system.`}
        {pinned ? (decisions.length === 1 ? ' It lives at a specific point in the drawing above.' : ' Each one lives at a specific point in the drawing above.') : null}
      </p>
      <ol className="cbv2-story__decision-list">
        {decisions.map((d, i) => (
          <li className="cbv2-story__decision" key={d.key}>
            <div className="cbv2-story__decision-top">
              <span className="cbv2-story__decision-index" aria-hidden="true">{i + 1}</span>
              {d.stage ? <span className="cbv2-story__decision-stage">{`At ${d.stage}`}</span> : null}
            </div>
            <h3 className="cbv2-story__decision-title">{d.title}</h3>
            <p className="cbv2-story__decision-text">{d.problem}</p>
            <p className="cbv2-story__decision-text">{d.decision}</p>
            <p className="cbv2-story__decision-evidence">
              <span className="cbv2-story__term">Evidence</span> {d.evidence}
            </p>
            <p className="cbv2-story__decision-outcome">
              {d.figure ? <strong className="cbv2-story__decision-figure">{d.figure}</strong> : null}
              <span>{d.consequence}</span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Whether the builder card already credits the only contributor by name, in
 * which case "Who built it" would say the same thing a screen earlier.
 */
export function builderCoversContributors(record: PublicCaseStudyDetail): boolean {
  const only = record.contributors.length === 1 ? record.contributors[0] : null;
  return Boolean(record.builder?.name && only && only.displayMode === 'named'
    && only.displayName === record.builder.name && record.anonymousContributorCount === 0);
}

export function StoryClosing({ closing }: { closing: string | null }): React.ReactElement | null {
  if (!closing) return null;
  return (
    <div className="cbv2-story__block cbv2-story__closing" data-testid="story-closing">
      <p className="cbv2-story__closing-text">{closing}</p>
    </div>
  );
}

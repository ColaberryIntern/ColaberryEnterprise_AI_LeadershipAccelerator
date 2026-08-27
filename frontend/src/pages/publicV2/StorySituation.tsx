import React from 'react';
import type { PublicCaseStudySituation } from '../../services/caseStudyPublicTypes';

/**
 * StorySituation - the problem, and the two lists that qualify it.
 *
 * THE TWO LISTS ARE THE POINT OF THIS FILE. `situation.constraints` and
 * `situation.goals` have existed on the snapshot type since it was written, are
 * populated by the sync pipeline, and are walked by the publish gate's claim scan
 * - so a sentence in either of them can BLOCK a record from publishing. They were
 * never projected onto the public payload, so no reader could ever see them. A
 * constraint that can veto publication and cannot be read is the worst of both
 * worlds, and closing that was the cheapest real improvement available to this
 * surface: no new section key, no new component in the closed set, no new content
 * field for anybody to fill in. The content was already written by whoever wrote
 * the record.
 *
 * WHY THEY ARE NOT THEIR OWN BAND. `STORY_FORMAT_V1.md` proposes a "THE DECISION"
 * band and then answers its own proposal: these two fields are substantially what
 * such a band would contain, and promoting a rendered field to a section later is
 * a smaller step than inventing a section key, a heading, a support predicate and
 * a place in `sectionOrder` now. They render inside "The situation", where they
 * belong: a goal is part of the problem statement, not a separate claim.
 *
 * ORDER IS AIM THEN BOUNDARY. Goals say what the work was for; constraints say
 * what it had to work within. Read the other way round a reader meets a
 * limitation before they know what it limited.
 *
 * EACH LIST HIDES INDEPENDENTLY, AND NEITHER RESCUES THE BAND. The projector
 * still requires a narrative before it emits a situation at all, so a record
 * whose only situation content is a bullet list of goals renders no band rather
 * than a band headed "The situation" containing no situation. That guard lives on
 * the server (`projectSituation`) and is asserted there; this component simply
 * never receives such a record.
 *
 * PROSE IS `readonly string[]` AND STAYS THAT WAY. No markup in the strings, no
 * `dangerouslySetInnerHTML`, no inline links. The API carries paragraphs and the
 * renderer decides markup - a deliberate anti-injection posture, and a band that
 * needs structure needs a typed field rather than markup smuggled in a string.
 */

export interface StorySituationProps {
  /** `null` is possible in the type but not in practice: the page only asks for
   *  this band when `isSectionSupported` said the record has a narrative. */
  situation: PublicCaseStudySituation | null;
}

function QualifierList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div className="cbv2-story__qualifier">
      {/* h3, because the section heading above is an h2 and this is the same
          outline level `CaseStudyArchitecture` uses for its own sub-lists. */}
      <h3 className="cbv2-cs-eyebrow">{title}</h3>
      <ul className="cbv2-story__qualifier-list">
        {items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function StorySituation({ situation }: StorySituationProps): React.ReactElement | null {
  if (!situation) return null;
  const { body, goals, constraints } = situation;
  if (body.length === 0 && goals.length === 0 && constraints.length === 0) return null;

  return (
    <div className="cbv2-story__situation">
      {body.length > 0 ? (
        <div className="cbv2-cs-arch__prose">
          {body.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>
      ) : null}

      {goals.length > 0 || constraints.length > 0 ? (
        <div className="cbv2-story__qualifiers" data-testid="story-situation-qualifiers">
          <QualifierList title="What the work was for" items={goals} />
          <QualifierList title="What it had to work within" items={constraints} />
        </div>
      ) : null}
    </div>
  );
}

export default StorySituation;

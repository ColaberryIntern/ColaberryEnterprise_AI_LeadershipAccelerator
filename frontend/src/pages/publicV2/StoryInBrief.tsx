import React from 'react';
import type { PublicCaseStudyStoryBeat } from '../../services/caseStudyPublicTypes';
import './storyInBrief.css';

/**
 * StoryInBrief - the whole arc of the record in three to five labeled beats, the
 * first band under the masthead.
 *
 * Ali, 2026-11-18: "the story is so shortened I can't even tell what the story is.
 * Can we create a small format at the top that tells the story of what happened in
 * the case study. Sometimes the opening paragraph does a good job explaining and
 * sometimes it doesn't." The standfirst is one sentence and the situation opens on
 * the problem; this band is the arc itself: where it started, what was built, what
 * happened, why it matters, read in one glance.
 *
 * LIKE `StoryContextStrip`, IT CARRIES NO `data-section`. The section vocabulary is
 * a closed list the suite reads straight off `[data-section]`; this is part of the
 * opening, not an eleventh section.
 *
 * HIDES ITSELF. The projection sends either the record's whole usable set of beats
 * or none (see `caseStudyStoryInBrief.ts` on the server), so an empty list draws
 * nothing at all and the page reads as it did before the field existed.
 */
export interface StoryInBriefProps {
  beats: readonly PublicCaseStudyStoryBeat[];
}

export function StoryInBrief({ beats }: StoryInBriefProps): React.ReactElement | null {
  if (beats.length === 0) return null;
  return (
    <section className="cbv2-section cbv2-brief" aria-labelledby="cbv2-brief-title" data-testid="story-in-brief">
      <div className="cbv2-wrap">
        <h2 id="cbv2-brief-title" className="cbv2-brief__title">The story in brief</h2>
        <ol className="cbv2-brief__beats" style={{ ['--cbv2-brief-n' as string]: beats.length } as React.CSSProperties}>
          {beats.map((beat, i) => (
            <li className="cbv2-brief__beat" key={`${i}-${beat.label}`}>
              <span className="cbv2-brief__num" aria-hidden="true">{i + 1}</span>
              <span className="cbv2-brief__label">{beat.label}</span>
              <p className="cbv2-brief__text">{beat.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default StoryInBrief;

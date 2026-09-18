import React from 'react';
import { ROADMAP_STATUS_LABELS } from '../../config/caseStudySurfaces';
import type {
  PublicCaseStudyRoadmapItem,
  PublicCaseStudyTimelineEntry,
} from '../../services/caseStudyPublicTypes';
import './storyLowerV2.css';

/**
 * The lower half of a story page: the build as a rail, what happened next as a
 * status board.
 *
 * WHY THESE EXIST RATHER THAN EDITS TO THE SHIPPED COMPONENTS.
 * `CaseStudyTimeline` and `CaseStudyRoadmap` print every field of every entry,
 * which is right for a reviewer reading a record and wrong for a reader
 * scrolling a page: on the CORA record they ran 1,274px for eight steps and
 * 1,034px for seven roadmap items, against 261 and 329 for the same content in
 * the format Ali approved on the training site on 2026-09-17. He then looked at
 * the other two surfaces: "the timeline is not on the aiflotation side ... same
 * thing with enterprise, it doesn't have a timeline and bottom format." Those
 * two components keep their behaviour and their tests for every other caller;
 * the public story page draws these instead. (The Studio's rendered preview
 * renders the same article, so it gets this format too, which is what an editor
 * should be checking.)
 *
 * DATES ARE READ OUT OF THE STRING, never through `new Date()`, which parses a
 * bare date as UTC midnight and prints the day before in any negative-offset
 * timezone. Same rule, and the same three renderers, as everywhere else.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function shortDate(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number.parseInt(match[2], 10) - 1];
  if (!month) return iso;
  return `${Number.parseInt(match[3], 10)} ${month} ${match[1]}`;
}

/**
 * One dot per step with the labels staggered above and below, so neighbours can
 * each take two columns and still be read; the details fold underneath rather
 * than printing against every dot. Under 900px the same steps stand as compact
 * rows, so the page never scrolls sideways for it.
 */
export function StoryBuildRail({
  entries,
}: {
  entries: readonly PublicCaseStudyTimelineEntry[];
}): React.ReactElement | null {
  if (entries.length === 0) return null;
  const detailed = entries.filter((entry) => entry.detail);
  return (
    <>
      <ol
        className="cbv2-cs-rail"
        data-testid="story-build-rail"
        style={{ ['--cbv2-rail-n' as string]: entries.length }}
      >
        {entries.map((entry, index) => (
          <li
            className="cbv2-cs-rail__item"
            data-side={index % 2 === 0 ? 'up' : 'down'}
            style={{ ['--cbv2-rail-i' as string]: index + 1 }}
            key={`${entry.date}-${entry.label}-${index}`}
          >
            <span className="cbv2-cs-rail__dot" aria-hidden="true" />
            <div className="cbv2-cs-rail__label">
              {entry.date ? <time dateTime={entry.date}>{shortDate(entry.date)}</time> : null}
              <span>{entry.label}</span>
            </div>
          </li>
        ))}
      </ol>
      {detailed.length > 0 ? (
        <details className="cbv2-story__proof" data-testid="story-build-notes">
          <summary className="cbv2-story__proof-summary">
            {`Notes on ${detailed.length} of the ${entries.length} steps`}
          </summary>
          <ul className="cbv2-cs-rail__notes">
            {detailed.map((entry, index) => (
              <li key={`${entry.label}-${index}`}>
                <strong>{`${entry.label}.`}</strong>
                {` ${entry.detail}`}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

/**
 * What happened next as a board: one column per status in the order the record
 * lists them, labels only, the details folded. Stalled work keeps its own
 * column and its own word, exactly as the list form showed it; nothing about a
 * status is carried by colour alone.
 */
export function StoryRoadmapBoard({
  items,
}: {
  items: readonly PublicCaseStudyRoadmapItem[];
}): React.ReactElement | null {
  if (items.length === 0) return null;
  const statuses = [...new Set(items.map((item) => item.status))];
  const detailed = items.filter((item) => item.detail);
  return (
    <>
      <div className="cbv2-cs-next" data-testid="story-roadmap-board">
        {statuses.map((status) => (
          <div className="cbv2-cs-next__group" data-roadmap-status={status} key={status}>
            <h3 className="cbv2-cs-next__term">{ROADMAP_STATUS_LABELS[status]}</h3>
            <ul className="cbv2-cs-next__list">
              {items
                .filter((item) => item.status === status)
                .map((item, index) => (
                  <li key={`${item.label}-${index}`}>{item.label}</li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      {detailed.length > 0 ? (
        <details className="cbv2-story__proof" data-testid="story-roadmap-notes">
          <summary className="cbv2-story__proof-summary">
            {`Notes on ${detailed.length} of the ${items.length} items`}
          </summary>
          <ul className="cbv2-cs-rail__notes">
            {detailed.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                <strong>{`${item.label}.`}</strong>
                {` ${item.detail}`}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

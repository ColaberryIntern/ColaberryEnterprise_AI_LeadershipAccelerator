import React from 'react';
import { TIMELINE_SOURCE_LABELS } from '../../config/caseStudySurfaces';
import type { PublicCaseStudyTimelineEntry } from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyTimeline - the dated build record.
 *
 * DATES ARE FORMATTED FROM THE STRING, NEVER THROUGH `new Date()`. `new
 * Date('2026-08-22')` is parsed as UTC midnight, so in any negative-offset
 * timezone `toLocaleDateString()` renders the day before. A timeline exists to
 * say when something happened; a renderer that can move an event a day is worse
 * than no timeline. `formatIsoDate` therefore reads the three fields out of the
 * ISO string and never constructs a Date at all, which also makes the output
 * identical on a server render and in a browser in Karachi.
 *
 * An unparseable value is printed verbatim rather than guessed at or dropped.
 *
 * PROVENANCE WITHOUT THE REFERENCE. `sourceKind` says what KIND of thing
 * evidenced an entry. The reference itself - a commit sha, a stage id - is not
 * on the public contract, because for a private repository the reference is the
 * leak.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatIsoDate(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number.parseInt(match[2], 10) - 1];
  if (!month) return iso;
  return `${month} ${Number.parseInt(match[3], 10)}, ${match[1]}`;
}

export interface CaseStudyTimelineProps {
  entries: readonly PublicCaseStudyTimelineEntry[];
  className?: string;
}

export function CaseStudyTimeline({
  entries,
  className,
}: CaseStudyTimelineProps): React.ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <ol className={`cbv2-cs-timeline${className ? ` ${className}` : ''}`}>
      {entries.map((entry, index) => (
        <li
          className="cbv2-cs-timeline__item"
          key={`${entry.date}-${entry.label}-${index}`}
          data-source-kind={entry.sourceKind}
        >
          <span className="cbv2-cs-timeline__date">
            <time dateTime={entry.date}>{formatIsoDate(entry.date)}</time>
            {entry.endDate ? (
              <>
                <span aria-hidden="true"> - </span>
                <span className="cbv2-cs-sr-only"> to </span>
                <time dateTime={entry.endDate}>{formatIsoDate(entry.endDate)}</time>
              </>
            ) : null}
          </span>
          <span className="cbv2-cs-timeline__label">{entry.label}</span>
          {entry.detail ? <p className="cbv2-cs-timeline__detail">{entry.detail}</p> : null}
          <span className="cbv2-cs-tag">
            <span className="cbv2-cs-sr-only">Evidence: </span>
            {TIMELINE_SOURCE_LABELS[entry.sourceKind]}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default CaseStudyTimeline;

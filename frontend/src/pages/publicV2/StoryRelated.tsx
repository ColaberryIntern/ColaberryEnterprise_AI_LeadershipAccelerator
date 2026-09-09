import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EMPTY_CASE_STUDY_FILTERS, fetchCaseStudyIndex } from '../../services/caseStudyApi';
import type { PublicCaseStudySummary } from '../../services/caseStudyPublicTypes';
import {
  DEFAULT_CASE_STUDY_SURFACE_KEY,
  caseStudyDetailPath,
  resolveCaseStudySurfaceProfile,
} from '../../config/caseStudySurfaces';

/**
 * "Keep reading" — the other records a reader can go to next.
 *
 * Ali, 2026-09-08: "show other related project at the end of the Case Study's
 * so they can continue looking through related case studys. This should be at
 * the bottom and only include Case Studys that can be shown on their respective
 * site."
 *
 * THE SURFACE IS THE FILTER, AND IT IS THE SERVER'S. This asks the same index
 * endpoint the proof page uses, for this surface, so a record that is not
 * published to this brand cannot appear — which is the whole of "only Case
 * Studys that can be shown on their respective site". Nothing is filtered here
 * beyond dropping the record the reader is already on.
 *
 * FETCHED SEPARATELY, ON PURPOSE. The record must never wait on this: if the
 * request is slow or fails, the reader still has the record and the page simply
 * ends where it used to. That is why this is its own component with its own
 * effect rather than another field on the detail response.
 */

/** Three at most: an invitation to keep reading, not a second index. */
const MAX_RELATED = 3;

export interface StoryRelatedProps {
  /** The record being read, which must not appear in its own list. */
  readonly currentSlug: string;
}

export function StoryRelated({ currentSlug }: StoryRelatedProps) {
  const [items, setItems] = useState<readonly PublicCaseStudySummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    // MAX_RELATED + 1, because the record being read is almost always in this
    // list and is dropped below; asking for exactly three could return two.
    fetchCaseStudyIndex(
      { ...EMPTY_CASE_STUDY_FILTERS, limit: MAX_RELATED + 1 },
      { signal: controller.signal },
    )
      .then((body) => {
        if (!live) return;
        setItems((body.items ?? []).filter((r) => r.slug !== currentSlug).slice(0, MAX_RELATED));
      })
      // Silent by design: the record is already on the page, and an error state
      // here would be a failure notice about something the reader did not ask for.
      .catch(() => undefined);

    return () => {
      live = false;
      controller.abort();
    };
  }, [currentSlug]);

  const profile = resolveCaseStudySurfaceProfile(DEFAULT_CASE_STUDY_SURFACE_KEY);

  /* `caseStudyDetailPath` returns null for a surface with no reader-facing page.
     A record with nowhere to go is dropped rather than rendered as a dead link,
     which is the same rule the index cards follow. */
  const linkable = items
    .map((record) => ({ record, href: caseStudyDetailPath(profile, record.slug) }))
    .filter((entry): entry is { record: PublicCaseStudySummary; href: string } => entry.href !== null);

  if (linkable.length === 0) return null;

  return (
    <section className="cbv2-story__related" id="related" aria-labelledby="related-heading">
      <h2 className="cbv2-story__band-title" id="related-heading">Keep reading</h2>
      <ul className="cbv2-related__list">
        {linkable.map(({ record, href }) => (
          <li className="cbv2-related__item" key={record.slug}>
            <Link className="cbv2-related__link" to={href}>
              {record.heroImageUrl ? (
                <img
                  className="cbv2-related__media"
                  src={record.heroImageUrl}
                  /* Decorative: the title sits in the same link, so announcing
                     both would read the record's name twice. */
                  alt=""
                  loading="lazy"
                />
              ) : null}
              <span className="cbv2-related__body">
                {record.primaryCapability ? (
                  <span className="cbv2-related__meta">{record.primaryCapability}</span>
                ) : null}
                <span className="cbv2-related__title">{record.title}</span>
                {record.standfirst ? (
                  <span className="cbv2-related__note">{record.standfirst}</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default StoryRelated;

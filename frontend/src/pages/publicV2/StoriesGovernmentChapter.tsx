import React from 'react';
import type { CaseStudyFilterField } from '../../components/caseStudy/CaseStudyFilters';
import type { CaseStudyFilterState } from '../../services/caseStudyApi';
import type { PublicCaseStudyTaxonomyFacets } from '../../services/caseStudyPublicTypes';
import { DELIVERY_CONTEXT_CATALOG, GOV_CAPABILITY_CATALOG } from './storiesGovernment';
import './storiesGovernment.css';

/**
 * The Government chapter: the same published records, read the way a public-
 * sector buyer reads them.
 *
 * WHAT IT IS. A band above the results that lists the seven things a contracting
 * officer buys (each with the NAICS / PSC codes it is bought under) and how many
 * published records a human has mapped to each, plus the three delivery
 * contexts and their counts. Every control is a filter over the SAME state the
 * sidebar and the word cloud write to; clicking a category is clicking its
 * checkbox. There is no second list of records.
 *
 * WHEN IT RENDERS. Only when the chapter has at least one record, or the URL is
 * already filtering on it (a shared link must not lose the band that explains
 * its own filter). A library with nothing mapped yet renders no chapter, the
 * same way a detail page hides an unsupported section - an empty chapter with a
 * pitch and no records is exactly the kind of page this site exists not to be.
 *
 * COUNTS ARE HONEST ZEROS. Once the chapter shows, all seven categories show,
 * including the ones with nothing behind them yet: a category with `0` is not a
 * button (a filter that can only return nothing is a trap), and it says so in
 * words. The alternative - listing only the populated categories - would let the
 * page imply coverage the records do not have.
 *
 * THE LAST SENTENCE IS THE POINT. A capability demonstration is real work built
 * against real requirements; it is not past performance, and the band says so in
 * the same words the card prints. See `CaseStudyDeliveryContext` on the backend.
 */

export interface StoriesGovernmentChapterProps {
  readonly facets: PublicCaseStudyTaxonomyFacets | null;
  readonly value: CaseStudyFilterState;
  readonly onToggle: (field: CaseStudyFilterField, optionValue: string) => void;
}

const countOf = (
  list: readonly { readonly slug: string; readonly count: number }[] | undefined,
  slug: string,
): number => list?.find((f) => f.slug === slug)?.count ?? 0;

export function StoriesGovernmentChapter({
  facets, value, onToggle,
}: StoriesGovernmentChapterProps): React.ReactElement | null {
  const populated = (facets?.govCapabilities ?? []).some((f) => f.count > 0);
  const filtering = value.govCapability.length > 0 || value.deliveryContext.length > 0;
  if (!populated && !filtering) return null;

  const total = (facets?.deliveryContexts ?? []).reduce((n, f) => n + f.count, 0);

  return (
    <section
      className="cbv2-rv cbv2-section"
      aria-labelledby="cbv2-gov-title"
      data-testid="stories-government"
    >
      <div className="cbv2-wrap">
        <p className="cbv2-eyebrow">Government &amp; public sector</p>
        <h2 id="cbv2-gov-title">What a contracting officer buys, and what we can show for it</h2>
        <p className="cbv2-lede cbv2-stories__gov-lede">
          The records on this page, read by procurement category. Each category names the
          codes the work is bought under and how many published records a reviewer has placed
          in it. {total === 1 ? 'One record is' : `${total} records are`} on this chapter today.
        </p>

        <ul className="cbv2-stories__gov-grid" data-testid="stories-government-categories">
          {GOV_CAPABILITY_CATALOG.map((entry) => {
            const count = countOf(facets?.govCapabilities, entry.key);
            const on = value.govCapability.includes(entry.key);
            const codes = `NAICS ${entry.naics.join(', ')} · PSC ${entry.psc.join(', ')}`;
            return (
              <li className="cbv2-stories__gov-item" key={entry.key} data-count={count}>
                {count > 0 ? (
                  <button
                    type="button"
                    className="cbv2-stories__gov-cat"
                    aria-pressed={on}
                    data-on={on ? 'true' : 'false'}
                    onClick={() => onToggle('govCapability', entry.key)}
                  >
                    <span className="cbv2-stories__gov-cat-label">{entry.label}</span>
                    <span className="cbv2-stories__gov-cat-count">
                      {count} {count === 1 ? 'record' : 'records'}
                    </span>
                  </button>
                ) : (
                  <p className="cbv2-stories__gov-cat cbv2-stories__gov-cat--empty">
                    <span className="cbv2-stories__gov-cat-label">{entry.label}</span>
                    <span className="cbv2-stories__gov-cat-count">No records yet</span>
                  </p>
                )}
                <p className="cbv2-stories__gov-buys">{entry.buys}</p>
                <p className="cbv2-stories__gov-codes">{codes}</p>
              </li>
            );
          })}
        </ul>

        <h3 className="cbv2-stories__gov-subtitle">How each record reached the world</h3>
        <ul className="cbv2-stories__gov-contexts" data-testid="stories-government-contexts">
          {DELIVERY_CONTEXT_CATALOG.map((entry) => {
            const count = countOf(facets?.deliveryContexts, entry.key);
            const on = value.deliveryContext.includes(entry.key);
            return (
              <li className="cbv2-stories__gov-context" key={entry.key}>
                <button
                  type="button"
                  className="cbv2-stories__gov-ctx"
                  aria-pressed={on}
                  data-on={on ? 'true' : 'false'}
                  disabled={count === 0}
                  onClick={() => onToggle('deliveryContext', entry.key)}
                >
                  {entry.label}
                  <span className="cbv2-stories__gov-cat-count"> {count}</span>
                </button>
                <p className="cbv2-stories__gov-buys">{entry.meaning}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default StoriesGovernmentChapter;

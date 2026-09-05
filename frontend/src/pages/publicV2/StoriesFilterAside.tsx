import React from 'react';
import CaseStudyFilters from '../../components/caseStudy/CaseStudyFilters';
import type {
  CaseStudyFilterField,
  CaseStudyFilterGroup,
} from '../../components/caseStudy/CaseStudyFilters';
import type { CaseStudyFilterState } from '../../services/caseStudyApi';

/**
 * The precise half of the filter system: grouped facets, every option shown.
 *
 * EXTRACTED, NOT REDESIGNED. Adding the search box and the word cloud pushed
 * `StoriesV2.tsx` past the 400-line ceiling `storiesV2Contract.test.ts` enforces,
 * and the repo's rule at a ceiling is to split before adding. The markup below is
 * what was already there.
 *
 * IT KEEPS BOTH NOTES, and they are not decoration. The first distinguishes "the
 * facet menu failed to load" from "there are no facets" - without it a reader
 * sees an empty sidebar and concludes the library is untagged. The second says
 * why illustrative records are missing before anyone wonders whether the list is
 * broken; a default exclusion nobody is told about looks like a bug.
 */
export interface StoriesFilterAsideProps {
  groups: readonly CaseStudyFilterGroup[];
  value: CaseStudyFilterState;
  onToggle: (field: CaseStudyFilterField, optionValue: string) => void;
  /** `<details open>` cannot be driven by a media query, so the page decides. */
  openByDefault: boolean;
  /** The taxonomy request failed; show no menu rather than a partial one. */
  facetsFailed: boolean;
  /** How many records the default verification filter is holding back. */
  withheld: number;
}

export function StoriesFilterAside({
  groups,
  value,
  onToggle,
  openByDefault,
  facetsFailed,
  withheld,
}: StoriesFilterAsideProps): React.ReactElement {
  return (
    <aside
      className="cbv2-stories__aside"
      aria-label="Filter published projects"
      data-testid="stories-filters"
    >
      <CaseStudyFilters
        groups={groups}
        value={value}
        onToggle={onToggle}
        openByDefault={openByDefault}
        idPrefix="stories-filter"
      />
      {facetsFailed ? (
        <p className="cbv2-stories__note" data-testid="stories-facets-note">
          The filter list could not be loaded, so it is not shown. The project records
          below are unaffected.
        </p>
      ) : null}
      {withheld > 0 ? (
        <p className="cbv2-stories__note" data-testid="stories-hidden-note">
          Illustrative demonstrations are withheld unless you select them under
          Verification.
        </p>
      ) : null}
    </aside>
  );
}

export default StoriesFilterAside;

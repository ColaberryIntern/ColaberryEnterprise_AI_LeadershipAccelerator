import type {
  CaseStudyFilterField,
  CaseStudyFilterGroup,
} from '../../components/caseStudy/CaseStudyFilters';
import type { CaseStudyFilterState } from '../../services/caseStudyApi';
import { humanizeFacetLabel } from './facetLabels';

/**
 * storiesFilterModel - W26, the one filter panel on /proof.
 *
 * Ali, 2026-11-18: "when filters are selected, they should show that. All the
 * filters should be filtered by that selection as well." The server now sends
 * facet counts narrowed to the current query (`caseStudyContextualFacets.ts`);
 * these pure helpers decide what the panel shows from them.
 */

/** The order a visitor filters in: who it is for first, then what it is. */
export const GROUP_ORDER: readonly CaseStudyFilterField[] = [
  'department', 'industry', 'capability', 'stack', 'program', 'builtBy', 'verification',
];

/** Options shown per group before "Show all". */
export const VISIBLE_PER_GROUP = 6;

const selectedFor = (state: CaseStudyFilterState, field: CaseStudyFilterField): readonly string[] =>
  (state[field] as readonly string[] | undefined) ?? [];

/**
 * Drop options the current selection cannot reach (count 0), but never a
 * selected one: a choice that vanished from the panel could not be undone there.
 * A selected value the server did not count at all (an old link, say) is added
 * back with 0 so it stays visible and removable. Groups are put in GROUP_ORDER.
 */
export function narrowGroups(
  groups: readonly CaseStudyFilterGroup[],
  state: CaseStudyFilterState,
): CaseStudyFilterGroup[] {
  const rank = (field: CaseStudyFilterField): number => {
    const i = GROUP_ORDER.indexOf(field);
    return i === -1 ? GROUP_ORDER.length : i;
  };
  return [...groups]
    .sort((a, b) => rank(a.field) - rank(b.field))
    .map((group) => {
      const selected = selectedFor(state, group.field);
      const options = group.options.filter((o) => o.count > 0 || selected.includes(o.value));
      for (const value of selected) {
        if (!options.some((o) => o.value === value)) {
          options.push({ value, label: humanizeFacetLabel(value), count: 0 });
        }
      }
      return { ...group, options };
    });
}

export interface ActiveFilterChip {
  readonly field: CaseStudyFilterField;
  readonly value: string;
  readonly legend: string;
  readonly label: string;
}

/** Every value the URL selects, labelled the way the panel labels it. */
export function activeFilterChips(
  groups: readonly CaseStudyFilterGroup[],
  state: CaseStudyFilterState,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  for (const group of groups) {
    for (const value of selectedFor(state, group.field)) {
      const option = group.options.find((o) => o.value === value);
      chips.push({
        field: group.field,
        value,
        legend: group.legend,
        label: option ? option.label : humanizeFacetLabel(value),
      });
    }
  }
  return chips;
}

/**
 * The title in two tones, like every other page hero: the last clause in the
 * accent ("What we shipped, / and who built it."). The words are the server's;
 * only where they break is decided here. No comma, no accent.
 */
export function splitTitle(title: string): readonly [string, string] {
  const at = title.lastIndexOf(', ');
  if (at <= 0) return [title, ''];
  return [title.slice(0, at + 1), title.slice(at + 2)];
}

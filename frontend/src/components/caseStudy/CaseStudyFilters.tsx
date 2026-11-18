import React from 'react';
import type { CaseStudyFilterState } from '../../services/caseStudyApi';
import './caseStudy.css';

/**
 * CaseStudyFilters - the facet controls for an index.
 *
 * IT KNOWS NO VOCABULARY. Groups, their legends, their option labels and their
 * counts are all handed in. The component's job is the control surface and its
 * accessibility, not what the facets are called - which is what lets the same
 * component serve a surface whose facets are entirely different.
 *
 * KEYBOARD AND SCREEN READER, BY CONSTRUCTION RATHER THAN BY ARIA. Each option
 * is a real `<input type="checkbox">` inside its own `<label>`, so it is
 * focusable, togglable with Space, and announced with its label and checked
 * state without a single `role` or `aria-selected`. Progressive disclosure is a
 * native `<details>/<summary>`, which is a real disclosure widget on every
 * platform. A div with a click handler would have needed four attributes and a
 * keydown handler to reach the same place, and would have got one of them wrong.
 *
 * SELECTION IS NOT A COLOUR. A checked box is a checked box; the tinted pill is
 * decoration on top of it, and the count of selected options is printed as words
 * in the summary.
 *
 * NO `aria-live` HERE. The result count lives on the page, not on the controls,
 * and announcing from two places would double-speak every change.
 */

/** The state fields a facet group may write to. */
export type CaseStudyFilterField =
  | 'capability'
  | 'industry'
  | 'department'
  | 'stack'
  | 'program'
  | 'deliverable'
  | 'builtBy'
  | 'verification'
  | 'verificationMethod'
  | 'status';

export interface CaseStudyFilterOption {
  readonly value: string;
  readonly label: string;
  /** How many published records carry this facet. Derived, never typed in. */
  readonly count: number;
}

export interface CaseStudyFilterGroup {
  readonly field: CaseStudyFilterField;
  readonly legend: string;
  readonly options: readonly CaseStudyFilterOption[];
}

export interface CaseStudyFiltersProps {
  groups: readonly CaseStudyFilterGroup[];
  value: CaseStudyFilterState;
  onToggle: (field: CaseStudyFilterField, optionValue: string) => void;
  /**
   * Collapsed groups are the small-screen presentation; the page decides,
   * because only the page knows how much room it has.
   */
  openByDefault?: boolean;
  /** Keeps input ids unique when two filter sets share a page. */
  idPrefix?: string;
  className?: string;
  /**
   * W26: options shown per group before a "Show all" button. A long group (the
   * capability list runs past a hundred) otherwise pushes the results a page
   * down. Selected options always show, so a choice can never be hidden.
   */
  visibleLimit?: number;
}

const selectedIn = (value: CaseStudyFilterState, field: CaseStudyFilterField): readonly string[] =>
  value[field] as readonly string[];

export function CaseStudyFilters({
  groups,
  value,
  onToggle,
  openByDefault = true,
  idPrefix = 'cs-filter',
  className,
  visibleLimit,
}: CaseStudyFiltersProps): React.ReactElement | null {
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());
  const usable = groups.filter((group) => group.options.length > 0);
  // An empty facet menu is worse than none: it advertises filters that cannot
  // match anything. The zero-data state belongs to the page.
  if (usable.length === 0) return null;

  return (
    <div className={`cbv2-cs-filters${className ? ` ${className}` : ''}`}>
      {usable.map((group) => {
        const selected = selectedIn(value, group.field);
        const limited = visibleLimit !== undefined && !expanded.has(group.field)
          && group.options.length > visibleLimit;
        const shown = limited
          ? group.options.filter((option, i) => i < (visibleLimit as number) || selected.includes(option.value))
          : group.options;
        return (
          <details className="cbv2-cs-filters__group" key={group.field} open={openByDefault}>
            <summary className="cbv2-cs-filters__summary">
              <span>{group.legend}</span>
              <span className="cbv2-cs-filters__count">
                {selected.length > 0 ? `${selected.length} selected` : 'Any'}
              </span>
            </summary>
            <ul className="cbv2-cs-filters__options">
              {shown.map((option) => {
                const id = `${idPrefix}-${group.field}-${option.value}`;
                return (
                  <li key={option.value}>
                    <label className="cbv2-cs-filters__option" htmlFor={id}>
                      <input
                        id={id}
                        type="checkbox"
                        name={group.field}
                        value={option.value}
                        checked={selected.includes(option.value)}
                        onChange={() => onToggle(group.field, option.value)}
                      />
                      <span>{option.label}</span>
                      <span className="cbv2-cs-filters__tally">
                        {option.count}
                        <span className="cbv2-cs-sr-only"> matching projects</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {visibleLimit !== undefined && group.options.length > visibleLimit ? (
              <button
                type="button"
                className="cbv2-cs-filters__more"
                aria-expanded={!limited}
                onClick={() => setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(group.field)) next.delete(group.field); else next.add(group.field);
                  return next;
                })}
              >
                {limited ? `Show all ${group.options.length}` : 'Show fewer'}
              </button>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

export default CaseStudyFilters;

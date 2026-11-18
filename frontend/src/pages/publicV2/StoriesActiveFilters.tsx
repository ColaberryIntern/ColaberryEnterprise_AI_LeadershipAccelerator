import React from 'react';
import type { CaseStudyFilterField } from '../../components/caseStudy/CaseStudyFilters';
import type { ActiveFilterChip } from './storiesFilterModel';

/**
 * W26: what is filtered, said above the results. Each chip is a real button that
 * removes its one value (the same toggle the checkbox uses), and "Clear all"
 * empties the URL. Renders nothing when nothing is selected.
 */
export interface StoriesActiveFiltersProps {
  chips: readonly ActiveFilterChip[];
  onRemove: (field: CaseStudyFilterField, value: string) => void;
  onClear: () => void;
}

export function StoriesActiveFilters({
  chips,
  onRemove,
  onClear,
}: StoriesActiveFiltersProps): React.ReactElement | null {
  if (chips.length === 0) return null;
  return (
    <div className="cbv2-stories__active" data-testid="stories-active-filters">
      <span className="cbv2-stories__active-label">Filtered by</span>
      <ul className="cbv2-stories__active-list">
        {chips.map((chip) => (
          <li key={`${chip.field}:${chip.value}`}>
            <button
              type="button"
              className="cbv2-stories__chip"
              onClick={() => onRemove(chip.field, chip.value)}
              aria-label={`Remove filter ${chip.legend}: ${chip.label}`}
            >
              <span className="cbv2-stories__chip-legend">{chip.legend}:</span> {chip.label}
              <span className="cbv2-stories__chip-x" aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="cbv2-btn cbv2-btn--ghost cbv2-btn--sm"
        onClick={onClear}
        data-testid="stories-clear-filters"
      >
        Clear all filters
      </button>
    </div>
  );
}

export default StoriesActiveFilters;

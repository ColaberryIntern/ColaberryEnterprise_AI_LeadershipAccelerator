import React from 'react';

export interface SearchFilterValues {
  search: string;
  status: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface SearchFiltersProps {
  filters: SearchFilterValues;
  onChange: (filters: SearchFilterValues) => void;
  statusOptions?: { value: string; label: string }[];
  sortOptions?: { value: string; label: string }[];
  placeholder?: string;
  totalResults?: number;
}

const DEFAULT_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const DEFAULT_SORT_OPTIONS = [
  { value: 'created_at', label: 'Date Created' },
  { value: 'name', label: 'Name' },
  { value: 'updated_at', label: 'Last Updated' },
];

function SearchFilters({
  filters,
  onChange,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  sortOptions = DEFAULT_SORT_OPTIONS,
  placeholder = 'Search...',
  totalResults,
}: SearchFiltersProps) {
  const update = (partial: Partial<SearchFilterValues>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
      <div className="position-relative flex-grow-1" style={{ minWidth: 200, maxWidth: 360 }}>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder={placeholder}
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          aria-label="Search"
        />
      </div>
      <select
        className="form-select form-select-sm"
        style={{ width: 'auto', minWidth: 140 }}
        value={filters.status}
        onChange={(e) => update({ status: e.target.value })}
        aria-label="Filter by status"
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <select
        className="form-select form-select-sm"
        style={{ width: 'auto', minWidth: 150 }}
        value={filters.sortBy}
        onChange={(e) => update({ sortBy: e.target.value })}
        aria-label="Sort by"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        className="btn btn-outline-secondary btn-sm"
        onClick={() => update({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
        title={`Sort ${filters.sortOrder === 'asc' ? 'descending' : 'ascending'}`}
        aria-label={`Sort ${filters.sortOrder === 'asc' ? 'descending' : 'ascending'}`}
      >
        {filters.sortOrder === 'asc' ? '\u2191' : '\u2193'}
      </button>
      {totalResults !== undefined && (
        <span className="text-muted small ms-auto">
          {totalResults} result{totalResults !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

export default SearchFilters;

import React from 'react';

export interface SearchResultItem {
  id: string;
  title: string;
  description?: string;
  status?: string;
  category?: string;
  metadata?: Record<string, string | number>;
  updatedAt?: string;
}

interface SearchResultsGridProps {
  results: SearchResultItem[];
  loading?: boolean;
  emptyMessage?: string;
  onSelect?: (item: SearchResultItem) => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'success',
  completed: 'info',
  archived: 'secondary',
  pending: 'warning',
  error: 'danger',
  new: 'primary',
};

function SearchResultsGrid({
  results,
  loading = false,
  emptyMessage = 'No results found.',
  onSelect,
  page = 1,
  totalPages = 1,
  onPageChange,
}: SearchResultsGridProps) {
  if (loading) {
    return (
      <div className="text-center py-5" role="status">
        <div className="spinner-border text-primary spinner-border-sm" />
        <span className="visually-hidden">Loading results...</span>
        <p className="text-muted small mt-2">Loading results...</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-5">
        <p className="text-muted mb-0">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className="row g-3">
        {results.map((item) => (
          <div key={item.id} className="col-12 col-md-6 col-xl-4">
            <div
              className="card border-0 shadow-sm h-100"
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onClick={() => onSelect?.(item)}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onKeyDown={(e) => {
                if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelect(item);
                }
              }}
            >
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <h6 className="card-title mb-0 fw-semibold" style={{ color: 'var(--color-primary)' }}>
                    {item.title}
                  </h6>
                  {item.status && (
                    <span className={`badge bg-${STATUS_COLORS[item.status] || 'secondary'}`}>
                      {item.status}
                    </span>
                  )}
                </div>
                {item.category && (
                  <span className="badge bg-light text-dark small mb-2 d-inline-block"
                    style={{ borderColor: 'var(--color-border)', border: '1px solid' }}>
                    {item.category}
                  </span>
                )}
                {item.description && (
                  <p className="card-text small mb-2" style={{ color: 'var(--color-text-light)' }}>
                    {item.description.length > 150 ? `${item.description.slice(0, 150)}...` : item.description}
                  </p>
                )}
                {item.metadata && Object.keys(item.metadata).length > 0 && (
                  <div className="d-flex gap-3 flex-wrap mt-auto">
                    {Object.entries(item.metadata).map(([key, val]) => (
                      <div key={key} className="text-center">
                        <div className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>{val}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>
                          {key.replace(/_/g, ' ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {item.updatedAt && (
                  <div className="mt-2" style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>
                    Updated {new Date(item.updatedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && onPageChange && (
        <nav className="d-flex justify-content-center mt-4" aria-label="Search results pagination">
          <ul className="pagination pagination-sm mb-0">
            <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
                Previous
              </button>
            </li>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1;
              return (
                <li key={p} className={`page-item ${p === page ? 'active' : ''}`}>
                  <button className="page-link" onClick={() => onPageChange(p)}>
                    {p}
                  </button>
                </li>
              );
            })}
            {totalPages > 7 && (
              <li className="page-item disabled"><span className="page-link">...</span></li>
            )}
            <li className={`page-item ${page >= totalPages ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
                Next
              </button>
            </li>
          </ul>
        </nav>
      )}
    </>
  );
}

export default SearchResultsGrid;

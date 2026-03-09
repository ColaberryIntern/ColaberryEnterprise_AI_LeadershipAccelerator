import React, { useState } from 'react';
import { QualityBreakdown, QualityCategory, getScoreColor, getGrade } from './types';

interface Props {
  miniSectionId?: string;
  qualityBreakdown: QualityBreakdown | null;
  loading: boolean;
  onRefresh: () => void;
}

function CategoryBar({ cat }: { cat: QualityCategory }) {
  const pct = cat.maxScore > 0 ? Math.round((cat.score / cat.maxScore) * 100) : 0;
  const barColor = pct >= 90 ? 'bg-info' : pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-danger';

  return (
    <div className="mb-2">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <span className="small fw-medium">{cat.name}</span>
        <span className="small text-muted">{cat.score}/{cat.maxScore}</span>
      </div>
      <div className="progress" style={{ height: 6 }}>
        <div className={`progress-bar ${barColor}`} style={{ width: `${pct}%` }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}></div>
      </div>
      {cat.details.length > 0 && (
        <ul className="list-unstyled mb-0 mt-1">
          {cat.details.map((d, i) => (
            <li key={i} className="text-muted" style={{ fontSize: 10, paddingLeft: 8 }}>
              <i className="bi bi-dot"></i> {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function QualityScoreSection({ miniSectionId, qualityBreakdown, loading, onRefresh }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  if (!miniSectionId) {
    return <p className="text-muted small mb-0">Save the mini-section first to see quality scores.</p>;
  }

  if (!qualityBreakdown && !loading) {
    return (
      <div className="text-center py-2">
        <p className="text-muted small mb-2">No quality score yet.</p>
        <button className="btn btn-sm btn-outline-primary" onClick={onRefresh}>
          <i className="bi bi-graph-up me-1"></i>Calculate Score
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-2">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Scoring...</span>
        </div>
        <span className="small text-muted">Calculating quality score...</span>
      </div>
    );
  }

  const { overall, grade, categories } = qualityBreakdown!;

  return (
    <div>
      {/* Overall score header */}
      <div className="d-flex align-items-center gap-3 mb-3">
        <div className="text-center">
          <div
            className={`d-flex align-items-center justify-content-center rounded-circle ${getScoreColor(overall)}`}
            style={{ width: 52, height: 52, fontSize: 18, fontWeight: 700, color: overall >= 40 && overall < 70 ? undefined : '#fff' }}
          >
            {overall}
          </div>
          <span className="small fw-semibold mt-1 d-block">Grade {grade}</span>
        </div>
        <div className="flex-grow-1">
          <div className="progress mb-1" style={{ height: 10 }}>
            <div
              className={`progress-bar ${getScoreColor(overall)}`}
              style={{ width: `${overall}%` }}
              role="progressbar"
              aria-valuenow={overall}
              aria-valuemin={0}
              aria-valuemax={100}
            ></div>
          </div>
          <div className="d-flex justify-content-between">
            <span className="text-muted" style={{ fontSize: 10 }}>0</span>
            <span className="text-muted" style={{ fontSize: 10 }}>100</span>
          </div>
        </div>
        <button className="btn btn-sm btn-outline-secondary flex-shrink-0" onClick={onRefresh} title="Refresh score">
          <i className="bi bi-arrow-clockwise"></i>
        </button>
      </div>

      {/* Category breakdown toggle */}
      <button
        className="btn btn-sm btn-link text-decoration-none p-0 mb-2"
        onClick={() => setShowDetails(!showDetails)}
      >
        <i className={`bi ${showDetails ? 'bi-chevron-up' : 'bi-chevron-down'} me-1`}></i>
        {showDetails ? 'Hide' : 'Show'} category breakdown ({categories.length})
      </button>

      {showDetails && (
        <div className="border rounded p-2">
          {categories.map((cat, i) => (
            <CategoryBar key={i} cat={cat} />
          ))}
        </div>
      )}
    </div>
  );
}

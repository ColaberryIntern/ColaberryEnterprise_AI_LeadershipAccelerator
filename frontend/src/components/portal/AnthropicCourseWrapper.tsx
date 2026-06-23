import React from 'react';

interface Props {
  title: string;
  url: string;
  description?: string;
  estimatedMinutes?: number;
  courseNumber?: number;
}

function AnthropicCourseWrapper({ title, url, description, estimatedMinutes, courseNumber }: Props) {
  return (
    <div
      className="card border-0 shadow-sm"
      style={{ borderLeft: '4px solid #6366f1' }}
    >
      <div className="card-body" style={{ padding: '16px 20px' }}>

        {/* Badge row */}
        <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
          <span
            className="badge"
            style={{ background: '#fff3e0', color: '#c15c1b', fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' }}
          >
            Anthropic
          </span>
          <span
            className="badge"
            style={{ background: '#eef2ff', color: '#6366f1', fontSize: 10, fontWeight: 600 }}
          >
            <i className="bi bi-mortarboard me-1" aria-hidden="true"></i>Skilljar
          </span>
          {courseNumber != null && (
            <span
              className="badge"
              style={{ background: '#f1f5f9', color: '#64748b', fontSize: 10, fontWeight: 600 }}
            >
              Course {courseNumber}
            </span>
          )}
        </div>

        {/* Title */}
        <h6
          className="fw-bold mb-1"
          style={{ color: '#1e293b', fontSize: 14, lineHeight: 1.4 }}
        >
          {title}
        </h6>

        {/* Description */}
        {description && (
          <p
            className="mb-0 small"
            style={{ color: '#64748b', lineHeight: 1.6 }}
          >
            {description}
          </p>
        )}

        {/* Footer: duration + CTA */}
        <div
          className="d-flex align-items-center justify-content-between gap-2 flex-wrap"
          style={{ marginTop: 14 }}
        >
          {estimatedMinutes != null ? (
            <span className="small" style={{ color: '#94a3b8' }}>
              <i className="bi bi-clock me-1" aria-hidden="true"></i>
              {estimatedMinutes} min
            </span>
          ) : (
            <span />
          )}

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm px-3"
            style={{
              background: '#6366f1',
              color: '#fff',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              minHeight: 36,
              display: 'inline-flex',
              alignItems: 'center',
            }}
            aria-label={`Launch ${title} — opens in new tab`}
          >
            <i className="bi bi-box-arrow-up-right me-1" aria-hidden="true"></i>
            Launch Course
          </a>
        </div>
      </div>
    </div>
  );
}

export default AnthropicCourseWrapper;

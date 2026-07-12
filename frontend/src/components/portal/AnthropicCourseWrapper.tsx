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
      className="card border-0 shadow-sm card-lift"
      style={{ borderLeft: '4px solid #FB2832' }}
    >
      <div className="card-body p-3 px-md-4">

        {/* Badge row */}
        <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
          <span
            className="badge text-uppercase"
            style={{ background: '#FB2832', color: 'var(--color-bg)', letterSpacing: '0.03em' }}
          >
            Anthropic
          </span>
          <span
            className="badge bg-light border"
            style={{ color: '#C20E1E' }}
          >
            <i className="bi bi-mortarboard me-1" aria-hidden="true"></i>Skilljar
          </span>
          {courseNumber != null && (
            <span className="badge bg-light border text-muted">
              Course {courseNumber}
            </span>
          )}
        </div>

        {/* Title — h6 inherits navy #FB2832 from the global heading rule */}
        <h6 className="fw-bold mb-1" style={{ fontSize: 14, lineHeight: 1.4 }}>
          {title}
        </h6>

        {/* Description */}
        {description && (
          <p className="mb-0 small text-muted">
            {description}
          </p>
        )}

        {/* Footer: duration + CTA */}
        <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mt-3">
          {estimatedMinutes != null ? (
            <span className="small text-muted">
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
            className="btn btn-sm px-3 d-inline-flex align-items-center"
            style={{ background: '#FB2832', color: '#fff', border: 'none' }}
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

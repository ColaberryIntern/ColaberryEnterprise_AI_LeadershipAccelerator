import React from 'react';

/**
 * The learner's journey nudges on the portal dashboard (Growth Journey OS,
 * Phase 5 T514): the in-app channel's one surface. It renders what
 * `GET /api/portal/journey-nudges` returns - four fields a nudge, every title
 * and href copied at execution time from content a human approved - and it
 * renders nothing at all when there is nothing to show: no empty box, no
 * "you're all caught up", nothing a learner has to look past.
 *
 * The href is rendered as a plain attribute, and only when it is a portal
 * path or an https link; anything else shows the title without a link. The
 * server already refused everything else before the row existed; this is the
 * browser's own copy of the rule.
 */

export interface JourneyNudge {
  id: string;
  title: string;
  href: string | null;
  purpose: string | null;
}

interface Props {
  nudges: JourneyNudge[];
  onDismiss: (id: string) => void;
}

/** A relative portal path (not protocol-relative), or https. Nothing else becomes a link. */
export function safeNudgeHref(href: string | null): string | null {
  if (!href) return null;
  if (/^\/(?![/\\])/.test(href)) return href;
  if (/^https:\/\/[^/\s]+/i.test(href)) return href;
  return null;
}

export default function JourneyNudgeCard({ nudges, onDismiss }: Props) {
  if (nudges.length === 0) return null;
  return (
    <div className="card border-0 shadow-sm mb-4" data-testid="gj-journey-nudge-card">
      <div className="card-header bg-white border-bottom" style={{ padding: '12px 16px' }}>
        <span className="fw-semibold small" style={{ color: '#1e293b' }}>
          <i className="bi bi-lightbulb me-2"></i>Suggested next steps
        </span>
      </div>
      <ul className="list-group list-group-flush">
        {nudges.map((n) => {
          const href = safeNudgeHref(n.href);
          return (
            <li key={n.id} className="list-group-item d-flex align-items-center justify-content-between gap-3" data-testid="gj-journey-nudge">
              <span className="small fw-medium">
                {href ? <a href={href} className="text-decoration-none">{n.title}</a> : n.title}
              </span>
              <button type="button" className="btn btn-link btn-sm text-muted p-0 flex-shrink-0" aria-label={`Dismiss: ${n.title}`} onClick={() => onDismiss(n.id)}>
                Dismiss
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

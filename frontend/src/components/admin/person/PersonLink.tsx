import React from 'react';
import { Link } from 'react-router-dom';
import { PersonRef, personPath } from '../../../adminOs/personLink';

/**
 * A person's name, linked to their 360 profile.
 *
 * Drop this in wherever an admin surface shows who someone is. It takes whatever
 * identifiers the row happens to carry and renders:
 *
 *   - a link to /admin/people/... when any of them resolves
 *   - the plain name when none does, rather than a link that would 404
 *
 * ── WHY A COMPONENT AND NOT JUST THE HELPER ─────────────────────────────────
 *
 * Because the fallback is the whole point. Fourteen call sites each writing
 * `path ? <Link/> : name` is fourteen chances to render a dead link for the rows
 * that carry no email — and on the leads table alone that is a real fraction of
 * rows. One component means one correct fallback.
 *
 * The name itself is also allowed to be missing: a lead captured from a form
 * with no name still has an email and a history worth opening, so it falls back
 * to the email, then to a stated placeholder. An empty cell that is secretly a
 * link is worse than either.
 */
export interface PersonLinkProps extends PersonRef {
  /** What to show. Falls back to the email, then to a stated placeholder. */
  name?: string | null;
  className?: string;
  /** Extra hint for the title attribute, appended after the person's identity. */
  title?: string;
  /**
   * Stop the click reaching an enclosing row handler.
   *
   * Several rosters put the name inside a `<tr onClick>` that opens a drawer.
   * Without this, clicking the name both navigates AND fires the drawer, and the
   * drawer's state update lands on an unmounting component.
   */
  stopPropagation?: boolean;
  children?: React.ReactNode;
}

export default function PersonLink({
  name, email, leadId, enrollmentId, className, title, stopPropagation, children,
}: PersonLinkProps) {
  const to = personPath({ email, leadId, enrollmentId });

  const label = children
    ?? (name && name.trim())
    ?? null;
  const shown = label || (email && email.trim()) || null;

  const body: React.ReactNode = shown ?? <span className="text-muted">Unnamed</span>;

  if (!to) {
    // No usable identifier. Say so on hover rather than silently rendering an
    // inert name that looks like every other clickable one.
    return (
      <span className={className} title="No email or id on this record, so there is no profile to open">
        {body}
      </span>
    );
  }

  const identity = (name && name.trim()) || (email && email.trim()) || 'this person';
  return (
    <Link
      to={to}
      className={className ?? 'text-decoration-none fw-medium'}
      title={title ? `${identity} — ${title}` : `Open the 360 profile for ${identity}`}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {body}
    </Link>
  );
}

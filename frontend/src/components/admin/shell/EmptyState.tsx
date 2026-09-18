import React from 'react';
import { Link } from 'react-router-dom';

interface Props {
  /** RemixIcon name WITHOUT the `ri-` prefix, matching SectionCard and the nav. */
  icon?: string;
  title: string;
  description?: React.ReactNode;
  /** The way out. A `to` renders a link; an `onAction` renders a button. Give one, not both. */
  actionLabel?: string;
  to?: string;
  onAction?: () => void;
  /** Softens the block where an empty panel is normal rather than a gap to be filled. */
  tone?: 'default' | 'quiet';
}

/**
 * EmptyState - what a panel says when it has nothing, and what to do about it.
 *
 * Promoted into the shell from `components/ui/EmptyState`, which no page ever imported: three
 * marketing pages hand-rolled their own instead, so an operator met three different voices for
 * the same situation. Two things changed in the move.
 *
 * First, it takes a `to`. Every empty state that matters here is a door - no accounts connected
 * leads to Brands, nothing scheduled leads to the Composer - and the old component could only
 * fire a callback, so every caller that wanted a link had to skip it and write its own.
 *
 * Second, the accent comes from `--color-primary` rather than a hardcoded `#FB2832`. The old
 * copy predates the token and would have had to be found and edited by hand on the day the
 * brand colour moves.
 *
 * A new brand starts with no posts, no accounts and no campaigns, so these panels ARE the first
 * impression of the product. They name what is missing and where to go, never just "No data".
 */
export default function EmptyState({
  icon, title, description, actionLabel, to, onAction, tone = 'default',
}: Props) {
  const action = actionLabel && (to
    ? <Link className="btn btn-sm admin-empty__action" to={to}>{actionLabel}</Link>
    : onAction
      ? <button type="button" className="btn btn-sm admin-empty__action" onClick={onAction}>{actionLabel}</button>
      : null);

  return (
    <div className={`admin-empty${tone === 'quiet' ? ' admin-empty--quiet' : ''}`}>
      {icon && <i className={`ri-${icon} admin-empty__icon`} aria-hidden="true" />}
      <p className="admin-empty__title">{title}</p>
      {description && <p className="admin-empty__desc">{description}</p>}
      {action}
    </div>
  );
}

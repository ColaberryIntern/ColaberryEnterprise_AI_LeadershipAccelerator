import React from 'react';

/**
 * An admin room (the Staff Office's links), shared by the building card and the list view (C6 rule, C11 shared): these work only
 * through the Management Portal bridge, so with management access they open in a new tab, and without it they are disabled
 * with aria-disabled. Never a door zoom and never a dead link.
 */
export default function AdminLink({ label, route, className, isMgmt, children }: {
  label: string; route: string; className: string; isMgmt: boolean; children?: React.ReactNode;
}): React.ReactElement {
  const content = children ?? label;
  return isMgmt
    ? <a className={className} href={route} target="_blank" rel="noopener noreferrer" data-admin="true" aria-label={children ? `${label} (opens in a new tab)` : undefined}>{content}</a>
    : <span className={`${className} is-disabled`} aria-disabled="true" data-admin="true">{content}</span>;
}

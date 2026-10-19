import React from 'react';

/**
 * An admin room (the Staff Office's links), shared by the building card and the list view (C6 rule, C11 shared): these work only
 * through the Management Portal bridge, so with management access they open in a new tab, and without it they are disabled
 * with aria-disabled. Never a door zoom and never a dead link.
 */
export default function AdminLink({ label, route, className, isMgmt }: { label: string; route: string; className: string; isMgmt: boolean }): React.ReactElement {
  return isMgmt
    ? <a className={className} href={route} target="_blank" rel="noopener noreferrer" data-admin="true">{label}</a>
    : <span className={`${className} is-disabled`} aria-disabled="true" data-admin="true">{label}</span>;
}

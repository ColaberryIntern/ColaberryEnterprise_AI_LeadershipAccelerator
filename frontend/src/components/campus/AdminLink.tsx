import React from 'react';
import { mgmtBridgeBlockedReason } from '../../pages/portal/mgmtBridgeGate';

/**
 * An admin room (the Staff Office's links), shared by the building card and the list view (C6 rule, C11 shared): these work only
 * through the Management Portal bridge, so with management access they open in a new tab, and without it they are disabled
 * with aria-disabled. Never a door zoom and never a dead link.
 *
 * AF2.7: the bridge is also withheld during a read-only "View as member" session. The check lives
 * HERE, at the one leaf every call site renders (BuildingCard, CampusListView, CampusNav,
 * ConciergeCards), rather than in each of them — a fifth call site added later inherits the rule
 * instead of having to remember it. The reason is carried on the element itself because, unlike
 * the sidebar entry, a disabled campus room stays on screen with nothing else to explain it.
 * `target="_blank"` is exactly what makes this necessary: see mgmtBridgeGate.ts.
 */
export default function AdminLink({ label, route, className, isMgmt, children }: {
  label: string; route: string; className: string; isMgmt: boolean; children?: React.ReactNode;
}): React.ReactElement {
  const content = children ?? label;
  const blocked = mgmtBridgeBlockedReason();
  if (blocked) {
    return (
      <span className={`${className} is-disabled`} aria-disabled="true" data-admin="true"
        data-admin-blocked="view-as" title={blocked} aria-label={`${label} — ${blocked}`}>{content}</span>
    );
  }
  return isMgmt
    ? <a className={className} href={route} target="_blank" rel="noopener noreferrer" data-admin="true" aria-label={children ? `${label} (opens in a new tab)` : undefined}>{content}</a>
    : <span className={`${className} is-disabled`} aria-disabled="true" data-admin="true">{content}</span>;
}

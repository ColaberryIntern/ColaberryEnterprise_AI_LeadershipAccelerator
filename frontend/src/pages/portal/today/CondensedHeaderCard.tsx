import React from 'react';

export type CondensedTone = 'leaf' | 'berry' | 'cherry' | 'amber';

type Props = {
  /** Leading badge icon for the card's main subject (e.g. a sparkle for "next step"). */
  icon?: React.ReactNode;
  /** Accent for the icon badge + left edge — the "conditional formatting" hook
   *  (e.g. cherry when something's overdue, leaf when caught up). */
  tone?: CondensedTone;
  label: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
};

/**
 * Shared compact presentation for whatever a page hands PortalShell as its
 * condensedSlot — the same shape (icon + label/title/sub + action) is reused
 * across every page that opts into condensing, so the header reads
 * consistently regardless of which page condensed into it.
 */
const CondensedHeaderCard: React.FC<Props> = ({ icon, tone, label, title, sub, action }) => (
  <div className={`te-condensed${tone ? ` tone-${tone}` : ''}`}>
    {icon && <span className="te-cmini-icon">{icon}</span>}
    <div className="te-cmini-tx">
      <span className="lab">{label}</span>
      <span className="val">{title}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
    {action}
  </div>
);

export default CondensedHeaderCard;

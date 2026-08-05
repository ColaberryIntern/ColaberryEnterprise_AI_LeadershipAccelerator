import React from 'react';

export type CondensedTone = 'leaf' | 'berry' | 'cherry' | 'amber';

export type CondensedStat = {
  icon: React.ReactNode;
  value: string;
  tone: CondensedTone;
  title?: string;
};

type Props = {
  /** Leading badge icon for the card's main subject (e.g. a star for level/tier). */
  icon?: React.ReactNode;
  visual?: React.ReactNode;
  /** Accent for the icon badge + left edge — the "conditional formatting" hook
   *  (e.g. cherry when something's overdue, leaf when caught up). */
  tone?: CondensedTone;
  label: string;
  title: string;
  sub?: string;
  /** Compact colored stat chips shown between the main text and the action
   *  (e.g. Readiness next to Next Tier). */
  stats?: CondensedStat[];
  action?: React.ReactNode;
};

/**
 * Shared compact presentation for whatever a page hands PortalShell as its
 * condensedSlot — the same shape (icon + mini visual + label/title/sub + stat
 * chips + action) is reused across every page that opts into condensing, so
 * the header reads consistently regardless of which page condensed into it.
 */
const CondensedHeaderCard: React.FC<Props> = ({ icon, visual, tone, label, title, sub, stats, action }) => (
  <div className={`te-condensed${tone ? ` tone-${tone}` : ''}`}>
    {icon && <span className="te-cmini-icon">{icon}</span>}
    {visual}
    <div className="te-cmini-tx">
      <span className="lab">{label}</span>
      <span className="val">{title}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
    {stats && stats.length > 0 && (
      <div className="te-cmini-stats">
        {stats.map((s, i) => (
          <span key={i} className={`te-cmini-stat tone-${s.tone}`} title={s.title}>
            {s.icon}<b>{s.value}</b>
          </span>
        ))}
      </div>
    )}
    {action}
  </div>
);

export default CondensedHeaderCard;

import React from 'react';

type Props = {
  visual?: React.ReactNode;
  label: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
};

/**
 * Shared compact presentation for whatever a page hands PortalShell as its
 * condensedSlot — the same shape (mini visual + label/title/sub + action) is
 * reused by Today, Projects, and Classroom so the header reads consistently
 * regardless of which page condensed into it.
 */
const CondensedHeaderCard: React.FC<Props> = ({ visual, label, title, sub, action }) => (
  <div className="te-condensed">
    {visual}
    <div className="te-cmini-tx">
      <span className="lab">{label}</span>
      <span className="val">{title}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
    {action}
  </div>
);

export default CondensedHeaderCard;

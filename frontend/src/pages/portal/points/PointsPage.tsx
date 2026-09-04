import React from 'react';
import PortalShell from '../today/PortalShell';
import CondensedHeaderCard from '../today/CondensedHeaderCard';
import PointsDrilldown from './PointsDrilldown';
import PointsRail from './PointsRail';

/**
 * PointsPage — the dedicated points drill-down at /portal/points. The actual
 * 3-lens breakdown lives in the shared <PointsDrilldown/> component, which the
 * Settings "Points" tab also renders (one screen, two entry points).
 *
 * Laid out like every other main portal page: a working column, a sticky rail to
 * its right carrying what you track while you read, and a condensed header that
 * keeps the page's subject in the top bar once you scroll past the title. The
 * breakdown is long, and before this the total scrolled away with it.
 */
const PointsPage: React.FC = () => (
  <PortalShell
    condensedSlot={(
      <CondensedHeaderCard
        label="Your progress"
        title="Your points, broken down"
        sub="Engagement, XP and skill — three lenses on the same growth"
        tone="berry"
      />
    )}
  >
    <div className="te-page-h">
      <div className="crumb">Your progress</div>
      <h1>Your points, broken down</h1>
      <div className="sub">Three ways you grow here. Together they tell you where you are and exactly what moves you forward.</div>
    </div>
    <div className="te-grid">
      {/* min-width:0 because a grid item defaults to min-content width and would
          otherwise refuse to shrink, pushing the page sideways. */}
      <div style={{ minWidth: 0 }}>
        <PointsDrilldown />
      </div>
      <aside className="te-side">
        <PointsRail />
      </aside>
    </div>
  </PortalShell>
);

export default PointsPage;

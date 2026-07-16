import React from 'react';
import PortalShell from '../today/PortalShell';
import PointsDrilldown from './PointsDrilldown';

/**
 * PointsPage — the dedicated points drill-down at /portal/points. The actual
 * 3-lens breakdown lives in the shared <PointsDrilldown/> component, which the
 * Settings "Points" tab also renders (one screen, two entry points).
 */
const PointsPage: React.FC = () => (
  <PortalShell>
    <div className="te-page-h">
      <div className="crumb">Your progress</div>
      <h1>Your points, broken down</h1>
      <div className="sub">Three ways you grow here. Together they tell you where you are and exactly what moves you forward.</div>
    </div>
    <PointsDrilldown />
  </PortalShell>
);

export default PointsPage;

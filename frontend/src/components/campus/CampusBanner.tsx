import React, { useState } from 'react';
import CampusLive from './CampusLive';
import CampusRail from './CampusRail';
import CampusMeHost from './home/CampusMeHost';
import './campus.css';
import './campusBanner.css';
import './campusPageChrome.css';
import './campusLive.css';
import './campusPanels.css'; // WP-7: the Me panel

/**
 * What sits at the top of a campus page's content (Colaberry Campus C3; C16 moved the bar itself out). Since round 3 §2.4 the
 * light location bar (CampusLocationBar: Campus map, the trail, Step outside, Where to?, you) is its own full-width row above
 * the columns, so this keeps only what belongs to the page column:
 *  - "Next steps" (narrow screens, or a page with no rail of its own): the rail as a drawer, so your next steps and the tour are
 *    never more than one tap away;
 *  - Colaberry Live, when something is on air;
 *  - the Me panel's host (the bar's "you" button opens it).
 * Rendered by both page chromes (PortalShell and the legacy PortalLayout) and by the Showcase page, only while the campus is active.
 */
function NextStepsDrawer(): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cm-btn is-secondary cm-steps-btn" onClick={() => setOpen(true)} aria-expanded={open} data-testid="cm-steps-open">Next steps</button>
      {open && (
        <div className="cm-steps-drawer" role="dialog" aria-modal="true" aria-label="Your next steps" data-testid="cm-steps-drawer"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          <button type="button" className="cm-steps-x" onClick={() => setOpen(false)} aria-label="Close your next steps" autoFocus>×</button>
          <CampusRail />
        </div>
      )}
    </>
  );
}

export default function CampusBanner({ alwaysSteps = false }: { alwaysSteps?: boolean }): React.ReactElement {
  return (
    <div className={`cm-banner cm-pagebits${alwaysSteps ? ' has-steps' : ''}`} data-testid="cm-banner">
      <NextStepsDrawer />
      {/* C8: what is on air now (renders nothing when nothing is) */}
      <CampusLive />
      <CampusMeHost />
    </div>
  );
}

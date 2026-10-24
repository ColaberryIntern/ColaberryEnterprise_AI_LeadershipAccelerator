import React from 'react';
import { useLocation } from 'react-router-dom';
import CampusBanner from './CampusBanner';
import CampusLocationBar from './CampusLocationBar';
import CampusLayers from './CampusLayers';
import CampusNav from './CampusNav';
import CampusRail from './CampusRail';
import { useCampus } from './CampusContext';

/** The side nav for the current route (only rendered with the campus on, so a campus-off page never needs a router here). */
function ScopedNav(): React.ReactElement {
  return <CampusNav active={useLocation().pathname} />;
}

/**
 * Campus chrome for pages that do NOT render PortalShell (Colaberry Campus C3, D2/D2a): the lean legacy PortalLayout and the
 * Showcase gallery. Wrapped in `.cm-scope`, which maps the campus color names onto the global :root tokens, because the shell
 * tokens only exist inside `.te-shell`. Adds nothing unless the campus is active, so those pages are unchanged otherwise.
 *
 * WP-1 (always a panel with your next steps): given the page as `children` (PortalLayout does), it lays the page out like every
 * other campus page, the campus side nav on the left and the rail on the right (the prototype's .pg-side / .pg-rail), which give
 * way to the banner's Next steps drawer on narrow screens. Without children (Showcase) the banner always offers that drawer.
 */
export default function CampusScopedChrome({ children }: { children?: React.ReactNode }): React.ReactElement | null {
  const { active } = useCampus();
  if (!active) return children ? <>{children}</> : null;
  if (!children) {
    return (
      <div className="cm-scope" data-testid="cm-scope">
        <CampusLocationBar />
        <CampusBanner alwaysSteps />
        <CampusLayers />
      </div>
    );
  }
  return (
    <div className="cm-scope" data-testid="cm-scope">
      <CampusLocationBar />
      <CampusBanner />
      <CampusLayers />
      <div className="cm-scoped-grid">
        <aside className="cm-scoped-side" data-testid="cm-scoped-side"><ScopedNav /></aside>
        <div className="cm-scoped-main">{children}</div>
        <aside className="cm-scoped-rail" aria-label="Your next steps"><CampusRail /></aside>
      </div>
    </div>
  );
}

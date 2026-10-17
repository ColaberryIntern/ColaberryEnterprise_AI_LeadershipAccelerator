import React from 'react';
import CampusBanner from './CampusBanner';
import CampusLayers from './CampusLayers';
import { useCampus } from './CampusContext';

/**
 * Campus banner + layers for pages that do NOT render PortalShell (Colaberry Campus C3, D2/D2a):
 * the lean legacy PortalLayout and the Showcase gallery. Wrapped in `.cm-scope`, which maps the campus
 * color names onto the global :root tokens, because the shell tokens only exist inside `.te-shell`.
 * Renders nothing unless the campus is active for this learner, so those pages are unchanged otherwise.
 */
export default function CampusScopedChrome(): React.ReactElement | null {
  const { active } = useCampus();
  if (!active) return null;
  return (
    <div className="cm-scope" data-testid="cm-scope">
      <CampusBanner />
      <CampusLayers />
    </div>
  );
}

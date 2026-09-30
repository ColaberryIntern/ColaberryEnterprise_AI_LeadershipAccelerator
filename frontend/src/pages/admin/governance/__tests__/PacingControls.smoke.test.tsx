import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PacingControls from '../PacingControls';

/**
 * CAPE Phase 6 (T013). Same no-browser smoke-check pattern as the sibling
 * governance panels: `renderToStaticMarkup` proves the initial (loading)
 * render never crashes — neither `fetchGovernancePolicy()` nor the
 * `api.get('/api/admin/feed-control/policy')` call ever fires (no `useEffect`
 * commit phase in static rendering).
 */

describe('PacingControls (CAPE Phase 6 governance board)', () => {
  it('renders its initial loading state without throwing', () => {
    expect(() => renderToStaticMarkup(<PacingControls />)).not.toThrow();
    const html = renderToStaticMarkup(<PacingControls />);
    expect(html).toContain('Loading');
    expect(html).toContain('Pacing Controls');
  });
});

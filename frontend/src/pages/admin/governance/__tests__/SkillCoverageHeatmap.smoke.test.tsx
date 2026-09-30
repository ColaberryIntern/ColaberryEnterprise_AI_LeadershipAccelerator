import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SkillCoverageHeatmap from '../SkillCoverageHeatmap';

/**
 * CAPE Phase 6 (T011). Follows the established no-browser smoke-check pattern
 * already used for `AdminTrustCenterPage.smoke.test.tsx`: `renderToStaticMarkup`
 * never runs `useEffect` (no commit phase in static rendering), so it never
 * fires the real `fetchSkillCoverageHeatmap()` call this component makes on
 * mount — it only proves the component's INITIAL (loading) render is safe: no
 * crash from the new heatmap-matrix JSX, the credit-strength color map, or the
 * gap-highlighting logic. No route params/router context needed (this
 * component takes no props and uses no `<Link>`).
 */

describe('SkillCoverageHeatmap (CAPE Phase 6 governance board)', () => {
  it('renders its initial loading state without throwing', () => {
    expect(() => renderToStaticMarkup(<SkillCoverageHeatmap />)).not.toThrow();
    const html = renderToStaticMarkup(<SkillCoverageHeatmap />);
    expect(html).toContain('Loading');
    expect(html).toContain('Skill Coverage Heatmap');
  });
});

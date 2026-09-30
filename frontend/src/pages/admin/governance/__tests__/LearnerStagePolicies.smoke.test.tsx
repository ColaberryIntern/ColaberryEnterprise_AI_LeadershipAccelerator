import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LearnerStagePolicies from '../LearnerStagePolicies';

/**
 * CAPE Phase 6 (T012). Same no-browser smoke-check pattern as
 * SkillCoverageHeatmap.smoke.test.tsx / AdminTrustCenterPage.smoke.test.tsx:
 * `renderToStaticMarkup` proves the initial (loading) render never crashes —
 * the real `fetchLifecycleModePolicies()` call never fires (no `useEffect`
 * commit phase in static rendering).
 */

describe('LearnerStagePolicies (CAPE Phase 6 governance board)', () => {
  it('renders its initial loading state without throwing', () => {
    expect(() => renderToStaticMarkup(<LearnerStagePolicies />)).not.toThrow();
    const html = renderToStaticMarkup(<LearnerStagePolicies />);
    expect(html).toContain('Loading');
    expect(html).toContain('Learner-Stage Policies');
  });
});

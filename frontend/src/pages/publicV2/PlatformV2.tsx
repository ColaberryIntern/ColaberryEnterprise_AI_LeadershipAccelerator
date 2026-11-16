import React from 'react';
import SeoV2 from '../../components/publicV2/SeoV2';
import HeroPlatformV8 from '../../components/publicV2/HeroPlatformV8';
import OpenPlatform from '../../components/publicV2/OpenPlatform';
import { SurfacesSection } from './platformV2Surfaces';
import { WhoeverBuildsItSection } from './platformV2Bands';
import './platformV2.css';
import '../../components/publicV2/heroV8.css';

/**
 * PlatformV2 — four bands, which is what the v5 site model draws.
 *
 * Ali gave this repo `colaberry-enterprise-site.html` as the design model and
 * then said, on 2026-11-15, that the site did not look like it. Measured side
 * by side in one browser at 1440px, this page was the largest gap on the whole
 * site: nine bands and 11,854px against the model's four and 5,910px. His call
 * on being shown the comparison: the colour is right, close the structural gap.
 *
 * So the page is now the model's four bands:
 *
 *   1. the hero
 *   2. the four surfaces, each addressed to a role, in ONE band
 *   3. "whoever builds it, you see it"
 *   4. the close
 *
 * The four surfaces used to be four separate full-width bands, each paying for
 * its own eyebrow, h2 and section padding. They are siblings inside one band
 * now; see `platformV2Surfaces.tsx` for what each one keeps, what came off the
 * page, and why the readiness drill-down stayed when the build pipeline and the
 * maturity ladder did not.
 *
 * CLAIM BOUNDARIES, settled with Ali on 2026-08-19 and still in force:
 *  - Claude Code is NOT claimed as an embedded runtime. What is true, and what
 *    the page says, is that every story ships with a Claude Code prompt written
 *    from the team's own requirements, and the platform reads their repository
 *    to confirm each acceptance criterion against a real commit. Both halves are
 *    disprovable by opening a repo, which is what makes them worth saying.
 *  - "Production-grade" is NOT used. The honest claim is real systems against
 *    real workflows, with governance and evidence.
 *
 * Unrouted, not deleted: `BuildPipeline`, `CapabilityEarned`, `ReceiptsDrilldown`
 * (its panel is still rendered, by the surfaces band), `CapabilityOS`,
 * `TwoExperiences`, `ArchitectExperience`. Check what else imports each before
 * removing any file.
 */

function PlatformV2(): React.ReactElement {
  return (
    <>
      <SeoV2
        title="See your company move to AI, department by department."
        description={
          'One place for every leader’s projects, every workflow, every application ' +
          'release and every person learning, whether we build it, guide it or train it.'
        }
      />

      <HeroPlatformV8 />

      <SurfacesSection />

      <WhoeverBuildsItSection />

      <OpenPlatform />
    </>
  );
}

export default PlatformV2;

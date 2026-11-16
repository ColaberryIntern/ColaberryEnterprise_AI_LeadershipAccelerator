import React from 'react';
import { Link } from 'react-router-dom';
import DepartmentMap from '../../components/publicV2/DepartmentMap';
import ServiceCardsV5 from '../../components/publicV2/ServiceCardsV5';
import Icon from '../../components/publicV2/Icon';

/**
 * homeV2Bands - the two bands the v5 site model adds to the home page.
 *
 * A THIRD FILE, not more of homeV2Sections.tsx. That file was itself an
 * extraction made because HomeV2 passed CLAUDE.md's 500-line ceiling, and it is
 * at 387 lines; adding these two bands to it would push it over the same
 * ceiling the extraction existed to respect.
 *
 * Both are pure: no state, no hooks, no props, same as the bands next door.
 */

/* ------------------------------------------------------- department map -- */

/**
 * "Your company, moving to AI. Department by department."
 *
 * The grid itself now lives in `components/publicV2/DepartmentMap.tsx`, because
 * the v5 model renders it inside the home hero rather than as a band, and a
 * component reaching up into a page's band file would be the wrong way round.
 *
 * This wrapper is what /how-it-works still renders. The model has no equivalent
 * band there either, so it is expected to go when that page is brought to the
 * model; it is kept until then rather than deleted out from under a page that
 * is still using it.
 */
export function DepartmentMapSection(): React.ReactElement {
  return (
    <section
      className="cbv2-rv cbv2-section cbv2-section--inverse"
      aria-labelledby="cbv2-deptmap-title"
    >
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Your company, moving to AI</p>
          <h2 id="cbv2-deptmap-title">Department by department.</h2>
          <p className="cbv2-lede">
            Start where the return is clearest, prove it, then take the same method to the
            next leader. Or, if leadership is aligned, start everywhere at once.
          </p>
        </div>

        <DepartmentMap />

        <p className="cbv2-deptmap__foot">
          <Link className="cbv2-btn cbv2-btn--primary" to="/how-it-works">
            See how a rollout runs
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ----------------------------------------------------- three services --- */

/**
 * "Build. Guide. Train." The three-service band.
 *
 * REPLACES the five-engagement band (ServicesSection). The cards are the model's
 * (ServiceCardsV5, delta S4), reading SERVICE_SHAPES so the home page, /services and
 * /pricing describe one offer rather than three versions of it.
 */
export function ThreeServicesSection(): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-three-title">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow">Three ways to work with us</p>
          <h2 id="cbv2-three-title">Build. Guide. Train.</h2>
          <p className="cbv2-lede">
            All three use Claude Code. Choose by what you need:{' '}
            <strong>a custom application built for you</strong>,{' '}
            <strong>workflows your team builds in the systems you already have</strong>, or{' '}
            <strong>people trained to do it themselves</strong>.
          </p>
        </div>

        <ServiceCardsV5 />

        <p className="cbv2-center-link">
          <Link className="cbv2-lnk" to="/services">
            Compare the three in detail
            <Icon name="arrowRight" size={15} />
          </Link>
        </p>
      </div>
    </section>
  );
}

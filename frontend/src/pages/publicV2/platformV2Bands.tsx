import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/publicV2/Icon';
import { SERVICE_SHAPES } from '../../config/v2Pricing';

/**
 * platformV2Bands - the Platform hero and the band that ties the three services
 * to the platform, both built to Ali's site model (route "platform"), 2026-11-16.
 *
 * The leader's-view band that used to live here moved into
 * `platformV2Surfaces.tsx` when the four surfaces were folded into one band.
 */

/**
 * The model's dark platform hero (`.phero`): centred title, the product picture
 * under it in a browser frame.
 *
 * THE PICTURE is the Command Center overview the home page already shows
 * (`shot-command-center.png`), on sample data: the screenshot carries its own
 * "Sample data" banner and the alt text says so. It is not the model's image,
 * which was captured in the old red.
 *
 * THE FIRST BUTTON. The model's reads "Open a free company workspace". The site
 * does not advertise the word (standing rule, counted by the copy ratchet), so it
 * reads "Open a company workspace" and goes where the model sends it.
 *
 * Replaces HeroPlatformV8 (unrouted, not deleted: HeroSvcV8.test still renders it).
 */
export function PlatformHeroV5(): React.ReactElement {
  return (
    <section className="cbv2-phero5" aria-labelledby="cbv2-plat-title">
      <div className="cbv2-wrap">
        <p className="cbv2-crumb5 cbv2-crumb5--d">
          <Link to="/">Home</Link> / Platform
        </p>
        <h1 id="cbv2-plat-title">
          See your company move to AI,{' '}
          <span className="cbv2-it">department by department.</span>
        </h1>
        <p className="cbv2-lede">
          One place for every leader’s projects, every workflow, every application release and
          every person learning, whether we build it, guide it or train it.
        </p>
        <div className="cbv2-btns5">
          <Link className="cbv2-btn cbv2-btn--primary" to="/try">
            Open a company workspace
            <Icon name="arrowRight" size={16} />
          </Link>
          <a className="cbv2-btn cbv2-btn--line cbv2-btn--onDark" href="#pl-inside">
            See what is inside
          </a>
        </div>
        <figure className="cbv2-phero5__shot">
          <div className="cbv2-browser5__b" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>Command Center &middot; Overview</span>
          </div>
          <img
            src="/site-v2/shot-command-center.png"
            alt="The Command Center overview, on sample data: where the build is now, and what is live and what is not across source systems, AI agents, stories shipped, guardrails and outcome measures."
            decoding="async"
          />
        </figure>
      </div>
    </section>
  );
}

const WHAT_YOU_SEE: Readonly<Record<string, { title: string; body: string }>> = {
  build: {
    title: 'Watch your application take shape',
    body:
      'Every release of your custom application, with its owner, its progress and its ROI case.',
  },
  guide: {
    title: 'Run your cohort',
    body:
      'Every workflow your team is automating, the weekly scrum, and each builder’s progress.',
  },
  train: {
    title: 'Track your learners',
    body:
      'Your assigned FDE and your managers see the same view of who is ready, and why.',
  },
};

/**
 * "Whoever builds it, you see it." The model's dark band (`.sec--ink` + `.pill3`):
 * three dark cards, one per service. The per-card "See Build" links came off with
 * the rebuild; the model has none, and every service page is one click away in the
 * header and the footer.
 */
export function WhoeverBuildsItSection(): React.ReactElement {
  return (
    <section className="cbv2-section cbv2-ink5" aria-labelledby="cbv2-pl-three">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">One platform, three services</p>
          <h2 id="cbv2-pl-three">
            Whoever builds it, <span className="cbv2-it">you see it.</span>
          </h2>
        </div>

        <div className="cbv2-pill5">
          {SERVICE_SHAPES.map((s) => {
            const w = WHAT_YOU_SEE[s.key];
            return (
              <article key={s.key}>
                <p className="cbv2-k5">{s.verb}</p>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

/**
 * ClosingCtaV5 - the one closing band every page ends on in Ali's site model (delta S5).
 *
 * Dark band with a soft accent glow from below, "Start here", the headline with its accent
 * phrase, one line of what to bring, two buttons and the mono sign-off line. It sits flush
 * on the footer (no white gap), which is why it is a component and not page copy: each page
 * that adopts it gets the same band instead of its own variant.
 *
 * LABEL: the model's second button reads "Start training free". The site does not advertise
 * the word "free" (standing rule; the copy ratchet in frontendCopyBaseline.ts counts it), so
 * the button reads "Start training" and goes where the model sends it.
 *
 * DASHES: the model's headline and sign-off use an em dash. House style (frontendTypographyLint)
 * puts a comma there instead, escaped or not, so both read with a comma.
 */
export default function ClosingCtaV5(): React.ReactElement {
  return (
    <section className="cbv2-cta5" aria-labelledby="cbv2-cta5-title">
      <div className="cbv2-wrap">
        <p className="cbv2-eyebrow cbv2-cta5__k">Start here</p>
        <h2 id="cbv2-cta5-title" className="cbv2-cta5__h">
          See AI run on one of your processes,{' '}
          <span className="cbv2-it">before you commit to anything.</span>
        </h2>
        <p className="cbv2-cta5__p">
          Bring one process and two numbers: what it costs you today, and what you need it to
          return. We will show you the demo pilot that proves it.
        </p>
        <div className="cbv2-cta5__btns">
          <Link className="cbv2-btn cbv2-btn--primary" to="/demo-pilot">
            Book a demo pilot
            <Icon name="arrowRight" size={16} />
          </Link>
          <Link className="cbv2-btn cbv2-btn--line cbv2-btn--onDark" to="/try">
            Start training
          </Link>
        </div>
        <p className="cbv2-cta5__fine">Build &middot; Guide &middot; Train, with Claude Code</p>
      </div>
    </section>
  );
}

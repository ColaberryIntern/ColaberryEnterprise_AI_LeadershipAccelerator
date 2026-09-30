import React from 'react';
import { Link } from 'react-router-dom';
import './ctaInterrupt.css';

/**
 * Option 2A — the full-bleed dark CTA interrupt.
 *
 * Ali, 2026-08-21: "the user has to do so much scrolling in between CTAs. Give
 * each a fresh look that is a segment to attract people that have heard enough
 * and ready to get started."
 *
 * So this is deliberately NOT the closing CTA repeated. It is its own shape: a
 * hard dark break against the white page, aimed at the reader who stopped being
 * persuaded three sections ago and just wants the door.
 *
 * The copy changes at each placement, the shape does not. That is the point --
 * a reader scrolling past the third one should recognise it instantly as "the
 * way in" rather than read it as new argument.
 *
 * Heavy by design, so it is used sparingly. 2B (the railed card) was the option
 * for sprinkling five times; this one earns two or three placements.
 *
 * Everything lands on /try, per the funnel decision of the same day.
 */

interface Props {
  eyebrow: string;
  title: string;
  body: string;
  /** Defaults to the free workspace. Overridable for a placement that warrants it. */
  primary?: { label: string; to: string };
  secondary?: { label: string; to: string };
}

export default function CtaInterrupt({
  eyebrow, title, body,
  primary = { label: 'Open the free workspace', to: '/try' },
  secondary = { label: 'Talk to an architect', to: '/contact' },
}: Props): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-cint" aria-labelledby={`cint-${eyebrow.replace(/\W+/g, '-').toLowerCase()}`}>
      <div className="cbv2-wrap cbv2-cint__in">
        <p className="cbv2-cint__k">{eyebrow}</p>
        <h2 id={`cint-${eyebrow.replace(/\W+/g, '-').toLowerCase()}`}>{title}</h2>
        <p className="cbv2-cint__p">{body}</p>
        <div className="cbv2-cint__b">
          <Link className="cbv2-btn cbv2-btn--primary" to={primary.to}>{primary.label}</Link>
          <Link className="cbv2-cint__ghost" to={secondary.to}>{secondary.label}</Link>
        </div>
      </div>
    </section>
  );
}

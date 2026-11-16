import React from 'react';
import { Link } from 'react-router-dom';
import { SERVICE_SHAPES } from '../../config/v2Pricing';
import Icon from './Icon';

/**
 * ServiceCardsV5 - the three service cards as Ali's site model draws them (delta S4).
 *
 * Big "Build." wordmark with an accent dot, a numbered top row with a tag, a terms box,
 * ringed ticks and a full-width button with an arrow. Guide is the featured card and is
 * inverted (dark), with the accent button; the other two take the outlined button.
 *
 * WHY A COMPONENT AND NOT MORE CSS ON `.cbv2-shape`: the old cards were styled from
 * pricingV2.css, which only loads with /pricing. On a visit that landed on the home page
 * the cards rendered unstyled - no padding, the wordmark beside the label instead of
 * under it - and nothing failed. These classes are styled from fidelityV5.css, which the
 * public layout loads on every page.
 *
 * Copy comes from SERVICE_SHAPES, so the home page, /services and /pricing still describe
 * one offer.
 */

/** The model's ringed tick: a circle with a check, drawn in the accent. */
export function RingTick(): React.ReactElement {
  return (
    <svg className="cbv2-ringtick" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.3l2.7 2.7L16.2 9.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ServiceCardsV5(): React.ReactElement {
  return (
    <div className="cbv2-svcs5">
      {SERVICE_SHAPES.map((s, i) => (
        <article className={`cbv2-svc5${s.featured ? ' cbv2-svc5--d' : ''}`} key={s.key}>
          <div className="cbv2-svc5__top">
            <span className="cbv2-svc5__n">{String(i + 1).padStart(2, '0')}</span>
            <span className={`cbv2-tag ${s.featured ? 'cbv2-tag--accent' : 'cbv2-tag--muted'}`}>{s.badge}</span>
          </div>
          <h3 className="cbv2-svc5__verb">
            {s.verb}
            <span aria-hidden="true">.</span>
          </h3>
          <p className="cbv2-svc5__t">{s.promise}</p>
          <p className="cbv2-svc5__blurb">{s.blurb}</p>
          <div className="cbv2-svc5__terms">
            <span className="cbv2-svc5__k">{s.termsLabel}</span>
            <strong>{s.terms}</strong>
          </div>
          <ul className="cbv2-svc5__list">
            {s.includes.map((inc) => (
              <li key={inc}>
                <RingTick />
                <span>{inc}</span>
              </li>
            ))}
          </ul>
          <Link
            className={`cbv2-btn ${s.featured ? 'cbv2-btn--primary' : 'cbv2-btn--line'} cbv2-svc5__btn`}
            to={`/services/${s.key}`}
          >
            See {s.verb}
            <Icon name="arrowRight" size={16} />
          </Link>
        </article>
      ))}
    </div>
  );
}

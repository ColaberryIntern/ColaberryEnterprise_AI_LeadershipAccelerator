import React from 'react';
import { Link } from 'react-router-dom';
import { SERVICE_SHAPES } from '../../config/v2Pricing';

/**
 * platformV2Bands - the closing band that ties the three services to the
 * platform.
 *
 * The leader's-view band that used to live here moved into
 * `platformV2Surfaces.tsx` when the four surfaces were folded into one band, so
 * that all four read as siblings rather than one of them sitting in a different
 * file from the other three.
 */

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

/** "Whoever builds it, you see it." Ties the three services to the platform. */
export function WhoeverBuildsItSection(): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-pl-three">
      <div className="cbv2-wrap">
        <p className="cbv2-eyebrow">One platform, three services</p>
        <h2 id="cbv2-pl-three">Whoever builds it, you see it.</h2>

        <div className="cbv2-pl-three">
          {SERVICE_SHAPES.map((s) => {
            const w = WHAT_YOU_SEE[s.key];
            return (
              <article className="cbv2-field" key={s.key}>
                <p className="cbv2-eyebrow">{s.verb}</p>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
                <p style={{ marginTop: 'var(--space-3)' }}>
                  <Link to={`/services/${s.key}`}>See {s.verb}</Link>
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

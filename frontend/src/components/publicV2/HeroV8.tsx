import React from 'react';
import { Link } from 'react-router-dom';
import DepartmentMap from './DepartmentMap';
import Icon from './Icon';

/**
 * The home hero, built to `colaberry-enterprise-site.html`.
 *
 * WHY THIS WAS REWRITTEN ON 2026-11-16. Ali, looking at the deployed page:
 * "what file are you looking at because nothing I gave you looks like this."
 *
 * He was right. The hero carried a wired system diagram -- Ingest, Model,
 * Deploy, Agents, Guardrails, five people and a HANDOVER COMPLETE stamp --
 * that appears in NEITHER file he has supplied: not in
 * `colaberry-enterprise-site.html` and not in `colaberry-enterprise-v4.html`.
 * It came from a much older design. Both of his files specify the same hero,
 * and it is this one:
 *
 *   1. the eyebrow, the headline
 *   2. beside it, the lede and two buttons
 *   3. three cards, We build it / We guide you / We train you, each with a line
 *   4. the rollout block, FULL WIDTH, with its legend and its mode toggle
 *
 * AND THE CHECKS COULD NOT SEE IT. The fidelity work that preceded this
 * measured band counts and heading order. Both heroes are one band with one h1,
 * so every assertion passed while the most prominent element on the site
 * matched nothing he had sent. Counting sections cannot see a picture. The
 * guards below assert the hero's PARTS, which is the thing that was missing.
 *
 * The layout defect this also fixes: `.cbv2-h8` was `display: flex`, so the
 * rollout block added yesterday became a sibling column of the copy and
 * overlapped the diagram. Measured on production: the grid at x=878..1440 over
 * a diagram at x=516..968.
 *
 * WHAT IS DELIBERATELY NOT CARRIED OVER from the old hero: the status chips
 * (now the three cards, with the sentence each one was missing), the "One
 * process first" deck, and the three-item proof row. None of the three is in
 * either file, and the proof row's claims live on in the "Short on purpose."
 * band further down the page, which is where the model puts them.
 */

/** The three services, as the model's hero states them. */
const VERBS: readonly { n: string; verb: string; title: string; body: string; to: string }[] = [
  {
    n: '01',
    verb: 'Build',
    title: 'We build it.',
    body: 'A custom application, designed with your business experts for how your industry works.',
    to: '/services/build',
  },
  {
    n: '02',
    verb: 'Guide',
    title: 'We guide you.',
    body:
      'Your people automate your processes as workflows in your own environment and current ' +
      'systems.',
    to: '/services/guide',
  },
  {
    n: '03',
    verb: 'Train',
    title: 'We train you.',
    body: 'Your team learns Claude Code and becomes Forward Deployed Engineers.',
    to: '/services/train',
  },
];

export default function HeroV8(): React.ReactElement {
  return (
    <section className="cbv2-h8" aria-labelledby="cbv2-hero-title">
      <div className="cbv2-h8__field" aria-hidden="true" />
      <div className="cbv2-h8__bloom cbv2-h8__bloom--red" aria-hidden="true" />

      <div className="cbv2-h8__inner">
        <div className="cbv2-h8__copy">
          <div className="cbv2-h8__eyebrow">
            <span className="cbv2-h8__live" aria-hidden="true" />
            <b>Claude Code</b>
            Colaberry Enterprise AI
          </div>

          <h1 id="cbv2-hero-title" className="cbv2-h8__h1">
            We build, guide and train your company{' '}
            <span className="cbv2-h8__it">into AI.</span>
          </h1>
        </div>

        <div className="cbv2-h8__side">
          <p className="cbv2-h8__body">
            A custom application designed around your business, or workflows that automate your
            processes inside the systems you already run. We find where the ROI is, <b>prove it
            with a demo pilot</b>, then keep going, department by department, or company-wide.
          </p>

          <div className="cbv2-h8__cta">
            <Link className="cbv2-h8__btn cbv2-h8__btn--primary" to="/demo-pilot">
              Start with a demo pilot
              <Icon name="arrowRight" size={16} />
            </Link>
            <Link className="cbv2-h8__btn cbv2-h8__btn--ghost" to="/services">
              Build, guide or train?
            </Link>
          </div>
        </div>
      </div>

      {/* Three cards, not three chips. The chips said the same three words with
          no sentence under them; the model gives each one a line, and that line
          is the only place on the home page that says what each service is
          before the reader is two screens down. */}
      <ul className="cbv2-h8__verbs">
        {VERBS.map((v) => (
          <li className="cbv2-h8__verb" key={v.verb}>
            <p className="cbv2-h8__verbk">
              {v.n} <span aria-hidden="true">&middot;</span> {v.verb}
            </p>
            {/* h3: these sit under the page's h1 as its three parts, as the model marks them. */}
            <h3>
              <Link to={v.to}>{v.title}</Link>
            </h3>
            <p>{v.body}</p>
          </li>
        ))}
      </ul>

      {/*
          The rollout block, full width, as the model draws it.

          NO "see how a rollout runs" BUTTON. The old band had one and I carried
          it over; the model's hero does not, and on the dark band it rendered
          dark-on-dark once the hero above went light, because the ghost button
          takes its ink from the hero's foreground. /how-it-works is in the nav
          and is linked from the three-steps band below.
      */}
      <div className="cbv2-h8__rollout">
        <DepartmentMap />
      </div>
    </section>
  );
}

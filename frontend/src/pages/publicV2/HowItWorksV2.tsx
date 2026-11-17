import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import { Claim } from '../../components/publicV2/Claim';
import DepartmentMap from '../../components/publicV2/DepartmentMap';
import FaqCardsV5 from '../../components/publicV2/FaqCardsV5';
import ClosingCtaV5 from '../../components/publicV2/ClosingCtaV5';
import { JOURNEY } from '../../config/v2Journey';
import { trackEvent } from '../../utils/tracker';
import { DemoPilotSection } from './homeV2Sections';
import './journeyV2.css';
import './howItWorksV2.css';

/**
 * HowItWorksV2 - at /how-it-works, built to Ali's site model (route "how-it-works").
 *
 * THE MODEL'S ORDER, band for band (2026-11-16, page group 2 of the fidelity rebuild):
 *   1. the light page hero (crumb, label, title with its accent phrase, two buttons)
 *   2. the rollout board, dark, full width: the same DepartmentMap the home hero uses
 *   3. the three steps (shared with Home, labelled "The three steps" here)
 *   4. your pace: department by department, or company-wide
 *   5. how engagements grow, with the five stages folded in underneath
 *   6. questions
 *   7. the shared closing band
 *
 * THE ROLLOUT BOARD IS BACK. An earlier pass took it off believing the model had no
 * board on this page. It does: the model draws `.orgwrap` straight under this hero.
 * It is a <div>, not a <section>, as in the model, so the page still has six bands.
 *
 * THE FIVE STAGES STAY, AND SO DOES THEIR DELIVERY LABEL. The model has no
 * equivalent. They are kept because the C2.2 capability audit found two of the five
 * stages have no platform capability behind them, and each one says so on the page.
 * Matching a design comp is not a reason to retire an honesty the audit put there.
 *
 * KEPT BEYOND THE MODEL, also on purpose: the positioning line (VERIFIED, through
 * <Claim>, the one place it is stated) and the link to /proof under the questions.
 *
 * NO DURATION ON THE PACE TRACKS. The model labels the track's end "Month 12". These
 * bars are shapes, not schedules, so the end reads "Later" and no length is claimed.
 */

const ROUTE = '/how-it-works';

interface Lane {
  readonly name: string;
  /** bars as [left %, width %, green?]: green is a department already automating */
  readonly bars: readonly (readonly [number, number, boolean])[];
}

interface Path {
  readonly tag: string;
  readonly accent: boolean;
  readonly title: string;
  readonly body: string;
  readonly lanes: readonly Lane[];
  readonly reading: string;
}

/** The two rollout shapes, with the model's own bar positions. */
const PATHS: readonly Path[] = [
  {
    tag: 'Path A',
    accent: false,
    title: 'Department by department',
    body:
      'Start where the ROI is clearest. Prove it, then take the result to the next leader. ' +
      'Each win funds the case for the next.',
    lanes: [
      { name: 'Finance', bars: [[0, 34, true]] },
      { name: 'Operations', bars: [[22, 34, true]] },
      { name: 'Support', bars: [[46, 30, false]] },
      { name: 'Sales', bars: [[68, 32, false]] },
    ],
    reading:
      'Departments begin one after another, each starting once the one before it is proven.',
  },
  {
    tag: 'Path B',
    accent: true,
    title: 'Company-wide',
    body:
      'One demo pilot to prove the approach, then every leader starts together, each with ' +
      'their own shortlist and their own processes.',
    lanes: [
      { name: 'Finance', bars: [[0, 24, true], [26, 74, false]] },
      { name: 'Operations', bars: [[26, 74, false]] },
      { name: 'Support', bars: [[26, 74, false]] },
      { name: 'Sales', bars: [[26, 74, false]] },
    ],
    reading:
      'Departments begin together, after a single demo pilot has proven the approach.',
  },
];

const GROWTH: readonly { n: string; title: string; body: string }[] = [
  { n: '1', title: 'Demo pilot', body: 'One process, automated and running, with the ROI beside it.' },
  { n: '2', title: 'First department', body: 'The pilot’s leader gets the rest of their shortlist.' },
  { n: '3', title: 'Next leaders', body: 'We work with each leader in turn, or all at once.' },
  { n: '4', title: 'Company-wide', body: 'AI is how the work gets done, and your people can extend it.' },
];

const FAQS: readonly { q: string; a: string }[] = [
  {
    q: 'What exactly is a demo pilot?',
    a:
      'One of your real processes, automated with Claude Code and running, with the ROI ' +
      'case written beside it. It is how you decide whether to go further, on evidence, not ' +
      'on a deck.',
  },
  {
    q: 'Department by department, or company-wide?',
    a:
      'Either. You can start with the department where the ROI is clearest. If leadership ' +
      'is aligned, every leader can start after the pilot. The method is the same.',
  },
  {
    q: 'Who owns the data?',
    a:
      'You do. Guide runs entirely inside your environment, and Build is designed with your ' +
      'data boundaries and approval rules from day one.',
  },
];

export default function HowItWorksV2(): React.ReactElement {
  const onEnquire = (): void => {
    trackEvent('cta_click', { cta_name: 'how_it_works_enquiry', page: ROUTE });
  };

  return (
    <>
      <SeoV2
        title="Find the ROI. Prove it. Roll it out, leader by leader."
        description={
          'The same three steps whether you choose Build, Guide or Train, and whether you go '
          + 'department by department or company-wide.'
        }
        route={ROUTE}
      />

      <section className="cbv2-prhero5" aria-labelledby="cbv2-how-title">
        <div className="cbv2-wrap">
          <p className="cbv2-crumb5">
            <Link to="/">Home</Link> / How it works
          </p>
          <p className="cbv2-k5">How it works</p>
          <h1 id="cbv2-how-title">
            Find the ROI. Prove it.{' '}
            <span className="cbv2-it">Roll it out, leader by leader.</span>
          </h1>
          <p className="cbv2-lede">
            The same three steps whether you choose Build, Guide or Train, and whether you go
            department by department or company-wide.
          </p>
          <div className="cbv2-btns5">
            <Link
              className="cbv2-btn cbv2-btn--primary"
              to="/demo-pilot?source=how-it-works"
              onClick={onEnquire}
              data-track="how_it_works_enquiry"
            >
              Book a demo pilot
              <Icon name="arrowRight" size={16} />
            </Link>
            <Link className="cbv2-btn cbv2-btn--line" to="/services">
              See the three services
            </Link>
          </div>
          {/*
              positioning.primary, kept on the page. The model's hero does not carry it
              and the home h1 no longer does either, so this is the one place the
              company's own positioning line is stated. VERIFIED in the registry and
              rendered through <Claim>, so if it is withdrawn the line disappears.
          */}
          <p className="cbv2-note5 cbv2-hiw5__claim">
            <Claim claimKey="positioning.primary" route={ROUTE} />
          </p>
        </div>
      </section>

      <div className="cbv2-orgwrap5" aria-label="Illustration: AI moving through a company department by department">
        <div className="cbv2-wrap">
          <DepartmentMap />
        </div>
      </div>

      <DemoPilotSection eyebrow="The three steps" onHowItWorks />

      <section className="cbv2-section cbv2-section--soft cbv2-paths5-sec" aria-labelledby="cbv2-paths-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Your pace</p>
            <h2 id="cbv2-paths-title">
              Department after department, <span className="cbv2-it">or company-wide.</span>
            </h2>
            <p className="cbv2-lede">
              Same method either way. The difference is how many leaders we work with at once.
            </p>
          </div>

          <div className="cbv2-paths5">
            {PATHS.map((p) => (
              <article className="cbv2-path5" key={p.tag}>
                <span className={`cbv2-tag ${p.accent ? 'cbv2-tag--accent' : 'cbv2-tag--navy5'}`}>
                  {p.tag}
                </span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
                {/* A shape, not a schedule: the bars show staggered or together, and the
                    sentence after them is the same reading for assistive technology. */}
                <div className="cbv2-path5__viz" aria-hidden="true">
                  {p.lanes.map((l) => (
                    <div className="cbv2-lane5" key={l.name}>
                      <span>{l.name}</span>
                      <div className="cbv2-lane5__t">
                        {l.bars.map(([left, width, green]) => (
                          <i
                            key={left}
                            className={green ? 'is-g' : undefined}
                            style={{ left: `${left}%`, width: `${width}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cbv2-path5__ax" aria-hidden="true">
                  <span />
                  <div>
                    <span>Demo pilot</span>
                    <span>Later</span>
                  </div>
                </div>
                <p className="cbv2-sr-only">{p.reading}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-growth-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">How engagements grow</p>
            <h2 id="cbv2-growth-title">From one process to the whole company.</h2>
          </div>
          <ol className="cbv2-journey5">
            {GROWTH.map((g) => (
              <li className="cbv2-jn5" key={g.n}>
                <b aria-hidden="true">{g.n}</b>
                <h3>{g.title}</h3>
                <p>{g.body}</p>
              </li>
            ))}
          </ol>

          {/*
              THE FIVE-STAGE MECHANISM, FOLDED IN RATHER THAN RETIRED. It carries the
              C2.2 disclosure: each stage says whether the platform or a person delivers
              it, and two of the five are people.
          */}
          <h3 className="cbv2-jy__sub">
            Inside one engagement: five stages, from a problem you name to software your
            people built.
          </h3>
          <ol className="cbv2-jy__stages">
            {JOURNEY.map((s, i) => (
              <li className="cbv2-jy__stage" key={s.key}>
                <span className="cbv2-jy__n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div className="cbv2-jy__body">
                  <h3>
                    {s.name}
                    <span
                      className={`cbv2-jy__by cbv2-jy__by--${s.delivery}`}
                      /* Text, never colour alone: the label has to survive greyscale. */
                    >
                      {s.delivery === 'platform' ? 'the platform does this' : 'our team does this'}
                    </span>
                  </h3>
                  <p>{s.summary}</p>
                  <p className="cbv2-jy__out"><strong>You get:</strong> {s.output}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="cbv2-jy__note">
            Two of the five are delivered by people rather than by software, and they say so.
            We would rather tell you that now than have you find it in week ten.
          </p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--soft" aria-labelledby="cbv2-hiw-faq">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Questions</p>
            <h2 id="cbv2-hiw-faq">Before you ask.</h2>
          </div>
          <FaqCardsV5 items={FAQS} />
          <p className="cbv2-note5">
            Proof is the stage everything else rests on, and it is the one you can test
            before you buy anything.{' '}
            <Link to="/proof" className="cbv2-jy__link">See the published records</Link>.
          </p>
        </div>
      </section>

      <ClosingCtaV5 />
    </>
  );
}

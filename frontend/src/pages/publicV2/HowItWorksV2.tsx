import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { Claim } from '../../components/publicV2/Claim';
import { JOURNEY } from '../../config/v2Journey';
import { trackEvent } from '../../utils/tracker';
import { DemoPilotSection } from './homeV2Sections';
import './journeyV2.css';
import './howItWorksV2.css';

/**
 * HowItWorksV2 - at /how-it-works.
 *
 * THE ONE PAGE THE v5 SITE MODEL MAKES LONGER. Everywhere else the model cuts;
 * here it adds, because the page answered "what are the stages" and never
 * answered the question a buyer actually asks next: how does this scale past
 * the first process, and how fast does it have to go.
 *
 * So the page now runs: the three steps, the rollout as a picture, the choice
 * between taking it one leader at a time or starting everyone together, how an
 * engagement grows from one process to the whole company, then the five-stage
 * mechanism, then the questions.
 *
 * THE FIVE STAGES STAY, AND SO DOES THEIR DELIVERY LABEL. The model has no
 * equivalent of this band. It is kept because the C2.2 capability audit found
 * two of the five stages have no platform capability behind them, and each one
 * says so on the page. Both tickets in that group say "never describe roadmap
 * as live", and the cheapest way to comply is to keep saying which stages a
 * person delivers. Dropping the band to match a design comp would quietly
 * retire an honesty the audit put there on purpose.
 *
 * THE DEPARTMENT MAP AND THE THREE STEPS ARE SHARED WITH THE HOME PAGE, not
 * copied. The model shows the same two blocks on both, and two copies of a
 * block that must stay consistent is how they stop being consistent.
 */

const ROUTE = '/how-it-works';

interface Path {
  readonly tag: string;
  readonly title: string;
  readonly body: string;
  readonly depts: readonly { name: string; from: number }[];
}

/**
 * The two rollout shapes. `from` is the month-12 bar's start as a percentage of
 * the track: department-by-department staggers, company-wide starts together.
 * These are SHAPES, not schedules -- no duration is claimed anywhere, and the
 * track is labelled by its endpoints rather than by months elapsed.
 */
const PATHS: readonly Path[] = [
  {
    tag: 'Path A',
    title: 'Department by department',
    body:
      'Start where the ROI is clearest. Prove it, then take the result to the next leader. ' +
      'Each win funds the case for the next.',
    depts: [
      { name: 'Finance', from: 0 },
      { name: 'Operations', from: 22 },
      { name: 'Support', from: 44 },
      { name: 'Sales', from: 66 },
    ],
  },
  {
    tag: 'Path B',
    title: 'Company-wide',
    body:
      'One demo pilot to prove the approach, then every leader starts together, each with ' +
      'their own shortlist and their own processes.',
    depts: [
      { name: 'Finance', from: 14 },
      { name: 'Operations', from: 14 },
      { name: 'Support', from: 14 },
      { name: 'Sales', from: 14 },
    ],
  },
];

const GROWTH: readonly { n: string; title: string; body: string }[] = [
  {
    n: '1',
    title: 'Demo pilot',
    body: 'One process, automated and running, with the ROI case beside it.',
  },
  {
    n: '2',
    title: 'First department',
    body: 'The pilot’s leader gets the rest of their shortlist.',
  },
  {
    n: '3',
    title: 'Next leaders',
    body: 'We work with each leader in turn, or with all of them at once.',
  },
  {
    n: '4',
    title: 'Company-wide',
    body: 'AI is how the work gets done, and your people can extend it themselves.',
  },
];

const FAQS: readonly { q: string; a: string }[] = [
  {
    q: 'What exactly is a demo pilot?',
    a:
      'One of your real processes, automated with Claude Code and running, with the ROI ' +
      'case written beside it. It is how you decide whether to go further, on evidence ' +
      'rather than on a deck.',
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

      <section className="cbv2-pagehero" aria-labelledby="cbv2-how-title">
        <div className="cbv2-wrap">
          <p className="cbv2-breadcrumb">
            <Link to="/">Home</Link> / How it works
          </p>
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">How it works</p>
          <h1 id="cbv2-how-title">Find the ROI. Prove it. Roll it out, leader by leader.</h1>
          <p className="cbv2-pagehero__lede">
            The same three steps whether you choose Build, Guide or Train, and whether
            you go department by department or company-wide.
          </p>
          {/*
              positioning.primary, kept on the page. The v5 model's hero does
              not carry it and the home h1 no longer does either, so this is now
              the one place the company's own positioning line is stated. It is
              VERIFIED in the registry and rendered through <Claim>, so if it is
              ever withdrawn the line disappears rather than going stale.
          */}
          <p className="cbv2-jy__claim">
            <Claim claimKey="positioning.primary" route={ROUTE} />
          </p>
          <p className="cbv2-hiw__cta">
            <Link className="cbv2-btn cbv2-btn--primary" to="/demo-pilot">
              Book a demo pilot
            </Link>
            <Link className="cbv2-btn cbv2-btn--secondary" to="/services">
              See the three services
            </Link>
          </p>
        </div>
      </section>

      {/*
          THE ROLLOUT BAND CAME OFF THIS PAGE. The model has no equivalent here,
          and the same grid now sits inside the home hero, where the model does
          put it. `DepartmentMapSection` is unrouted by this change, not
          deleted.
      */}

      <DemoPilotSection />

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-paths-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">Your pace</p>
          <h2 id="cbv2-paths-title">Department after department, or company-wide.</h2>
          <p className="cbv2-lede">
            The same method either way. The difference is how many leaders we work with at
            once.
          </p>

          <div className="cbv2-paths">
            {PATHS.map((p) => (
              <article className="cbv2-path" key={p.tag}>
                <p className="cbv2-eyebrow">{p.tag}</p>
                <h3>{p.title}</h3>
                <p className="cbv2-path__body">{p.body}</p>
                {/* A shape, not a schedule. The bars show whether departments
                    start staggered or together; no duration is claimed, and the
                    list below is the accessible reading of the same thing. */}
                <ul className="cbv2-path__track" aria-hidden="true">
                  {p.depts.map((d) => (
                    <li key={d.name}>
                      <span className="cbv2-path__dept">{d.name}</span>
                      <span className="cbv2-path__bar">
                        <span style={{ marginLeft: `${d.from}%`, width: `${100 - d.from}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="cbv2-path__legend">
                  {p.tag === 'Path A'
                    ? 'Departments begin one after another, each starting once the one before it is proven.'
                    : 'Departments begin together, after a single demo pilot has proven the approach.'}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-growth-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">How engagements grow</p>
          <h2 id="cbv2-growth-title">From one process to the whole company.</h2>
          <ol className="cbv2-pilot">
            {GROWTH.map((g) => (
              <li className="cbv2-pilot__step" key={g.n}>
                <span className="cbv2-pilot__n" aria-hidden="true">
                  {g.n}
                </span>
                <div>
                  <h3 className="cbv2-pilot__title">{g.title}</h3>
                  <p className="cbv2-pilot__body">{g.body}</p>
                </div>
              </li>
            ))}
          </ol>

          {/*
              THE FIVE-STAGE MECHANISM, FOLDED IN RATHER THAN RETIRED.

              It was a band of its own, and the model has no equivalent, which
              took this page to eight bands against the model's six. But it
              carries the C2.2 disclosure: each stage says whether the platform
              or a person delivers it, and two of the five are people. That is
              an audited honesty, and matching a picture is not a reason to
              retire one. So the band's chrome goes and its content stays, one
              level down, under the band about how an engagement grows.
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

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-hiw-faq">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">Questions</p>
          <h2 id="cbv2-hiw-faq">Before you ask.</h2>
          <dl className="cbv2-faq">
            {FAQS.map((f) => (
              <div className="cbv2-faq__item" key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="cbv2-jy__proof">
            Proof is the stage everything else rests on, and it is the one you can test
            before you buy anything.{' '}
            <Link to="/proof" className="cbv2-jy__link">See the published records</Link>.
          </p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--inverse" aria-label="Talk to us">
        <div className="cbv2-wrap cbv2-jy__cta">
          <Link
            to="/demo-pilot?source=how-it-works"
            onClick={onEnquire}
            className="cbv2-jy__btn"
            data-track="how_it_works_enquiry"
          >
            Book a demo pilot
          </Link>
        </div>
      </section>
    </>
  );
}

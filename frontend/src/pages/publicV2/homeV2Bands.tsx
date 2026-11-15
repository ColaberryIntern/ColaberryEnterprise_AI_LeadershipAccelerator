import React from 'react';
import { Link } from 'react-router-dom';
import { SampleBadge } from '../../components/publicV2/Claim';
import { SERVICE_SHAPES } from '../../config/v2Pricing';

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

type DeptStatus = 'automating' | 'pilot' | 'next' | 'none';

interface Dept {
  readonly n: string;
  readonly name: string;
  readonly leader: string;
  readonly status: DeptStatus;
  readonly processes: readonly string[];
}

/**
 * THIS IS INVENTED DATA AND IS LABELLED AS SUCH.
 *
 * It depicts what the platform's department view looks like for a company
 * partway through a rollout. No Colaberry customer is shown, no real rollout is
 * described, and no figure appears anywhere in it -- the status chips are
 * states, not measurements. The band carries a <SampleBadge>, and
 * HomeV2.test.tsx fails if that badge ever goes missing, because an unlabelled
 * mock of a customer dashboard is a fabricated proof claim.
 *
 * The departments and the processes under them are ordinary back-office work
 * chosen to be recognisable, not drawn from any engagement.
 */
const DEPARTMENTS: readonly Dept[] = [
  {
    n: '01',
    name: 'Finance',
    leader: 'CFO',
    status: 'automating',
    processes: ['Invoice matching', 'Month-end close prep', 'Expense review'],
  },
  {
    n: '02',
    name: 'Operations',
    leader: 'COO',
    status: 'automating',
    processes: ['Order exception triage', 'Vendor onboarding', 'Scheduling'],
  },
  {
    n: '03',
    name: 'Customer service',
    leader: 'VP Support',
    status: 'pilot',
    processes: ['Ticket routing', 'Reply drafting', 'Refund checks'],
  },
  {
    n: '04',
    name: 'Sales',
    leader: 'CRO',
    status: 'next',
    processes: ['Lead research', 'Proposal first drafts', 'CRM hygiene'],
  },
  {
    n: '05',
    name: 'HR',
    leader: 'CHRO',
    status: 'none',
    processes: ['Candidate screening', 'Policy questions', 'Onboarding'],
  },
  {
    n: '06',
    name: 'IT & Data',
    leader: 'CIO',
    status: 'none',
    processes: ['Access requests', 'Report requests', 'Data cleanup'],
  },
];

/** Status chips carry a WORD, never colour alone. */
const STATUS_LABEL: Readonly<Record<DeptStatus, string>> = {
  automating: 'Automating',
  pilot: 'Demo pilot',
  next: 'Next leader',
  none: 'Not started',
};

/**
 * "Your company, moving to AI. Department by department."
 *
 * The band exists to make the rollout concrete. "Department by department" is
 * the central promise of how an engagement scales, and in words alone it is
 * abstract; as a grid of departments at different stages it is obvious at a
 * glance, which is the whole argument for the picture.
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

        <p className="cbv2-deptmap__badge">
          <SampleBadge inverse />
        </p>

        <ul className="cbv2-deptmap">
          {DEPARTMENTS.map((d) => (
            <li className={`cbv2-dept cbv2-dept--${d.status}`} key={d.name}>
              <div className="cbv2-dept__head">
                <div>
                  <h3 className="cbv2-dept__name">{d.name}</h3>
                  <p className="cbv2-dept__leader">{d.leader}</p>
                </div>
                <span className="cbv2-dept__n" aria-hidden="true">
                  {d.n}
                </span>
              </div>
              <ul className="cbv2-dept__procs">
                {d.processes.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              {/* The chip states the stage in words. Colour repeats it; it never
                  carries it alone. */}
              <p className="cbv2-dept__status">{STATUS_LABEL[d.status]}</p>
            </li>
          ))}
        </ul>

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
 * REPLACES the five-engagement band (ServicesSection). Same job, three cards
 * instead of five, reading from SERVICE_SHAPES so the home page, /services and
 * /pricing all describe one offer rather than three versions of it.
 */
export function ThreeServicesSection(): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-three-title">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow">Three ways to work with us</p>
          <h2 id="cbv2-three-title">Build. Guide. Train.</h2>
          <p className="cbv2-lede">
            All three use Claude Code. Choose by what you need: a custom application built
            for you, workflows your team builds in the systems you already have, or people
            trained to do it themselves.
          </p>
        </div>

        <div className="cbv2-shapes">
          {SERVICE_SHAPES.map((s, i) => (
            <article
              className={`cbv2-shape${s.featured ? ' cbv2-shape--featured' : ''}`}
              key={s.key}
            >
              <div className="cbv2-shape__head">
                <span className="cbv2-shape__badge">
                  {String(i + 1).padStart(2, '0')} &middot; {s.badge}
                </span>
                <h3 className="cbv2-shape__verb">
                  <Link to={`/services/${s.key}`}>{s.verb}.</Link>
                </h3>
              </div>
              <p className="cbv2-shape__promise">{s.promise}</p>
              <p className="cbv2-shape__blurb">{s.blurb}</p>
              <div className="cbv2-shape__terms">
                <p className="cbv2-shape__terms-label">{s.termsLabel}</p>
                <p className="cbv2-shape__terms-value">{s.terms}</p>
              </div>
              <ul className="cbv2-shape__list">
                {s.includes.map((inc) => (
                  <li key={inc}>
                    <span aria-hidden="true">&#10003;</span>
                    {inc}
                  </li>
                ))}
              </ul>
              <p className="cbv2-shape__cta">
                <Link
                  className="cbv2-btn cbv2-btn--primary cbv2-btn--sm"
                  to={`/services/${s.key}`}
                >
                  See {s.verb}
                </Link>
              </p>
            </article>
          ))}
        </div>

        <p className="cbv2-note">
          <Link to="/services">Compare the three side by side</Link>
        </p>
      </div>
    </section>
  );
}

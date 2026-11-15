import React from 'react';
import { Link } from 'react-router-dom';
import { SampleBadge } from '../../components/publicV2/Claim';
import { SERVICE_SHAPES } from '../../config/v2Pricing';

/**
 * platformV2Bands - the two bands the v5 site model adds to /platform.
 *
 * The model cuts this page to four surfaces, each answering "who is this for".
 * Three of the four already existed as components (BuildPipeline,
 * ReceiptsDrilldown, CapabilityEarned). The fourth -- the leader's view of a
 * rollout -- did not, and is here. So is the closing band that ties the three
 * services to what each one looks like once it is running.
 */

/* ------------------------------------------------------- leader's view -- */

type RowStatus = 'automated' | 'building' | 'pilot' | 'next';

interface RolloutRow {
  readonly dept: string;
  readonly leader: string;
  readonly process: string;
  readonly status: RowStatus;
}

/**
 * INVENTED DATA, LABELLED AS SUCH.
 *
 * A depiction of the rollout table a leader sees partway through an
 * engagement. No Colaberry customer appears in it, no real rollout is
 * described, and there is no figure anywhere -- the status column holds states,
 * not measurements. The band carries a <SampleBadge> and PlatformV2.test fails
 * without it, because an unlabelled mock of a customer's dashboard is a
 * fabricated proof claim.
 */
const ROLLOUT: readonly RolloutRow[] = [
  { dept: 'Finance', leader: 'CFO', process: 'Invoice matching', status: 'automated' },
  { dept: 'Finance', leader: 'CFO', process: 'Month-end close prep', status: 'building' },
  { dept: 'Operations', leader: 'COO', process: 'Order exception triage', status: 'pilot' },
  { dept: 'Support', leader: 'VP Support', process: 'Ticket routing', status: 'next' },
];

const ROW_LABEL: Readonly<Record<RowStatus, string>> = {
  automated: 'Automated',
  building: 'Building',
  pilot: 'Pilot',
  next: 'Next',
};

/** "Every department, its processes, and the return." The leader's surface. */
export function LeaderViewSection(): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-pl-leader">
      <div className="cbv2-wrap">
        <p className="cbv2-eyebrow">For leaders</p>
        <h2 id="cbv2-pl-leader">Every department, its processes, and the return.</h2>
        <p className="cbv2-lede">
          Each leader sees their shortlist, what is in pilot, what is automated, and the ROI
          case behind each one, tied back to what the budget was approved to achieve.
        </p>

        <div className="cbv2-grid cbv2-grid--2" style={{ marginTop: 'var(--space-6)' }}>
          <div className="cbv2-field">
            <h3>An ROI case per process</h3>
            <p>The baseline and the target, written down before the build starts.</p>
          </div>
          <div className="cbv2-field">
            <h3>No status meetings</h3>
            <p>Where every department stands, without having to ask anyone.</p>
          </div>
        </div>

        <figure className="cbv2-rollout">
          <figcaption className="cbv2-rollout__cap">
            <span>Company &middot; AI rollout</span>
            <SampleBadge />
          </figcaption>
          <div className="cbv2-rollout__scroll">
            <table className="cbv2-rollout__table">
              <caption className="cbv2-sr-only">
                An illustrative rollout: four processes across three departments, each at a
                different stage.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Department</th>
                  <th scope="col">Process</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {ROLLOUT.map((r) => (
                  <tr key={r.dept + r.process}>
                    <th scope="row">
                      {r.dept}
                      <span className="cbv2-rollout__leader">{r.leader}</span>
                    </th>
                    <td>{r.process}</td>
                    <td>
                      {/* The stage is a word. Colour repeats it, never carries it. */}
                      <span className={`cbv2-rollout__status cbv2-rollout__status--${r.status}`}>
                        {ROW_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cbv2-rollout__foot">
            Each row links to its ROI case, its owner, and the commits behind it.
          </p>
        </figure>
      </div>
    </section>
  );
}

/* --------------------------------------------- one platform, three services -- */

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

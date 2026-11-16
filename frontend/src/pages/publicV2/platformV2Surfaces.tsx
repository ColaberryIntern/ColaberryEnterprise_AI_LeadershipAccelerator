import React from 'react';
import { SampleBadge } from '../../components/publicV2/Claim';
import { ReceiptsPanel } from '../../components/publicV2/ReceiptsDrilldown';
import './platformV2Surfaces.css';

/**
 * platformV2Surfaces - the four surfaces, as ONE band.
 *
 * WHY THIS FILE EXISTS. The v5 site model draws /platform as four bands: the
 * hero, one band holding four numbered surfaces, "whoever builds it you see
 * it", and the close. This page shipped the same surfaces as four separate
 * full-width bands, each with its own eyebrow, its own h2 and its own section
 * padding, which is most of why the page measured 11,854px against the model's
 * 5,910px. Ali, 2026-11-15, on being shown both side by side: close the
 * structural gap.
 *
 * So the four surfaces move inside a single section. Each one keeps the shape
 * the model gives it -- a number, who it is for, what they see, two notes and
 * one figure -- and the band chrome is paid for once instead of four times.
 *
 * WHAT CAME OFF THE PAGE, and why it is a judgement call rather than a cut:
 *  - `BuildPipeline` (ten stages of the build machine) was the single tallest
 *    thing on the site. The model has no equivalent band; what it keeps is the
 *    one sentence that matters to a buyer, which is now surface 3's lede.
 *  - `CapabilityEarned` (the LMS comparison, the competency weighting, and the
 *    AI Aware -> AI Organization ladder). The ladder has no model equivalent and
 *    is detail about how the product is put together.
 *  - The inline "best people already work for you" thesis band.
 * All three components still exist and are simply unrouted, the same way
 * CapabilityOS and TwoExperiences were left when they came off this page.
 *
 * WHAT DID NOT COME OFF, deliberately: the readiness drill-down is surface 4's
 * figure rather than a retired band, because it carries the real Engineer gate
 * thresholds, the tab semantics, and the "where this stops" boundary note -- all
 * three pinned by tests in `architectExperience.test.tsx`. Matching a picture is
 * not a reason to retire an audited honesty.
 */

/* ------------------------------------------------------- 1. for leaders -- */

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

function RolloutFigure(): React.ReactElement {
  return (
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
  );
}

/* ----------------------------------------------- 2. for project tracking -- */

interface StoryRow {
  readonly release: string;
  readonly story: string;
  readonly owner: string;
  readonly due: string;
  readonly state: 'shipped' | 'in-review' | 'building' | 'next';
}

/** Invented, and badged. Same rule as the rollout table above. */
const STORIES: readonly StoryRow[] = [
  { release: 'R1', story: 'Normalize vendor codes on intake', owner: 'A. Rao', due: 'Wk 3', state: 'shipped' },
  { release: 'R1', story: 'Route low-confidence orders to a human queue', owner: 'J. Okafor', due: 'Wk 4', state: 'in-review' },
  { release: 'R2', story: 'Audit log for every model decision', owner: 'A. Rao', due: 'Wk 6', state: 'building' },
  { release: 'R2', story: 'Eval set for edge-case orders', owner: 'M. Bell', due: 'Wk 7', state: 'next' },
];

const STATE_LABEL: Readonly<Record<StoryRow['state'], string>> = {
  shipped: 'Shipped',
  'in-review': 'In review',
  building: 'Building',
  next: 'Next',
};

function ReleasesFigure(): React.ReactElement {
  return (
    <figure className="cbv2-rollout">
      <figcaption className="cbv2-rollout__cap">
        <span>Project &middot; releases and stories</span>
        <SampleBadge />
      </figcaption>
      <div className="cbv2-rollout__scroll">
        <table className="cbv2-rollout__table">
          <caption className="cbv2-sr-only">
            An illustrative project plan: four stories across two releases, each with an
            owner, a due week and a state.
          </caption>
          <thead>
            <tr>
              <th scope="col">Story</th>
              <th scope="col">Owner</th>
              <th scope="col">Due</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {STORIES.map((s) => (
              <tr key={s.story}>
                <th scope="row">
                  {s.story}
                  <span className="cbv2-rollout__leader">{s.release}</span>
                </th>
                <td>{s.owner}</td>
                <td>{s.due}</td>
                <td>
                  <span className={`cbv2-rollout__status cbv2-rollout__status--${s.state === 'shipped' ? 'automated' : s.state === 'in-review' ? 'pilot' : s.state === 'building' ? 'building' : 'next'}`}>
                    {STATE_LABEL[s.state]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cbv2-rollout__foot">
        A date that slips shows up the day it slips, because the plan and the build read the
        same record.
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------ 3. for proof -- */

interface CommitRow {
  readonly sha: string;
  readonly msg: string;
  readonly ac: string;
  readonly met: boolean;
}

/** Invented, and badged. */
const COMMITS: readonly CommitRow[] = [
  { sha: 'a41f9c2', msg: 'Route low-confidence orders to the human queue', ac: 'AC-3', met: true },
  { sha: '7be0d13', msg: 'Audit log for every model decision', ac: 'AC-5', met: true },
  { sha: '19c44ae', msg: 'Normalize vendor codes on intake', ac: 'AC-1', met: true },
  { sha: 'e02d7b8', msg: 'Eval set for edge-case orders', ac: 'AC-6', met: false },
];

function ProofFigure(): React.ReactElement {
  return (
    <figure className="cbv2-repo">
      <figcaption className="cbv2-repo__cap">
        <span className="cbv2-repo__name">your-org/order-exceptions</span>
        <span className="cbv2-repo__conn">Connected</span>
        <SampleBadge />
      </figcaption>
      <ul className="cbv2-repo__rows">
        {COMMITS.map((c) => (
          <li key={c.sha}>
            <code>{c.sha}</code>
            <span>{c.msg}</span>
            {/* The state is a word. Colour repeats it, never carries it. */}
            <b className={c.met ? 'is-met' : 'is-pending'}>
              {c.ac} {c.met ? 'confirmed' : 'pending'}
            </b>
          </li>
        ))}
      </ul>
      <p className="cbv2-repo__foot">
        A story counts only when every criterion is confirmed.
      </p>
    </figure>
  );
}

/* ---------------------------------------------------------- the band itself -- */

interface Surface {
  readonly id: string;
  readonly who: string;
  readonly heading: string;
  readonly lede: string;
  readonly notes: readonly { readonly t: string; readonly d: string }[];
  readonly figure: () => React.ReactElement;
}

const SURFACES: readonly Surface[] = [
  {
    id: 'leaders',
    who: 'For leaders',
    heading: 'Every department, its processes, and the return.',
    lede:
      'Each leader sees their shortlist, what is in pilot, what is automated, and the ROI ' +
      'case behind each one, tied back to what the budget was approved to achieve.',
    notes: [
      { t: 'An ROI case per process', d: 'The baseline and the target, written down before the build starts.' },
      { t: 'No status meetings', d: 'Where every department stands, without having to ask anyone.' },
    ],
    figure: RolloutFigure,
  },
  {
    id: 'tracking',
    who: 'For project tracking',
    heading: 'Every project, every owner, every due date.',
    lede:
      'Releases, stories and dates come from the same plan the build runs on, so a slipped ' +
      'date shows up the day it slips, not at month end.',
    notes: [
      { t: 'Requirements become stories', d: 'Each one traceable to the process it automates.' },
      { t: 'Built for the weekly scrum', d: 'The agenda writes itself from what moved.' },
    ],
    figure: ReleasesFigure,
  },
  {
    id: 'proof',
    who: 'For proof',
    heading: 'Done is confirmed from the work, not claimed.',
    lede:
      'The platform reads the repository your team connects and checks each acceptance ' +
      'criterion against a real commit before a story counts.',
    notes: [
      { t: 'Evidence from commits', d: 'Nothing turns green until something real reports in.' },
      { t: 'In your environment', d: 'Your repository, your data, your approval rules.' },
    ],
    figure: ProofFigure,
  },
  {
    id: 'people',
    who: 'For your people',
    heading: 'Watch your team become AI builders.',
    lede:
      'Training progress, evaluations passed and things shipped, attached to each person. ' +
      'Readiness is computed from evidence, not attendance.',
    notes: [
      { t: 'The 12-week path', d: 'Every learner’s progress in one view, for your FDE and for you.' },
      { t: 'A cohort that can see itself', d: 'People compare approaches and help each other.' },
    ],
    figure: ReceiptsPanel,
  },
];

/** The four surfaces, one band. */
export function SurfacesSection(): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-section cbv2-surfaces" aria-label="What each role sees">
      <div className="cbv2-wrap">
        {SURFACES.map((s, i) => {
          const Figure = s.figure;
          /* Alternating sides, as the model does it, and by CSS `order` only.
             Reordering the DOM as well cancels it out and every row renders
             identically -- a real defect this repo already found once on
             /services. */
          return (
            <article className={`cbv2-surf${i % 2 === 1 ? ' cbv2-surf--flip' : ''}`} key={s.id}>
              <div className="cbv2-surf__copy">
                <p className="cbv2-surf__n">
                  <b aria-hidden="true">{i + 1}</b>
                  <span className="cbv2-eyebrow">{s.who}</span>
                </p>
                <h2 id={`cbv2-surf-${s.id}`}>{s.heading}</h2>
                <p className="cbv2-lede">{s.lede}</p>
                <div className="cbv2-grid cbv2-grid--2 cbv2-surf__notes">
                  {s.notes.map((n) => (
                    <div className="cbv2-field" key={n.t}>
                      <h3>{n.t}</h3>
                      <p>{n.d}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="cbv2-surf__fig">
                <Figure />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default SurfacesSection;

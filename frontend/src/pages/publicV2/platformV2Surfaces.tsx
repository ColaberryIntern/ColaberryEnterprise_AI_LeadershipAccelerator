import React from 'react';
import { SampleBadge } from '../../components/publicV2/Claim';
import ModelGlyph from '../../components/publicV2/ModelGlyph';
import type { GlyphName } from '../../components/publicV2/ModelGlyph';
import { ReceiptsPanel } from '../../components/publicV2/ReceiptsDrilldown';
import './platformV2Surfaces.css';

/**
 * platformV2Surfaces - the four surfaces, as ONE band.
 *
 * WHY THIS FILE EXISTS. The v5 site model draws /platform as four bands: the
 * hero, one band holding four numbered surfaces, "whoever builds it you see
 * it", and the close. This page shipped the same surfaces as four separate
 * full-width bands, which is most of why the page measured 11,854px against the
 * model's 5,910px. Ali, 2026-11-15: close the structural gap.
 *
 * 2026-11-16 (page group 2 of the fidelity rebuild): each surface now draws what
 * the model draws. A numbered label, the title, one lede and two icon rows on one
 * side; on the other, the model's figure:
 *   1. the rollout card (department, process, progress, status)
 *   2. the build schedule, as the product screenshot the model uses
 *   3. the dark repository panel
 *   4. the readiness drill-down (kept, see below; the model shows a feed screenshot)
 *
 * WHAT CAME OFF THE PAGE EARLIER, and is still off: `BuildPipeline`,
 * `CapabilityEarned` and the inline thesis band. All three components exist,
 * unrouted.
 *
 * WHAT DID NOT COME OFF, deliberately: the readiness drill-down is surface 4's
 * figure, because it carries the real Engineer gate thresholds, the tab
 * semantics, and the "where this stops" boundary note, all three pinned by tests
 * in `architectExperience.test.tsx`. Matching a picture is not a reason to retire
 * an audited honesty.
 */

/* ------------------------------------------------------- 1. for leaders -- */

type RowStatus = 'automated' | 'building' | 'pilot' | 'next';

interface RolloutRow {
  readonly dept: string;
  readonly leader: string;
  readonly process: string;
  /** bar length, as a share of the track: a picture of progress, not a measurement */
  readonly progress: number;
  readonly status: RowStatus;
}

/**
 * INVENTED DATA, LABELLED AS SUCH.
 *
 * A depiction of the rollout table a leader sees partway through an engagement.
 * No Colaberry customer appears in it, no real rollout is described, and no
 * number is printed: the bars are lengths and the status column holds states.
 * The card carries a <SampleBadge> and PlatformV2.test fails without it, because
 * an unlabelled mock of a customer's dashboard is a fabricated proof claim.
 */
const ROLLOUT: readonly RolloutRow[] = [
  { dept: 'Finance', leader: 'CFO', process: 'Invoice matching', progress: 100, status: 'automated' },
  { dept: 'Finance', leader: 'CFO', process: 'Month-end close prep', progress: 72, status: 'building' },
  { dept: 'Operations', leader: 'COO', process: 'Order exception triage', progress: 45, status: 'pilot' },
  { dept: 'Support', leader: 'VP Support', process: 'Ticket routing', progress: 12, status: 'next' },
];

const ROW_LABEL: Readonly<Record<RowStatus, string>> = {
  automated: 'Automated',
  building: 'Building',
  pilot: 'Pilot',
  next: 'Next',
};

function RolloutFigure(): React.ReactElement {
  return (
    <figure className="cbv2-roi5">
      <div className="cbv2-roi5__h">
        <h4>Company &middot; AI rollout</h4>
        <SampleBadge className="cbv2-tag" />
      </div>
      <table>
        <caption className="cbv2-sr-only">
          An illustrative rollout: four processes across three departments, each at a
          different stage.
        </caption>
        <thead>
          <tr className="cbv2-roi5__r cbv2-roi5__r--h">
            <th scope="col"><span>Department</span></th>
            <th scope="col"><span>Process</span></th>
            <th scope="col"><span>Progress</span></th>
            <th scope="col"><span>Status</span></th>
          </tr>
        </thead>
        <tbody>
          {ROLLOUT.map((r) => (
            <tr className="cbv2-roi5__r" key={r.dept + r.process}>
              <th scope="row">
                <strong>{r.dept}</strong>
                <small>{r.leader}</small>
              </th>
              <td>{r.process}</td>
              <td>
                <span className={`cbv2-bar5 cbv2-bar5--${r.status}`} aria-hidden="true">
                  <i style={{ width: `${r.progress}%` }} />
                </span>
              </td>
              <td>
                {/* The stage is a word. Colour repeats it, never carries it. */}
                <span className={`cbv2-tag cbv2-roi5__st cbv2-roi5__st--${r.status}`}>
                  {r.status === 'pilot' ? null : <i aria-hidden="true" />}
                  {ROW_LABEL[r.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="cbv2-roi5__f">Each row links to its ROI case, its owner and the commits behind it.</p>
    </figure>
  );
}

/* ----------------------------------------------- 2. for project tracking -- */

/**
 * The build schedule, as the product screenshot the model uses. It is the same
 * image the home page shows under "Project management, built in", sample data,
 * badged in the caption.
 */
function ScheduleFigure(): React.ReactElement {
  return (
    <figure className="cbv2-surf5__fig">
      <div className="cbv2-shot5">
        <img
          src="/site-v2/shot-build-schedule.png"
          alt="A build schedule on sample data: releases with stories plotted against dates, with markers for today, the end of the build and demo day."
          loading="lazy"
          decoding="async"
        />
      </div>
      <figcaption className="cbv2-cap">
        <SampleBadge className="cbv2-tag" />
        Releases, stories, and the day it is due.
      </figcaption>
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

/** Invented, and badged. One criterion is deliberately pending. */
const COMMITS: readonly CommitRow[] = [
  { sha: 'a41f9c2', msg: 'Route low-confidence orders to the human queue', ac: 'AC-3', met: true },
  { sha: '7be0d13', msg: 'Audit log for every model decision', ac: 'AC-5', met: true },
  { sha: '19c44ae', msg: 'Normalize vendor codes on intake', ac: 'AC-1', met: true },
  { sha: 'e02d7b8', msg: 'Eval set for edge-case orders', ac: 'AC-6', met: false },
];

function ProofFigure(): React.ReactElement {
  return (
    <figure className="cbv2-surf5__fig">
      <div className="cbv2-commits5">
        <div className="cbv2-commits5__b">
          <ModelGlyph name="branch" size={16} />
          <span>your-org/order-exceptions</span>
          <span className="cbv2-commits5__ok">&#9679; Connected</span>
        </div>
        <ul>
          {COMMITS.map((c) => (
            <li className="cbv2-cm5" key={c.sha}>
              <code>{c.sha}</code>
              <span>{c.msg}</span>
              {/* The state is a word. Colour repeats it, never carries it. */}
              <em className={c.met ? undefined : 'is-pending'}>
                {c.met ? (
                  <>
                    {c.ac} <span aria-hidden="true">&#10003;</span>
                    <span className="cbv2-sr-only"> confirmed</span>
                  </>
                ) : (
                  `${c.ac} pending`
                )}
              </em>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="cbv2-cap">
        <SampleBadge className="cbv2-tag" />
        A story counts only when every criterion is confirmed.
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------- the band itself -- */

interface Surface {
  readonly id: string;
  readonly who: string;
  readonly heading: string;
  readonly lede: string;
  readonly notes: readonly { readonly icon: GlyphName; readonly t: string; readonly d: string }[];
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
      { icon: 'bars', t: 'ROI case per process', d: 'The baseline and the target, written down before the build.' },
      { icon: 'eye', t: 'No status meetings', d: 'Where every department stands, without asking anyone.' },
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
      { icon: 'checklist', t: 'Requirements to stories', d: 'Each one traceable to the process it automates.' },
      { icon: 'calendar', t: 'Built for weekly scrum', d: 'The agenda writes itself from what moved.' },
    ],
    figure: ScheduleFigure,
  },
  {
    id: 'proof',
    who: 'For proof',
    heading: 'Done is confirmed from the work, not claimed.',
    lede:
      'The platform reads the repository your team connects and checks each acceptance ' +
      'criterion against a real commit before a story counts.',
    notes: [
      { icon: 'branch', t: 'Evidence from commits', d: 'Nothing turns green until something real reports in.' },
      { icon: 'shield', t: 'In your environment', d: 'Your repo, your data, your approval rules.' },
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
      { icon: 'cap', t: 'The 12-week FDE path', d: 'Every learner’s progress in one view, for your FDE and you.' },
      { icon: 'people', t: 'A cohort that can see itself', d: 'People compare approaches and help each other.' },
    ],
    figure: ReceiptsPanel,
  },
];

/** The four surfaces, one band. `#pl-inside` is where the hero's second button lands. */
export function SurfacesSection(): React.ReactElement {
  return (
    <section className="cbv2-section cbv2-surfs5" id="pl-inside" aria-label="What each role sees">
      <div className="cbv2-wrap">
        {SURFACES.map((s, i) => {
          const Figure = s.figure;
          /* Alternating sides, as the model does it, by CSS `order` only. Reordering
             the DOM as well cancels it out and every row renders identically. */
          return (
            <article className={`cbv2-surf5${i % 2 === 1 ? ' cbv2-surf5--f' : ''}`} key={s.id}>
              <div className="cbv2-surf5__c">
                <p className="cbv2-surf5__n">
                  <b aria-hidden="true">{i + 1}</b>
                  {s.who}
                </p>
                <h2 id={`cbv2-surf-${s.id}`}>{s.heading}</h2>
                <p className="cbv2-surf5__p">{s.lede}</p>
                <ul className="cbv2-ticks">
                  {s.notes.map((n) => (
                    <li key={n.t}>
                      <span className="cbv2-ticks__ic"><ModelGlyph name={n.icon} size={19} /></span>
                      <div><strong>{n.t}</strong><span>{n.d}</span></div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="cbv2-surf5__side">
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

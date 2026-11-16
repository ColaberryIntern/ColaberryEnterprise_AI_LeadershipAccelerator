import React, { useState } from 'react';
import { SampleBadge } from './Claim';

/**
 * DepartmentMap - the rollout block from the v5 model's hero.
 *
 * WHAT CHANGED ON 2026-11-16, and why. Ali, looking at the deployed home page:
 * "what file are you looking at because nothing I gave you looks like this".
 * He was right, and the band-count checks could not see it: his file's hero is
 * this block, full width, with a colour legend and a working
 * department-by-department / company-wide toggle. What shipped was the grid
 * alone, squeezed into a column beside a system diagram that appears in
 * NEITHER file he has supplied.
 *
 * So the block now carries the three parts the model gives it: the bar with the
 * legend, the grid, and the mode toggle.
 *
 * THE TOGGLE IS REAL. The model encodes two statuses per department -- one for
 * each mode -- and this does the same. A control that looked switchable and
 * changed nothing would be worse than no control.
 *
 * THIS IS INVENTED DATA AND IS LABELLED AS SUCH. It depicts what the platform's
 * department view looks like for a company partway through a rollout. No
 * Colaberry customer is shown, no real rollout is described, and no figure
 * appears anywhere in it -- the status chips are states, not measurements. It
 * carries a <SampleBadge>, and the suite fails if that badge goes missing,
 * because an unlabelled mock of a customer dashboard is a fabricated proof
 * claim.
 */

export type DeptStatus = 'automating' | 'pilot' | 'next' | 'none';

export interface Dept {
  readonly n: string;
  readonly name: string;
  readonly leader: string;
  /** [department by department, company-wide] - the model's own two values. */
  readonly status: readonly [DeptStatus, DeptStatus];
  readonly processes: readonly [string, string, string];
}

export const DEPARTMENTS: readonly Dept[] = [
  {
    n: '01',
    name: 'Finance',
    leader: 'CFO',
    status: ['automating', 'automating'],
    processes: ['Invoice matching', 'Month-end close prep', 'Expense review'],
  },
  {
    n: '02',
    name: 'Operations',
    leader: 'COO',
    status: ['pilot', 'pilot'],
    processes: ['Order exception triage', 'Vendor onboarding', 'Scheduling'],
  },
  {
    n: '03',
    name: 'Customer service',
    leader: 'VP Support',
    status: ['next', 'pilot'],
    processes: ['Ticket routing', 'Reply drafting', 'Refund checks'],
  },
  {
    n: '04',
    name: 'Sales',
    leader: 'CRO',
    status: ['none', 'pilot'],
    processes: ['Lead research', 'Proposal first drafts', 'CRM hygiene'],
  },
  {
    n: '05',
    name: 'HR',
    leader: 'CHRO',
    status: ['none', 'pilot'],
    processes: ['Candidate screening', 'Policy questions', 'Onboarding'],
  },
  {
    n: '06',
    name: 'IT & Data',
    leader: 'CIO',
    status: ['none', 'pilot'],
    processes: ['Access requests', 'Report requests', 'Data cleanup'],
  },
];

/** Status chips carry a WORD, never colour alone. */
export const STATUS_LABEL: Readonly<Record<DeptStatus, string>> = {
  automating: 'Automating',
  pilot: 'Demo pilot',
  next: 'Next leader',
  none: 'Not started',
};

/** The four states, in the order the model's legend lists them. */
const LEGEND: readonly DeptStatus[] = ['automating', 'pilot', 'next', 'none'];

const MODES: readonly { readonly key: string; readonly label: string; readonly lede: string }[] = [
  {
    key: 'staggered',
    label: 'Department by department',
    lede:
      'Start where the return is clearest, prove it, then take the same method to the next ' +
      'leader.',
  },
  {
    key: 'company-wide',
    label: 'Company-wide',
    lede:
      'Or, if leadership is aligned, every department starts together once a single demo ' +
      'pilot has proven the approach.',
  },
];

export default function DepartmentMap(): React.ReactElement {
  const [mode, setMode] = useState(0);

  return (
    <div className="cbv2-rollout-block">
      <div className="cbv2-rollout-block__bar">
        <div>
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Your company, moving to AI</p>
          <h2 id="cbv2-deptmap-title">{MODES[mode].label}.</h2>
        </div>
        {/* The legend names every state in words. Colour repeats it, and the
            chip on each card repeats it again, so nothing here depends on
            telling four dark blues apart. */}
        <ul className="cbv2-rollout-block__legend">
          {LEGEND.map((s) => (
            <li key={s}>
              <i className={`cbv2-dept__key cbv2-dept__key--${s}`} aria-hidden="true" />
              {STATUS_LABEL[s]}
            </li>
          ))}
        </ul>
      </div>

      <p className="cbv2-rollout-block__lede">{MODES[mode].lede}</p>

      <ul className="cbv2-deptmap">
        {DEPARTMENTS.map((d) => {
          const status = d.status[mode];
          return (
            <li className={`cbv2-dept cbv2-dept--${status}`} key={d.name}>
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
              <p className="cbv2-dept__status">{STATUS_LABEL[status]}</p>
            </li>
          );
        })}
      </ul>

      <div className="cbv2-rollout-block__foot">
        <div className="cbv2-rollout-block__modes" role="group" aria-label="Rollout pace">
          {MODES.map((m, i) => (
            <button
              type="button"
              key={m.key}
              className={`cbv2-rollout-block__mode${i === mode ? ' is-on' : ''}`}
              aria-pressed={i === mode}
              onClick={() => setMode(i)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <SampleBadge inverse />
      </div>
    </div>
  );
}

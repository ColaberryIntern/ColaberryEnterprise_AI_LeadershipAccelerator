import React from 'react';
import { SampleBadge } from './Claim';

/**
 * DepartmentMap - the rollout grid, without a band around it.
 *
 * It lived inside `homeV2Bands.tsx` as a full band of its own. The v5 site
 * model puts it INSIDE the hero: "Your company, moving to AI / Department by
 * department" is part of the opening statement there, not a chapter after it.
 * Reading it as a separate dark band immediately under a dark hero was one of
 * the three bands home carried that the model does not.
 *
 * It is a component rather than a page module because the hero renders it, and
 * a component reaching up into a page's band file is the wrong way round.
 *
 * THIS IS INVENTED DATA AND IS LABELLED AS SUCH.
 *
 * It depicts what the platform's department view looks like for a company
 * partway through a rollout. No Colaberry customer is shown, no real rollout is
 * described, and no figure appears anywhere in it -- the status chips are
 * states, not measurements. It carries a <SampleBadge>, and `HomeV2.test.tsx`
 * fails if that badge ever goes missing, because an unlabelled mock of a
 * customer dashboard is a fabricated proof claim.
 *
 * The departments and the processes under them are ordinary back-office work
 * chosen to be recognisable, not drawn from any engagement.
 */

export type DeptStatus = 'automating' | 'pilot' | 'next' | 'none';

export interface Dept {
  readonly n: string;
  readonly name: string;
  readonly leader: string;
  readonly status: DeptStatus;
  readonly processes: readonly string[];
}

export const DEPARTMENTS: readonly Dept[] = [
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
export const STATUS_LABEL: Readonly<Record<DeptStatus, string>> = {
  automating: 'Automating',
  pilot: 'Demo pilot',
  next: 'Next leader',
  none: 'Not started',
};

export interface DepartmentMapProps {
  /** Light-on-dark sample badge, for an inverse ground. Defaults to true. */
  readonly inverse?: boolean;
}

/** The grid itself: six departments, each at a stage, each stage named. */
export default function DepartmentMap({ inverse = true }: DepartmentMapProps): React.ReactElement {
  return (
    <>
      <p className="cbv2-deptmap__badge">
        <SampleBadge inverse={inverse} />
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
    </>
  );
}

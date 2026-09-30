import React from 'react';
import { getTicketStatusLabel } from '../../../utils/ticketTypeMeta';
import { adv2PillClass } from './adv2PillTone';

// Agent Detail polish round 2 (2026-09-29) — Ali, live: "I'd like to see
// the stages in a ticket kinda like the screenshot so I can see which
// process." The mockup's own 5-step ladder (Assess/Plan/Handoff/Verify/
// Complete) has no real backing field anywhere — Ticket.ts's real
// TicketStatus is a kanban workflow state, not that narrative one, and
// re-reading the mockup's own JS confirmed each of its 4 demo cases
// hardcodes a DIFFERENT 5-label array, meaning there was never one real
// ladder to mirror literally in the first place (see this run's own
// execution-contract.md). Confirmed via AskUserQuestion: build the SAME
// visual shape using the 5 REAL status values instead
// (backlog/todo/in_progress/in_review/done), reusing
// getTicketStatusLabel()'s exact real label strings — never invented copy.
//
// A cancelled ticket exited the workflow early and never honestly
// "reached" a fixed stage — it gets a plain Cancelled badge instead of a
// stepper implying linear progress that didn't happen.

const STEP_ORDER = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;

interface Props {
  status: string;
}

export default function AgentWorkV2Stepper({ status }: Props) {
  if (status === 'cancelled') {
    return <span className={adv2PillClass('danger')}>Cancelled</span>;
  }

  const currentIndex = STEP_ORDER.indexOf(status as (typeof STEP_ORDER)[number]);

  return (
    <div className="adv2-steps">
      {STEP_ORDER.map((step, i) => {
        const state = currentIndex < 0 ? '' : i < currentIndex ? 'done' : i === currentIndex ? 'current' : '';
        return (
          <div key={step} className={`adv2-step${state ? ` adv2-step-${state}` : ''}`}>
            {state === 'done' ? '✓ ' : ''}{getTicketStatusLabel(step)}
          </div>
        );
      })}
    </div>
  );
}

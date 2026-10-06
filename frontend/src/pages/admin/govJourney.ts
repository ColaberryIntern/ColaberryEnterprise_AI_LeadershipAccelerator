/**
 * govJourney — PURE: derive where an opportunity sits in OUR pursuit pipeline, so the reviewer can see the journey
 * at a glance ("what step are they on?") rather than inferring it from ten separate cards. Each stage's state is
 * read deterministically from the workspace; the current stage is the first not-yet-done one. Advisory only —
 * it mirrors the real gates, it never changes one. No IO; total; deterministic.
 */
export type JourneyState = 'done' | 'current' | 'todo';
export interface JourneyStep { key: string; label: string; state: JourneyState; detail: string; }
export interface JourneyInput {
  hasRecord: boolean;        // a qualification record exists (the opportunity was opened into the workspace)
  establishedCount: number;  // reviewer-established, cited requirements
  zipAttested: boolean;      // the solicitation ZIP is attested (evidence of record)
  assessed: boolean;         // requirements have been evaluated (coverage computed)
  decision: string | null | undefined;
}
export interface Journey { steps: JourneyStep[]; currentIndex: number; }

/**
 * Six stages of the decoupled gov pursuit: Discovered -> Requirements -> Captured (ZIP) -> Assessed ->
 * Pursuit approved -> Build authorized. The last is shown but never marked done here (a build is a separate,
 * reserved authorization). currentIndex = first non-done step (clamped to the last when everything is done).
 */
export function deriveJourney(i: JourneyInput): Journey {
  const approved = ['approved_bid_pursuit', 'rfi_response'].includes(String(i.decision ?? '').toLowerCase());
  const done = {
    discovered: !!i.hasRecord,
    requirements: i.establishedCount > 0,
    captured: !!i.zipAttested,
    assessed: !!i.assessed && i.establishedCount > 0,
    approved,
  };
  const raw: { key: string; label: string; done: boolean; detail: string }[] = [
    { key: 'discovered', label: 'Discovered', done: done.discovered, detail: 'Opportunity opened into the qualify workspace.' },
    { key: 'requirements', label: 'Requirements established', done: done.requirements, detail: 'Applicable, cited requirements captured from the solicitation.' },
    { key: 'captured', label: 'Solicitation attested', done: done.captured, detail: 'The solicitation ZIP is attested as the evidence of record.' },
    { key: 'assessed', label: 'Assessed', done: done.assessed, detail: 'Requirements evaluated for disqualifiers and coverage.' },
    { key: 'approved', label: 'Pursuit approved', done: done.approved, detail: 'A second person approved the bid pursuit; the two-track project is created.' },
    { key: 'build', label: 'Build authorized', done: false, detail: 'A separate, reserved authorization — not part of qualification.' },
  ];
  // First not-done step is "current"; if every assessable stage is done, the current marker rests on the last step.
  let currentIndex = raw.findIndex((s) => !s.done);
  if (currentIndex === -1) currentIndex = raw.length - 1;
  const steps: JourneyStep[] = raw.map((s, idx) => ({
    key: s.key, label: s.label, detail: s.detail,
    state: s.done ? 'done' : idx === currentIndex ? 'current' : 'todo',
  }));
  return { steps, currentIndex };
}

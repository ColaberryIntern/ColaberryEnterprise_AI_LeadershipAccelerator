import React from 'react';

/**
 * Section 7 — governance, reworded around what the system actually enforces.
 *
 * THE PROTOTYPE'S VERSION COULD NOT SHIP. Its headline was "AI accelerates the
 * work. Humans remain accountable," and section 4 asserted that promotion above
 * Senior Developer needs "a human-reviewed approval."
 *
 * `services/progression/promotionService.ts` implements that gate as
 * `requires_ai_approval`, called through an `aiApprover(enrollmentId, slug)`
 * hook whose own header reads "Phase 2 default is permissive." So the approval
 * is an AI check, and until an approver is wired it passes. Publishing "humans
 * remain accountable" on that basis would be asserting a control we do not
 * currently run -- on the page whose entire argument is that every claim traces
 * to evidence.
 *
 * Ali's call (2026-08-20): reword around the governance that genuinely exists.
 *
 * EVERYTHING BELOW IS ENFORCED IN CODE, not aspiration:
 *  - Acceptance criteria are written before the build and one covers trust --
 *    what the system must refuse to do on its own.
 *  - Done is decided by re-reading the repository, not by the learner ticking a
 *    box. Verified this session from the story-verification path.
 *  - Promotion gates carry evidence minimums and never pass on points alone.
 *  - The prompt assembler refuses to cite a file absent from the repository
 *    manifest rather than inventing a path.
 *  - Scoring weights are versioned, so what an organization counts is a
 *    recorded decision rather than a hidden constant.
 *
 * What is deliberately NOT claimed: that a person signs off each promotion.
 */

const CONTROLS = [
  {
    k: 'Before the build',
    t: 'Trust is specified, not assumed',
    d: 'Every story carries acceptance criteria written before any code, and one of them states what the system must refuse to do on its own — the case that routes to a person instead of resolving itself.',
  },
  {
    k: 'During the build',
    t: 'The prompt cannot invent your codebase',
    d: 'The assembler checks the repository manifest before citing a file. A prompt that would reference a path that was never written throws instead of shipping, so nobody builds against a hallucinated tree.',
  },
  {
    k: 'At the end',
    t: 'Nobody marks their own work done',
    d: 'Completion is decided by re-reading the repository and confirming each acceptance criterion against what is actually committed. A learner cannot tick a box to make a story count.',
  },
  {
    k: 'On promotion',
    t: 'Points alone never pass the gate',
    d: 'Each rank carries evidence minimums — verified projects, repository evidence, reviewed artefacts, evaluations, participation — and an approval step beyond the totals. Accumulating points is not sufficient.',
  },
  {
    k: 'Over time',
    t: 'What counts is a recorded decision',
    d: 'The evidence-band weights are versioned. Changing what your organization values is an auditable change with a version behind it, not a silent adjustment to a constant.',
  },
];

export default function GovernanceReal(): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-section cbv2-section--inverse" aria-labelledby="cbv2-gov-title">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow">Where the system says no</p>
          <h2 id="cbv2-gov-title">Governance is what the platform refuses to do</h2>
          <p className="cbv2-lede">
            There is a version of this product that scores everyone automatically and hands you a
            number. The interesting part of ours is the opposite &mdash; the places it declines to
            take your word for something, including the learner&rsquo;s.
          </p>
        </div>

        <div className="cbv2-gov">
          {CONTROLS.map((c) => (
            <article className="cbv2-gov__c" key={c.k}>
              <p className="cbv2-gov__k">{c.k}</p>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </article>
          ))}
        </div>

        {/*
          The honest boundary, stated rather than implied. A page arguing that
          every number traces to evidence has to be straight about the control it
          does NOT currently run, or it is doing the thing it criticises.
        */}
        <div className="cbv2-gov__note">
          <p>
            <b>What we do not claim.</b> The approval step on promotion is an automated check, not
            a human signature. Instructors review artefacts and sign feedback, and that review
            feeds the judgment band &mdash; but we are not going to tell you a person personally
            countersigns every rank change when the gate is automated. If your policy requires a
            named human approver, that is a configuration conversation, and worth having before
            you roll this out.
          </p>
        </div>
      </div>
    </section>
  );
}

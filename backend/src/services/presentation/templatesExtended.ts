import type { PresentationTemplate } from './templateContract';

/**
 * The three templates available for practice but not surfaced prominently in the
 * student chooser. They matter for the roles students move into after the programme —
 * defending a design, reporting upward, and handing work to someone who will own it.
 *
 * Same authoring rules as `templatesCore.ts`: every example is labelled as an example
 * and invented for teaching, never attributed to a real student or customer, and every
 * `timedOutline` totals exactly its `defaultSeconds` with Q&A held separately.
 */

const rubric = (lookFor: Record<string, string>) => ([
  { dimension: 'Problem and audience clarity', weight: 20, lookFor: lookFor.problem },
  { dimension: 'Story structure', weight: 15, lookFor: lookFor.structure },
  { dimension: 'Demonstration and evidence', weight: 25, lookFor: lookFor.evidence },
  { dimension: 'AI/human control and limitations', weight: 15, lookFor: lookFor.control },
  { dimension: 'Delivery, timing, visual clarity', weight: 15, lookFor: lookFor.delivery },
  { dimension: 'Questions and reflection', weight: 10, lookFor: lookFor.questions },
]);

export const ARCHITECTURE_REVIEW: PresentationTemplate = {
  id: 'architecture_review',
  label: 'Architecture review',
  prominent: false,
  defaultSeconds: 480,
  qaSeconds: 300,
  outcome: 'Explain the choices you made, the ones you rejected, and what would make you change your mind.',
  objective: 'Defend a design to people who will probe it, without becoming defensive.',
  expectedOutput: 'An eight-minute walkthrough of components, data flow, alternatives, permissions and recovery.',
  preface:
    'An architecture review is not a tour of your diagram. The audience can read boxes. What they cannot read is '
    + 'why you chose this shape over the obvious alternative, and what would have to be true for you to choose '
    + 'differently. The pattern to practise: decision, alternatives, reason, tradeoff, and the trigger that would '
    + 'make you reconsider. A design with no stated tradeoff reads as a design nobody thought about.',
  structure: ['Components', 'Data flow', 'Alternatives considered', 'Permissions and trust', 'Failure and recovery'],
  strongExample: {
    text:
      'Example: "I put the queue between them rather than calling directly. The direct call is simpler and I '
      + 'nearly shipped it. I chose the queue because the downstream service rate-limits and I needed retries to '
      + 'survive a restart. The cost is that I now have a second thing to monitor. If the rate limit went away, I '
      + 'would take the queue out."',
    why:
      'It names the decision, the rejected alternative, the specific reason, the price paid, and the condition '
      + 'that would reverse it. A reviewer can now argue with the reasoning rather than guess at it.',
  },
  weakExample: {
    text:
      'Example of what not to do: "We used a microservices architecture with an event-driven design because it is '
      + 'scalable and follows industry best practice."',
    why:
      '"Best practice" is not a reason, it is a way of avoiding one. No alternative was considered out loud, no '
      + 'cost was acknowledged, and nothing here tells a reviewer what problem the shape was solving.',
  },
  timedOutline: [
    { beat: 'Components', seconds: 80, say: 'Name each part and what it is responsible for — one sentence each, no more.' },
    { beat: 'Data flow', seconds: 100, say: 'Trace one real request end to end, out loud, in order.' },
    { beat: 'Alternatives considered', seconds: 120, say: 'For the two biggest choices: what you rejected, why, and what it cost you.' },
    { beat: 'Permissions and trust', seconds: 90, say: 'Say what each component is allowed to do, and what it is deliberately not allowed to do.' },
    { beat: 'Failure and recovery', seconds: 90, say: 'Pick the most likely failure and walk through what happens and who finds out.' },
  ],
  vocabulary: [
    { term: 'Idempotent', plain: 'Running it twice has the same effect as running it once — safe to retry.' },
    { term: 'Blast radius', plain: 'How much breaks if this one part fails.' },
    { term: 'Least privilege', plain: 'Each part can do only what it needs, so a mistake cannot reach further.' },
  ],
  prepare: [
    'Pick the two decisions a reviewer is most likely to challenge, and write the alternative you rejected for each.',
    'Trace one real request through your own system and write down every hop, including the ones you forgot existed.',
    'Decide which failure is most likely in practice, not which is most interesting.',
  ],
  checklist: [
    'Every component has one sentence saying what it is responsible for.',
    'I name at least two rejected alternatives with real reasons.',
    'I state a cost for each choice I defend.',
    'I can say what each part is NOT allowed to do.',
    'I name the trigger that would make me change the design.',
  ],
  practiceDrill:
    'Ask a peer to pick any arrow on your diagram and ask "why not the other way?" Answer in the decision / '
    + 'alternative / reason / tradeoff / trigger shape. Repeat until it stops feeling like defending.',
  rubric: rubric({
    problem: 'The review opens by saying what the design had to achieve, not what it contains.',
    structure: 'All five beats present, with alternatives given real time rather than a passing mention.',
    evidence: 'One real request is traced end to end rather than described in the abstract.',
    control: 'Permissions are stated as what each part may and may not do.',
    delivery: 'The diagram supports the narration instead of replacing it.',
    questions: 'Responds to challenge with reasoning and tradeoffs, not justification.',
  }),
  reflection: 'Which decision would you reverse first if you learned you were wrong about one assumption?',
};

export const STAKEHOLDER_UPDATE: PresentationTemplate = {
  id: 'stakeholder_update',
  label: 'Stakeholder update',
  prominent: false,
  defaultSeconds: 180,
  qaSeconds: 120,
  outcome: 'Tell a busy decision-maker what moved, what is stuck, and what you need from them.',
  objective: 'Report progress in three minutes and leave with a decision, not a follow-up meeting.',
  expectedOutput: 'A three-minute update ending in one clearly stated decision request.',
  preface:
    'The most common failure here is reporting activity instead of progress. "I worked on the parser" is activity. '
    + '"The parser now handles two of the three formats; the third needs a decision from you" is progress. Lead '
    + 'with what changed, be specific about what is blocked, and never end without saying what you need. An update '
    + 'with no ask trains people to stop attending.',
  structure: ['What is done, with evidence', 'What is blocked', 'The proposed next action', 'The decision you need'],
  strongExample: {
    text:
      'Example: "Two of three carrier formats are live and processed forty loads last week. The third is blocked: '
      + 'their emails have no consistent date field. I propose we ask them for a template rather than guess. I need '
      + 'you to decide whether we can ask the carrier directly, or whether that has to go through their account '
      + 'manager."',
    why:
      'Progress is evidenced, the blocker is specific and technical rather than vague, a proposal is offered so the '
      + 'decision-maker is choosing rather than inventing, and the ask is a real question with two options.',
  },
  weakExample: {
    text:
      'Example of what not to do: "Good progress this week, made headway on the integration, ran into a few issues '
      + 'with data quality but working through them. Should have more to show next week."',
    why:
      'Nothing is checkable and nothing is asked for. A listener cannot tell whether this is on track or three '
      + 'weeks from failing, so they either stop listening or start worrying — both bad outcomes.',
  },
  timedOutline: [
    { beat: 'What is done, with evidence', seconds: 60, say: 'State what now works and the one number or artefact that shows it.' },
    { beat: 'What is blocked', seconds: 40, say: 'Name the blocker precisely enough that someone could act on it.' },
    { beat: 'The proposed next action', seconds: 45, say: 'Offer your recommendation so they are choosing, not designing.' },
    { beat: 'The decision you need', seconds: 35, say: 'Ask one clear question with the options named.' },
  ],
  vocabulary: [
    { term: 'Blocked', plain: 'Work that cannot move until someone else does something.' },
    { term: 'Dependency', plain: 'Something outside your control that your work needs.' },
    { term: 'Decision needed', plain: 'A specific question only this person can answer.' },
  ],
  prepare: [
    'Write the one sentence of real progress before anything else — if you cannot, that is itself the update.',
    'Phrase your blocker so that someone outside the work could act on it.',
    'Decide your recommendation in advance; arriving without one turns a three-minute update into a meeting.',
  ],
  checklist: [
    'My first sentence says what changed, not what I worked on.',
    'My evidence is a number or an artefact, not an adjective.',
    'My blocker names a specific person, system or answer I am waiting on.',
    'I end with one question, not three.',
    'I come with a recommendation, not just a problem.',
  ],
  practiceDrill:
    'Write the update, then delete every sentence that does not change what the listener would do. Deliver what '
    + 'survives, and notice how much of the original was there to show effort rather than inform.',
  rubric: rubric({
    problem: 'The listener knows within twenty seconds whether this is on track.',
    structure: 'All four beats present, in order, inside three minutes.',
    evidence: 'Progress is backed by a number or artefact, not by an assertion of effort.',
    control: 'States clearly what is within the presenter\'s control and what is not.',
    delivery: 'Lands inside three minutes without compressing the ask at the end.',
    questions: 'The decision request is answerable on the spot.',
  }),
  reflection: 'Did you ask for a decision, or did you only report? If only reported, what were you avoiding?',
};

export const CLIENT_HANDOFF: PresentationTemplate = {
  id: 'client_handoff',
  label: 'Client handoff',
  prominent: false,
  defaultSeconds: 420,
  qaSeconds: 300,
  outcome: 'Teach someone else to run and own what you built, including when it misbehaves.',
  objective: 'Hand over operation and ownership so the receiver can run it without you.',
  expectedOutput: 'A seven-minute handoff covering workflow, responsibilities, exceptions, recovery and support.',
  preface:
    'A handoff is a teaching session, not a demonstration. The test is not whether they were impressed — it is '
    + 'whether they could run it on Monday without calling you. That means spending most of your time on the parts '
    + 'that go wrong, because the happy path teaches itself and the exceptions are where ownership actually lives.',
  structure: ['The workflow they will run', 'Who is responsible for what', 'Exceptions', 'Recovery', 'Support and escalation'],
  strongExample: {
    text:
      'Example: "When it flags a load, you will see it in the review queue with the reason. Ninety per cent of the '
      + 'time the reason is an ambiguous date, and you fix that by opening the original email and setting the date '
      + 'manually — about thirty seconds. If you see the same carrier flagged more than five times in a day, that '
      + 'is not a data problem, that is their format changing, and that one comes back to us."',
    why:
      'It teaches the common case with a time estimate, then gives a concrete threshold that distinguishes routine '
      + 'work from a real escalation. The receiver now knows what is theirs and what is not.',
  },
  weakExample: {
    text:
      'Example of what not to do: "If anything goes wrong, just check the logs and let us know. The documentation '
      + 'covers most of it."',
    why:
      '"Check the logs" assumes skills the receiver may not have, and "let us know" defines no threshold, so they '
      + 'will either escalate everything or nothing. Pointing at documentation during a handoff is a way of not '
      + 'doing the handoff.',
  },
  timedOutline: [
    { beat: 'The workflow they will run', seconds: 100, say: 'Walk the normal day once, from their seat, using their words.' },
    { beat: 'Who is responsible for what', seconds: 80, say: 'Draw the line: what they own, what you own, what the system owns.' },
    { beat: 'Exceptions', seconds: 90, say: 'Show the two or three things that actually go wrong, with how often.' },
    { beat: 'Recovery', seconds: 80, say: 'Demonstrate the fix for the most common exception, slowly enough to copy.' },
    { beat: 'Support and escalation', seconds: 70, say: 'Give the threshold that separates "handle it" from "call us", and who to call.' },
  ],
  vocabulary: [
    { term: 'Escalation', plain: 'Passing a problem to someone else because it is outside what you can fix.' },
    { term: 'Review queue', plain: 'The list of items the system was not confident about and set aside for a person.' },
    { term: 'Runbook', plain: 'Step-by-step instructions for handling a specific situation when it happens.' },
  ],
  prepare: [
    'Find out what the receiver already knows — a handoff pitched at the wrong level teaches nobody.',
    'List the exceptions that have actually occurred, with rough frequencies, not the ones that theoretically could.',
    'Write the escalation threshold as a number or a condition, never as "if it seems serious".',
  ],
  checklist: [
    'I walk the workflow from their seat, using their vocabulary.',
    'I state who owns what, including what the system owns.',
    'I show the real exceptions with how often they happen.',
    'I demonstrate a recovery slowly enough to be copied.',
    'My escalation threshold is a condition they can check, not a judgement call.',
    'I never say "just check the documentation" as an answer.',
  ],
  practiceDrill:
    'Have the receiver drive while you narrate nothing. Every place they stall is a place your handoff was a '
    + 'demonstration rather than a lesson.',
  rubric: rubric({
    problem: 'Pitched at what the receiver actually knows, established before the walkthrough.',
    structure: 'All five beats present, with exceptions and recovery given more time than the happy path.',
    evidence: 'Real exceptions with real frequencies, and a recovery performed rather than described.',
    control: 'Ownership boundaries are explicit for the receiver, the presenter and the system.',
    delivery: 'Paced so the receiver could copy each step; no jargon left undefined.',
    questions: 'Answers in terms of what the receiver should do, not how the system works internally.',
  }),
  reflection: 'Where would this person get stuck on Monday, and what did you not show them?',
};

export const EXTENDED_TEMPLATES: readonly PresentationTemplate[] = [
  ARCHITECTURE_REVIEW,
  STAKEHOLDER_UPDATE,
  CLIENT_HANDOFF,
];

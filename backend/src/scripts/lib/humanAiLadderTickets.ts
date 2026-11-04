/**
 * The Human/AI Task Split ticket ladder, as data. PURE: no Basecamp, no I/O.
 *
 * Separated from the runner so the CONTENT can be tested without touching a board, and so a
 * reviewer can read what will be filed without reading an API client.
 *
 * ## ASCII only, enforced by a test rather than by remembering
 *
 * Basecamp content posted through this toolchain must be ASCII. A right single quote or an arrow
 * survives every local check and then arrives on the board as mojibake, which is only visible to
 * whoever opens the ticket. `nonAsciiOffenders()` exists so that is a failing test instead.
 *
 * ## Why every ticket carries a due date and an assignee
 *
 * Both are standing requirements for this board, and both have been forgotten before. A todo
 * with neither is invisible to every date-ordered view, which is the same as not filing it.
 */

/** Ali Muwwakkil. The board's existing 20 open tickets are all assigned to him. */
export const ALI_BASECAMP_ID = 17454835;

/** AI Project Lifecycle. Bucket is the shared Colaberry project. */
export const LIFECYCLE_BUCKET = 7463955;
export const LIFECYCLE_LIST = 10396175294;

/** The group these eight land in. Numbered 10 to continue the board's 00-09 convention. */
export const LADDER_GROUP_TITLE = '10 - Human/AI Task Split, Agent Teams and The One Console';

export interface LadderTicket {
  /** Stable code, used as the title prefix and as the idempotency key. */
  readonly code: string;
  readonly title: string;
  /** ISO date. Every ticket has one; the board is read in date order. */
  readonly due: string;
  /** What the work is, why it exists, what it consumes, and how it is known to be done. */
  readonly body: string;
}

function body(parts: {
  what: string; why: string; inputs: string; doneWhen: string; evidence?: string;
}): string {
  const lines = [
    `<div><strong>What.</strong> ${parts.what}</div>`,
    `<div><strong>Why.</strong> ${parts.why}</div>`,
    `<div><strong>Inputs.</strong> ${parts.inputs}</div>`,
    `<div><strong>Done when.</strong> ${parts.doneWhen}</div>`,
  ];
  if (parts.evidence) lines.push(`<div><strong>Measured.</strong> ${parts.evidence}</div>`);
  return lines.join('');
}

/**
 * The ladder, in dependency order. Dates run 7 Nov to 25 Nov 2026, inside the Herriman
 * submission deadline of 30 Nov, because the Herriman bid is the test case for all of it.
 */
export const HUMAN_AI_LADDER: readonly LadderTicket[] = [
  {
    code: 'L10.1',
    title: 'L10.1 - Connect the factory spine to the governance that already exists',
    due: '2026-11-07',
    body: body({
      what: 'Wire the factory decomposition to INPACT, the R0-R9 autonomy ladder, the control '
        + 'specification and the delivery trust gate. Import the existing types; declare no new ones.',
      why: 'The governance is built and the spine does not reference it. A decomposition therefore '
        + 'produces a human/AI split with no trust dimension, no autonomy stage and no control '
        + 'enforcement point, and every project runs through this spine.',
      inputs: 'modules/delivery/inpact.ts, services/agentDomain/autonomyLadder.ts, '
        + 'services/lifecycle/generation/controlSpecification.ts, services/delivery/deliveryTrustGate.ts.',
      doneWhen: 'FactoryProject carries agent_teams and surfaces typed against ExecutionPolicy, '
        + 'ApprovalPolicy, AutonomyStage and InpactDimension, and no sixth autonomy vocabulary was added.',
      evidence: 'Both-ways control on 4 Nov 2026: services/delivery matched 7 files for the '
        + 'governance pattern, services/factory matched 0 of 83, services/lifecycle matched 2.',
    }),
  },
  {
    code: 'L10.2',
    title: 'L10.2 - Agent teams: group the AI tasks by subject so one agent owns one subject',
    due: '2026-11-10',
    body: body({
      what: 'Emit named, subject-bounded agent teams from a decomposition, with a human approver, '
        + 'an execution policy, an autonomy stage and the INPACT dimensions each team must address.',
      why: 'An AI executor was an arbitrary string id and nothing more, so one unnamed agent could absorb '
        + 'every AI task in a project. Nobody owns an unnamed agent and no subject bounds it, which '
        + 'is the generic blob. An admissions agent that only handles admissions can be judged.',
      inputs: 'The allocation rows, the assignments, and the role set from the decomposition.',
      doneWhen: 'humanAiStructure reports no blocking finding on a real decomposition: every AI '
        + 'task belongs to exactly one team, no two teams share a subject, and every team names a '
        + 'human approver that an agent does not fill.',
    }),
  },
  {
    code: 'L10.3',
    title: 'L10.3 - The one console: give every human task a destination',
    due: '2026-11-12',
    body: body({
      what: 'Add the surface concept so human tasks land somewhere, and build the operator console '
        + 'that holds all of them: agent strip, one decision queue, blocked items greyed in place.',
      why: 'Human tasks had an owner and no destination, so the only grouping primitive downstream '
        + 'was the role, and a generated app grew one screen and one login per role with a handoff '
        + 'between each. The first cohort shipped that app. The contract permitted it, which is the '
        + 'actual defect.',
      inputs: 'The approved design, section 6 of the Human/AI Task Split proposal, 4 Nov 2026.',
      doneWhen: 'Exactly one surface of kind console exists, every human task lands on exactly one '
        + 'surface, and external surfaces are labelled as external rather than counted as consoles.',
    }),
  },
  {
    code: 'L10.4',
    title: 'L10.4 - Role-first decomposition: the coverage gate becomes a check, not the generator',
    due: '2026-11-14',
    body: body({
      what: 'Derive tasks from the role set first, then run SOURCE_COVERAGE over the result as a '
        + 'check. A requirement no role-derived task covers is either a real gap or a non-obligation.',
      why: 'Requirement-first guarantees compliance coverage and produces no subject structure, '
        + 'because the requirements have none. Role-first produces the subject axis as a by-product, '
        + 'because roles are subjects, which is what L10.2 needs to group on.',
      inputs: 'factoryDecomposePrompt.ts, factoryValidate.ts SOURCE_COVERAGE.',
      doneWhen: 'A decomposition of a 56-requirement project produces tasks scaled to the job '
        + 'rather than to the document, and every uncovered requirement is reported for triage '
        + 'instead of forcing a citation.',
      evidence: 'The prompt targets 5 to 14 tasks while demanding every requirement be cited. At '
        + 'Herriman scale that is about 4 requirements per task, against a rule in the same prompt '
        + 'requiring one verb, one object, one outcome. Those conflict.',
    }),
  },
  {
    code: 'L10.5',
    title: 'L10.5 - The eight visual rules, enforced in the renderer and referenced from story-build',
    due: '2026-11-17',
    body: body({
      what: 'Encode the eight standing rules so every story visual obeys them: explicit human/AI '
        + 'split, UNCLASSIFIED never defaulted, named subject-bounded agents, human tasks converging '
        + 'on one surface, every agent showing its approver, the pre-AI baseline stated, approvals '
        + 'and irreversible actions always human, and every empty state saying which empty it is.',
      why: 'story-build currently contains no rule about visuals at all, so each one is drawn from '
        + 'scratch and the rules decay into a style guide nobody reads.',
      inputs: 'services/factory/visual/humanAiFlowSvg.ts, .claude/skills/story-build/SKILL.md.',
      doneWhen: 'Each rule is a test over the renderer, and story-build references the contract '
        + 'rather than restating it.',
    }),
  },
  {
    code: 'L10.6',
    title: 'L10.6 - Requirement subject classifier: 858 of 864 rows are compliance/must',
    due: '2026-11-19',
    body: body({
      what: 'Make the requirement kind and section fields carry real signal, so there is a subject '
        + 'axis to group on.',
      why: 'Grouping AI tasks by subject needs subjects. Today there is effectively one, so the '
        + 'grouping would yield a single agent that does everything, which is what L10.2 exists to '
        + 'prevent. Role-first (L10.4) routes around this; fixing it makes the coverage check useful too.',
      inputs: 'contract_requirements, the extraction path, modules/delivery requirement kinds.',
      doneWhen: 'A bulk extraction produces more than one kind, and the control is validated both '
        + 'ways: the classifier is shown emitting each kind on a known case before any negative counts.',
      evidence: 'Production, 4 Nov 2026: 858 of 864 rows across 13 projects are compliance/must. '
        + 'All seven projects above 47 requirements are single-subject. Sections are populated on 23 '
        + 'of 864 rows. The four other kinds do exist, so the field works and is simply unused.',
    }),
  },
  {
    code: 'L10.7',
    title: 'L10.7 - Herriman triage: turn 56 extracted statements into real obligations',
    due: '2026-11-21',
    body: body({
      what: 'Review the 56 extracted Herriman requirements and separate genuine obligations on '
        + 'Colaberry from descriptive text that binds nobody.',
      why: 'The coverage gate will demand a task cites every one of the 56, including the ones that '
        + 'impose no obligation. That turns the gate into a citation quota and the tasks into buckets.',
      inputs: 'delivery_project 80b35be2, 56 contract_requirements rows, the solicitation.',
      doneWhen: 'Each of the 56 is marked obligation or non-obligation with a reason, and the '
        + 'obligations carry a real kind and priority.',
      evidence: 'One current row reads: if the selected Proposer and the City attorneys office are '
        + 'unable to negotiate an acceptable agreement, then another Proposer will be selected. That '
        + 'describes the City process and binds Colaberry to nothing. It is stored as compliance/must.',
    }),
  },
  {
    code: 'L10.8',
    title: 'L10.8 - Stories and releases emitted through the delivery story contract and release gate',
    due: '2026-11-25',
    body: body({
      what: 'After decomposition, allocation and the agent/console structure are settled, emit the '
        + 'stories and the release through the delivery contract that already exists.',
      why: 'This is the step that makes the whole spine produce shippable work rather than a '
        + 'diagram, and every project uses this spine.',
      inputs: 'services/delivery/deliveryStoryContract.ts, services/delivery/releaseGate.ts.',
      doneWhen: 'Each story carries executionPolicy, approvalPolicy, trustDimensions, riskLevel and '
        + 'evidenceRequired, the traceability rules hold, including every production agent trust '
        + 'requirement becoming an implementation or evaluation story, and the release gate '
        + 'distinguishes ready from authorized to deploy.',
    }),
  },
];

/**
 * Characters that are not plain ASCII, with where they are, so a failure names the offender
 * instead of just asserting a boolean.
 */
export function nonAsciiOffenders(): Array<{ code: string; field: string; char: string; at: number }> {
  const out: Array<{ code: string; field: string; char: string; at: number }> = [];
  const scan = (code: string, field: string, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      if (text.charCodeAt(i) > 127) out.push({ code, field, char: text[i], at: i });
    }
  };
  for (const t of HUMAN_AI_LADDER) {
    scan(t.code, 'title', t.title);
    scan(t.code, 'body', t.body);
  }
  scan('(group)', 'title', LADDER_GROUP_TITLE);
  return out;
}

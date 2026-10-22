/**
 * Claude Code prompts for the discovery and legacy-migration stories. PURE.
 *
 * ## Why this exists
 *
 * `agentDomainStoryTemplates` used to emit `claude_code_prompt: ''` for the five research
 * stories and the legacy-migration story, and `agentDomainProvisionPlan` then substituted
 * `HUMAN_WORK_STATEMENT`: *"This story is human work, not a Claude Code build, and it carries no
 * prompt on purpose."*
 *
 * That reasoning was coherent and it was wrong. Ali, 2026-10-21: **there are no manual tasks in
 * this programme, and every prompt should be understood as something that will be run in Claude
 * Code.** A research story whose product is a written document is still Claude Code work; the
 * deliverable is a committed file rather than a feature.
 *
 * The cost of the old behaviour was not theoretical. Mihret opened a story, read that it was
 * human work with no prompt, and could not tell whether she was meant to run anything at all;
 * she asked rather than guessing, which is the only reason it surfaced. These prompts were
 * written and backfilled into production by hand on 2026-10-20 to unblock the seven interns.
 * **This module is that content moved to its source**, so a newly provisioned domain gets the
 * prompt rather than regressing to the statement.
 *
 * ## The shape every prompt shares
 *
 * Head (what this is, and that the brief above it is the specification) -> how to build it ->
 * what the document must contain -> the evidence contract -> the standing constraints. Two of
 * those earn their place loudly:
 *
 *   · **The brief is the specification, not this prompt.** The domain's real figures live on the
 *     story page. Repeating them here would create a second copy that drifts, and then nobody
 *     knows which is true.
 *   · **Unknown is a real answer.** Several of these questions have no source material in the
 *     repository. "The source does not exist, and here is what would have to be written" is a
 *     complete answer. Without saying so, a confident invention scores better than honest
 *     research, which is precisely backwards.
 */

/** Everything a prompt needs that is specific to one story on one domain. */
export interface ResearchPromptContext {
  /** The story's own title, as the page shows it. */
  readonly title: string;
  /** The domain's display title, e.g. "Admissions & Applicant Experience". */
  readonly domainTitle: string;
  /** The accountable human who reviews the output. */
  readonly manager: string;
  /** Fully qualified story id, e.g. `admissions.RESEARCH-1-SYSTEM-CLASSES`. */
  readonly storyId: string;
  /** The release's display name, e.g. "Discovery and validation". */
  readonly release: string;
}

const L = (...lines: string[]): string => lines.join('\n');

/** The platform repository. Named because a brief citing a path without one is the brief's bug. */
const PLATFORM_REPO =
  'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator';

/**
 * The shared tail: evidence contract plus the standing constraints.
 *
 * The repository line exists because Sarbjit was blocked within hours of starting: the brief
 * told her to read `backend/src/services/agentRegistrySeed.ts` without naming which repository
 * it lives in, so there was nothing to find. She stopped and asked, which was correct. The fix
 * belongs in the prompt, not in her.
 */
function evidence(file: string): string {
  return L(
    '',
    '## Evidence this is done',
    '',
    `Cite the real thing. For this story that is the committed file \`${file}\`, and inside it,`,
    'every claim carrying either a source or the word unknown.',
    '',
    '**None of these count:** this story being marked complete, elapsed time, a conversation that',
    'went well, a document that restates the brief without answering it, or a confident sentence',
    'with no source. Your accountable manager evaluates the evidence.',
    '',
    '**Unknown is a real answer and is worth more than a guess.** Several of these questions have',
    'no source material in this repository. Writing "the source does not exist, and here is what',
    'would have to be written" is a complete answer, not a failure to find one.',
    '',
    '## Before you start',
    '',
    '- **The platform source is PUBLIC. You do not need access granted.** Wherever this brief',
    '  cites a file like `backend/src/services/agentRegistrySeed.ts`, it means the Colaberry',
    `  platform repository:\n  **${PLATFORM_REPO}**`,
    '  Clone it read-only beside your own project and point Claude Code at it. A brief that cites',
    '  a path without naming its repository is the brief being wrong, not you.',
    '- **Nothing in this story authorizes an outbound message.** Do not send an invitation, an',
    '  email or a direct message, and do not record a meeting as booked. Arranging anything with a',
    '  person is a human action taken outside this project.',
    '- **Nothing here changes an agent.** Do not enable one, grant it a tool, or raise an autonomy',
    '  level. A capability stays `draft` until your manager has actually reviewed it.',
    '- Your repo may not be connected yet. The prompt works either way; the story cannot be',
    '  verified and no points are awarded until a repo is connected, because verification is a',
    '  read of your repo.',
  );
}

function head(c: ResearchPromptContext, file: string): string {
  return L(
    `# ${c.title}`,
    `**Domain:** ${c.domainTitle} · **Release:** ${c.release} · **Story:** \`${c.storyId}\``,
    `**Accountable human:** ${c.manager} · **Deliverable:** \`${file}\``,
    '',
    '## What this is',
    '',
    'This is Claude Code work, and the product is a written document. There is no feature to ship',
    'and no agent to switch on. The document is the thing your manager reviews, so it is written',
    'to be read by them rather than by you.',
    '',
    '## The specification is the brief on this story, not this prompt',
    '',
    "Read the brief above this prompt on the story page. It names this domain's real figures, your",
    'accountable human, and the specific blockers discovery already found. **Those numbers are not',
    'repeated here on purpose:** a second copy drifts from the first, and then nobody knows which',
    'is true. Work from the brief; this prompt tells you how to turn it into a document.',
  );
}

const howTo = (...steps: string[]): string =>
  L('', '## How to build it', '', ...steps.map((s) => `- ${s}`));

const contract = (...sections: string[]): string =>
  L(
    '',
    '## What the document must contain',
    '',
    ...sections.map((s) => `- ${s}`),
    '',
    'Write it as Markdown with real headings. A wall of prose is not a deliverable, and neither is',
    'a bulleted restatement of the brief.',
  );

/** The deliverable path each story writes. Part of the contract: the verifier reads these. */
export const RESEARCH_DELIVERABLES: Readonly<Record<string, string>> = Object.freeze({
  'RESEARCH-1-SYSTEM-CLASSES': 'docs/discovery/01-system-classes.md',
  'RESEARCH-2-AGENT-ANATOMY': 'docs/discovery/02-agent-anatomy.md',
  'RESEARCH-3-ROLE-AND-DA-TRANSITION': 'docs/discovery/03-role-and-da-transition.md',
  'RESEARCH-4-MANAGER-INTERVIEW': 'docs/discovery/04-manager-interview.md',
  'RESEARCH-5-THREE-PROPOSED-TASKS': 'docs/discovery/05-three-proposed-tasks.md',
  'LEGACY-MIGRATION-PLAN': 'docs/migration/legacy-migration-plan.md',
});

type Template = (c: ResearchPromptContext) => string;

const TEMPLATES: Readonly<Record<string, Template>> = Object.freeze({
  'RESEARCH-1-SYSTEM-CLASSES': (c) => {
    const file = RESEARCH_DELIVERABLES['RESEARCH-1-SYSTEM-CLASSES'];
    return L(
      head(c, file),
      howTo(
        'Start a Claude Code session in your project folder.',
        'Ask it to draft the comparison from the brief, then CHECK each claim yourself. A fluent'
          + ' paragraph about agentic systems that would read identically for any domain is the'
          + ' failure mode here.',
        "Ground the recommendation in this domain's own figures, which the brief gives you. If the"
          + ' argument does not change when those numbers change, it is not applied.',
        'Look at what this platform actually runs before claiming a class is needed.'
          + ' `backend/src/services/agentRegistrySeed.ts` is the real registry; read a few entries'
          + ' near your domain.',
      ),
      contract(
        'One short section per class: chatbots, fixed workflows, tool-using agents, agentic'
          + ' systems, multi-agent systems. Two or three sentences each, no filler.',
        'The recommendation for this domain, with the reason stated in terms of its own numbers.',
        'Which class this domain explicitly does NOT need.',
        'What would have to change for the next class up to be justified. Name the condition, not'
          + ' a vague "more maturity".',
        'A sources section. Every factual claim about the platform carries a `file:line` or a'
          + ' query.',
      ),
      evidence(file),
    );
  },

  'RESEARCH-2-AGENT-ANATOMY': (c) => {
    const file = RESEARCH_DELIVERABLES['RESEARCH-2-AGENT-ANATOMY'];
    return L(
      head(c, file),
      howTo(
        'Work the nine elements one at a time. Ask Claude Code to search the repo for what exists'
          + ' today for each one before you write anything about it.',
        'No agent exists for this domain yet, so most answers are design questions. **"Unknown" is'
          + ' the correct answer wherever you have no evidence**, and the brief says so.',
        'Coordination is the trap: agent-to-agent handoff does NOT exist in this platform. Record'
          + ' what it would require rather than describing it as available.',
      ),
      contract(
        'Nine sections: reasoning, memory, inputs, communication, tools, procedures, coordination,'
          + ' safeguards, verification.',
        'Each answers three things: what exists today, what is missing, what the first honest'
          + ' version looks like.',
        'An explicit count at the top of how many of the nine are currently "unknown". That number'
          + ' is the honest headline of this document.',
        'A sources section with `file:line` for every claim that something does exist.',
      ),
      evidence(file),
    );
  },

  'RESEARCH-3-ROLE-AND-DA-TRANSITION': (c) => {
    const file = RESEARCH_DELIVERABLES['RESEARCH-3-ROLE-AND-DA-TRANSITION'];
    return L(
      head(c, file),
      howTo(
        'Read the warning in the brief first. No document in this repository enumerates Data'
          + ' Analyst duties for ANY domain, and three researchers confirmed that separately.',
        '**Do not infer a duty list from a job title.** If you cannot source a responsibility, the'
          + ' honest output is "the source material does not exist, and here is what would have to'
          + ' be written" - which the brief states is a real deliverable.',
        'Ask Claude Code to search the repo for the role before concluding it is absent, and record'
          + ' what you searched so the absence is evidenced rather than assumed.',
      ),
      contract(
        'What you searched and what you found, so the gap is proved rather than asserted.',
        'A table of responsibilities with one row each: **stays human / transitions to AI /'
          + ' splits**, and the reason.',
        'For a split, exactly where the line falls and who holds each side.',
        'If the source does not exist: a short outline of the document that would have to be'
          + ' written, and who would have to write it.',
      ),
      evidence(file),
    );
  },

  'RESEARCH-4-MANAGER-INTERVIEW': (c) => {
    const file = RESEARCH_DELIVERABLES['RESEARCH-4-MANAGER-INTERVIEW'];
    return L(
      head(c, file),
      howTo(
        '**THIS STORY SENDS NOTHING.** No calendar invite, no scheduling link, no attendee list, no'
          + ' email. The story is complete when the agenda exists, not when a meeting is booked.'
          + ' Any wording implying a meeting is scheduled is wrong and will fail review.',
        'Draft the questions with Claude Code, then cut them. Thirty minutes is roughly eight real'
          + ' questions, not twenty.',
        'Carry the blocker named in the brief into the agenda as an item. A manager who cannot'
          + ' reach the surface cannot validate what they are being asked to validate, and that is'
          + ' worth their meeting time.',
      ),
      contract(
        'A 30-minute agenda with time budgeted per section, adding up to 30.',
        'The questions, grouped by: which capabilities they want first, which must stay human'
          + ' forever, what "good" looks like in measurable terms, and what they would want'
          + ' switched off immediately if it misbehaved.',
        'The access blocker from the brief, written as something to raise rather than something to'
          + ' fix in the meeting.',
        'A short section for their answers, left empty, so the same file becomes the record'
          + ' afterwards.',
      ),
      evidence(file),
    );
  },

  'RESEARCH-5-THREE-PROPOSED-TASKS': (c) => {
    const file = RESEARCH_DELIVERABLES['RESEARCH-5-THREE-PROPOSED-TASKS'];
    return L(
      head(c, file),
      howTo(
        "**Choose from this domain's own draft capabilities rather than inventing tasks.** The"
          + ' brief says how many there are to choose from. An invented task cannot be validated'
          + ' against anything.',
        'For each, state the starting autonomy and the ceiling on the `autonomy:R0` to'
          + ' `autonomy:R9` ladder, and WHY the ceiling is where it is. Read'
          + ' `backend/src/services/agentDomain/autonomyLadder.ts` for what each rung means.',
        'Write the completion evidence before the task description. If you cannot say what would'
          + ' prove it worked, the task is not ready to propose.',
      ),
      contract(
        'Three tasks, each with: the tools and data it needs, its approval boundary, and what'
          + ' counts as evidence it completed correctly.',
        'Starting autonomy and ceiling for each, with the reason for the ceiling.',
        'The named human who approves each one.',
        'An explicit statement, per task, of what would make you switch it off.',
      ),
      L(
        '',
        '## The evidence rule this story exists to teach',
        '',
        '**Completion evidence may not be any of these:** a story marked done, time having passed,',
        'a conversation that went well, or a mocked test passing. This platform already carries 106',
        'approval rows whose only recorded decider is a 4.25-hour timer. That is the failure this',
        'requirement exists to prevent, and proposing a task with timer-shaped evidence repeats it.',
        evidence(file),
      ),
    );
  },

  'LEGACY-MIGRATION-PLAN': (c) => {
    const file = RESEARCH_DELIVERABLES['LEGACY-MIGRATION-PLAN'];
    return L(
      head(c, file),
      howTo(
        'The brief already contains the disposition of every inherited legacy record for this'
          + ' domain, with reasons and `file:line` evidence. **Your job is not to redo that work.**'
          + ' It is to turn it into a plan a manager can act on, and to check it.',
        'Verify a sample against the repo. Open two or three of the cited `file:line` references'
          + ' with Claude Code and confirm they say what the brief claims. Record which ones you'
          + ' checked.',
        'Every record marked `unknown` is the real work. For each, say what single question would'
          + ' resolve it and who can answer.',
      ),
      contract(
        'A disposition table: one row per legacy record, its category, and its successor capability'
          + ' where there is one.',
        'The `unknown` records called out separately, each with the question that resolves it and'
          + ' the person who can answer.',
        'Which citations you personally verified, and what you found.',
        'A sequence: what has to be decided first, and what is blocked until it is.',
        'Anything in the brief you believe is WRONG, with your evidence. Discovery was done at'
          + ' speed and finding an error in it is a better outcome than agreeing with all of it.',
      ),
      evidence(file),
    );
  },
});

/** The story suffixes this module can write a prompt for. */
export const RESEARCH_PROMPT_KEYS: ReadonlyArray<string> = Object.freeze(Object.keys(TEMPLATES));

/**
 * The prompt for a story, or null when this module does not own it.
 *
 * Matched on the SUFFIX, because story ids are `<domain>.<PREFIX>` and the prefix is the stable
 * part. Returns null rather than a generic prompt: a capability story has its own prompt built
 * from its own capability record, and handing it a research template would be worse than
 * handing it nothing.
 */
export function researchPromptFor(storyId: string, c: ResearchPromptContext): string | null {
  if (typeof storyId !== 'string') return null;
  const key = RESEARCH_PROMPT_KEYS.find((k) => storyId.endsWith(k));
  return key ? TEMPLATES[key](c) : null;
}

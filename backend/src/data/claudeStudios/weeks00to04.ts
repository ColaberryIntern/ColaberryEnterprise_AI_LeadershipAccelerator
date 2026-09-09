/**
 * Claude Studio content — Weeks 0-4.
 *
 * Each studio is adapted to the EXISTING week theme in data/weekBlueprints.ts
 * (the AI Systems Architect track) while retaining the intended career asset.
 * Where placement deviates from the source curriculum brief the reason is
 * recorded in `adaptation` and surfaced in the instructor view.
 */
import { ClaudeStudioWeek } from './types';

export const STUDIOS_00_TO_04: ClaudeStudioWeek[] = [
  /* ------------------------------------------------------------------ Week 0 */
  {
    week: 0,
    key: 'working-agreement',
    title: 'Claude Working Agreement Studio',
    career_asset: 'A personal Claude Project and a written AI Working Agreement',
    week_theme: 'Free AI Preview',
    adaptation: null,
    intro:
      'Before you build anything, decide how you will work with Claude. This studio has you set up one reusable Project that carries your role, your standards, and your privacy boundaries into every future conversation, then write the agreement that says what you will and will not hand over to an AI. It is the shortest studio in the program and the one every later week leans on.',
    objectives: [
      'Distinguish Claude.ai conversations, Projects, Artifacts, and Claude Code by what each is actually good at',
      'Configure a reusable Claude Project with role, goals, response style, evidence rules, and privacy boundaries',
      'Write an AI Working Agreement that states which decisions you will never delegate',
      'Produce a tool-selection Artifact you can hand to a colleague who has never used Claude',
    ],
    scenario:
      'You have just been given an AI budget and no rules. Your manager wants to know, in writing, how you intend to use AI on client and company work before you touch either. Nobody has written this down at your organization yet, so what you produce becomes the first draft everyone else argues with.',
    role: 'A business technologist setting your own operating rules before your first AI project',
    estimated_minutes: 45,
    stages: [
      {
        key: 'explore',
        title: 'Find the edges of what you should delegate',
        minutes: 10,
        instruction:
          'Open a normal Claude conversation and think out loud about your actual work. You are not asking Claude for a policy; you are using it to surface the decisions you have been making implicitly.',
        steps: [
          'Describe your role, the kinds of work you do weekly, and the data those tasks touch.',
          'Ask Claude to name the tasks where AI assistance is low-risk, and the ones where a wrong answer would be expensive or hard to reverse.',
          'Push back at least once on an answer you think is wrong, and note why you disagreed.',
        ],
      },
      {
        key: 'organize',
        title: 'Build the Project you will reuse all program',
        minutes: 15,
        instruction:
          'Create a Claude Project and put your context in it once. Everything you do in weeks 1-12 starts from this Project, so the effort compounds.',
        steps: [
          'Create a Project named for yourself and this program.',
          'Write custom instructions covering your role, your goals for the next 12 weeks, the response style you want, and the evidence standard you expect.',
          'Add a privacy boundary section that names, specifically, what must never be pasted in.',
        ],
      },
      {
        key: 'create',
        title: 'Make the tool-selection Artifact',
        minutes: 15,
        instruction:
          'Ask Claude to build an Artifact that helps a colleague choose the right Claude mode for a task. It should be usable by someone who has never opened Claude.',
        steps: [
          'Ask for a single-page interactive Artifact comparing conversations, Projects, Artifacts, and Claude Code.',
          'Require a concrete example task per mode, drawn from your own job, not generic ones.',
          'Iterate at least once: tell Claude what a confused colleague would still get wrong, and have it fix that.',
        ],
      },
      {
        key: 'prove',
        title: 'Commit to the agreement in your own words',
        minutes: 5,
        instruction:
          'Write the working agreement yourself. Claude can format it; the commitments have to be yours or the document is worthless.',
        steps: [
          'State the three decisions you will never delegate to an AI.',
          'State how you will disclose AI assistance in work you hand to others.',
          'Submit the Artifact link and your reflection.',
        ],
      },
    ],
    project: {
      name: 'My Architect Workspace — Working Agreement',
      instructions:
        'Set custom instructions covering: who you are and what you do; what you want out of the next 12 weeks; the response style you prefer (length, directness, whether you want to be challenged); your evidence rule (for example, "flag anything you are inferring rather than reading"); and your privacy boundary (what categories of data must never appear in a prompt).',
      sources: [
        'Your own role description or a recent project brief with client identifiers removed',
        'Your employer\'s acceptable-use or data-handling policy, if one exists',
        'The program syllabus for the AI Systems Architect Accelerator',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Surface your own delegation boundary',
        why: 'Starts from your real work instead of a generic AI-policy template, so the boundaries you end up with are ones you would actually defend.',
        text: `I am setting my personal rules for working with AI before I start a 12-week AI Systems Architect program.

My role: [describe your role in 2-3 sentences]
Work I do weekly: [list 4-6 recurring tasks]
Data those tasks touch: [name the categories, not the data itself]

Do three things, in this order:
1. Sort my weekly tasks into three groups: safe to delegate to AI, safe with review, and should not be delegated. Explain the sorting rule you used.
2. Name the two tasks where you are least confident about your own sorting, and say what you would need to know to be sure.
3. Ask me the three questions that would most change your answer.

Do not write a policy yet. I want to see the reasoning first.`,
      },
      {
        kind: 'improve',
        label: 'Attack your first draft',
        why: 'A first answer tends to be agreeable. This makes Claude argue against its own sorting so you see where it is soft.',
        text: `Take the sorting you just gave me and argue against it.

For each task you put in "safe to delegate", give me the specific scenario where that turns out to be the wrong call and something goes badly. Be concrete about the failure, not hand-wavy about "risk".

Then tell me which of your original placements you would now change, and which you would defend even knowing the failure case.`,
      },
      {
        kind: 'followup',
        label: 'Build the tool-selection Artifact',
        why: 'Produces the week\'s career asset — an Artifact a colleague can use without you standing next to them.',
        text: `Build me a single-page interactive Artifact that helps a colleague who has never used Claude decide which mode to use for a task.

Cover four modes: a normal Claude conversation, a Claude Project, an Artifact, and Claude Code.

For each mode include: what it is in one plain sentence, when to reach for it, when NOT to, and one worked example drawn from this list of my real tasks: [paste your weekly task list].

Requirements:
- It must be usable without me explaining it.
- No jargon that a non-technical manager would not know.
- Make the examples specific to my job. Generic examples are the failure mode here.

After you build it, tell me what a confused first-time reader would still get wrong.`,
      },
    ],
    artifact: {
      type: 'Interactive tool-selection guide (single-page Artifact)',
      requirements: [
        'Covers all four modes: conversation, Project, Artifact, Claude Code',
        'Each mode has a plain-language description, a "reach for it when", and a "do not use it for"',
        'At least one worked example per mode drawn from the student\'s own work, not a generic one',
        'Readable by a non-technical colleague with no explanation from the student',
      ],
    },
    trust_checkpoints: [
      'The privacy boundaries in your working agreement are yours. If you cannot say why a boundary is there, it is not a boundary, it is decoration.',
      'Do not paste client names, personal data, credentials, or anything under NDA into any Claude surface while building this — the exercise is about the categories, not the contents.',
      'Claude drafted the comparison; you are the one signing the agreement. Read every line you are about to commit to.',
    ],
    deliverables: [
      'A Claude Project created with custom instructions filled in (screenshot or description of the setup)',
      'A written AI Working Agreement naming three decisions you will never delegate',
      'The tool-selection Artifact (shared link)',
      'A reflection on where your instinct and Claude\'s sorting disagreed',
    ],
    prohibited_shortcuts: [
      'Pasting a generic AI-use policy found online and calling it your working agreement',
      'Submitting the Artifact without opening the shared link yourself to check it renders for someone else',
      'Accepting the first sorting without pushing back on any of it',
    ],
    reflection: {
      checks: [
        'I created a Claude Project and filled in its custom instructions',
        'My working agreement names at least three decisions I will not delegate',
        'I opened my Artifact\'s shared link and confirmed it renders for someone who is not me',
        'I disagreed with Claude at least once and recorded why',
      ],
      free_response:
        'Where did your judgment and Claude\'s sorting disagree, and who was right? If you changed your mind, say what changed it. If you did not, say what evidence would.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'The delegation boundaries follow from the student\'s actual work and risk, and the student can explain the rule behind the sorting.', developing: 'Boundaries are generic or borrowed; the sorting rule is unstated.' },
      { dimension: 'Evidence', strong: 'Examples in the Artifact are drawn from the student\'s real tasks and are specific enough to be checkable.', developing: 'Examples are generic ("write an email", "summarize a document").' },
      { dimension: 'Communication', strong: 'A non-technical colleague could use the Artifact unaided.', developing: 'The Artifact assumes the reader already knows the tools.' },
      { dimension: 'Judgment', strong: 'The student pushed back on Claude and can say what would change their mind.', developing: 'Every Claude output was accepted as given.' },
      { dimension: 'Responsible AI', strong: 'Privacy boundaries are specific, justified, and were respected during the exercise itself.', developing: 'Privacy is mentioned but not defined, or sensitive data was pasted in during the build.' },
    ],
    competencies: ['ai_governance', 'communication', 'leadership'],
    points: { learning: 25, builder: 15, community: 0 },
    portfolio_eligible: true,
    certification_active: false,
    instructor_notes:
      'This is the free-preview week, so treat it as onboarding, not assessment. The Project created here is reused in every later studio — if a student skips it, weeks 1-12 get materially harder, so chase non-completion early. The single most valuable output is the "three decisions I will never delegate" list; read those before anything else.',
    misconceptions: [
      'Thinking a Project is just a folder — students often skip custom instructions entirely, which is the only part that carries context forward.',
      'Assuming Artifacts and Claude Code are the same thing because both produce code.',
      'Writing a working agreement that only says "I will check the output", which is not a boundary.',
    ],
  },

  /* ------------------------------------------------------------------ Week 1 */
  {
    week: 1,
    key: 'problem-framing',
    title: 'Problem Framing Studio',
    career_asset: 'An interactive Business Problem Brief',
    week_theme: 'Claude Code Foundations + Workspace',
    adaptation:
      'The source brief frames Week 1 generically. Here the framing exercise is pointed at the Architect Workspace the student stands up this week in Claude Code, so the problem brief becomes the charter for the system they extend for the remaining 11 weeks.',
    intro:
      'This week you stand up an Architect Workspace in Claude Code. Before you build in it, decide what it is for. This studio turns "I should automate something" into a brief a stakeholder could fund: who hurts, what it costs them, what constrains the fix, and how you would know it worked.',
    objectives: [
      'Convert an unclear idea into users, pain points, constraints, outcomes, and measurable success criteria',
      'Separate the presenting symptom from the underlying problem, and defend the distinction',
      'Surface and record the silent assumptions a problem statement is resting on',
      'Produce an interactive brief a stakeholder can inspect without a walkthrough',
    ],
    scenario:
      'Your Architect Workspace is empty and you have 11 weeks of build time. Someone on your team has been complaining about a recurring manual process for months. You have been asked to write the one-page brief that decides whether it is worth eleven weeks of engineering, and to be honest about whether the thing being complained about is the actual problem.',
    role: 'The person who has to defend this build to whoever is paying for it',
    estimated_minutes: 75,
    stages: [
      {
        key: 'explore',
        title: 'Separate the symptom from the problem',
        minutes: 20,
        instruction:
          'Bring Claude the messy version — the complaint as you actually heard it. Use the conversation to find out whether the complaint and the problem are the same thing.',
        steps: [
          'Describe the situation in the words the complainer used, not in cleaned-up business language.',
          'Ask Claude to distinguish what people are experiencing from what may be causing it, and to say which parts are inference.',
          'Name at least two plausible root causes you had not considered, and say what evidence would tell them apart.',
        ],
      },
      {
        key: 'organize',
        title: 'Load the Project with what is actually true',
        minutes: 15,
        instruction:
          'Move from conversation to Project. The Project holds the constraints and facts so you stop re-explaining them every time.',
        steps: [
          'Add the real constraints: time, budget, systems you cannot change, people whose approval you need.',
          'Add any documents you legitimately have — a process description, a ticket export with identifiers removed, a team charter.',
          'Write instructions telling Claude to mark clearly when it is inferring rather than reading from your sources.',
        ],
      },
      {
        key: 'create',
        title: 'Build the inspectable brief',
        minutes: 30,
        instruction:
          'The brief is an Artifact, not a document, because a stakeholder should be able to poke at the framing rather than read it linearly.',
        steps: [
          'Include users and their pain, the problem statement, constraints, target outcomes, and measurable success criteria.',
          'Include the assumptions register as a first-class section — visible, not buried.',
          'Make success criteria numeric and time-bound. "Faster" is not a success criterion.',
        ],
      },
      {
        key: 'prove',
        title: 'Defend it in two minutes',
        minutes: 10,
        instruction:
          'Record or write a two-minute explanation of why this problem is worth eleven weeks, aimed at someone who controls the budget.',
        steps: [
          'Lead with the cost of doing nothing, not with the solution.',
          'Name the assumption that, if wrong, kills the project.',
          'Submit the Artifact link and the explanation.',
        ],
      },
    ],
    project: {
      name: 'Week 1 — Problem Framing',
      instructions:
        'Instruct Claude: this Project is for framing a business problem, not solving it. Refuse to propose solutions until the problem statement is agreed. Mark every claim as either "from the sources you gave me" or "my inference". When I state something as fact that the sources do not support, say so.',
      sources: [
        'Your Week 1 Architect Workspace CLAUDE.md or project README',
        'A written description of the manual process in question, with client identifiers removed',
        'Any existing tickets, complaints, or notes about the process (identifiers removed)',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Interrogate the complaint',
        why: 'Most briefs fail because they encode the first complaint as the problem. This forces the symptom/cause split before any framing hardens.',
        text: `I am writing a business problem brief and I want to make sure I am solving the right problem.

Here is the situation as it was actually described to me, in the original words:
"[paste the complaint verbatim]"

Context: [2-3 sentences on the team, the process, and why it matters now]

Do this:
1. Restate what people are EXPERIENCING, separately from what might be CAUSING it. Be explicit about which is which.
2. Give me three plausible root causes, including at least one that would mean building software is the wrong response.
3. For each root cause, tell me the single cheapest piece of evidence that would confirm or kill it.
4. List every assumption you had to make to answer at all.

Do not propose a solution. I am not there yet.`,
      },
      {
        kind: 'improve',
        label: 'Make the success criteria measurable',
        why: 'Turns aspirational outcomes into numbers someone could check in three months, which is where most briefs quietly fail.',
        text: `Here are the outcomes I want from this project:
[paste your outcomes]

Rewrite each one as a measurable success criterion with a number, a unit, and a deadline. For each:
- State what we would measure and where that measurement comes from today.
- If we do not currently measure it, say so plainly and tell me what it would take to start.
- Flag any criterion that sounds measurable but is not actually observable with the data we have.

Then tell me which single criterion I should drop because it will not survive contact with reality.`,
      },
      {
        kind: 'followup',
        label: 'Build the interactive brief',
        why: 'Produces the career asset — a brief a stakeholder can inspect rather than sit through.',
        text: `Build an interactive single-page Artifact: a Business Problem Brief a stakeholder can inspect.

Use only what is in this Project. If something is missing, show it as an open question rather than inventing it.

Sections:
1. The problem in one sentence a busy executive would understand
2. Who is affected, and what it costs them — with the numbers we actually have
3. Constraints we cannot change
4. Target outcomes with measurable success criteria
5. Assumptions register — every assumption, its risk if wrong, and how we would test it
6. Open questions we have not answered

Make the assumptions register prominent, not a footnote. A reader should be able to see the shakiest part of this brief in ten seconds.`,
      },
    ],
    artifact: {
      type: 'Interactive Business Problem Brief (single-page Artifact)',
      requirements: [
        'Problem statement distinguishable from the presenting symptom',
        'Affected users and quantified cost of the current state',
        'Constraints section covering time, budget, systems, and approvals',
        'Success criteria that are numeric and time-bound',
        'A visible assumptions register with risk and a test for each assumption',
        'Open questions shown rather than papered over',
      ],
    },
    trust_checkpoints: [
      'Any number in your brief must come from something you can point to. If Claude produced a plausible-sounding figure and you cannot source it, mark it as an estimate or cut it.',
      'The assumptions register is the honest part of the document. Do not let Claude quietly resolve an assumption by asserting it.',
      'You are deciding whether eleven weeks of your life go here. That judgment is not delegable, however good the brief looks.',
    ],
    deliverables: [
      'The interactive Business Problem Brief (shared Artifact link)',
      'An assumptions register with at least five assumptions, each with a test',
      'A two-minute written or recorded explanation aimed at a budget holder',
      'Reflection on which root cause you rejected and why',
    ],
    prohibited_shortcuts: [
      'Accepting the first framing Claude offers without generating alternative root causes',
      'Success criteria that use words like "improved", "faster", or "better" with no number',
      'Letting Claude invent baseline metrics you do not actually have',
    ],
    reflection: {
      checks: [
        'My problem statement is different from the complaint I started with, or I can explain why it should not be',
        'Every success criterion has a number and a date',
        'My assumptions register has at least five entries, each with a way to test it',
        'Every figure in the brief traces to a source I can name',
      ],
      free_response:
        'Which root cause did you seriously consider and then reject, and what made you reject it? If you never had a real second candidate, say so — that is worth knowing about your own framing.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'Symptom and cause are cleanly separated and the student can defend the chosen framing against a named alternative.', developing: 'The brief restates the original complaint with better formatting.' },
      { dimension: 'Evidence', strong: 'Every quantitative claim traces to a real source; gaps are shown as open questions.', developing: 'Numbers appear with no provenance, or invented baselines are presented as fact.' },
      { dimension: 'Communication', strong: 'A budget holder could read the brief cold and know what is being asked and why.', developing: 'The brief needs the student present to make sense.' },
      { dimension: 'Judgment', strong: 'The assumptions register names the assumption that would kill the project, and it is a real one.', developing: 'Assumptions listed are safe and inconsequential.' },
      { dimension: 'Responsible AI', strong: 'Inference is labelled as inference; no client or personal data entered the Project.', developing: 'AI-generated inference is presented as established fact.' },
    ],
    competencies: ['systems_thinking', 'communication', 'context_engineering'],
    points: { learning: 30, builder: 40, community: 0 },
    portfolio_eligible: true,
    certification_active: false,
    instructor_notes:
      'The brief produced here should be the charter for the student\'s workspace build for the rest of the program — check that it is scoped to something they could actually build in eleven weeks. The most common failure is a brief for a problem that is real but far too large. Read the assumptions register first; a register of five safe assumptions means the student has not found the risky one.',
    misconceptions: [
      'Believing the loudest complaint is the problem.',
      'Treating "we do not have that metric today" as a reason to invent one rather than as a finding.',
      'Thinking the assumptions register is a formality rather than the most useful part of the brief.',
    ],
  },

  /* ------------------------------------------------------------------ Week 2 */
  {
    week: 2,
    key: 'research-evidence',
    title: 'Research and Evidence Studio',
    career_asset: 'A source-grounded Research Brief',
    week_theme: 'Agent Skills (build 3 skills)',
    adaptation:
      'Week 2 has students author three reusable Agent Skills. A Skill encodes a standard, so this studio researches the standard first — the research brief becomes the evidence base the student\'s Skills are built on, rather than an unrelated research exercise.',
    intro:
      'This week you teach Claude something once so it behaves consistently forever. That only works if what you teach it is right. This studio is about grounding: building a Project that holds approved sources, then producing a research brief that separates what a source says from what you concluded.',
    objectives: [
      'Build a Claude Project whose answers are constrained to approved sources',
      'Compare sources and identify where they genuinely disagree rather than merely differ in wording',
      'Distinguish fact, inference, and speculation in your own writing',
      'Produce a research brief with source references, stated confidence, and named gaps',
    ],
    scenario:
      'You are about to encode three standards into Agent Skills that you and possibly your team will rely on for months. Before you do, you have to establish what the standard actually is — from primary sources, not from memory or from whatever the model believes. Getting this wrong means confidently wrong output, repeated at scale.',
    role: 'The person whose research is about to be frozen into reusable tooling',
    estimated_minutes: 80,
    stages: [
      {
        key: 'explore',
        title: 'Map what you do not know',
        minutes: 15,
        instruction:
          'Start with an honest inventory. The purpose is to find the questions worth researching, not to get answers yet.',
        steps: [
          'State the three standards you intend to encode as Skills.',
          'Ask Claude what it would need to be confident about each, and where it thinks practitioners actually disagree.',
          'Write down which questions you can answer from documents you have, and which you cannot.',
        ],
      },
      {
        key: 'organize',
        title: 'Build a source-constrained Project',
        minutes: 20,
        instruction:
          'This is the studio where the Project does the real work: it is what makes the difference between grounded research and confident guessing.',
        steps: [
          'Add at least three genuine sources — documentation, standards, internal guidelines, published guidance.',
          'Write instructions requiring every claim to cite which source it came from, and to say "not in the sources" rather than filling gaps.',
          'Test the constraint: ask something the sources do not cover and confirm Claude declines instead of inventing.',
        ],
      },
      {
        key: 'create',
        title: 'Write the brief, contradictions and all',
        minutes: 35,
        instruction:
          'Produce the research Artifact. The section that matters most is where the sources disagree.',
        steps: [
          'Build a source table: what each source is, its date, and how authoritative it is.',
          'Build a contradiction log: where sources conflict, and which you are trusting and why.',
          'Mark each finding with confidence and say what would raise it.',
        ],
      },
      {
        key: 'prove',
        title: 'Show your Skills inherit the evidence',
        minutes: 10,
        instruction:
          'Connect the research to the week\'s build: point at which finding shaped which Skill.',
        steps: [
          'For each of your three Skills, name the finding it rests on.',
          'Name one thing you had believed before this research that turned out to be unsupported.',
          'Submit the brief and reflection.',
        ],
      },
    ],
    project: {
      name: 'Week 2 — Research and Evidence',
      instructions:
        'Instruct Claude: answer only from the sources in this Project. Every claim must name its source. If the sources do not cover something, say "not in the sources" — do not fill the gap from general knowledge. When two sources conflict, surface the conflict rather than picking one silently. Label anything you infer as an inference.',
      sources: [
        'Official documentation for the tools or standards you are encoding',
        'Your organization\'s internal guidelines or style standards, if any exist',
        'At least one source that predates or disagrees with the others, so the contradiction log has something real in it',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Interrogate the sources against each other',
        why: 'Comparison across sources is where research stops being summarization. This makes disagreement the output rather than a side effect.',
        text: `I have loaded this Project with sources on [topic]. I am about to encode standards from them into reusable Agent Skills, so being wrong here is expensive.

Working ONLY from the sources in this Project:

1. Summarize what each source claims about [specific question]. Cite the source for every claim.
2. Identify where the sources genuinely disagree — not just where they use different words, but where following one would lead to different behavior than following another.
3. For each disagreement, tell me what kind it is: out of date, different scope, or a real difference of opinion.
4. List what these sources do NOT cover that I would need to know.

If something is not in the sources, say "not in the sources". Do not fill it in.`,
      },
      {
        kind: 'improve',
        label: 'Separate fact from your inference',
        why: 'Research briefs go wrong when an inference hardens into a fact between the draft and the final version.',
        text: `Take your last answer and re-label it.

Go through claim by claim and mark each one as:
- FACT: stated directly in a source (name it)
- INFERENCE: your reasoning from what the sources say (show the step)
- UNSUPPORTED: you believe it but this Project's sources do not establish it

Then tell me: which of your INFERENCE items are load-bearing — meaning if the inference is wrong, the conclusion changes? Those are the ones I need to verify myself.`,
      },
      {
        kind: 'followup',
        label: 'Build the research Artifact',
        why: 'Produces the career asset with confidence and gaps visible rather than implied.',
        text: `Build a single-page Artifact: a source-grounded Research Brief on [topic].

Use only this Project's sources.

Include:
1. The question this brief answers, in one sentence
2. Key findings — each with its source reference and a confidence level (high / medium / low) with a one-line reason for that level
3. A source table: source, what kind it is, its date, and how authoritative it is
4. A contradiction log: where sources conflict, what kind of conflict, and which I am trusting with the reason
5. Open questions — what these sources cannot answer
6. What would change my conclusions

Do not smooth over the contradictions. The contradiction log is the most valuable section here.`,
      },
    ],
    artifact: {
      type: 'Source-grounded Research Brief (single-page Artifact)',
      requirements: [
        'Every finding carries a source reference',
        'A source table with kind, date, and authority for each source',
        'A contradiction log showing real conflicts and the resolution taken',
        'Confidence stated per finding, with the reason for that confidence',
        'An explicit list of what the sources cannot answer',
      ],
    },
    trust_checkpoints: [
      'A citation is only a citation if you opened the source. Confirm the source actually says what the brief claims it says — at least for the load-bearing findings.',
      'A contradiction log with nothing in it usually means the sources were too similar or the comparison was shallow, not that everyone agrees.',
      'Do not let a confidence level be decoration. If everything is "high confidence", the scale is not being used.',
    ],
    deliverables: [
      'The Research Brief Artifact (shared link)',
      'A source table with at least three genuine sources',
      'A contradiction log with at least one real disagreement and its resolution',
      'A note mapping each of your three Agent Skills to the finding it rests on',
    ],
    prohibited_shortcuts: [
      'Loading sources into the Project but then asking questions the sources do not cover and accepting the answer anyway',
      'Citing a source you have not read',
      'Recording a contradiction and resolving it by preference rather than by reason',
    ],
    reflection: {
      checks: [
        'My Project contains at least three real sources',
        'I tested the source constraint by asking something out of scope and Claude declined',
        'My contradiction log contains at least one genuine disagreement',
        'I verified the load-bearing findings against the source myself',
      ],
      free_response:
        'Name one thing you believed before this research that the sources did not support. If nothing changed, describe how you checked — because starting and ending with identical beliefs is either good preparation or shallow research, and it matters which.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'Disagreements between sources are classified by cause and resolved with a stated reason.', developing: 'Sources are summarized in sequence with no comparison.' },
      { dimension: 'Evidence', strong: 'Every finding cites a source; the student verified the load-bearing ones directly.', developing: 'Citations are present but unverified, or absent for key claims.' },
      { dimension: 'Communication', strong: 'A reader can see confidence and gaps at a glance.', developing: 'Confidence is uniform or missing; gaps are not stated.' },
      { dimension: 'Judgment', strong: 'The student can name a belief the research overturned, or shows how they checked.', developing: 'No belief was tested; the research confirmed what the student already thought.' },
      { dimension: 'Responsible AI', strong: 'The Project constraint was tested and holds; inference is labelled distinctly from fact.', developing: 'Model general knowledge is presented as sourced fact.' },
    ],
    competencies: ['context_engineering', 'documentation', 'systems_thinking'],
    points: { learning: 30, builder: 40, community: 0 },
    portfolio_eligible: true,
    certification_active: false,
    instructor_notes:
      'The Project-with-sources constraint is the teachable moment of this week. Ask students to show you the moment Claude said "not in the sources" — if they cannot produce one, the constraint was never really applied. Tie the brief to their three Skills explicitly; the point is that reusable tooling inherits the quality of the research behind it.',
    misconceptions: [
      'Believing that adding sources to a Project automatically stops the model using general knowledge — it needs to be instructed, and tested.',
      'Treating "the sources disagree" as a failure of the research rather than its most useful finding.',
      'Using confidence levels as a formatting flourish rather than a real signal.',
    ],
  },

  /* ------------------------------------------------------------------ Week 3 */
  {
    week: 3,
    key: 'requirements',
    title: 'Stakeholder and Requirements Studio',
    career_asset: 'An interactive Requirements Explorer',
    week_theme: 'Claude API + Workflow Assistant',
    adaptation:
      'Week 3 ships a Business Workflow Assistant. This studio produces the requirements that assistant is built against, so the week\'s Claude Code deliverable has a specification behind it instead of an improvised scope.',
    intro:
      'This week you ship a Business Workflow Assistant. This studio writes what it must do before you write how. You will run structured stakeholder discovery, translate needs into requirements with acceptance criteria, and be explicit about what you are deliberately not building.',
    objectives: [
      'Run structured stakeholder discovery that surfaces conflicting needs rather than averaging them',
      'Translate needs into functional and non-functional requirements with testable acceptance criteria',
      'Write exclusions and open decisions as first-class parts of a specification',
      'Produce an explorer that lets a stakeholder filter requirements by owner and priority',
    ],
    scenario:
      'Four people want your Workflow Assistant to do four different things. The operations lead wants speed, the compliance reviewer wants an audit trail, the person doing the work today wants it to not break their routine, and your manager wants it done this month. You have to write a specification all four could sign, or say plainly which one is not getting what they asked for.',
    role: 'The business analyst who has to write down what is in and what is out',
    estimated_minutes: 85,
    stages: [
      {
        key: 'explore',
        title: 'Model the stakeholders honestly',
        minutes: 20,
        instruction:
          'Use Claude to prepare for and structure discovery. It can help you anticipate what each stakeholder cares about; it cannot tell you what they actually said.',
        steps: [
          'Describe each real stakeholder, their role, and what you already know they want.',
          'Ask Claude to generate the questions that would most likely surface a conflict between them.',
          'Mark clearly which stakeholder statements are things you were actually told, and which are your projections.',
        ],
      },
      {
        key: 'organize',
        title: 'Put the constraints where they cannot be forgotten',
        minutes: 15,
        instruction:
          'The Project holds the non-negotiables so no requirement quietly violates one three weeks later.',
        steps: [
          'Add the Week 1 problem brief and any real process documentation.',
          'Add the hard constraints: systems, compliance requirements, deadlines, skills available.',
          'Instruct Claude to flag any proposed requirement that conflicts with a constraint already in the Project.',
        ],
      },
      {
        key: 'create',
        title: 'Build the Requirements Explorer',
        minutes: 40,
        instruction:
          'A list of requirements is hard to review. An explorer lets a stakeholder see just their own and argue with it.',
        steps: [
          'Write functional requirements as user stories with acceptance criteria that could be tested.',
          'Write non-functional requirements with numbers — response time, availability, data retention.',
          'Include exclusions and a decision log of what is still unresolved and who decides.',
          'Make it filterable by stakeholder and by priority.',
        ],
      },
      {
        key: 'prove',
        title: 'Tell someone they are not getting what they asked for',
        minutes: 10,
        instruction:
          'The test of a specification is whether it survives the conversation with the person whose request got cut.',
        steps: [
          'Write the summary you would send to the stakeholder whose need was deprioritized.',
          'State the tradeoff plainly and say what would change the decision.',
          'Submit the explorer and the summary.',
        ],
      },
    ],
    project: {
      name: 'Week 3 — Requirements',
      instructions:
        'Instruct Claude: when I describe a stakeholder need, never present a simulated stakeholder statement as something a real person said — label anything you generate as a projection. Flag any requirement that conflicts with the constraints in this Project. Every functional requirement must come with acceptance criteria that could be objectively tested.',
      sources: [
        'Your Week 1 Business Problem Brief',
        'A description of the current manual workflow the assistant will replace',
        'Compliance, security, or retention constraints that apply to this data',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Find the conflict before the meeting does',
        why: 'Requirements failures are usually unresolved stakeholder conflicts that nobody wrote down. This surfaces them while they are still cheap.',
        text: `I am specifying a Business Workflow Assistant. Here are my real stakeholders and what I know each of them wants:

1. [role] — wants: [what you actually heard]
2. [role] — wants: [what you actually heard]
3. [role] — wants: [what you actually heard]
4. [role] — wants: [what you actually heard]

Do this:
1. Identify where these wants are in genuine tension — where satisfying one makes another harder or impossible.
2. For each tension, describe the decision that has to be made and who should make it. Do not resolve it for me.
3. Generate the five discovery questions most likely to expose a requirement nobody has stated yet.
4. Flag anything above where you are projecting what a stakeholder would want rather than using what I told you.

Do not invent quotes or present any simulated stakeholder statement as real.`,
      },
      {
        kind: 'improve',
        label: 'Make every requirement testable',
        why: 'A requirement without acceptance criteria is a wish. This converts them and exposes the ones that cannot be converted.',
        text: `Here are my draft requirements:
[paste them]

For each one:
- Rewrite it as a user story: as a [role], I want [capability], so that [outcome].
- Write acceptance criteria specific enough that two different people testing it would agree on pass or fail.
- Mark it functional or non-functional. For non-functional, give me a number and a unit — "fast" is not a requirement.
- Flag any requirement you cannot write testable criteria for, and tell me why. Those are the ones that are still vague.

Then list what I have NOT specified that a developer would have to guess at.`,
      },
      {
        kind: 'followup',
        label: 'Build the Requirements Explorer',
        why: 'Produces the career asset — a specification a stakeholder can navigate to their own section instead of reading end to end.',
        text: `Build a single-page interactive Artifact: a Requirements Explorer.

Content from this Project only. Where something is undecided, show it as an open decision rather than choosing for me.

Include:
1. Functional requirements as user stories with acceptance criteria
2. Non-functional requirements with numeric targets
3. Explicit exclusions — what we are deliberately NOT building, and why
4. A decision log: open questions, the options, who decides, and by when
5. A stakeholder map showing who asked for what

Make it filterable by stakeholder and by priority, so each person can see their own requirements without reading everything.

Show clearly which requirements are in tension with each other. Do not hide the conflicts to make the document look finished.`,
      },
    ],
    artifact: {
      type: 'Interactive Requirements Explorer (single-page Artifact)',
      requirements: [
        'Functional requirements written as user stories with testable acceptance criteria',
        'Non-functional requirements with numeric targets and units',
        'An explicit exclusions section',
        'A decision log naming open questions, the decider, and the deadline',
        'Filterable by stakeholder and by priority',
        'Requirements in tension with each other are visibly marked',
      ],
    },
    trust_checkpoints: [
      'Claude can help you prepare for discovery. It cannot conduct it. Never present a generated stakeholder statement as something a person said — label projections as projections.',
      'An exclusions list is a commitment. Anything you exclude, you owe the affected stakeholder a direct conversation about.',
      'Prioritization is your call, not the model\'s. If Claude ranked your requirements, check whether you actually agree before you ship the ranking.',
    ],
    deliverables: [
      'The Requirements Explorer Artifact (shared link)',
      'A requirements set covering functional, non-functional, and exclusions',
      'A decision log with owners and deadlines for every open question',
      'The written summary to the stakeholder whose need was deprioritized',
    ],
    prohibited_shortcuts: [
      'Presenting AI-generated stakeholder statements as real interview findings',
      'An exclusions section that is empty because "we will do it all"',
      'Acceptance criteria that restate the requirement instead of testing it',
    ],
    reflection: {
      checks: [
        'Every functional requirement has acceptance criteria two testers would agree on',
        'Every non-functional requirement has a number and a unit',
        'My exclusions section is not empty',
        'No simulated stakeholder statement is presented as a real one',
      ],
      free_response:
        'Which stakeholder is not getting what they asked for, and how did you decide it would be them? Write it as you would say it to their face.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'Stakeholder conflicts are named and resolved with a stated tradeoff, not averaged away.', developing: 'Requirements read as a union of every request with no tension acknowledged.' },
      { dimension: 'Evidence', strong: 'Requirements trace to a stated need; projections are labelled as such.', developing: 'Generated stakeholder needs are indistinguishable from real ones.' },
      { dimension: 'Communication', strong: 'A stakeholder can find and understand their own requirements without help.', developing: 'The explorer is a flat list requiring narration.' },
      { dimension: 'Judgment', strong: 'Exclusions and prioritization are owned, with a defensible reason and a named decider.', developing: 'Nothing is excluded and everything is high priority.' },
      { dimension: 'Responsible AI', strong: 'The line between prepared questions and actual discovery is respected throughout.', developing: 'Fabricated interview content appears as fact.' },
    ],
    competencies: ['systems_thinking', 'communication', 'tradeoffs', 'documentation'],
    points: { learning: 30, builder: 45, community: 0 },
    portfolio_eligible: true,
    certification_active: false,
    instructor_notes:
      'This is the studio where students most often fabricate stakeholders. Ask directly which statements came from a real person. The specification should be the one their Week 3 Workflow Assistant is actually built against — if the two have drifted apart, that is the conversation to have. An empty exclusions section is the reliable signal of an unfinished specification.',
    misconceptions: [
      'Thinking a requirements document should make everyone happy — its job is to make the tradeoffs explicit.',
      'Writing acceptance criteria that simply restate the requirement in other words.',
      'Believing simulated stakeholder discovery is a substitute for talking to people.',
    ],
  },

  /* ------------------------------------------------------------------ Week 4 */
  {
    week: 4,
    key: 'data-storytelling',
    title: 'Data Storytelling Studio',
    career_asset: 'An Executive Insight Brief',
    week_theme: 'Prompt Engineering + Prompt Library',
    adaptation:
      'Week 4 builds an Enterprise Prompt Library and evaluates prompts objectively. That evaluation produces a real dataset the student owns, so this studio uses their own prompt-evaluation results as the data to tell an executive story about, instead of a synthetic dataset.',
    intro:
      'This week you measure prompts instead of guessing about them, which means by Friday you have data. This studio turns that data into a decision. The skill is not describing what a chart shows — it is knowing which decision the data supports, and saying so with the limitations attached.',
    objectives: [
      'Identify the decision a dataset should inform, rather than describing the data',
      'Separate observation, interpretation, recommendation, and limitation cleanly',
      'Quantify uncertainty and state what the data cannot support',
      'Produce an executive brief that leads with the recommendation and survives challenge',
    ],
    scenario:
      'You have evaluation results across the prompts in your library: which techniques worked, which failed, where output quality varied. Your manager has ten minutes and one question — should the team standardize on your library or keep improvising? You have to answer with the evidence you have, including the parts of it that are thin.',
    role: 'The analyst whose recommendation will be acted on before anyone reads the appendix',
    estimated_minutes: 80,
    stages: [
      {
        key: 'explore',
        title: 'Find the decision, not the chart',
        minutes: 15,
        instruction:
          'Before analyzing anything, establish what decision this data is supposed to inform. Most weak analysis is a correct answer to no question.',
        steps: [
          'State the decision that has to be made and who makes it.',
          'Ask Claude what the data would have to show to support each possible decision.',
          'Identify what you would need but do not have.',
        ],
      },
      {
        key: 'organize',
        title: 'Load the real results',
        minutes: 15,
        instruction:
          'Put your actual prompt-evaluation data into the Project, along with how it was collected — because how it was collected is what limits the conclusions.',
        steps: [
          'Add your evaluation results and the method you used to produce them.',
          'Add the sample sizes and the conditions each test ran under.',
          'Instruct Claude to state the limitation whenever it makes a claim the sample cannot carry.',
        ],
      },
      {
        key: 'create',
        title: 'Build the Insight Brief',
        minutes: 40,
        instruction:
          'Build the Artifact executive-first: the recommendation up top, the reasoning underneath, the limitations visible rather than buried.',
        steps: [
          'Lead with the recommendation and the confidence in it.',
          'Separate what you observed from what you concluded — keep them visually distinct.',
          'Show the KPIs that matter for the decision, not every metric you have.',
          'State the limitations in the main body, not an appendix.',
        ],
      },
      {
        key: 'prove',
        title: 'Defend it against the obvious objection',
        minutes: 10,
        instruction:
          'Write the answer to the hardest question your manager will ask, before they ask it.',
        steps: [
          'Name the strongest argument against your recommendation.',
          'Say what evidence would change your mind.',
          'Submit the brief and your defense.',
        ],
      },
    ],
    project: {
      name: 'Week 4 — Data Storytelling',
      instructions:
        'Instruct Claude: distinguish observation (what the data shows) from interpretation (what I think it means) from recommendation (what I think we should do) — and never blur them. State the limitation whenever the sample size or method cannot support a claim. If I ask for a conclusion the data cannot carry, say so instead of hedging it into something that sounds supported.',
      sources: [
        'Your Week 4 prompt evaluation results',
        'The evaluation method: what you tested, how many runs, under what conditions',
        'The Week 1 problem brief, so the recommendation ties back to the original goal',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Work backwards from the decision',
        why: 'Anchors the analysis to a decision so it cannot drift into description, which is the default failure of data work.',
        text: `I have evaluation data on the prompts in my library and I need to make a recommendation.

The decision: should my team standardize on this prompt library, or keep improvising?
Who decides: [role]
The data I have: [describe what you measured, how many runs, under what conditions]

Before analyzing anything:
1. Tell me what the data would have to show to support "standardize", and what it would have to show to support "keep improvising".
2. Tell me what a third option might be that I have not considered.
3. Tell me what I would need to measure that I have not — and which of those gaps is most likely to make my recommendation wrong.

Do not analyze the data yet. I want to know what would count as an answer first.`,
      },
      {
        kind: 'improve',
        label: 'Split observation from interpretation',
        why: 'Executive briefs collapse when an interpretation gets read as a finding. This forces the separation while it is still fixable.',
        text: `Here is my draft analysis:
[paste it]

Rewrite it in four clearly separated sections:
- OBSERVED: only what the data directly shows. No interpretation.
- INTERPRETED: what I think it means, with the reasoning step shown.
- RECOMMENDED: what to do, and how confident I am.
- LIMITATIONS: what this data cannot tell us, and where the sample is too thin to carry the claim.

Then tell me: which of my interpretations is doing the most work in the recommendation, and is the data actually strong enough to support it? Be blunt.`,
      },
      {
        kind: 'followup',
        label: 'Build the Executive Insight Brief',
        why: 'Produces the career asset in the shape an executive reads — decision first, evidence underneath, limits visible.',
        text: `Build a single-page Artifact: an Executive Insight Brief.

Audience: a manager with ten minutes who will act on the recommendation without reading the detail.

Structure:
1. The recommendation, in one sentence, with a confidence level
2. The three KPIs that drive it — only the ones relevant to the decision, not everything I measured
3. What we observed, kept visually distinct from what we concluded
4. Risks and limitations — in the body, not an appendix
5. What we should do next, and what would change the recommendation

Rules:
- Lead with the answer. Do not build up to it.
- Every number must come from the data in this Project.
- If a limitation weakens the recommendation, say so in the same breath as the recommendation.`,
      },
    ],
    artifact: {
      type: 'Executive Insight Brief (single-page Artifact)',
      requirements: [
        'Recommendation stated first, with an explicit confidence level',
        'Only the KPIs relevant to the decision, not every available metric',
        'Observation and interpretation visually distinguished',
        'Limitations in the main body, not an appendix',
        'A stated trigger that would change the recommendation',
      ],
    },
    trust_checkpoints: [
      'Every number in the brief must come from your own evaluation data. A plausible figure the model produced is not a finding.',
      'If the sample is too small to support the recommendation, the honest brief says so and recommends anyway with the caveat — it does not quietly upgrade the confidence.',
      'The recommendation is yours. If you would not defend it in the meeting, do not ship it because the Artifact looks convincing.',
    ],
    deliverables: [
      'The Executive Insight Brief Artifact (shared link)',
      'A written executive summary of no more than 150 words',
      'The observation / interpretation / recommendation / limitation split, kept explicit',
      'Your written answer to the strongest objection',
    ],
    prohibited_shortcuts: [
      'Describing every metric you collected instead of the ones the decision needs',
      'Moving limitations to the end where they will not be read',
      'Letting Claude generate illustrative numbers to fill a gap in the real data',
    ],
    reflection: {
      checks: [
        'My brief leads with a recommendation, not with background',
        'Every figure traces to my own evaluation data',
        'Limitations appear in the main body',
        'I stated what evidence would change my recommendation',
      ],
      free_response:
        'What is the strongest argument against your recommendation, and why did you recommend it anyway? If you cannot construct a real counter-argument, your analysis is probably not finished.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'The analysis answers a decision, and the path from data to recommendation is visible.', developing: 'The brief describes the data without resolving to a decision.' },
      { dimension: 'Evidence', strong: 'Every number traces to the student\'s own evaluation data with the method stated.', developing: 'Figures appear without provenance or method.' },
      { dimension: 'Communication', strong: 'A busy executive gets the recommendation and its confidence in the first ten seconds.', developing: 'The recommendation is buried after background.' },
      { dimension: 'Judgment', strong: 'Limitations are stated where they matter and the student can name what would change their mind.', developing: 'Limitations are absent, or relegated to an appendix.' },
      { dimension: 'Responsible AI', strong: 'No figure was generated to fill a gap; sample weakness is disclosed rather than smoothed.', developing: 'Illustrative numbers are presented as measurements.' },
    ],
    competencies: ['communication', 'decision_making', 'leadership'],
    points: { learning: 30, builder: 45, community: 0 },
    portfolio_eligible: true,
    certification_active: false,
    instructor_notes:
      'Students arrive at this studio wanting to show all their work. The discipline is subtraction. The reliable tell for a finished brief is that limitations sit next to the recommendation rather than at the end. If a student has no real evaluation data from the week\'s Prompt Library build, that is a Week 4 build gap worth catching here rather than at the capstone.',
    misconceptions: [
      'Believing more charts make a stronger brief.',
      'Treating "the sample was small" as something to hide rather than something to state.',
      'Confusing a description of what happened with a recommendation about what to do.',
    ],
  },
];

/**
 * Claude Studio content — Weeks 9-12.
 *
 * Weeks 9 and 10 are deliberately swapped relative to the source curriculum
 * brief so each studio lands on the repo week whose theme already carries it:
 * the repo's Week 9 is Reliability + Quality (evaluation) and its Week 10 is the
 * Governance Engine (trust and risk). Both career assets are retained; the
 * swap is recorded in each week's `adaptation` and asserted by the tests.
 */
import { ClaudeStudioWeek } from './types';

export const STUDIOS_09_TO_12: ClaudeStudioWeek[] = [
  /* ------------------------------------------------------------------ Week 9 */
  {
    week: 9,
    key: 'evaluation-quality',
    title: 'Evaluation and Quality Studio',
    career_asset: 'An AI Output Evaluation Lab',
    week_theme: 'Reliability Engineering + Quality Layer',
    adaptation:
      'Swapped with Week 10 relative to the source brief. The repo\'s Week 9 is Reliability Engineering + Quality Layer, whose stated purpose is adding evaluation and quality gates "so AI output is measured, not assumed" — the evaluation studio belongs on that week, and the governance studio belongs on Week 10\'s Governance Engine. Both career assets are retained, only the order changes.',
    intro:
      'This week you wrap your system in a reliability and quality layer. Quality gates need a definition of quality, and most teams write the gate before they have one. This studio makes you define what good means, build the rubric and the test set, and score real output against it before you automate the judgment.',
    objectives: [
      'Define what "good" means for a specific AI output before evaluating any of it',
      'Build a rubric with scoring guidance two evaluators would apply consistently',
      'Assemble a test set covering representative cases, edge cases, and known failures',
      'Specify which judgments stay with a human and why',
    ],
    scenario:
      'Your system produces AI output that something downstream depends on. You are about to add a quality gate that will pass or fail that output automatically. If your definition of good is wrong, the gate will confidently enforce the wrong standard at scale, which is worse than no gate at all.',
    role: 'The engineer whose rubric is about to become an automated gate',
    estimated_minutes: 90,
    stages: [
      {
        key: 'explore',
        title: 'Define good before you look at any output',
        minutes: 20,
        instruction:
          'Write the standard first. Looking at output before defining quality means the definition gets fitted to what you already produced.',
        steps: [
          'Name the AI output you are evaluating and what depends on it downstream.',
          'Ask Claude what dimensions matter for this output and which are easy to score versus genuinely hard.',
          'Decide which dimensions can be scored automatically and which need a human, and write down why.',
        ],
      },
      {
        key: 'organize',
        title: 'Assemble a test set that includes failure',
        minutes: 20,
        instruction:
          'A test set of well-behaved cases proves nothing. The edge cases and known failures are what the rubric has to survive.',
        steps: [
          'Add representative real cases from your own system\'s output.',
          'Add edge cases: empty input, oversized input, ambiguous input, adversarial input.',
          'Add at least three known failures — output you already know is bad, and why.',
        ],
      },
      {
        key: 'create',
        title: 'Build the evaluation lab',
        minutes: 40,
        instruction:
          'Build the Artifact so a second person could score the same output and land in the same place.',
        steps: [
          'Write the rubric with scoring guidance and a worked example per level.',
          'Score the sample outputs and show the reasoning behind each score, not just the number.',
          'Show a side-by-side comparison of a passing and a failing output on the same dimension.',
          'State the human-review rule: which cases never get auto-scored.',
        ],
      },
      {
        key: 'prove',
        title: 'Test the rubric against a second scorer',
        minutes: 10,
        instruction:
          'A rubric only two people agree on is a rubric. One that only you can apply is a preference.',
        steps: [
          'Have a peer, or your own second pass a day later, score two outputs with your rubric.',
          'Record where the scores diverged and what was ambiguous in the wording.',
          'Submit the lab and the divergence note.',
        ],
      },
    ],
    project: {
      name: 'Week 9 — Evaluation and Quality',
      instructions:
        'Instruct Claude: do not evaluate any output until the rubric is written. When scoring, always show the reasoning that produced the score, not just the number. Distinguish between what a rubric can score reliably and what needs human judgment — and when I ask you to automate a judgment that needs a human, say so.',
      sources: [
        'Real output samples from your own system, including the ones you know are bad',
        'Your Week 3 requirements and acceptance criteria — the downstream standard',
        'The reliability requirements from this week: what depends on this output being right',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Define quality before looking at output',
        why: 'Defining good after seeing the output produces a rubric that ratifies what you already made.',
        text: `I am building a quality gate for AI output in my system. Before I look at any output, I want to define what good means.

The output: [describe what your system produces]
What depends on it: [what happens downstream if it is wrong]
Who consumes it: [human, another system, both]

Do this:
1. What dimensions determine whether this output is good? For each, say whether it is objectively scoreable or requires judgment.
2. For each dimension, what does a clear pass look like, a clear fail, and the ambiguous middle?
3. Which of these dimensions should NOT be automated, and why?
4. What is the failure mode of a gate that scores only the easily-measurable dimensions?

Do not look at or ask for output samples yet.`,
      },
      {
        kind: 'improve',
        label: 'Break the rubric with edge cases',
        why: 'A rubric is only useful at the boundaries; the middle takes care of itself.',
        text: `Here is my rubric:
[paste it]

Try to break it:
1. Construct three outputs that would score well on this rubric while being genuinely bad. Show how they exploit it.
2. Construct two outputs that would score badly while being genuinely fine.
3. Identify which rubric wording is ambiguous enough that two evaluators would disagree — quote the exact phrase.
4. Tell me which dimension is doing the least work and could be cut.

Be adversarial. I would rather find these now than after the gate is enforcing it.`,
      },
      {
        kind: 'followup',
        label: 'Build the evaluation lab',
        why: 'Produces the career asset — a lab where scores come with reasoning, so the rubric can be argued with.',
        text: `Build a single-page Artifact: an AI Output Evaluation Lab.

Include:
1. The rubric — dimensions, scoring levels, and a worked example at each level
2. The test set — representative cases, edge cases, and known failures, labelled by category
3. Scored examples — each with the score AND the reasoning that produced it
4. A side-by-side comparison of a passing and a failing output on the same dimension, so the boundary is visible
5. The human-review rule: which cases must never be auto-scored, and why

Important: this Artifact is a scoring and comparison tool. It must not be presented as having executed automated tests — it shows evaluation reasoning, it does not run a test suite. Label that clearly.`,
      },
    ],
    artifact: {
      type: 'AI Output Evaluation Lab (single-page Artifact)',
      requirements: [
        'A rubric with scoring levels and a worked example per level',
        'A test set labelled by category, including at least three known failures',
        'Scored examples that show reasoning, not only scores',
        'A side-by-side passing/failing comparison on the same dimension',
        'An explicit human-review rule for cases that must not be auto-scored',
        'Clear labelling that this is evaluation reasoning, not an executed test suite',
      ],
    },
    trust_checkpoints: [
      'A visual comparison of outputs is not a test run. Do not let the Artifact imply that automated tests executed and passed — that is the specific confusion this studio exists to prevent.',
      'Write the rubric before looking at output. A rubric fitted to output you already have will pass everything you already made.',
      'Some judgments should not be automated. Naming those explicitly is part of the deliverable, not an admission of incompleteness.',
    ],
    deliverables: [
      'The AI Output Evaluation Lab Artifact (shared link)',
      'An evaluation rubric with scoring guidance and worked examples',
      'A test set including representative, edge, and known-failure cases',
      'A divergence note from a second scorer applying your rubric',
    ],
    prohibited_shortcuts: [
      'Writing the rubric after reviewing the output it will score',
      'A test set with no failure cases in it',
      'Presenting a visual comparison as executed automated testing',
    ],
    reflection: {
      checks: [
        'I wrote the rubric before examining any output',
        'My test set contains at least three known-bad cases',
        'Every score in my lab shows the reasoning behind it',
        'A second scorer applied my rubric and I recorded where we diverged',
      ],
      free_response:
        'Where did your rubric and a second scorer disagree, and was the fault in the wording or in the judgment? Ambiguity you can name is ambiguity you can fix.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'Quality dimensions follow from what depends on the output downstream.', developing: 'Dimensions are generic quality words with no link to consequence.' },
      { dimension: 'Evidence', strong: 'The test set includes real failures from the student\'s own system.', developing: 'The test set is all well-behaved synthetic cases.' },
      { dimension: 'Communication', strong: 'A second evaluator can apply the rubric and land close to the same scores.', developing: 'The rubric only works when the author applies it.' },
      { dimension: 'Judgment', strong: 'The student names which judgments must stay human and defends the boundary.', developing: 'Everything is automated because everything can be scored somehow.' },
      { dimension: 'Responsible AI', strong: 'The Artifact does not imply executed tests; evaluation reasoning is labelled as such.', developing: 'A visual simulation reads as a passing test suite.' },
    ],
    competencies: ['testing', 'decision_making', 'systems_thinking'],
    points: { learning: 30, builder: 50, community: 0 },
    portfolio_eligible: true,
    certification_active: true,
    instructor_notes:
      'Two checks carry this studio. First: did the rubric come before the output? Ask directly — a rubric fitted to existing output passes everything and teaches nothing. Second: does the Artifact claim, by implication, that tests ran? Students build a convincing comparison view and then describe it as testing. The divergence note from a second scorer is the highest-signal artifact here; a rubric nobody else can apply is not yet a rubric.',
    misconceptions: [
      'Believing a rubric written after seeing the output is still an objective standard.',
      'Confusing a visual comparison of outputs with an executed automated test suite.',
      'Treating "this needs human review" as a gap in the design rather than part of it.',
    ],
  },

  /* ----------------------------------------------------------------- Week 10 */
  {
    week: 10,
    key: 'trust-risk-governance',
    title: 'Trust, Risk, and Governance Studio',
    career_asset: 'An AI Trust and Risk Review',
    week_theme: 'Governance + Governance Engine',
    adaptation:
      'Swapped with Week 9 relative to the source brief, so the trust and risk review lands on the week that actually builds the Governance Engine (ABAC, human-in-the-loop escalation, immutable audit trail). The review documents the system the student is governing this week rather than a system they have not built yet.',
    intro:
      'This week you wrap your system in a Governance Engine: access control, human-in-the-loop escalation, and an audit trail. This studio produces the document that governance actually asks for — a risk register with named owners, monitoring signals, and the conditions under which you stop.',
    objectives: [
      'Identify risks across data, privacy, security, bias, reliability, explainability, oversight, and operations',
      'Assign each risk an owner, a mitigation, a monitoring signal, and a stop condition',
      'Distinguish risks you have mitigated from risks you have merely documented',
      'Produce a trust-readiness view an executive can act on',
    ],
    scenario:
      'Your system is about to be governed rather than merely built. Someone senior has to sign off that it is safe to run against real data and real consequences. They will ask what can go wrong, who owns each of those, how you would know, and when you would stop. Documented-but-unmitigated is an acceptable answer; unexamined is not.',
    role: 'The person whose name goes on the trust review',
    estimated_minutes: 95,
    stages: [
      {
        key: 'explore',
        title: 'Sweep every risk category deliberately',
        minutes: 20,
        instruction:
          'Risk identification fails by omission, not by error. Walk the categories deliberately rather than listing what comes to mind.',
        steps: [
          'Walk each category in turn: data, privacy, security, bias, reliability, explainability, human oversight, operations.',
          'Ask Claude for the risks that teams building systems like yours typically miss.',
          'For each risk, decide whether it is real for your system or genuinely not applicable, and record which.',
        ],
      },
      {
        key: 'organize',
        title: 'Ground the review in what you actually built',
        minutes: 20,
        instruction:
          'A generic risk register is worthless. Load the real system so every risk is about something specific.',
        steps: [
          'Add your Week 6 agent charter, your Week 9 evaluation rubric, and your governance engine design.',
          'Add what data the system touches and who can reach it.',
          'Instruct Claude to reject any risk statement that could apply to any system equally.',
        ],
      },
      {
        key: 'create',
        title: 'Build the register and the readiness view',
        minutes: 40,
        instruction:
          'The register is the working document; the trust-readiness view is what the executive reads.',
        steps: [
          'For each risk: likelihood, impact, mitigation, owner, monitoring signal, and stop condition.',
          'Mark clearly which risks are mitigated and which are only documented.',
          'Build a trust-readiness summary an executive could act on in two minutes.',
        ],
      },
      {
        key: 'prove',
        title: 'Write the memo you would actually send',
        minutes: 15,
        instruction:
          'Write the management memo recommending, or declining to recommend, production use.',
        steps: [
          'State plainly whether this system is ready and under what conditions.',
          'Name the risk you cannot currently mitigate and what you are doing about it.',
          'Submit the review, register, and memo.',
        ],
      },
    ],
    project: {
      name: 'Week 10 — Trust, Risk, and Governance',
      instructions:
        'Instruct Claude: every risk must be specific to the system described in this Project — reject any risk statement that would apply equally to any AI system. Distinguish risks that are mitigated from risks that are merely documented. For every mitigation, ask what signal would tell us it stopped working. Never describe a control as implemented unless the sources show it is.',
      sources: [
        'Your Week 6 AI Employee Charter and escalation matrix',
        'Your Week 9 evaluation rubric and quality gate design',
        'Your governance engine design: access control model, escalation path, audit trail',
        'What data the system touches and who can reach it',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Sweep the categories, including the ones you would skip',
        why: 'Risk registers fail by omission. A deliberate category sweep catches what free recall does not.',
        text: `I am writing a trust and risk review for the system described in this Project.

Walk these categories one at a time and give me the risks specific to MY system — not generic AI risks:
1. Data (quality, provenance, retention)
2. Privacy (what personal data is touched, by whom)
3. Security (access, injection, credential exposure)
4. Bias and fairness
5. Reliability (what breaks, how often, what depends on it)
6. Explainability (can we reconstruct why it did something)
7. Human oversight (where a person is genuinely in the loop, versus nominally)
8. Operational (cost, dependency, key-person risk)

For each risk: state it specifically, rate likelihood and impact, and say whether my current design already addresses it.

Reject your own generic entries. If a risk would apply equally to any AI system, it is not useful here — replace it with the version specific to mine.

Then tell me which category I would most likely have skipped if I had done this from memory.`,
      },
      {
        kind: 'improve',
        label: 'Separate mitigated from documented',
        why: 'The dangerous register is the one where writing down a risk feels like handling it.',
        text: `Take my risk register:
[paste it]

Sort every entry into three groups, honestly:
- MITIGATED: there is a control in place that I could point to in the system today
- PARTIALLY MITIGATED: a control exists but has a gap — name the gap
- DOCUMENTED ONLY: we know about it and have done nothing yet

For the mitigated ones, tell me what signal would reveal that the control has silently stopped working.

For the documented-only ones, tell me which is most likely to actually bite, and what the cheapest real mitigation would be.

Do not let me count "we wrote it down" as mitigation.`,
      },
      {
        kind: 'followup',
        label: 'Build the trust and risk review',
        why: 'Produces the career asset — a register that a governance reviewer can sign against.',
        text: `Build a single-page Artifact: an AI Trust and Risk Review.

Include:
1. Risk register — for each risk: category, specific description, likelihood, impact, mitigation, OWNER (a role, not "the team"), monitoring signal, and stop condition
2. A clear visual distinction between mitigated, partially mitigated, and documented-only risks
3. A trust-readiness view: an executive summary of whether this is safe to run, and under what conditions
4. The top three risks, with what would have to be true before production use

Rules:
- Every risk must be specific to this system. No generic entries.
- Every mitigation names a monitoring signal — how we would know it stopped working.
- Every risk has a stop condition: the observable state at which we halt.
- Do not describe any control as implemented unless this Project's sources show it is.`,
      },
    ],
    artifact: {
      type: 'AI Trust and Risk Review (single-page Artifact)',
      requirements: [
        'A risk register covering all eight categories, or an explicit note where one does not apply',
        'Every risk carries an owner role, a monitoring signal, and a stop condition',
        'Mitigated, partially mitigated, and documented-only risks are visually distinct',
        'A trust-readiness view an executive can act on quickly',
        'No risk statement that would apply equally to any AI system',
      ],
    },
    trust_checkpoints: [
      'Writing a risk down is not mitigating it. Keep the mitigated and documented-only columns honestly separated, even when the register looks worse for it.',
      'Every mitigation needs a monitoring signal. A control nobody would notice failing is not a control.',
      'Do not describe a control as implemented because it is designed. The trust review is exactly where that distinction matters most.',
    ],
    deliverables: [
      'The AI Trust and Risk Review Artifact (shared link)',
      'A risk register with owners, monitoring signals, and stop conditions',
      'A mitigation plan for the top three risks',
      'A management memo stating whether the system is ready and under what conditions',
    ],
    prohibited_shortcuts: [
      'Generic risk entries that would apply to any AI system',
      'Counting documentation as mitigation',
      'Assigning risk ownership to "the team" rather than a role',
    ],
    reflection: {
      checks: [
        'Every risk in my register is specific to my system',
        'Mitigated and documented-only risks are honestly separated',
        'Every mitigation has a monitoring signal',
        'Every risk has an owner role and a stop condition',
      ],
      free_response:
        'Which risk are you carrying without a mitigation, and why is that acceptable for now? An honest answer here is worth more than a register with no gaps in it.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'Risks are specific to the built system and follow from its actual design.', developing: 'The register would fit any AI project unchanged.' },
      { dimension: 'Evidence', strong: 'Controls described as implemented can be pointed at in the student\'s system.', developing: 'Designed controls are described as if in place.' },
      { dimension: 'Communication', strong: 'The trust-readiness view lets an executive decide in two minutes.', developing: 'The reader must work through the whole register to find the answer.' },
      { dimension: 'Judgment', strong: 'The student names an unmitigated risk they are consciously carrying and why.', developing: 'Every risk is claimed as handled.' },
      { dimension: 'Responsible AI', strong: 'Human oversight is genuine, and monitoring signals exist for each control.', developing: 'Oversight is nominal; nobody would notice a control failing.' },
    ],
    competencies: ['ai_governance', 'security', 'decision_making'],
    points: { learning: 30, builder: 50, community: 0 },
    portfolio_eligible: true,
    certification_active: true,
    instructor_notes:
      'The single most useful question here: show me a risk you have NOT mitigated. A register with no gaps is a register that has not been examined honestly, and students default to presenting completeness. Second check: are controls described as implemented actually implemented, or merely designed in Week 6? That gap between designed and built is the exact confusion the governance week exists to close.',
    misconceptions: [
      'Believing that documenting a risk is a form of mitigating it.',
      'Writing risk entries generic enough to apply to any system, which makes them unactionable.',
      'Treating human oversight as present because a human could theoretically look.',
    ],
  },

  /* ----------------------------------------------------------------- Week 11 */
  {
    week: 11,
    key: 'career-evidence',
    title: 'Career Evidence Studio',
    career_asset: 'A Recruiter-Ready Project Story',
    week_theme: 'Systems Architecture + Architecture Package',
    adaptation:
      'Week 11 assembles the Solution Architecture Package, which the blueprint describes as the exhibit for the Architect Expo and the CCA-F portfolio. This studio turns that package into the recruiter-facing story, so the architecture work and the career evidence are the same body of work seen by two different audiences.',
    intro:
      'You have eleven weeks of real work and an architecture package that documents it. None of that helps you if a recruiter cannot tell in ninety seconds what you built and what you contributed. This studio turns the repository and the package into a story — with the AI assistance disclosed and the claims verifiable.',
    objectives: [
      'Extract only verifiable claims from a repository and your own evidence',
      'Explain problem, users, contribution, architecture, decisions, obstacles, testing, results, and limitations',
      'Distinguish clearly what you built, what AI assisted with, and what was verified',
      'Prepare content for the platform\'s existing case study and blog pipeline',
    ],
    scenario:
      'A recruiter has your repository open and ninety seconds. A hiring manager will read further if the first paragraph earns it. Both will ask, at some point, how much of this you actually did — and the honest answer, well told, is stronger than a vague one.',
    role: 'The candidate whose repository has to speak without you in the room',
    estimated_minutes: 90,
    stages: [
      {
        key: 'explore',
        title: 'Audit what your repository actually proves',
        minutes: 20,
        instruction:
          'Start from the evidence, not the narrative. What can a stranger verify from the repository alone?',
        steps: [
          'Walk your repository, commits, and architecture package with Claude.',
          'Ask what a stranger could verify from the artifacts alone, and what they would have to take on trust.',
          'List the claims you want to make that the evidence does not currently support.',
        ],
      },
      {
        key: 'organize',
        title: 'Load the evidence, not the aspiration',
        minutes: 15,
        instruction:
          'The Project holds real artifacts so the story stays anchored to them.',
        steps: [
          'Add your architecture package, ADRs, evaluation results, and trust review.',
          'Add your commit history summary and the README as it currently stands.',
          'Instruct Claude to refuse any claim it cannot trace to something in the Project.',
        ],
      },
      {
        key: 'create',
        title: 'Write the story and the STAR answers',
        minutes: 40,
        instruction:
          'Produce the case study draft plus the interview material that comes out of the same evidence.',
        steps: [
          'Cover problem, users, your contribution, architecture, key decisions, obstacles, testing, results, limitations, next steps.',
          'Write the AI-assistance disclosure: what you built, what Claude assisted with, what you verified.',
          'Write three STAR stories drawn from real obstacles in the build.',
          'Recommend the specific README changes that would make the repository legible to a stranger.',
        ],
      },
      {
        key: 'prove',
        title: 'Ship it into the case study pipeline',
        minutes: 15,
        instruction:
          'Prepare the content for the platform\'s existing case study and blog flow rather than leaving it in an Artifact.',
        steps: [
          'Format the story for the platform\'s case study submission.',
          'Confirm every quantitative claim traces to evidence you can show.',
          'Submit the Artifact, the case study draft, and the STAR stories.',
        ],
      },
    ],
    project: {
      name: 'Week 11 — Career Evidence',
      instructions:
        'Instruct Claude: make no claim about this project that cannot be traced to an artifact in this Project. If I ask you to describe something impressively that the evidence does not support, tell me what is missing instead of writing it. Distinguish what I built, what AI assisted with, and what was independently verified. Never inflate my contribution.',
      sources: [
        'Your Week 11 Solution Architecture Package, including the 7-layer mapping and ADRs',
        'Your repository README and a summary of your commit history',
        'Your Week 9 evaluation results and Week 10 trust review',
        'Your Week 1 problem brief, so the story closes the loop it opened',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Audit the repository as a stranger would',
        why: 'Career stories overstate by drift. Starting from what is verifiable keeps the story defensible under questioning.',
        text: `I am turning my project into a recruiter-ready story. Before I write anything, I want to know what my evidence actually supports.

Working only from the artifacts in this Project:

1. What could a stranger verify about this project from the repository and artifacts alone, with no explanation from me?
2. What would they have to take entirely on trust?
3. What claims would a skeptical technical interviewer challenge, and what would I need to show to answer?
4. What is genuinely impressive here that I have probably undersold because I am close to it?
5. What is missing from the repository that would materially change a reader's impression — a README, a diagram, a results summary?

Be blunt about item 3. I would rather hear it now.`,
      },
      {
        kind: 'improve',
        label: 'Draw the line around your contribution',
        why: 'Interviewers ask what you actually did. Having drawn the line yourself, in advance, is the difference between a confident answer and a defensive one.',
        text: `Help me draw an honest line around my contribution.

For each major component in this project, sort it:
- I designed and built it
- I designed it, Claude Code implemented it under my direction
- Claude generated it and I reviewed and modified it
- Claude generated it and I accepted it largely as-is

Then:
1. Write the AI-assistance disclosure paragraph I should include — honest, not apologetic. AI-assisted work done well is a skill, and the disclosure should read that way.
2. Tell me which components I can speak to in technical depth in an interview, and which I would struggle with. Be honest — I would rather know now.
3. For the ones I would struggle with, what should I go and understand this week?`,
      },
      {
        kind: 'followup',
        label: 'Build the project story',
        why: 'Produces the career asset and the content the platform\'s case study pipeline needs.',
        text: `Build a single-page Artifact: a Recruiter-Ready Project Story.

Structure it so a recruiter gets it in 90 seconds and a hiring manager can keep reading:

1. One-paragraph hook: the problem, what I built, and the outcome
2. The problem and who had it
3. What I built — architecture in plain language, with the diagram referenced
4. My contribution, clearly delineated from AI assistance
5. Key decisions and the tradeoffs behind them (pull from the ADRs)
6. Obstacles and how I got through them
7. How I tested it and what the results were
8. Honest limitations and what I would do next

Rules:
- Every claim traces to an artifact in this Project. If it does not, leave it out and tell me what is missing.
- No inflated language. "Architected an enterprise-grade solution" reads as noise; what I actually did is more impressive.
- Include the AI-assistance disclosure as a normal part of the story, not a disclaimer at the end.`,
      },
    ],
    artifact: {
      type: 'Recruiter-Ready Project Story (single-page Artifact) plus case study draft',
      requirements: [
        'A hook paragraph that lands the problem, the build, and the outcome',
        'Problem, users, contribution, architecture, decisions, obstacles, testing, results, limitations, next steps',
        'A clear delineation of what the student built versus what AI assisted with',
        'Every quantitative claim traceable to an artifact',
        'Recommended README changes that make the repository legible to a stranger',
        'Content formatted for the platform\'s existing case study and blog pipeline',
      ],
    },
    trust_checkpoints: [
      'Extract only what the repository and your evidence actually support. A claim you cannot show is a claim that fails in the interview, which is worse than not making it.',
      'Disclose AI assistance as part of the story, not as an apology buried at the end. Directed AI work is a skill; hiding it is what looks bad.',
      'If you cannot explain a component in technical depth, do not lead with it. Find that out here rather than in an interview.',
    ],
    deliverables: [
      'The Recruiter-Ready Project Story Artifact (shared link)',
      'A case study or blog draft formatted for the platform\'s pipeline',
      'Three STAR stories drawn from real obstacles in the build',
      'Recommended README changes for the repository',
      'The AI-assistance disclosure',
    ],
    prohibited_shortcuts: [
      'Claims about scale, performance, or impact with no artifact behind them',
      'Omitting AI assistance from the story',
      'Leading with a component the student could not discuss in an interview',
    ],
    reflection: {
      checks: [
        'Every quantitative claim in my story traces to an artifact I can show',
        'My AI-assistance disclosure is part of the story, not an afterthought',
        'I identified which components I could not currently discuss in depth',
        'My case study draft is formatted for the platform pipeline',
      ],
      free_response:
        'Which part of this project can you not yet explain in technical depth, and what are you going to do about it before the Expo? Naming it now is the point of this exercise.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'The story explains why decisions were made, not just what was built.', developing: 'The story is a feature list.' },
      { dimension: 'Evidence', strong: 'Every claim traces to a repository artifact or documented result.', developing: 'Impact claims appear with no supporting artifact.' },
      { dimension: 'Communication', strong: 'A recruiter gets it in 90 seconds; a hiring manager wants to keep reading.', developing: 'The reader must already understand the domain.' },
      { dimension: 'Judgment', strong: 'The student names what they cannot yet explain and has a plan for it.', developing: 'Everything is claimed as fully understood.' },
      { dimension: 'Responsible AI', strong: 'AI assistance is disclosed clearly and framed as directed work.', developing: 'AI involvement is omitted or minimized.' },
    ],
    competencies: ['documentation', 'communication', 'architecture'],
    points: { learning: 30, builder: 50, community: 10 },
    portfolio_eligible: true,
    certification_active: true,
    instructor_notes:
      'The delineation exercise is the one that changes outcomes. Students either overstate their contribution or, more often, undersell directed AI work as though it were not skill. Push on the components they say they cannot explain in depth — that list, produced in Week 11, is exactly what should be studied before the Expo and the exam. Check that the case study draft actually reached the platform pipeline rather than staying in the Artifact.',
    misconceptions: [
      'Believing that disclosing AI assistance weakens the story — a well-directed AI build is the skill being hired for.',
      'Thinking impressive-sounding language substitutes for a traceable claim.',
      'Assuming the repository speaks for itself without a README written for a stranger.',
    ],
  },

  /* ----------------------------------------------------------------- Week 12 */
  {
    week: 12,
    key: 'capstone-defense',
    title: 'Capstone Defense and Launch Studio',
    career_asset: 'An Interactive Capstone Defense Room',
    week_theme: 'Capstone + Architect Expo',
    adaptation:
      'The Defense Room is built as the exhibit for the Architect Expo the week already runs, so the studio produces the presentation surface for the existing capstone gate rather than a parallel deliverable.',
    intro:
      'This is the last studio, and it assembles the rest. You have twelve weeks of evidence and a capstone system. The Defense Room is the single place a panel, a recruiter, or a hiring manager can walk through the business case, the architecture, the demo, the trust controls, the evaluation evidence, and what comes next.',
    objectives: [
      'Assemble the strongest evidence from every prior studio and the technical capstone into one coherent exhibit',
      'Present business case, architecture, demonstration path, trust controls, and results as one argument',
      'Defend architectural decisions under follow-up questions',
      'Produce both a two-minute recruiter version and a longer stakeholder version from the same evidence',
    ],
    scenario:
      'You present at the Architect Expo and sit the CCA-Foundations exam this week. The panel will watch a demo and then ask why you made three specific decisions. Afterwards the same material has to work for recruiters who were not there. One exhibit, two audiences, and a live defense in between.',
    role: 'The architect defending twelve weeks of decisions to people who will push back',
    estimated_minutes: 120,
    stages: [
      {
        key: 'explore',
        title: 'Select the evidence that actually carries weight',
        minutes: 25,
        instruction:
          'You have more evidence than a panel will look at. Selecting is the work; including everything is the failure.',
        steps: [
          'Inventory every artifact from weeks 0-11 and the capstone.',
          'Ask Claude which pieces most support the central claim, and which are noise in a defense context.',
          'Identify the three decisions a panel is most likely to challenge.',
        ],
      },
      {
        key: 'organize',
        title: 'Assemble the evidence index',
        minutes: 20,
        instruction:
          'The Project becomes the index of everything you can point at, so nothing is scrambled for during questions.',
        steps: [
          'Add the architecture package, trust review, evaluation results, project story, and capstone documentation.',
          'Build an evidence index mapping each claim to the artifact that supports it.',
          'Instruct Claude to answer defense questions only from indexed evidence.',
        ],
      },
      {
        key: 'create',
        title: 'Build the Defense Room',
        minutes: 50,
        instruction:
          'One Artifact that works for a panel walking through it live and for a recruiter finding it cold.',
        steps: [
          'Business case, architecture, demonstration path, trust controls, evaluation evidence, results, roadmap.',
          'Include the evidence index so any claim can be traced during questioning.',
          'Build the two-minute recruiter path and the longer stakeholder path through the same material.',
        ],
      },
      {
        key: 'prove',
        title: 'Run the timed defense',
        minutes: 25,
        instruction:
          'A defense is timed and has follow-up questions. Rehearse it that way.',
        steps: [
          'Deliver a timed live or recorded defense.',
          'Take follow-up questions on the three decisions you expect to be challenged.',
          'Submit the Defense Room, the recorded defense, the evidence index, and your final reflection.',
        ],
      },
    ],
    project: {
      name: 'Week 12 — Capstone Defense',
      instructions:
        'Instruct Claude: answer only from the evidence indexed in this Project. When I make a claim, tell me which artifact supports it — and if none does, say so before I say it to a panel. Challenge my architectural decisions the way a skeptical reviewer would. Never help me overstate what the capstone does.',
      sources: [
        'Your Week 11 Solution Architecture Package and project story',
        'Your Week 10 trust review and Week 9 evaluation results',
        'Your capstone system documentation and end-to-end run evidence',
        'Your Week 1 problem brief, so the defense closes the loop the program opened',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Find the three questions you will be asked',
        why: 'Panels converge on the weakest decisions. Knowing which three in advance is most of the preparation.',
        text: `I am defending my capstone at the Architect Expo. Here is what I built and the decisions behind it:

[describe the system, its architecture, and the 5-6 significant decisions you made]

Working from the evidence in this Project:

1. Which three decisions is a skeptical panel most likely to challenge, and what exactly would they ask?
2. For each, what is the strongest version of the challenge — the one I would find hardest to answer?
3. What evidence do I have that answers each, and where is my evidence thin?
4. Which claim am I making that my evidence does not actually support? Tell me now.

Do not be encouraging. I want the version of this conversation that happens before the panel, not after.`,
      },
      {
        kind: 'improve',
        label: 'Compress to two minutes without lying',
        why: 'The recruiter version and the stakeholder version must come from the same evidence, or one of them is fiction.',
        text: `I need two versions of this defense from the same evidence:

A. A two-minute recruiter version — someone with no context who will decide in that time whether to keep reading
B. A fifteen-minute stakeholder version — a panel that will ask follow-up questions

For each, tell me:
- What must be included
- What must be cut
- What the opening line should be

Then check: does the two-minute version claim anything the fifteen-minute version qualifies? Compression must not become overstatement. If the short version only works by dropping a caveat, tell me and we will rewrite it.`,
      },
      {
        kind: 'followup',
        label: 'Build the Defense Room',
        why: 'Produces the final career asset — one exhibit that serves the panel live and the recruiter later.',
        text: `Build a single-page interactive Artifact: my Capstone Defense Room.

It must work for two audiences: a panel walking through it with me live, and a recruiter finding it cold.

Sections:
1. The business case — the problem, who had it, why it was worth solving
2. The architecture — the system in plain language, then in depth
3. The demonstration path — what to show, in what order, and what each step proves
4. Trust controls — how it is governed, from the trust review
5. Evaluation evidence — how quality was measured, with the actual results
6. Results and honest limitations
7. The roadmap — what comes next and why
8. Evidence index — every claim mapped to the artifact that supports it

Include a two-minute recruiter path and a full stakeholder path through the same material.

Every claim must be backed by an artifact in this Project. Where evidence is thin, say so in the Artifact rather than papering over it — a defense that is honest about its limits survives questioning better than one that is not.`,
      },
    ],
    artifact: {
      type: 'Interactive Capstone Defense Room (single-page Artifact)',
      requirements: [
        'Business case, architecture, demonstration path, trust controls, evaluation evidence, results, and roadmap',
        'An evidence index mapping every claim to a supporting artifact',
        'A two-minute recruiter path and a longer stakeholder path through the same material',
        'Honest limitations stated in the exhibit rather than omitted',
        'Usable by a recruiter who finds it with no context',
      ],
    },
    trust_checkpoints: [
      'Every claim in the Defense Room must map to an artifact in the evidence index. A claim without an index entry is one a panel will find.',
      'Compression is not permission to overstate. If the two-minute version only works by dropping a caveat, the caveat goes back in.',
      'The demonstration must show what the system actually does. A demo path that implies capability you did not build is the one failure a panel will not forgive.',
    ],
    deliverables: [
      'The Capstone Defense Room Artifact (shared link)',
      'A two-minute recruiter version',
      'A longer stakeholder version',
      'An evidence index mapping claims to artifacts',
      'A timed live or recorded defense with follow-up questions taken',
      'A final reflection on the twelve weeks',
    ],
    prohibited_shortcuts: [
      'Claims in the Defense Room with no evidence index entry',
      'A demonstration path that implies capability that was not built',
      'A recruiter version that works only by dropping a limitation the long version states',
    ],
    reflection: {
      checks: [
        'Every claim in my Defense Room maps to an artifact in the evidence index',
        'My two-minute version drops no caveat that the long version states',
        'My demonstration path shows only what the system actually does',
        'I delivered a timed defense and took follow-up questions',
      ],
      free_response:
        'Across twelve weeks, which decision would you make differently now, and what would it have cost you to know that in Week 1? This is the reflection that makes the next build better.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'The defense is one coherent argument from problem to roadmap, and decisions are justified under challenge.', developing: 'The exhibit is a tour of components with no through-line.' },
      { dimension: 'Evidence', strong: 'Every claim maps to an indexed artifact; thin evidence is disclosed.', developing: 'Claims outrun the evidence index.' },
      { dimension: 'Communication', strong: 'Both the two-minute and the long path work, from the same true material.', developing: 'One path only works by overstating or by burying the point.' },
      { dimension: 'Judgment', strong: 'The student anticipated the hard questions and answered them without deflecting.', developing: 'Challenges are met with restatement rather than evidence.' },
      { dimension: 'Responsible AI', strong: 'The demo shows real capability and AI assistance across the program is disclosed.', developing: 'The demo implies capability that was not built.' },
    ],
    competencies: ['communication', 'leadership', 'architecture', 'systems_thinking'],
    points: { learning: 40, builder: 60, community: 20 },
    portfolio_eligible: true,
    certification_active: true,
    instructor_notes:
      'Run the evidence index check first: pick three claims at random from the Defense Room and ask which artifact supports each. That single check separates a defensible exhibit from a well-designed one. Second, watch the compression — the recruiter version is where caveats quietly disappear. This studio consumes the outputs of every prior week, so a student arriving with gaps here usually has an unfinished week behind them; trace it back rather than patching the exhibit.',
    misconceptions: [
      'Thinking the Defense Room should include everything produced over twelve weeks — selection is the skill.',
      'Believing a shorter version is allowed to be a less careful one.',
      'Treating the panel\'s follow-up questions as hostile rather than as the actual assessment.',
    ],
  },
];

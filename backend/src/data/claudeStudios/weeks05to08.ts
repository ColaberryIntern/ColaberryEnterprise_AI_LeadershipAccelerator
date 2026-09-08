/**
 * Claude Studio content — Weeks 5-8.
 *
 * Week 7 is the FIRST studio with `certification_active: true`. Weeks 0-6 build
 * the underlying skill but must never present certification preparation as an
 * active track — that gate is asserted by the unit tests.
 */
import { ClaudeStudioWeek } from './types';

export const STUDIOS_05_TO_08: ClaudeStudioWeek[] = [
  /* ------------------------------------------------------------------ Week 5 */
  {
    week: 5,
    key: 'decision-intelligence',
    title: 'Decision Intelligence Studio',
    career_asset: 'An interactive Scenario and Recommendation Model',
    week_theme: 'MCP Foundations + First MCP Server',
    adaptation:
      'Week 5 builds a first MCP server, and the decision of which capability it should expose is genuinely open at the start of the week. This studio makes that the decision under analysis, so the scenario model drives a real build choice instead of a hypothetical one.',
    intro:
      'This week you build your first MCP server, which means choosing what capability it exposes. That choice constrains weeks 6 through 8. This studio is about deciding well under uncertainty: three real options, the assumptions each rests on, and a recommendation you can defend when one of those assumptions turns out to be wrong.',
    objectives: [
      'Construct three genuinely different courses of action rather than one option and two strawmen',
      'Make the assumptions behind each option explicit and testable',
      'Model how the recommendation changes when a key input changes',
      'Hold a human decision gate before producing a final recommendation',
    ],
    scenario:
      'Your MCP server can expose one capability well by Friday, or three badly. Three candidate capabilities are on the table, each with a different downstream cost: one is easy now but boxes you in at Week 7, one is harder now and opens up the multi-agent work, one is the obvious business win but depends on a system you do not control. You have to pick, and justify it to someone who will remember what you said.',
    role: 'The architect making an irreversible-ish decision with incomplete information',
    estimated_minutes: 90,
    stages: [
      {
        key: 'explore',
        title: 'Build three options that could each win',
        minutes: 20,
        instruction:
          'The failure mode of options analysis is two strawmen and a preference. Force each option to be defensible before comparing them.',
        steps: [
          'Describe the decision and the three candidate capabilities.',
          'Ask Claude to make the strongest possible case for each option in turn, as if it were advocating.',
          'Note which option got weaker under advocacy — that is usually the one you had already ruled out unfairly, or the one you were about to pick for the wrong reason.',
        ],
      },
      {
        key: 'organize',
        title: 'Separate what you know from what you are assuming',
        minutes: 15,
        instruction:
          'A Project with the constraints and the assumption register is what makes the scenario model honest rather than decorative.',
        steps: [
          'Add your Week 3 requirements and the Week 1 problem brief.',
          'Add the real constraints: your remaining time, systems you do not control, skills on hand.',
          'Write an assumption register: for each option, what has to be true for it to work.',
        ],
      },
      {
        key: 'create',
        title: 'Model the scenarios, then gate the recommendation',
        minutes: 40,
        instruction:
          'Build the Artifact so a reader can change a meaningful input and watch the recommendation move. Do not let Claude write the final recommendation until you have made the call yourself.',
        steps: [
          'Show benefits, risks, dependencies, confidence, and success measures per option.',
          'Let the reader vary at least two meaningful inputs and see the effect.',
          'Make your own decision and record it BEFORE asking Claude to write the recommendation section.',
        ],
      },
      {
        key: 'prove',
        title: 'Say what would make you wrong',
        minutes: 15,
        instruction:
          'Defend the decision in writing, including the condition under which you would reverse it.',
        steps: [
          'State the decision and the single assumption it most depends on.',
          'State the observable signal that would tell you the assumption has failed.',
          'Submit the model and the decision defense.',
        ],
      },
    ],
    project: {
      name: 'Week 5 — Decision Intelligence',
      instructions:
        'Instruct Claude: when comparing options, argue each one at its strongest before comparing. Never present a recommendation until I have stated my own decision — if I ask for one early, ask me for my call first. Keep assumptions visible and separate from facts. State confidence as a range, not a point.',
      sources: [
        'Your Week 3 Requirements Explorer',
        'Your Week 1 Business Problem Brief',
        'The real constraints on this decision: time remaining, systems, dependencies, skills',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Steelman all three options',
        why: 'Prevents the usual pattern of one real option and two decoys, which makes the analysis theatre rather than decision support.',
        text: `I have to choose which capability my first MCP server exposes. Three candidates:

A. [describe option A]
B. [describe option B]
C. [describe option C]

Constraints: [time, systems you don't control, skills available, what weeks 6-8 need from this]

Do this in order:
1. Argue for option A as its strongest advocate. Then B. Then C. Give each the best case that is honestly available.
2. For each option, list the assumptions that have to hold for it to be the right choice.
3. Tell me which assumption, across all three, is the most fragile.
4. Tell me which option I appear to have already decided on based on how I described them — and whether my description was fair to the others.

Do not recommend one yet.`,
      },
      {
        kind: 'improve',
        label: 'Stress-test with changed inputs',
        why: 'A recommendation that does not move when the inputs move is not a model, it is a preference with decoration.',
        text: `Take the three options and tell me how the analysis changes under each of these conditions:

1. I have half the time I thought
2. The external system I do not control is unavailable for two weeks
3. The multi-agent work in Week 7 turns out to need more from this server than I planned

For each condition: which option wins, and does the ranking change or just the margin?

Then tell me: which single input, if I got it wrong, would flip my decision? That is the one I need to verify before committing.`,
      },
      {
        kind: 'followup',
        label: 'Build the scenario model',
        why: 'Produces the career asset — a model a reader can interrogate rather than a recommendation they have to accept.',
        text: `I have made my decision: I am choosing [your option] because [your reasoning].

Now build a single-page interactive Artifact: a Scenario and Recommendation Model.

Include:
1. The decision being made and who owns it
2. All three options side by side: benefits, risks, dependencies, confidence, and how we would measure success
3. The assumption register — what has to be true for each option, and how fragile each assumption is
4. Interactive inputs the reader can change (at least two meaningful ones) with the effect on the ranking shown
5. My recommendation, my reasoning, and the signal that would make me reverse it

Present my decision as mine, with my reasoning. Do not substitute your own analysis for it — if you disagree, add that as a clearly labelled dissent section.`,
      },
    ],
    artifact: {
      type: 'Interactive Scenario and Recommendation Model (single-page Artifact)',
      requirements: [
        'Three options each presented at their strongest',
        'Benefits, risks, dependencies, confidence, and success measures per option',
        'A visible assumption register with fragility noted',
        'At least two meaningful inputs the reader can change, with the effect shown',
        'The student\'s own recommendation and the reversal signal',
      ],
    },
    trust_checkpoints: [
      'Make your decision before Claude writes the recommendation. If the model wrote the conclusion and you agreed with it afterwards, that is not a decision gate.',
      'Confidence should be a range, not a number that looks precise. A model that says "73% confident" about a judgment call is dressing up a guess.',
      'If one option is obviously right, check whether you framed the other two fairly. Unfair framing is the most common way options analysis goes wrong.',
    ],
    deliverables: [
      'The Scenario and Recommendation Model Artifact (shared link)',
      'An options analysis covering all three at their strongest',
      'An assumption register with fragility assessment',
      'A written decision defense naming the reversal signal',
    ],
    prohibited_shortcuts: [
      'Two strawman options and one real one',
      'Asking Claude for the recommendation before making your own call',
      'A "model" whose output does not actually change when the inputs change',
    ],
    reflection: {
      checks: [
        'Each of my three options was argued at its strongest before comparison',
        'I recorded my own decision before Claude wrote the recommendation section',
        'My model responds to at least two changed inputs',
        'I named the signal that would make me reverse the decision',
      ],
      free_response:
        'Which option looked worse than it deserved when you first described it, and what changed once it was argued properly? If none did, explain how you guarded against framing the analysis around a decision you had already made.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'All three options are genuinely viable and the comparison turns on stated assumptions.', developing: 'Two options exist to make the third look good.' },
      { dimension: 'Evidence', strong: 'Assumptions are explicit, fragility is assessed, and confidence is expressed as a range.', developing: 'Assumptions are implicit or presented as facts.' },
      { dimension: 'Communication', strong: 'A reader can change an input and see the recommendation respond.', developing: 'The model is static; the interactivity is cosmetic.' },
      { dimension: 'Judgment', strong: 'The human decision gate was genuinely held and the reversal signal is observable.', developing: 'The recommendation was generated and then adopted.' },
      { dimension: 'Responsible AI', strong: 'The student\'s reasoning is presented as theirs; any model dissent is labelled separately.', developing: 'Model-generated reasoning is presented as the student\'s own judgment.' },
    ],
    competencies: ['decision_support', 'risk_analysis', 'systems_thinking', 'tradeoffs', 'architecture'],
    points: { learning: 30, builder: 50, community: 0 },
    portfolio_eligible: true,
    certification_active: false,
    instructor_notes:
      'The human decision gate is the point of this studio and it is easy to fake. Ask the student when they decided, relative to when Claude wrote the recommendation — the honest answer is instructive either way. Watch for the model whose sliders do not actually change anything; interactive-looking is not interactive. The decision made here should visibly govern the Week 5 MCP build.',
    misconceptions: [
      'Thinking three options means one real choice plus two decoys.',
      'Believing a numeric confidence score makes a judgment more rigorous.',
      'Treating the decision gate as a formality to complete after the fact.',
    ],
  },

  /* ------------------------------------------------------------------ Week 6 */
  {
    week: 6,
    key: 'agent-workflow-design',
    title: 'Agent and Workflow Design Studio',
    career_asset: 'An AI Employee Charter and Workflow Simulator',
    week_theme: 'Advanced MCP + System Integration',
    adaptation:
      'The source brief places the agent-design studio at Week 6 and certification at Week 7. Week 6 here is Advanced MCP — tool scoping, roots and file-access control, sampling, and integration with a real business system — which is precisely the material an AI employee charter has to specify. The charter is therefore written against the student\'s own integrated MCP server rather than a hypothetical agent.',
    intro:
      'This week your MCP server gains real teeth: server-initiated model calls, file-access roots, and a connection to a live business system. That is the point where "what is this agent allowed to do" stops being theoretical. This studio writes the charter — purpose, permitted tools, checkpoints, escalation, and what happens when it fails.',
    objectives: [
      'Specify an AI employee\'s purpose, responsibilities, and accountability in writing',
      'Define permitted tools, inputs, outputs, and the boundary of autonomous action',
      'Design escalation rules and failure behavior before the happy path is built',
      'Produce a simulator that walks a reviewer through the agentic loop and its human approval points',
    ],
    scenario:
      'Your integrated MCP server can now reach a real business system. Someone in governance is going to ask what stops it doing something expensive at 3am. You need a charter that answers that: what this AI employee is for, what it may touch, where a human must approve, and what it does when the system it depends on is down.',
    role: 'The person accountable for what this agent does when nobody is watching',
    estimated_minutes: 95,
    stages: [
      {
        key: 'explore',
        title: 'Define the job before the tools',
        minutes: 20,
        instruction:
          'Start from the role, not the capability. An agent defined by what it can do rather than what it is for will drift.',
        steps: [
          'Describe the job this AI employee holds, as you would a job description for a person.',
          'Ask Claude to identify where the role\'s responsibilities exceed what should be automated.',
          'Name the decisions that must stay with a human, and why each one.',
        ],
      },
      {
        key: 'organize',
        title: 'Load the real integration surface',
        minutes: 15,
        instruction:
          'The charter is only useful if it is written against the actual tools and systems your server touches.',
        steps: [
          'Add your MCP server\'s real tool list, resources, and the systems it integrates with.',
          'Add the access controls you have implemented — roots, permissions, transport choices.',
          'Instruct Claude to flag any responsibility in the charter that the current tool set cannot actually support.',
        ],
      },
      {
        key: 'create',
        title: 'Build the charter and the simulator',
        minutes: 45,
        instruction:
          'The Artifact walks a reviewer through one full agentic loop, stopping at each human checkpoint. It is a design walkthrough, not a running agent.',
        steps: [
          'Write the charter: purpose, responsibilities, permitted tools, inputs, outputs, checkpoints, escalation, failure behavior, accountability.',
          'Build an escalation matrix: what triggers escalation, to whom, and how fast.',
          'Build a walkthrough of the agentic loop showing where a human approves and what happens if they do not.',
          'Label the Artifact clearly as a design simulation, not a working agent.',
        ],
      },
      {
        key: 'prove',
        title: 'Answer the 3am question',
        minutes: 15,
        instruction:
          'Write the governance answer: what this agent cannot do, and what enforces that.',
        steps: [
          'State the three actions this agent must never take autonomously.',
          'State what technically enforces each — a permission, a checkpoint, an approval gate.',
          'Submit the charter, simulator, and escalation matrix.',
        ],
      },
    ],
    project: {
      name: 'Week 6 — Agent and Workflow Design',
      instructions:
        'Instruct Claude: this Project designs an AI employee, not a running system. Never describe a designed capability as if it already works. When I assign a responsibility, check it against the tool list in this Project and tell me if the tools cannot support it. For every autonomous action, ask what happens when it fails and who finds out.',
      sources: [
        'Your MCP server\'s tool, resource, and prompt definitions',
        'The business system it integrates with and what access it has been granted',
        'Your Week 3 requirements and any compliance constraints on that system',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Write the job description first',
        why: 'Agents defined by capability sprawl. Defining the role first gives you a basis for saying no to a capability later.',
        text: `I am writing a charter for an AI employee built on my MCP server.

What it does today: [describe the capability]
Systems it can reach: [list them]
Tools it has: [list them]

Write this as a job description for a person first, then translate:
1. The role in one sentence — what this employee is FOR.
2. Its responsibilities, ranked by how much damage a mistake would cause.
3. For each responsibility, whether it should be fully autonomous, autonomous with audit, or require approval before acting. Justify each.
4. The responsibilities I have implied that this employee should NOT hold, and why.

Be specific about damage. "Could cause issues" is not an answer.`,
      },
      {
        kind: 'improve',
        label: 'Design the failure path',
        why: 'Charters are usually written for the happy path. This forces the failure behavior into the specification where it belongs.',
        text: `Take the responsibilities we just defined and design the failure path for each.

For every responsibility, tell me:
- What happens if the external system is unavailable
- What happens if it produces a plausible but wrong output that nobody catches immediately
- What happens if it is triggered twice for the same input
- Who finds out, how, and how fast

Then give me the escalation matrix: trigger, severity, who is notified, expected response time, and what the agent does while it waits.

Flag any responsibility where the honest answer is "we would not find out" — those are the ones that should not be autonomous.`,
      },
      {
        kind: 'followup',
        label: 'Build the charter and workflow simulator',
        why: 'Produces the career asset — a walkthrough a governance reviewer can follow without reading code.',
        text: `Build a single-page Artifact: an AI Employee Charter and Workflow Simulator.

Part 1 — The Charter:
Purpose, responsibilities, permitted tools, inputs, outputs, human checkpoints, escalation rules, failure behavior, and who is accountable.

Part 2 — The Workflow Simulator:
A step-by-step walkthrough of one complete agentic loop for a realistic task. At each step show: what the agent does, what it is allowed to touch, whether a human approves, and what happens if that approval does not come.

Part 3 — The Escalation Matrix:
Trigger, severity, notified party, response time, and agent behavior while waiting.

Critical: label this clearly and prominently as a DESIGN SIMULATION. It walks through a designed workflow — it is not a running agent and must not read as one.`,
      },
    ],
    artifact: {
      type: 'AI Employee Charter and Workflow Simulator (single-page Artifact)',
      requirements: [
        'Charter covering purpose, responsibilities, permitted tools, inputs, outputs, checkpoints, escalation, failure behavior, and accountability',
        'A step-by-step agentic loop walkthrough with human approval points marked',
        'An escalation matrix with triggers, owners, and response times',
        'Prominent labelling that this is a design simulation, not a working agent',
        'Every responsibility checkable against the server\'s actual tool list',
      ],
    },
    trust_checkpoints: [
      'The simulator walks through a designed workflow. It is not a running agent, and the Artifact must say so where a reader will see it — an unlabelled simulation reads as a working system.',
      'Accountability lands on a person, not on "the system". If the charter cannot name who answers for a bad autonomous action, the charter is incomplete.',
      'Check every responsibility against your server\'s real tools. A charter that grants a capability the server does not have is a governance document describing fiction.',
    ],
    deliverables: [
      'The AI Employee Charter (shared Artifact link)',
      'A workflow map showing the agentic loop and its human approval points',
      'An escalation matrix with triggers, owners, and response times',
      'The three actions this agent must never take autonomously, with what enforces each',
    ],
    prohibited_shortcuts: [
      'Presenting the simulator as a working agent',
      'Assigning responsibilities the MCP server\'s tools cannot actually support',
      'An escalation matrix with no response times or no named owner',
    ],
    reflection: {
      checks: [
        'My Artifact is clearly labelled as a design simulation',
        'Every responsibility maps to a tool my server actually has',
        'My escalation matrix names a person and a response time for each trigger',
        'I named three actions that must never be autonomous and what enforces that',
      ],
      free_response:
        'Which responsibility did you initially want to make autonomous and then pull back, and what changed your mind? If you did not pull anything back, describe how you tested the boundary.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'Autonomy boundaries follow from damage potential and detectability, not convenience.', developing: 'Everything the agent can do, it is allowed to do.' },
      { dimension: 'Evidence', strong: 'Every charter responsibility maps to a real tool or integration the student built.', developing: 'The charter describes capabilities that do not exist.' },
      { dimension: 'Communication', strong: 'A governance reviewer could follow the loop and find the approval points unaided.', developing: 'The walkthrough assumes technical familiarity with the server.' },
      { dimension: 'Judgment', strong: 'Failure behavior is designed for each responsibility, including the "nobody would notice" cases.', developing: 'Only the happy path is specified.' },
      { dimension: 'Responsible AI', strong: 'The simulation is unambiguously labelled and accountability names a person.', developing: 'The simulator could be mistaken for a running agent.' },
    ],
    competencies: ['agent_design', 'ai_governance', 'process_architecture', 'escalation_design', 'system_integration'],
    points: { learning: 30, builder: 50, community: 0 },
    portfolio_eligible: true,
    certification_active: false,
    instructor_notes:
      'The distinction between a designed workflow and a working agent is the thing to enforce here — students routinely produce a beautiful simulator that a reader would take for a live system. Check the labelling first. Second check: does every responsibility map to a tool that actually exists on their server? The charter written here is reused directly in the Week 10 governance studio.',
    misconceptions: [
      'Thinking an escalation rule without a response time is an escalation rule.',
      'Assigning accountability to "the system" or "the team" rather than a person.',
      'Believing a simulator that looks real is better than one that is honestly labelled.',
    ],
  },

  /* ------------------------------------------------------------------ Week 7 */
  {
    week: 7,
    key: 'certification-prep',
    title: 'Certification Preparation Studio',
    career_asset: 'A personalized Certification Readiness Coach',
    week_theme: 'Subagents + Multi-Agent Team',
    adaptation:
      'The source brief fixes certification preparation as beginning in Week 7, and the repo\'s Week 7 is Subagents + Multi-Agent Team. Both are honored: this is the first studio where certification prep is active, and the readiness coach is grounded in the CCA-Foundations blueprint with the week\'s multi-agent material as its first worked domain. Weeks 0-6 carry `certification_active: false` and never display cert prep.',
    intro:
      'Certification preparation starts here, not earlier. You are at the midpoint, you have built a foundation, a prompt library, and an integrated MCP server, and the Claude Certified Architect — Foundations blueprint now has enough of your own work to point at. This studio builds a coach that knows what you specifically are weak at.',
    objectives: [
      'Build a Claude Project grounded in the official exam blueprint and your own course evidence',
      'Diagnose weak domains using real assessment results rather than self-assessment alone',
      'Produce a study plan sequenced by gap severity and time remaining',
      'Create a study Artifact with a concept map, practice scenarios, and progress tracking',
    ],
    scenario:
      'You have five weeks until the CCA-Foundations exam and roughly six hours a week to prepare, alongside a capstone. Studying everything evenly is the plan that fails. You need to know which domains you are genuinely weak in, and a plan that spends your limited hours where they change the outcome.',
    role: 'A candidate with limited time who has to allocate it honestly',
    estimated_minutes: 85,
    stages: [
      {
        key: 'explore',
        title: 'Diagnose honestly, using real signals',
        minutes: 20,
        instruction:
          'Self-assessment is unreliable in both directions. Bring evidence: your knowledge check and evaluation scores, and the work you have actually produced.',
        steps: [
          'List the exam blueprint domains and rate your own confidence in each.',
          'Bring your platform assessment results and the evidence of what you have built.',
          'Ask Claude where your self-rating and your evidence disagree — those gaps are the interesting ones.',
        ],
      },
      {
        key: 'organize',
        title: 'Ground the Project in the real blueprint',
        minutes: 15,
        instruction:
          'The coach is only trustworthy if it is working from the published exam guide and your real course material, not from what the model remembers about certifications.',
        steps: [
          'Add the official CCA-Foundations exam guide and its domain breakdown.',
          'Add your course resources: week blueprints, deep dives, your own build artifacts.',
          'Instruct Claude never to present generated practice questions as official exam content.',
        ],
      },
      {
        key: 'create',
        title: 'Build the readiness coach',
        minutes: 40,
        instruction:
          'Build the Artifact so it is usable weekly, not read once: a plan, a concept map, scenarios, and a way to track progress.',
        steps: [
          'Sequence the study plan by gap severity against hours actually available.',
          'Build a concept map linking exam domains to the work you have already done.',
          'Write practice scenarios in your own domain — not reproduced exam questions.',
          'Include a progress tracker you will realistically update.',
        ],
      },
      {
        key: 'prove',
        title: 'Explain your weakest domain out loud',
        minutes: 10,
        instruction:
          'The test of readiness is explanation, not recognition. Explain your weakest concept as if teaching it.',
        steps: [
          'Pick your weakest domain and explain its core concept in plain language.',
          'Name what you still do not understand about it.',
          'Submit the coach Artifact and the explanation.',
        ],
      },
    ],
    project: {
      name: 'Week 7 — Certification Readiness',
      instructions:
        'Instruct Claude: ground every claim about the exam in the official exam guide in this Project. Never reproduce protected exam questions and never describe a practice question you generate as official or as "from the exam". When my self-assessment conflicts with my assessment scores, say so directly. Sequence study by gap severity against the hours I actually have, not by domain order.',
      sources: [
        'The official Claude Certified Architect — Foundations exam guide and domain breakdown',
        'Your knowledge check and evaluation scores from weeks 1-7',
        'Your own build evidence: workspace, Skills, prompt library, MCP server, agent charter',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Find where confidence and evidence disagree',
        why: 'The domains you are wrong about your own strength in are where preparation time is worth the most.',
        text: `I am preparing for the Claude Certified Architect — Foundations exam. Five weeks, about six hours a week, alongside a capstone.

My self-rated confidence by domain (1-5):
[list each domain from the exam guide with your rating]

My actual assessment results so far:
[paste your knowledge check / evaluation scores by week or competency]

What I have actually built:
[list your workspace, Skills, prompt library, MCP server, agent charter]

Do this:
1. Where does my self-rating disagree with my evidence? Name the domains where I am probably overconfident, and where I am probably underrating myself.
2. Rank the domains by how much a study hour spent there would change my exam outcome — factoring in both my gap and the domain's weight in the blueprint.
3. Tell me which domains I can safely spend almost no time on, and why.

Use only the exam guide in this Project for the domain structure.`,
      },
      {
        kind: 'improve',
        label: 'Sequence against real hours',
        why: 'Study plans fail on arithmetic. This forces the plan to fit the hours that actually exist.',
        text: `Build my study plan against these real constraints:

Weeks available: [number]
Hours per week I will genuinely have: [be honest, not aspirational]
Other commitments: [capstone, work, anything else]

Requirements for the plan:
- Sequence by the ranking we just established, not by exam-guide order
- Every session has a concrete output, not "review chapter 4"
- Build in one catch-up week, because something will go wrong
- Tell me explicitly what I am choosing NOT to study, and what it costs me

If the hours do not add up to adequate coverage, say so plainly rather than compressing the plan to fit.`,
      },
      {
        kind: 'followup',
        label: 'Build the readiness coach',
        why: 'Produces the career asset — a coach you use weekly, anchored to your own work rather than generic study material.',
        text: `Build a single-page Artifact: my Certification Readiness Coach.

Include:
1. Gap analysis — my domains ranked by study-hour value, with the reasoning
2. The study plan, sequenced against my real hours, with a concrete output per session
3. A concept map linking each exam domain to work I have ALREADY done in this program, so I revise from my own artifacts
4. Practice scenarios in my own domain that exercise the same reasoning as the exam
5. A progress tracker I can update weekly

Hard rules:
- Do not reproduce protected exam questions.
- Label every practice scenario clearly as practice material you generated, NOT official exam content.
- Ground the domain structure in the official exam guide in this Project.`,
      },
    ],
    artifact: {
      type: 'Personalized Certification Readiness Coach (single-page Artifact)',
      requirements: [
        'Gap analysis ranking domains by study-hour value with stated reasoning',
        'A study plan sequenced against genuinely available hours, with a concrete output per session',
        'A concept map linking exam domains to the student\'s own prior work',
        'Practice scenarios clearly labelled as generated practice, not official exam content',
        'A progress tracker the student will realistically maintain',
      ],
    },
    trust_checkpoints: [
      'Never reproduce protected exam questions, and never let a generated practice question be presented as official. Label practice material as practice, every time.',
      'A study plan built on hours you do not have is a plan to fail on schedule. Use honest numbers, and if they do not add up, say so.',
      'Recognition is not readiness. If you cannot explain a concept without the material in front of you, the domain is not covered regardless of what the tracker says.',
    ],
    deliverables: [
      'The Certification Readiness Coach Artifact (shared link)',
      'A gap analysis grounded in real assessment results, not self-rating alone',
      'A study plan fitting genuinely available hours, naming what is being skipped',
      'A plain-language explanation of your weakest domain\'s core concept',
    ],
    prohibited_shortcuts: [
      'Building the gap analysis from self-assessment alone when real scores exist',
      'Presenting generated practice questions as official exam content',
      'A study plan that assumes more hours than the student actually has',
    ],
    reflection: {
      checks: [
        'My gap analysis uses my real assessment results, not only self-rating',
        'My study plan fits the hours I genuinely have and names what I am skipping',
        'Every practice scenario is labelled as generated practice material',
        'I explained my weakest domain in plain language without the material in front of me',
      ],
      free_response:
        'Which domain were you most overconfident about, and what evidence corrected you? Overconfidence found now is worth more than any amount of study time later.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'Study sequencing follows from gap severity and domain weight, with the reasoning shown.', developing: 'The plan follows exam-guide order regardless of the student\'s gaps.' },
      { dimension: 'Evidence', strong: 'Gap analysis is grounded in real assessment results and real build evidence.', developing: 'The analysis rests on self-rating alone.' },
      { dimension: 'Communication', strong: 'The student can explain their weakest concept in plain language, unaided.', developing: 'Explanation is recall of phrasing rather than understanding.' },
      { dimension: 'Judgment', strong: 'The plan uses honest hours and states what is being deliberately skipped.', developing: 'The plan is aspirational and covers everything equally.' },
      { dimension: 'Responsible AI', strong: 'No protected content is reproduced; all generated practice is labelled as such.', developing: 'Generated questions are presented as official or exam-sourced.' },
    ],
    competencies: ['structured_learning', 'self_assessment', 'technical_explanation', 'cca_foundations', 'certification_readiness'],
    points: { learning: 40, builder: 35, community: 0 },
    portfolio_eligible: true,
    certification_active: true,
    instructor_notes:
      'This is the FIRST week certification preparation is active — do not let earlier studios drift into cert prep, and do not let this one arrive late. The highest-value output is the overconfidence finding: the domain where the student\'s self-rating and their assessment scores disagree. Check that practice scenarios are labelled as generated; presenting them as official exam content is a hard fail, not a nit.',
    misconceptions: [
      'Believing self-assessed confidence is a reliable measure of readiness — it is the thing being tested here.',
      'Treating a generated practice question as representative of the real exam.',
      'Planning study time by domain order rather than by gap value.',
    ],
  },

  /* ------------------------------------------------------------------ Week 8 */
  {
    week: 8,
    key: 'executive-communication',
    title: 'Executive Communication Studio',
    career_asset: 'A Role-Aware Executive Communication Kit',
    week_theme: 'Claude Code Workflows + Automation',
    adaptation:
      'Week 8 turns Claude Code into an automation platform running work unsupervised. That is exactly the initiative that needs four different explanations — to an executive, a technical lead, the person whose job it changes, and a risk reviewer. The communication kit is written about the student\'s own automation, not a hypothetical initiative.',
    intro:
      'This week you make routine engineering run itself. Automation that runs unsupervised is the kind of thing that alarms people who were not in the room when you built it. This studio produces four honest versions of the same story, each aimed at someone with a different reason to care.',
    objectives: [
      'Translate one technical initiative for four audiences without changing the underlying facts',
      'Match detail level, framing, and call to action to each audience\'s actual decision',
      'Surface the risk each audience most cares about rather than the risk you find most interesting',
      'Produce a kit that switches audience while keeping the substance consistent',
    ],
    scenario:
      'Your automation now reviews code and runs routine engineering unsupervised. Four people need to hear about it this week: an executive deciding whether to fund more of it, a technical lead who has to maintain it, the engineer whose daily routine it changes, and a risk reviewer who wants to know what happens when it is wrong. Same system, four completely different conversations.',
    role: 'The person who has to make four audiences comfortable with the same true story',
    estimated_minutes: 80,
    stages: [
      {
        key: 'explore',
        title: 'Find what each audience actually needs to decide',
        minutes: 15,
        instruction:
          'Audience adaptation is not tone adjustment. Each of these people is making a different decision; find out what it is.',
        steps: [
          'For each of the four audiences, state the decision they are making and what would make them say no.',
          'Ask Claude what each audience most fears about an automation like yours.',
          'Note where two audiences want opposite things — that tension is the real communication problem.',
        ],
      },
      {
        key: 'organize',
        title: 'Fix the facts so they cannot drift',
        minutes: 15,
        instruction:
          'The failure mode of audience adaptation is four documents that quietly contradict each other. Put the shared facts in the Project.',
        steps: [
          'Add the real details of what your automation does, what it touches, and what it has actually run so far.',
          'Add the honest limitations and the known failure modes.',
          'Instruct Claude that every version must be consistent with these facts — different emphasis, never different truth.',
        ],
      },
      {
        key: 'create',
        title: 'Build the switchable kit',
        minutes: 40,
        instruction:
          'One Artifact, four views. A reader picks their role and gets the version written for them.',
        steps: [
          'Write the executive version: outcome, cost, risk, decision requested.',
          'Write the technical version: architecture, dependencies, maintenance burden, failure handling.',
          'Write the end-user version: what changes about their day, what they keep control of.',
          'Write the risk version: what can go wrong, what detects it, who is accountable.',
        ],
      },
      {
        key: 'prove',
        title: 'Handle the hostile question',
        minutes: 10,
        instruction:
          'Pick the audience most likely to object and write your answer to their hardest question.',
        steps: [
          'State the objection in its strongest form, in their words.',
          'Answer it without minimizing the concern.',
          'Submit the kit and the response.',
        ],
      },
    ],
    project: {
      name: 'Week 8 — Executive Communication',
      instructions:
        'Instruct Claude: every audience version must be consistent with the facts in this Project. Change emphasis, detail level, and framing — never the underlying truth. If an audience version would require softening a real limitation, tell me instead of softening it. Flag anywhere two versions would give a reader contradictory impressions.',
      sources: [
        'What your automation actually does, what systems it touches, and what it has run so far',
        'Its real limitations and known failure modes',
        'Your Week 6 agent charter and escalation matrix',
      ],
    },
    prompts: [
      {
        kind: 'starter',
        label: 'Map each audience to their decision',
        why: 'Audience adaptation done as tone-shifting produces four versions of the same document. Starting from the decision produces four genuinely different ones.',
        text: `I need to communicate one initiative to four audiences.

The initiative: [describe your automation — what it does, what it touches, what it has actually run]

The audiences:
1. An executive deciding whether to fund more of this
2. A technical lead who will maintain it
3. The engineer whose daily work it changes
4. A risk and compliance reviewer

For each audience tell me:
- The decision they are actually making
- What would make them say no
- What they most fear about an automation like this
- What they do NOT need to know, and would be distracted by

Then: where do two of these audiences want opposite things? That tension is what I actually have to solve.`,
      },
      {
        kind: 'improve',
        label: 'Check the versions against each other',
        why: 'Four audience versions drift apart easily. This catches the contradictions before a reader does.',
        text: `Here are my four versions:
[paste them]

Audit them against each other:
1. Where would two audiences come away with contradictory impressions of the same fact?
2. Which version softens a real limitation that another version states plainly? Name it.
3. Which version is the most likely to be forwarded to an audience it was not written for, and what would go wrong if it were?
4. Is any version missing the thing that audience most needs to decide?

Be specific. I would rather find the contradiction here than in the meeting.`,
      },
      {
        kind: 'followup',
        label: 'Build the communication kit',
        why: 'Produces the career asset — one Artifact that switches audience while keeping the substance fixed.',
        text: `Build a single-page interactive Artifact: a Role-Aware Communication Kit.

The reader selects their role and sees the version written for them. Four views:

1. EXECUTIVE — the outcome, what it cost, the risk in one line, and the decision I am asking for
2. TECHNICAL LEAD — architecture, dependencies, maintenance burden, how failures are handled
3. END USER — what changes about their day, what they keep control of, what to do when it gets something wrong
4. RISK AND COMPLIANCE — failure modes, what detects them, escalation path, who is accountable

Rules:
- All four must be consistent with the facts in this Project. Emphasis changes; truth does not.
- Each version states its own call to action.
- Every version must include the honest limitation, phrased for that audience — not omitted for the friendly ones.`,
      },
    ],
    artifact: {
      type: 'Role-Aware Communication Kit (single-page interactive Artifact)',
      requirements: [
        'Four audience views: executive, technical lead, end user, risk and compliance',
        'A role switcher so a reader gets their own version',
        'Each version carries its own call to action',
        'The honest limitation appears in every version, phrased for that audience',
        'No two versions leave contradictory impressions of the same fact',
      ],
    },
    trust_checkpoints: [
      'Adaptation changes emphasis, never facts. If a version reads better because a limitation was dropped, that is not adaptation, it is misrepresentation.',
      'Every version — including the executive one — must carry the honest limitation. The friendly audience is the one most likely to be misled.',
      'The end-user version affects someone whose job is changing. Write it as though they will read it, because they will.',
    ],
    deliverables: [
      'The Role-Aware Communication Kit Artifact (shared link)',
      'An executive brief of no more than 200 words',
      'A technical brief covering maintenance burden and failure handling',
      'A written response to the hardest objection from your most skeptical audience',
    ],
    prohibited_shortcuts: [
      'Four versions that differ only in tone and length',
      'Omitting the limitation from the executive version because it complicates the ask',
      'An end-user version that describes the change without saying what they keep control of',
    ],
    reflection: {
      checks: [
        'All four versions are consistent with the same set of facts',
        'Every version, including the executive one, states the honest limitation',
        'Each version has its own call to action',
        'I wrote the end-user version as if the affected person will read it',
      ],
      free_response:
        'Which audience was hardest to write for, and what did that difficulty tell you about the initiative itself? Difficulty explaining something to a particular audience is often a signal about the work, not the writing.',
    },
    rubric: [
      { dimension: 'Reasoning', strong: 'Each version is shaped by that audience\'s actual decision, not by tone.', developing: 'The four versions are the same content at four lengths.' },
      { dimension: 'Evidence', strong: 'All versions trace to the same fixed facts; claims about what the automation has done are real.', developing: 'Versions contradict each other or overstate what has been run.' },
      { dimension: 'Communication', strong: 'Each audience gets what they need to decide, with a clear call to action.', developing: 'Calls to action are generic or missing.' },
      { dimension: 'Judgment', strong: 'The tension between audiences is named and handled rather than avoided.', developing: 'Conflicting audience needs are averaged into a bland middle.' },
      { dimension: 'Responsible AI', strong: 'Limitations appear in every version, including the ones where they are inconvenient.', developing: 'The friendly audience gets the sanitized story.' },
    ],
    competencies: ['executive_communication', 'audience_adaptation', 'influence', 'leadership', 'communication'],
    points: { learning: 30, builder: 45, community: 10 },
    portfolio_eligible: true,
    certification_active: true,
    instructor_notes:
      'The cross-version consistency audit is the part students skip and the part that carries the learning. Read the executive version and the risk version side by side — if the limitation appears only in one, that is the conversation. The end-user version is the ethical test: automation changes someone\'s job, and a student who writes that version carelessly is telling you something.',
    misconceptions: [
      'Thinking audience adaptation means adjusting vocabulary and length.',
      'Believing the executive version should omit complications to get the yes.',
      'Writing the end-user version about the technology rather than about their day.',
    ],
  },
];

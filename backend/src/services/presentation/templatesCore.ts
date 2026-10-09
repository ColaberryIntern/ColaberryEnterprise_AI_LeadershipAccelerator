import type { PresentationTemplate } from './templateContract';

/**
 * The four presentation templates surfaced prominently in the student chooser.
 *
 * Every example below is LABELLED AS AN EXAMPLE and invented for teaching. None is
 * attributed to a real student, and none carries a real customer name, metric or
 * deployment. Where a number appears it is visibly a placeholder inside the example's
 * own fiction, never a claim about this programme.
 *
 * The weak examples matter as much as the strong ones. A strong example alone teaches
 * imitation; the weak one plus its annotation is what teaches judgement — which is the
 * thing an architect is actually being hired for.
 *
 * Timings: every `timedOutline` totals exactly its `defaultSeconds`, and Q&A is held
 * separately in `qaSeconds`. `validateTemplate` fails the build if an outline overruns
 * its own speaking budget, because that is the most common way a timed demo falls over.
 */

/**
 * The default rubric weights from the programme spec. Dimensions are shared so a
 * student's score means the same thing across templates; only `lookFor` is tailored,
 * because what "evidence" looks like in a 90-second intro is not what it looks like in
 * an architecture review.
 */
const rubric = (lookFor: Record<string, string>) => ([
  { dimension: 'Problem and audience clarity', weight: 20, lookFor: lookFor.problem },
  { dimension: 'Story structure', weight: 15, lookFor: lookFor.structure },
  { dimension: 'Demonstration and evidence', weight: 25, lookFor: lookFor.evidence },
  { dimension: 'AI/human control and limitations', weight: 15, lookFor: lookFor.control },
  { dimension: 'Delivery, timing, visual clarity', weight: 15, lookFor: lookFor.delivery },
  { dimension: 'Questions and reflection', weight: 10, lookFor: lookFor.questions },
]);

export const PROJECT_INTRODUCTION: PresentationTemplate = {
  id: 'project_introduction',
  label: 'Project introduction',
  prominent: true,
  defaultSeconds: 90,
  qaSeconds: 0,
  outcome: 'Explain what your project is for, and why it matters, to someone who has never heard of it.',
  objective: 'Say what your project does and who it helps, in ninety seconds, without jargon.',
  expectedOutput: 'A ninety-second spoken introduction you can deliver from memory, plus one slide behind it.',
  preface:
    'This is the version you give when someone asks "so what are you building?" in a lift, a hallway, or the '
    + 'first minute of an interview. You will give it far more often than any other presentation here, and it is '
    + 'the hardest one to write, because ninety seconds leaves no room to hide behind detail.',
  structure: ['The person and their problem', 'What it costs them', 'What your project changes', 'The next milestone'],
  strongExample: {
    text:
      'Example: "Dispatchers at a mid-size freight brokerage re-key the same load details into three systems. '
      + 'Each load takes about eleven minutes and roughly one in twenty has a typo that costs a phone call. '
      + 'I built an agent that reads the booking email and fills all three. The dispatcher still approves every '
      + 'load before it sends. Next, I am handling the exceptions it currently refuses."',
    why:
      'It names a specific person, gives the cost in their units (minutes and phone calls, not percentages), '
      + 'states what changed in one sentence, keeps the human in the approval path, and ends on honest next work '
      + 'rather than a claim of completeness.',
  },
  weakExample: {
    text:
      'Example of what not to do: "My project is an AI-powered, end-to-end intelligent automation platform that '
      + 'leverages large language models to drive operational efficiency and unlock transformative value across '
      + 'the logistics vertical."',
    why:
      'Nobody appears in it. No person has a problem, nothing costs anything, and every noun could describe a '
      + 'hundred other projects. An audience cannot tell whether this exists, works, or matters — so they assume not.',
  },
  timedOutline: [
    { beat: 'The person and their problem', seconds: 20, say: 'Name one real role and the specific thing that goes wrong for them today.' },
    { beat: 'What it costs them', seconds: 20, say: 'Give the cost in their own units — minutes, calls, rework — not a percentage you cannot source.' },
    { beat: 'What your project changes', seconds: 30, say: 'Describe the new workflow in one sentence, then say what the human still decides.' },
    { beat: 'The next milestone', seconds: 20, say: 'Name the next thing you are building and what would make it done.' },
  ],
  vocabulary: [
    { term: 'Agent', plain: 'A program that takes a goal and performs several steps on its own to reach it.' },
    { term: 'Human in the loop', plain: 'A person approves or corrects the work before it has any real effect.' },
    { term: 'Exception', plain: 'A case the system cannot handle confidently, so it hands back to a person.' },
  ],
  prepare: [
    'Name the single role your project helps. One role, not a category.',
    'Find one number you can actually source from your own project or notes — and if you cannot, say so out loud instead of inventing one.',
    'Write the one sentence describing the workflow after your project exists.',
  ],
  checklist: [
    'I can say who this helps without using the word "users".',
    'My cost statement comes from something I can point to, not an estimate I made up.',
    'I say what the human still decides.',
    'I finish inside ninety seconds without rushing the last line.',
    'My closing names real next work, not a claim that it is finished.',
  ],
  practiceDrill:
    'Record yourself giving it twice: once reading, once from memory. Watch only the second one. Note every '
    + 'sentence where you reached for jargon because you had not decided what you meant.',
  rubric: rubric({
    problem: 'One named role with one specific problem, stated in the first twenty seconds.',
    structure: 'All four beats present and in order, with no beat crowding out another.',
    evidence: 'The cost figure is traceable to something real, or is explicitly labelled as not yet measured.',
    control: 'States plainly what the human still decides, rather than implying full automation.',
    delivery: 'Lands inside ninety seconds, audible and unhurried, with no slide the audience must read while listening.',
    questions: 'Can answer "what happens when it gets it wrong?" without rehearsing.',
  }),
  reflection: 'Which sentence did you reach for jargon in, and what did you actually mean by it?',
};

export const AI_VISUAL_PRESENTATION: PresentationTemplate = {
  id: 'ai_visual_presentation',
  label: 'AI visual presentation',
  prominent: true,
  defaultSeconds: 300,
  qaSeconds: 120,
  outcome: 'Make a visual argument that someone could follow with the sound off.',
  objective: 'Show, rather than describe, how the work changes a workflow — using before and after.',
  expectedOutput: 'A five-minute slide presentation whose images carry the argument, plus speaker notes.',
  preface:
    'A visual presentation is not a document read aloud. If your slides are sentences, your audience will read '
    + 'ahead and stop listening. The test to aim for: someone watching with the sound off should still follow the '
    + 'argument. Your voice adds the reasoning; the slides carry the shape.',
  structure: ['The problem, shown', 'Before and after', 'How the workflow runs', 'Evidence', 'The next step'],
  strongExample: {
    text:
      'Example: a single slide split down the middle. Left, a screenshot of the old process with eight numbered '
      + 'steps circled in red. Right, the same job with three steps. No body text — the title reads "Eight steps '
      + 'became three." The speaker explains which five disappeared and which one is new.',
    why:
      'The image makes the claim and the voice supplies the reasoning. The audience understands the point before '
      + 'the sentence finishes, so attention goes to the explanation rather than to decoding a slide.',
  },
  weakExample: {
    text:
      'Example of what not to do: a slide titled "Key Benefits" with six bullets, each a full sentence, read aloud '
      + 'verbatim, over a stock photograph of a robot hand touching a human hand.',
    why:
      'The audience reads all six bullets in four seconds, then waits. The photograph asserts "AI" without showing '
      + 'anything that was built. Nothing on the slide is specific to this project, so it proves nothing.',
  },
  timedOutline: [
    { beat: 'The problem, shown', seconds: 40, say: 'Open on the current state as an image — a screenshot, a form, a queue. Let them see it before you explain it.' },
    { beat: 'Before and after', seconds: 60, say: 'One slide, split. Say which steps disappeared and which one is new.' },
    { beat: 'How the workflow runs', seconds: 70, say: 'Walk the path once: what triggers it, what it does, where a person approves.' },
    { beat: 'Evidence', seconds: 80, say: 'Show the artefact that proves it ran. Label anything estimated as estimated.' },
    { beat: 'The next step', seconds: 50, say: 'Name the next decision you need to make, and what would settle it.' },
  ],
  vocabulary: [
    { term: 'Workflow', plain: 'The sequence of steps a job actually goes through from start to finish.' },
    { term: 'Trigger', plain: 'The event that starts the process — an email arriving, a form being submitted.' },
    { term: 'Artefact', plain: 'Something the system produced that you can point at: a file, a record, a log line.' },
  ],
  prepare: [
    'Take a screenshot of the current process before your project touches it. You cannot make a before-and-after later.',
    'Decide the one workflow you will show. One, fully, beats three partially.',
    'Collect the artefact that proves it ran, and check you are allowed to show it.',
  ],
  checklist: [
    'Every slide makes one point, and its title says what that point is.',
    'Someone could follow my argument with the sound off.',
    'No slide asks the audience to read while I am talking.',
    'Every number on screen is either sourced or labelled as an estimate.',
    'My before-and-after is the same task, not two different tasks.',
  ],
  practiceDrill:
    'Play your deck with the sound off and time how long each slide needs to be understood. Any slide that takes '
    + 'longer than five seconds to decode is doing your talking for you — cut it down.',
  rubric: rubric({
    problem: 'The opening image establishes the problem before any explanation is given.',
    structure: 'Before/after is a genuine comparison of the same task, not two unrelated screens.',
    evidence: 'A real artefact is shown, and estimated figures are visibly labelled as estimates.',
    control: 'The slide showing the workflow marks where a human approves.',
    delivery: 'Slides are legible at the back of a room and carry the argument without narration.',
    questions: 'Can explain why the five removed steps were safe to remove.',
  }),
  reflection: 'Which slide were you tempted to add words to, and what does that tell you about the image?',
};

export const WORKING_SYSTEM_DEMO: PresentationTemplate = {
  id: 'working_system_demo',
  label: 'Working-system demo',
  prominent: true,
  defaultSeconds: 420,
  qaSeconds: 180,
  outcome: 'Demonstrate one complete outcome end to end, including what happens when it fails.',
  objective: 'Run one real job in front of an audience and narrate what they are watching.',
  expectedOutput: 'A seven-minute live demonstration with a runbook and a backup recording.',
  preface:
    'A demo is the moment your work stops being a description. The discipline is narration: say what you are about '
    + 'to do, what to watch for, what happened, and why it matters — in that order, every time. Audiences forgive a '
    + 'system that stumbles. They do not forgive not knowing what they were supposed to be looking at.',
  structure: ['The starting condition', 'The action', 'The result', 'The control and failure path'],
  strongExample: {
    text:
      'Example narration: "I am going to paste in a booking email. Watch the status column on the right — it is '
      + 'empty now. … It has filled in three fields and flagged the fourth. It flagged it because the pickup date '
      + 'was ambiguous, and that is the behaviour I want: it refuses rather than guesses."',
    why:
      'The audience is told where to look before anything moves, so they see the thing happen instead of hearing '
      + 'about it afterwards. The refusal is framed as designed behaviour, which turns a limitation into evidence '
      + 'of judgement.',
  },
  weakExample: {
    text:
      'Example of what not to do: the presenter clicks through six screens in silence, then says "so as you can '
      + 'see, it works", while the audience is still reading the second screen.',
    why:
      'Nobody knew where to look, so nobody saw it work. Silence during a demo transfers all the interpretive work '
      + 'to the audience, and they will interpret confusion as a broken system.',
  },
  timedOutline: [
    { beat: 'The starting condition', seconds: 60, say: 'Show the empty or "before" state and say explicitly what the audience should watch.' },
    { beat: 'The action', seconds: 120, say: 'Do one real thing, narrating before each click rather than after.' },
    { beat: 'The result', seconds: 120, say: 'Point at what changed and say why that is the outcome that matters.' },
    { beat: 'The control and failure path', seconds: 120, say: 'Deliberately show one case it refuses, and what a person does next.' },
  ],
  vocabulary: [
    { term: 'Happy path', plain: 'The run where everything goes as expected — the easy case.' },
    { term: 'Failure path', plain: 'What the system does when something goes wrong, on purpose rather than by accident.' },
    { term: 'Sample data', plain: 'Safe, made-up data used for a demo so no real customer information is shown.' },
  ],
  prepare: [
    'Prepare safe sample data. Never demonstrate against real customer records.',
    'Decide the one failure you will show deliberately, and rehearse it until it is boring.',
    'Record a backup video of the full run, in case the live one cannot start.',
  ],
  checklist: [
    'My sample data contains nothing real or private.',
    'I say what to watch BEFORE I click, every time.',
    'I show one failure deliberately and explain the recovery.',
    'I have a backup recording and I know how to reach it in ten seconds.',
    'Notifications, bookmarks and other tabs are hidden before I share.',
    'I have rehearsed the exact window I am going to share.',
  ],
  practiceDrill:
    'Run the demo once with your screen shared to nobody, narrating aloud the whole way. Time the gap between your '
    + 'narration and each click; if the click comes first, you are showing rather than teaching.',
  rubric: rubric({
    problem: 'The starting condition makes clear what job is about to be done and for whom.',
    structure: 'All four beats appear, and the failure path is shown rather than described.',
    evidence: 'A real outcome is produced live, with safe data, and visibly changes state.',
    control: 'The refusal case is shown deliberately and the human recovery step is named.',
    delivery: 'Narration precedes every action; the audience is never left guessing where to look.',
    questions: 'Can answer "what else does it refuse?" with specifics rather than reassurance.',
  }),
  reflection: 'What did the system refuse to do, and are you glad it refused?',
};

export const FINAL_SHOWCASE: PresentationTemplate = {
  id: 'final_showcase',
  label: 'Final showcase',
  prominent: true,
  defaultSeconds: 480,
  qaSeconds: 300,
  outcome: 'Combine the story, live proof, and your own judgement about the limits of what you built.',
  objective: 'Present the whole project — problem, working proof, controls, results, limits, and next step.',
  expectedOutput: 'An eight-minute showcase with live proof, plus answers to five likely questions.',
  preface:
    'This is the one that goes in your portfolio and the one an employer watches. The difference between a good '
    + 'showcase and a great one is almost never the system — it is whether the presenter can say what their work '
    + 'does NOT do without sounding apologetic. Stating a limit precisely is the strongest signal of competence '
    + 'you can give in eight minutes.',
  structure: [
    'The problem and who has it', 'Live proof', 'What AI does and what humans decide',
    'Results', 'Limits', 'The next step',
  ],
  strongExample: {
    text:
      'Example: "It handles the three carriers whose formats I had samples for. A fourth would need about a day, '
      + 'and I would not promise it works until I had seen ten real emails from them. That is the honest boundary."',
    why:
      'It is specific about scope, specific about effort, and sets a condition for believing it rather than a '
      + 'promise. An audience trusts the rest of the talk more because of this sentence, not less.',
  },
  weakExample: {
    text:
      'Example of what not to do: "It is fully scalable and production-ready, and it could be rolled out across '
      + 'the whole organisation immediately."',
    why:
      'Nothing here is checkable, and anyone who has shipped software knows it is not true. One unverifiable claim '
      + 'makes an audience re-examine every claim that came before it.',
  },
  timedOutline: [
    { beat: 'The problem and who has it', seconds: 50, say: 'One role, one problem, one cost. Same discipline as the ninety-second intro.' },
    { beat: 'Live proof', seconds: 150, say: 'Run the real thing. Narrate before each action.' },
    { beat: 'What AI does and what humans decide', seconds: 80, say: 'Draw the line explicitly — what it decides alone, what it never decides.' },
    { beat: 'Results', seconds: 80, say: 'Give what you measured. Say "not measured yet" where that is the truth.' },
    { beat: 'Limits', seconds: 60, say: 'Name what it does not handle and what it would take to handle it.' },
    { beat: 'The next step', seconds: 60, say: 'The next decision, and what evidence would settle it.' },
  ],
  vocabulary: [
    { term: 'Scope', plain: 'The set of cases the system is actually built to handle.' },
    { term: 'Guardrail', plain: 'A rule that stops the system doing something, even if it could.' },
    { term: 'Measured versus estimated', plain: 'Measured means you counted it. Estimated means you reasoned about it. Say which.' },
  ],
  prepare: [
    'List every claim you plan to make, and write next to each one what you would show if challenged.',
    'Decide which results are measured and which are estimates, and mark them differently on the slide.',
    'Write your three real limits before you write anything else — they are the hardest part and shape the rest.',
  ],
  checklist: [
    'Every number on a slide is marked measured, estimated, or target.',
    'I state at least one real limit without apologising for it.',
    'My live proof uses safe data and I have a backup recording.',
    'I can say what the system never decides on its own.',
    'I finish speaking inside eight minutes, leaving questions untouched.',
    'I have answers ready for five likely questions, grounded in what I actually built.',
  ],
  practiceDrill:
    'Have someone ask you "how do you know?" after every claim you make. Any claim where your answer is "it just '
    + 'seems right" either needs evidence or needs removing before the day.',
  rubric: rubric({
    problem: 'Opens with a named role and a specific cost, not a market description.',
    structure: 'All six beats present, with limits given real time rather than rushed at the end.',
    evidence: 'Live proof runs, and every figure is explicitly measured, estimated, or target.',
    control: 'The AI/human boundary is stated as a rule, not implied by example.',
    delivery: 'Speaking finishes inside eight minutes with Q&A left whole.',
    questions: 'Answers stay grounded in what was built; "I do not know yet" is used where true.',
  }),
  reflection: 'Which limit were you most tempted to leave out, and why does that make it the important one?',
};

export const CORE_TEMPLATES: readonly PresentationTemplate[] = [
  PROJECT_INTRODUCTION,
  AI_VISUAL_PRESENTATION,
  WORKING_SYSTEM_DEMO,
  FINAL_SHOWCASE,
];

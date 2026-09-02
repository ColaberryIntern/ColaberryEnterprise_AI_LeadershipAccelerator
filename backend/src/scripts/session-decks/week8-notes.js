/**
 * week8-notes.js — presenter commentary for the generated slides in Week 8,
 * both days:
 *   Mon 2026-09-14  Architecture Day  (12 slides)
 *   Thu 2026-09-17  Build Day          (8 slides)
 *
 * Week 8 is "Claude Code Workflows + Automation". Its spine is the checklist
 * argument: words are for judgement, code is for boundaries — a rule you can
 * enforce is worth ten rules you wrote down and hoped for. Every note below
 * pushes that, because it is the through-line the room should leave with.
 *
 * Tagged vocabulary: SITUATION violet · ROOM blue · MOOD green · OPEN gold ·
 * SAY gold · DO blue · NOTE grey. Keyed `kind:id` — ids are not unique.
 *
 * Apply with applyWeekNotes.js.
 */

const L = (...lines) => lines.join('\n');

const MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The single-sentence hook. First thing you say tonight, before any content.',
    'ROOM: Full screen, one sentence, nothing else on the display.',
    'MOOD: Stop. Let it be uncomfortable — it is meant to be.',
    'OPEN: "Every system you have built so far has one single point of failure. It is you, remembering to start it."',
    'NOTE: Say it and then say NOTHING for three seconds. The room has to feel the accusation before you soften it.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show the finished automation before any theory.',
    'ROOM: Have a real custom command and a real hook firing on your own repo, ready to demo.',
    'MOOD: Concrete and confident. This is the most immediately useful week in the program.',
    'OPEN: "By Thursday you have a workflow that runs itself — commands, a hook, a headless run, and code review on every PR."',
    'DO: Run one of your own slash commands live, right now, before you explain what it is. Ten seconds.',
    'NOTE: Do not enumerate the four pieces here. Sell that it runs without you; the architecture slide breaks it down.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: First story beat. It reframes forgetting as a design flaw rather than a personal failing, which is what lets the room admit to it.',
    'ROOM: Story card full screen. Step away from the keyboard.',
    'MOOD: Generous, not scolding. Nobody should feel got at.',
    'OPEN: "Every process that depends on a person remembering has a failure rate, and it is never zero."',
    'SAY: The most fragile component in your system is not a service. It is a person with a calendar, a commute, and a bad week.',
    'DO: Ask who has ever shipped something that skipped a step they knew about. Take two hands and move — you are normalising it, not investigating.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Turn from "you forget things" to why a business should care.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and commercial. This is the segment that gets clipped for social — keep syntax out of it entirely.',
    'OPEN: "AI work only compounds when it is repeatable. Everything you have built so far runs once, when you remember."',
    'NOTE: Fifteen minutes for the whole segment. Keep it on the business stakes; the tooling starts after the break.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The availability story — Week 2 said knowledge in one head is the enemy; this says the same about one person being reachable.',
    'ROOM: Story card full screen.',
    'MOOD: Understated. The detail that lands is the two PRs approved unread.',
    'OPEN: "She had one week off in eighteen months, and the whole pipeline noticed."',
    'SAY: Week 2 said knowledge in one head is the enemy. Week 8 says the same about availability.',
    'NOTE: If somebody says "that is a staffing problem", agree — and then ask which is cheaper to fix, hiring a second her or writing the check into the pipeline.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the biggest teaching block. This is the table of contents for the four pieces.',
    'ROOM: Diagram up. Walk it left to right with your hand: commands, hooks, SDK/headless, CI.',
    'MOOD: Settle in — this is the longest stretch of teaching tonight.',
    'OPEN: "Four pieces. Two of them give Claude Code new verbs, and two of them take away its ability to do the wrong thing."',
    'DO: Ask the room which of the four they think is the guardrail. Take one answer before you reveal it is the hooks.',
    'NOTE: Do not teach the four here — this is the map. Each gets its own slide next.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: The aviation checklist story. This is the intellectual centre of the week — it is why hooks exist at all.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Slow down. This is the one they should quote back to you in Week 12.',
    'OPEN: "Aviation spent decades writing better instructions, and crews kept missing steps anyway."',
    'SAY: Words for judgment. Code for boundaries. That is the whole of tonight.',
    'DO: Have the room say "words for judgment, code for boundaries" back to you once.',
    'NOTE: This is the line to point at every time somebody suggests solving a problem by writing a longer CLAUDE.md.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. You are about to show an automation that ships a bad change confidently — the failure this whole week guards against.',
    'ROOM: Opener on screen. The anti-pattern block is next; do not run it, ever.',
    'MOOD: Shift gear — less lecture, more autopsy.',
    'OPEN: "Here is an automation with no scope and no verification. Watch what it does successfully."',
    'NOTE: Keep this short. The autopsy slides are the content; this is just the door.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The 2 AM question returns, and gets harder — this time the run SUCCEEDED at doing the wrong thing.',
    'ROOM: Story card full screen. Point back at the loud-or-quiet framing from Week 6 if the room was there.',
    'MOOD: Quiet and a bit grim. Do not soften the ending.',
    'OPEN: "Week 6 asked whether the failure is loud or quiet. Tonight it did not fail at all."',
    'SAY: A system that fails loudly wakes you up. A system that succeeds wrongly lets you sleep.',
    'NOTE: This is the strongest argument for the verification step in every headless run. Call it forward explicitly.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens. One custom command and one hook, on their own repo.',
    'ROOM: Your terminal and Claude Code both visible. Mentors standing.',
    'MOOD: Energy change — you stop presenting and start working alongside them.',
    'OPEN: "Two artifacts in the next thirty minutes: one verb you invented, and one boundary that enforces itself."',
    'DO: Say out loud that every block tonight is a prompt — Claude Code drives the terminal, nobody types shell.',
    'NOTE: Watch the pulse. If "stuck" climbs, slow down rather than pushing to stay on schedule.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: The inheritance beat, mid-build. It reframes the command they just wrote as something that outlives them.',
    'ROOM: Story card up. Let them keep their hands on keyboards for this one — it is sixty seconds.',
    'MOOD: Warm. This is the reward for the work they are in the middle of.',
    'OPEN: "Six months from now, someone you have never met will type your verb."',
    'SAY: Week 2 you taught it once. Tonight you teach everyone who comes after you, once.',
    'NOTE: Anyone whose command is still called "test2" will quietly rename it after this. That is the point.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide. Close the loop on "you are the single point of failure" and set up Thursday.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Land it. Slow down for the last two lines.',
    'OPEN: "Thursday we automate a real workflow end to end — commands, hooks, headless, and code review on every PR."',
    'SAY: You started tonight as the thing that has to remember. You finish Thursday as the person who wrote down what must never be forgotten.',
    'NOTE: End on the callback, not on logistics. Logistics first, then the line, then stop.',
  ),
};

const THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: First content slide of Build Day. Monday was the argument; tonight is the receipt.',
    'ROOM: Have the finished end state running on your screen — a PR with an automated review comment on it.',
    'MOOD: Concrete. No hedging about what gets done.',
    'OPEN: "By the end of tonight, a pull request in your own repo gets reviewed by something you built, without you asking it to."',
    'DO: Show the finished thing once, live, before explaining any of it. Thirty seconds.',
    'NOTE: Do not list the checkpoints here — the build map does that next.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening story beat of the build night.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Brief and warm. Sixty seconds, then into the work.',
    'OPEN: "Monday you argued that a rule you can enforce beats a rule you wrote down. Tonight you write the enforcement."',
    'NOTE: Keep it short — Build Day lives or dies on protected build time.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — the custom command exists and runs. First real artifact of the night.',
    'ROOM: Your own .claude/commands file open, so you can show a real one rather than describe it.',
    'MOOD: Encouraging. The spread widens here.',
    'OPEN: "Checkpoint one. You have invented a verb, and it lives in your repository."',
    'DO: VERIFY it ran — ask who has actually typed their slash command and seen it do something, not just who has the file.',
    'NOTE: A command that exists but has never been run is not CP1. Say that plainly before you advance.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — the hook. This is the boundary that enforces itself, and the payoff for Monday’s checklist story.',
    'ROOM: Have a deliberately-failing case ready so you can show the hook blocking something.',
    'MOOD: Firm. This is the checkpoint with a right answer.',
    'OPEN: "Checkpoint two. Something you cannot forget, because it is no longer up to you."',
    'DO: Ask who has watched their hook actually BLOCK something. Not "did you write it" — did you see it refuse.',
    'NOTE: A hook nobody has triggered is a hope. Push them to break their own rule on purpose before moving on.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — the headless run and CI review. The checkpoint most likely to run long.',
    'ROOM: Watch the clock. The failure drills still need their time after this.',
    'MOOD: Steady. Do not let the room panic about finishing.',
    'OPEN: "Checkpoint three. It runs without you, and it reviews work you did not ask it to review."',
    'DO: Have one person say out loud which real task they pointed their headless run at.',
    'NOTE: If most of the room is not here with twenty minutes left, cut a failure drill rather than the harden step.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: Story beat just before the build. Frames the automation as infrastructure, not a toy.',
    'ROOM: Story card up. Hold it — resist jumping straight into CP0.',
    'MOOD: Reflective, brief.',
    'OPEN: "The difference between a script and infrastructure is whether anyone else can rely on it."',
    'NOTE: Sixty seconds. Then hands on keyboards.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: Opens the failure segment. You are about to run the anti-pattern — frame it as a drill.',
    'ROOM: Story card up. The anti-pattern block is READ-ONLY tonight; nobody runs it.',
    'MOOD: Light. This should feel like play, not punishment.',
    'OPEN: "The safest possible time to watch an unguarded automation ship something broken is right now, while I am standing here."',
    'DO: Say plainly that the anti-pattern block is one we read together and nobody types. That is deliberate.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: Closing beat. Ties the night back to Monday’s checklist argument.',
    'ROOM: Story card full screen. Clock still running; do not rush.',
    'MOOD: Warm and a little proud. This is the emotional close.',
    'OPEN: "You spent tonight writing down the things that must never be forgotten, in a form that cannot forget them."',
    'SAY: Words for judgment. Code for boundaries.',
    'NOTE: Let it sit for a beat before the ship gate. Do not step on the callback.',
  ),
};

module.exports = {
  sessions: [
    { id: '8e8df597-ad52-4b1a-bb5c-b51057e24226', label: 'Week 8 Mon 9/14', slideNotes: MONDAY },
    { id: 'd0c174bd-15c5-44b7-b1f5-3b6fa764945d', label: 'Week 8 Thu 9/17', slideNotes: THURSDAY },
  ],
};

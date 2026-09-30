/**
 * session17-generated-notes.js — tagged commentary for the 19 generated
 * slides in Session 17 (Week 8 · Build Day, 2026-09-17) that week8-notes.js
 * left on untagged tips: the cover, the readiness opener, CP0, the break, the
 * demos and broadcast slides, all nine polls, and the four generator slides (rules, build map, before/after, assignment) that had SAY/DO/NOTE but no arrival category.
 *
 * As on Monday, these are NOT boilerplate replacements — the poll tips were
 * specific and authored, just untagged, so the phone painted each as one grey
 * block. Same direction, re-authored to the tagged contract so the arrival
 * screen colour-codes. Companion to session17-week8-thursday.js.
 *
 * Vocabulary: SITUATION violet · ROOM blue · MOOD green · OPEN gold · SAY gold ·
 * DO blue · NOTE grey. Keyed `kind:id` — ids are not unique.
 *
 * Apply with applyWeekNotes.js:
 *   node /app/applyWeekNotes.js /app/session17-generated-notes.js
 */

const L = (...lines) => lines.join('\n');

const THURSDAY = {
  'cover:result-preview-0': L(
    'SITUATION: Cover. Build Day; the room is arriving with laptops open and repos in various states.',
    'ROOM: Cover on screen, QR visible. Phone on the presenter view, class clock NOT yet running.',
    'MOOD: Calm and welcoming. Let people settle — CP0 will sort the setup problems.',
    'OPEN: "Welcome to Build Day. Repo open, phone on the class controller — tonight your repo learns to review itself."',
    'DO: Press Start class the moment you begin speaking.',
  ),
  'interaction:result-preview-950': L(
    'SITUATION: The opening question — it sets up the whole night in one poll.',
    'ROOM: Poll full screen. Nothing to run.',
    'MOOD: Curious. You genuinely want the number.',
    'OPEN: "How long does a change actually wait?"',
    'DO: Whatever the room says, ask the same follow-up: "and what were you waiting for?" The answer is almost always a person, not a problem.',
    'NOTE: That gap is what CP3 closes tonight. Name it now; call back to it when the first review comment lands.',
  ),
  'segment:readiness-0': L(
    'SITUATION: Readiness opener. Two minutes here saves an hour later.',
    'ROOM: Pulse rail visible. Mentors standing.',
    'MOOD: Brisk.',
    'OPEN: "You are ready to build if your repo is on GitHub, Actions is on, and you have a test command that runs."',
    'DO: Ask the room to tap I’m here. Anyone not set up goes to a mentor before CP1, not during it.',
  ),
  'interaction:readiness-950': L(
    'SITUATION: One warm-up trivia to confirm Monday landed before we build on it.',
    'ROOM: Poll up. Fast.',
    'MOOD: Light.',
    'OPEN: "Quick check — did Monday stick?"',
    'NOTE: Reveal, one line of why, move. If the room splits badly, say the thesis once more: an instruction is a request, a hook is a guarantee.',
  ),
  'interaction:readiness-951': L(
    'SITUATION: The roll call. Operational — this decides who gets a mentor in the next three minutes.',
    'ROOM: Poll up. Read the counts out loud as they move.',
    'MOOD: Strict but kind. Nobody starts CP1 red.',
    'OPEN: "Nobody starts CP1 red. Where are you?"',
    'DO: Send mentors immediately. The "no test command" group goes first — the commit-guard has nothing to enforce without one, and they fall quietly behind all night.',
  ),
  'checkpoint:build-map-1': L(
    'SITUATION: CP0 on the rail — Ready. Everyone starts here.',
    'ROOM: Checkpoint slide up. Pulse rail visible so you can see who has tapped through.',
    'MOOD: Matter-of-fact.',
    'OPEN: "Checkpoint zero. Repo on GitHub, Actions on. Confirm it before the first prompt."',
    'DO: Do not advance on the rail alone — ask who has actually opened the Actions tab in the browser tonight.',
  ),
  'interaction:build-map-950': L(
    'SITUATION: Commit-to-one poll before the build. The verb they name here is the one they build at CP1.',
    'ROOM: Poll up. Have three people ready to say theirs.',
    'MOOD: Encouraging, pushing for specificity.',
    'OPEN: "Name your verb before you build it."',
    'DO: Have three people say theirs in one sentence. "Test and format" is fine; "regenerate the API docs and check nothing in /legacy changed" gets a visibly better command — read that one out as the standard.',
  ),
  'interaction:guided-build-950': L(
    'SITUATION: Diagnostic poll right after CP1. It will be live for three or four people in the room at this exact moment.',
    'ROOM: Poll up. Mentors ready to move.',
    'MOOD: Practical.',
    'OPEN: "The guard let it through. Where do you look?"',
    'DO: Vote, reveal, then: "hands up if that is happening to you right now" — and send mentors straight there.',
    'NOTE: The two answers, in order: the script is not executable, or it is exiting 0 instead of 2. Check both before touching the matcher.',
  ),
  'interaction:guided-build-951': L(
    'SITUATION: The theater poll — the one full-screen stop-everything moment tonight. Fires before the real unattended run.',
    'ROOM: Full-screen theater. Lock the votes and show the spread before anyone speaks.',
    'MOOD: Slow down. Take the argument seriously.',
    'OPEN: "Nobody is awake. Choose the configuration."',
    'DO: Take one honest argument for bypassPermissions first — the "it keeps getting stuck" frustration is real and worth naming.',
    'SAY: The correct response to a stall is to widen allowedTools by one specific tool. Never to skip permissions.',
  ),
  'break:reset-0': L(
    'SITUATION: The break, between CP3 and the failure drills.',
    'ROOM: Break slide up with the return time on it. Phone on the pulse rail.',
    'MOOD: Off. Let them breathe — the break-and-harden segment is the emotional peak.',
    'OPEN: "Five minutes. When we come back, we break everything you just built — on purpose."',
    'DO: Use the break to clear the stuck queue on your phone rail; anyone without a review comment on their PR yet gets a mentor now.',
  ),
  'interaction:failure-950': L(
    'SITUATION: A trap question with a real lesson. Most rooms hunt for the one right answer; the honest answer is all of them.',
    'ROOM: Poll up.',
    'MOOD: Let them argue for one gate, then widen it.',
    'OPEN: "Which single gate saves the morning?"',
    'DO: After the reveal, tie it to Week 9 — reliability is layered, not heroic, and next week is entirely about what happens when a layer fails.',
  ),
  'demos:demos-0': L(
    'SITUATION: Student demonstrations. Two or three screens, the room votes on the strongest.',
    'ROOM: Screen-share ready. Check the pulse rail for who tapped I finished.',
    'MOOD: Celebratory. This is social proof and it is also your testimonial footage.',
    'OPEN: "Three of you are going to show the room a repo that reviews its own pull requests."',
    'DO: Call on students who tapped I finished. Ask each to show one thing: the review comment, the grey merge button, or the refused commit.',
  ),
  'interaction:demos-950': L(
    'SITUATION: Honest read on the CI reviewer. A room that says "mostly noise" is telling you the workflow prompt is too generic — fixable, teachable.',
    'ROOM: Poll up. Two students ready to read their review comment on screen.',
    'MOOD: Honest. Mean it when you ask.',
    'OPEN: "Was the automated review any good? Honest answer."',
    'DO: Have one person from each of the first two groups read their comment out loud.',
    'NOTE: If it was noise, say so and show how the prompt in the workflow is theirs to sharpen. That is the Week 9 homework in disguise.',
  ),
  'broadcast:broadcast-0': L(
    'SITUATION: Builder Broadcast. Thirty to sixty seconds on their phone, five prompts, opt-in.',
    'ROOM: Broadcast slide up with the five prompts. Phones out.',
    'MOOD: Warm. This is the proof they take home.',
    'OPEN: "Record your thirty-second Build Proof: a workflow that runs itself — commands, a hook, and CI review."',
    'DO: Read the five prompts once. Then give them the room to record; do not talk over it.',
    'NOTE: Opt-in becomes the content pipeline. Do not pressure anyone.',
  ),
  /* Four generator slides carried SAY/DO/NOTE but no arrival category, so the
   * arrival screen painted only blue and grey. None of them has a body, so
   * their SAY lines ARE the read screen and are kept verbatim. */
  'rules:result-preview-1': L(
    'SITUATION: The phone-rules slide. Sixty seconds, once, up front.',
    'ROOM: Rules on screen. Watch the pulse rail fill as people scan.',
    'MOOD: Quick and practical.',
    'OPEN: "Scan once now and stay on the class page — your phone is the controller tonight."',
    'SAY: Your phone is your controller for this class. Scan once now and stay connected the whole way through.',
    'SAY: I will ask you questions on it, and I can see when the room is stuck. That is how I know when to slow down.',
    'DO: Wait until you can see people scanning before you advance. Do not talk over it.',
    'NOTE: Everyone scans before you move on — chasing stragglers later costs far more.',
  ),
  'buildmap:build-map-0': L(
    'SITUATION: The build map — the rail for the night. CP0 ready · CP1 commands + hook · CP2 headless · CP3 CI review. The slides use these numbers.',
    'ROOM: Build map full screen. Walk the boxes left to right with your hand, then point at the rescue branch.',
    'MOOD: Steady. This is the contract for the next two hours.',
    'OPEN: "Four checkpoints. We move together — nobody goes past one until the room is through it."',
    'SAY: These are tonight’s checkpoints. We move together — nobody goes past one until the room is through it.',
    'SAY: And if you fall behind, that rescue branch is how you catch up. Nobody gets stranded tonight.',
    'DO: Confirm CP0 with the room before you open the first prompt.',
    'NOTE: Say the safety rails once, plainly, then move.',
  ),
  'beforeafter:cta--1': L(
    'SITUATION: The transformation payoff of the week — two columns, Monday versus now.',
    'ROOM: Both columns on screen. Step back from the keyboard.',
    'MOOD: Quiet pride. Let the slide do the talking.',
    'OPEN: "Look at the left column. That was you walking in on Monday."',
    'SAY: Look at the left column. That was you walking in on Monday.',
    'SAY: Now the right one. Every line there is something you can do tonight that you could not do then.',
    'DO: Pause. Let the two columns sit on screen — do not narrate every row.',
    'NOTE: Reading the rows out loud is what kills it.',
  ),
  'assignment:cta-0': L(
    'SITUATION: The assignment. Last thing they see before they leave; it defines what counts as proof by Friday.',
    'ROOM: Assignment slide up. Class clock already stopped.',
    'MOOD: Clear and unhurried.',
    'OPEN: "Here is what you owe by Friday, and exactly what counts as proof."',
    'SAY: Here is what you owe by Friday, and here is exactly what counts as proof.',
    'SAY: Learn it Monday, build it Thursday, prove it by Friday. That is the rhythm every single week.',
    'DO: Read the proof line off the slide rather than from memory — that is the part people get wrong.',
    'NOTE: Restate it even if you covered it during the build.',
  ),
  'interaction:broadcast-950': L(
    'SITUATION: The last question, and the last rehearsal of the judgment that defines the week.',
    'ROOM: Poll full screen. Last thing on the display tonight.',
    'MOOD: Reflective. One more time, out loud.',
    'OPEN: "One request becomes one guarantee. Which rule did you convert, and why can a script check it?"',
    'DO: Have three people say theirs in a sentence. That is a thirty-second clip worth posting.',
    'NOTE: Stop the class clock. Then the before/after and the assignment.',
  ),
};

module.exports = {
  sessions: [
    { id: 'd0c174bd-15c5-44b7-b1f5-3b6fa764945d', label: 'Week 8 Thu 9/17 (generated slides)', slideNotes: THURSDAY },
  ],
};

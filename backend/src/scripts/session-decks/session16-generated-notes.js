/**
 * session16-generated-notes.js — tagged commentary for the 15 generated slides
 * in Session 16 (Week 8 · Architecture Day, 2026-09-14) that week8-notes.js
 * did not cover: the Architecture Story (which needs spoken SAY lines, having no body), the cover, the phone-rules slide, the break, and all eleven
 * poll/trivia slides.
 *
 * The poll slides already carried specific, authored presenterTips — this is
 * NOT boilerplate replacement. They were untagged, so the phone painted each
 * as one grey "Context" block instead of the colour-coded arrival screen that
 * Sessions 12 and 15 use. Same direction, re-authored to the tagged contract.
 *
 * Companion to session16-week8-monday.js (which tags the 21 teach slides).
 * Vocabulary: SITUATION violet · ROOM blue · MOOD green · OPEN gold · SAY gold ·
 * DO blue · NOTE grey. Keyed `kind:id` — ids are not unique.
 *
 * Apply with applyWeekNotes.js:
 *   node /app/applyWeekNotes.js /app/session16-generated-notes.js
 */

const L = (...lines) => lines.join('\n');

const MONDAY = {
  /* The Architecture Story is the one generated slide with no body, so its
   * read screen is the SAY lines alone. Without them the phone says "keep
   * talking from the diagram" — Ali, 2026-09-14: "Architecture story's should
   * have commentary explaining it." These SAY lines walk the diagram node by
   * node, left to right, and land on the five key points. Supersedes the
   * arrival-only note in week8-notes.js. */
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the biggest teaching block. This is the table of contents for the four surfaces, drawn as one system.',
    'ROOM: Diagram full screen. Walk it LEFT TO RIGHT with your hand: dev workflow, then the three branches, then the diamond, then the CI row underneath.',
    'MOOD: Settle in — this is the longest stretch of teaching tonight, and this slide is the map for all of it.',
    'OPEN: "Four pieces. Two of them give Claude Code new verbs, and two of them take away its ability to do the wrong thing."',
    'SAY: Start on the left. Dev workflow is what you already have — you, in a session, typing prompts. Everything on this slide hangs off that box, and none of it replaces it.',
    'SAY: First branch, custom commands. The prompt you keep retyping becomes a verb — /ship, /review — saved as a file in the repo, so your team inherits it. That is key point one: reusable automation.',
    'SAY: Second branch, hooks. A hook is a shell script the harness runs at a fixed moment — before a tool call, after an edit, before the session ends. It does not read the model’s mind and it does not ask permission. It is the guardrail, and it is the one branch on this slide that is a guarantee rather than a request. Key point two.',
    'SAY: Third branch, headless and the SDK. Same agent, nobody in the chair. It runs one prompt to completion and hands back a JSON receipt. That is key point three — and key point four rides on it: the permission mode you pick decides what an unattended run is allowed to touch.',
    'SAY: Now the diamond. Verification passes? This is the only decision on the slide, and notice it is not the model making it — it is tests, typecheck, a Stop hook. Yes, it auto-ships. No, it is blocked. The model never gets a vote here.',
    'SAY: Bottom row, GitHub Actions and automated code review. That is the same idea one level up, in the pipeline: a reviewer on every pull request that can comment but cannot approve. The required check votes. Key point five.',
    'SAY: So read the whole picture once more. Left side gives the agent reach — verbs and unattended runs. Right side and bottom take away its ability to ship something wrong. Words for judgment, code for boundaries. That is the sentence under all five points.',
    'DO: Ask the room which of the four they think is the guardrail. Take one answer before you reveal it is the hooks.',
    'NOTE: Do not teach the four in depth here — each gets its own slide next. Spend the time on the diamond: the room needs to see that the decision is made by code, not by the model, before any surface is explained.',
  ),
  'cover:cold-open-0': L(
    'SITUATION: Cover. Nothing has happened yet; the room is settling and scanning in.',
    'ROOM: Cover on screen, QR visible. Your phone on the presenter view, class clock NOT yet running.',
    'MOOD: Calm. Let people arrive.',
    'OPEN: "Welcome to Week 8. Get your phone on the class controller — tonight it is doing more work than usual."',
    'DO: Press Start class the moment you begin speaking. The pace bar tracks you from here.',
  ),
  'rules:cold-open-1': L(
    'SITUATION: The phone-rules slide. Same three rules every week; tonight there are eleven questions, so it earns its thirty seconds.',
    'ROOM: Rules on screen. Check the pulse rail shows the room joining.',
    'MOOD: Quick and practical.',
    'OPEN: "Phone out, portal open, stay on the class page. Eleven questions tonight — more than usual, on purpose."',
    'NOTE: Anyone not on the rail by the second question gets a mentor, not a repeat of the instructions.',
  ),
  'interaction:cold-open-950': L(
    'SITUATION: The premise question, asked before any teaching. The answer IS the reason the night exists.',
    'ROOM: Poll full screen. Watch the bars pile onto the middle two options.',
    'MOOD: Non-judgemental. Nobody should feel caught out.',
    'OPEN: "Be honest — has any of it run without you?"',
    'DO: Read the count out loud without comment. Then say it is not a criticism, it is the definition of where they are on the ladder — and tonight we move.',
  ),
  'interaction:checkin-950': L(
    'SITUATION: The prediction question. It pays off in the challenge segment, so it must be asked now and NOT revealed.',
    'ROOM: Poll up. Everyone scans the QR here if they have not already.',
    'MOOD: Light. This is a bet, not a test.',
    'OPEN: "Before we start — make your call."',
    'DO: Take the votes, read the spread, move on. Do not reveal.',
    'NOTE: The reveal is on challenge-950 at the end of the night. Resist explaining anything here.',
  ),
  'interaction:checkin-951': L(
    'SITUATION: Operational readiness — does everyone have a real repo to put tonight into. Not a teaching question.',
    'ROOM: Poll up. Mentors standing, ready to move.',
    'MOOD: Brisk.',
    'OPEN: "Everything tonight lands in YOUR project. Where does yours live?"',
    'DO: Anything but the first option gets a mentor within three minutes.',
    'NOTE: Do not start the architecture segment with people who have nowhere to put what they learn — they will spend the night watching instead of building.',
  ),
  'interaction:business-problem-950': L(
    'SITUATION: The trap question that sets up the whole architecture segment. Both popular answers lead to rewriting the rule harder, which changes nothing.',
    'ROOM: Poll full screen. Expect a split between the first two options.',
    'MOOD: Let them fall into it. The trap is the lesson.',
    'OPEN: "It broke your rule. Whose fault is it?"',
    'DO: Take votes, reveal, then say the line — you can rewrite that rule in bold and it will still be a request.',
  ),
  'interaction:architecture-950': L(
    'SITUATION: The theater poll — the one stop-everything moment of the night. Moved here from the tail on purpose so it never dies to the overrun.',
    'ROOM: Full-screen theater. Lock the votes and show the spread before anyone speaks.',
    'MOOD: Slow down. Ninety seconds of argument is worth more than any slide tonight.',
    'OPEN: "Hook, or instruction? Choose — and be ready to defend it."',
    'DO: Take ONE argument for a wrong answer before revealing. The case for option 1 is genuinely interesting; give it its ninety seconds.',
    'SAY: Anything you can enforce in code should be enforced in code.',
    'NOTE: That sentence is the rule they carry out of the room. Say it once after the reveal, not before.',
  ),
  'interaction:architecture-951': L(
    'SITUATION: Quick check on permission modes, straight after the trust-dial slide.',
    'ROOM: Poll up. Fast one.',
    'MOOD: Brisk — vote, reveal, one line of why, move.',
    'OPEN: "Pick the mode before you pick the task."',
    'NOTE: If a chunk of the room picks bypassPermissions, spend thirty seconds: ask what the worst case is on their own repo, and let them say it out loud.',
  ),
  'interaction:deconstruct-950': L(
    'SITUATION: A real debugging question. Both failure modes in the options will happen to somebody on Thursday.',
    'ROOM: Poll up. Have your own settings.json ready in case someone asks where the matcher lives.',
    'MOOD: Practical. This is a preview of Thursday’s pain, offered kindly.',
    'OPEN: "The hook is silent. Where do you look?"',
    'DO: After the reveal, tell them to write those two checks in their notes — it saves twenty minutes of build time in two days.',
  ),
  'break:reset-0': L(
    'SITUATION: The break. Fifteen minutes between the sandwich picture and hands on keyboards.',
    'ROOM: Break slide up with the return time on it. Your phone on the pulse rail.',
    'MOOD: Off. Let the room breathe — the build segment is dense.',
    'OPEN: "Fifteen minutes. When we come back, you build all of this on your own repo."',
    'DO: Use the break to clear the stuck queue on your phone rail and send mentors to anyone not in their capstone repo yet.',
  ),
  'interaction:micro-build-950': L(
    'SITUATION: Operational gate after micro-build 1 — everyone has a working verb before the hook build starts.',
    'ROOM: Poll up. Call the numbers out loud as they move.',
    'MOOD: Encouraging and a little impatient. This is a gate, not a discussion.',
    'OPEN: "Everyone gets a verb before we move on. Where are you?"',
    'DO: Say the count — "19 of 24, five more." The "file exists but no command" group is almost always in the wrong directory or missing the frontmatter fence.',
    'NOTE: Send a mentor with that one hint and it clears in a minute. Do not troubleshoot from the front.',
  ),
  'interaction:challenge-950': L(
    'SITUATION: The payoff for the prediction they made at check-in. Now it gets revealed.',
    'ROOM: Poll up. Have the check-in spread in mind so you can compare.',
    'MOOD: Satisfying. This is the callback the room has been waiting for.',
    'OPEN: "Remember your call at the start of the night? Time to find out."',
    'DO: Reveal, then tie their prediction to the right architecture — hook for the mechanical rule, instruction for the judgement call.',
  ),
  'interaction:trivia-950': L(
    'SITUATION: Quick check at the tail. Expendable if the clock is gone.',
    'ROOM: Poll up.',
    'MOOD: Fast.',
    'OPEN: "Quick check."',
    'NOTE: Reveal, one line of why, move on. If you are past 20:15, skip it — the trailer poll matters more.',
  ),
  'interaction:trailer-950': L(
    'SITUATION: The closing question, and the Thursday homework in disguise. No correct option.',
    'ROOM: Poll full screen. Last thing on the display tonight.',
    'MOOD: Honest and warm. The last option is the true one for half the room — say so.',
    'OPEN: "No right answer — which rule do you quietly not trust?"',
    'SAY: Whatever you just picked, come on Thursday knowing whether a script could check it. If it could, you are converting it into a hook.',
    'NOTE: That is the homework. One sentence, then stop the class clock.',
  ),
};

module.exports = {
  sessions: [
    { id: '8e8df597-ad52-4b1a-bb5c-b51057e24226', label: 'Week 8 Mon 9/14 (generated slides)', slideNotes: MONDAY },
  ],
};

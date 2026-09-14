/**
 * session16-week8-monday.js — tagged presenter scripts for Session 16,
 * Monday 2026-09-14, "Week 8 · Architecture Day" (Claude Code Workflows +
 * Automation).
 *
 * WHY THIS EXISTS
 * Week 8's authored teach slides (backend/src/data/weeks/week8.ts) carry good
 * direction in `script`, but as untagged prose. `splitScript` renders an
 * untagged script as ONE grey "Context" block on the presenter's arrival
 * screen, so Session 16 looked like an older edition next to Sessions 12, 13
 * and 15, where every teach slide paints SITUATION · ROOM · MOOD · OPEN · DO ·
 * NOTE in its own colour. This file is the same direction, re-authored to the
 * tagged contract.
 *
 * HOW THIS IS BUILT
 * It composes rather than transcribes. Inside the backend container it takes
 * whatever Session 16 currently renders — the saved `teach.overrides` if there
 * is one, otherwise the authored WEEK8_PACK.monday.teach from dist — and
 * replaces ONLY the `script` on each slide, matched by a distinctive fragment
 * of its title. Body, bullets, diagram and code blocks are untouched, so
 * nothing on the projected deck changes; only the phone does.
 *
 * Every other category of the existing KitConfig (slideNotes from
 * week8-notes.js, interactions, story beats, opening) is preserved as-is.
 *
 * Run inside the container:  node /app/session16-week8-monday.js
 * Dry run (no save):         node /app/session16-week8-monday.js --dry
 * Rollback: restore the previous config printed at the top of the run, or set
 * kit_config_json back to NULL to return to the authored deck.
 */

const SID = '8e8df597-ad52-4b1a-bb5c-b51057e24226';

const L = (...lines) => lines.join('\n');

/* Tagged scripts, keyed by a distinctive fragment of each slide's title.
 * Vocabulary: SITUATION violet · ROOM blue · MOOD green · OPEN gold · SAY gold ·
 * DO blue · NOTE grey. OPEN is the first words out of your mouth; the body is
 * the read screen, so it is never repeated here. */
const SCRIPTS = {
  /* ============================ check-in ============================== */
  'every single thing still waits for you to press go': L(
    'SITUATION: First teach slide of Week 8. Seven weeks of building, and the room is about to realise none of it has ever run without them.',
    'ROOM: Diagram up. Nothing to run. Keep your own terminal closed so the question lands as a question, not a demo.',
    'MOOD: Quiet and a little uncomfortable. The silence is the point tonight, not a gap to fill.',
    'OPEN: "Name one thing you built in the last seven weeks that has run since — without you starting it."',
    'DO: Wait. Almost no hands. Hold the silence for four full seconds before you say anything else.',
    'NOTE: Do not rescue the room. That silence is the entire premise of the night and it is worth more than any slide.',
  ),
  'Four surfaces tonight': L(
    'SITUATION: The map for the whole night. Everything after this hangs off the four surfaces and the one question under them.',
    'ROOM: Diagram full screen. Put the four words on the board — commands, hooks, headless, Actions — and leave them up all night.',
    'MOOD: Confident and unhurried. This is the slide they should still be able to draw in Week 12.',
    'OPEN: "Three of these are mechanics you could learn from a doc page in twenty minutes. The fifth one is judgment."',
    'DO: Point at the fifth node and say the promise plainly — judgment takes years to get wrong enough to learn, and they are getting it tonight for free.',
    'NOTE: Do not explain any surface here. Name them, sell the fifth node, move. The architecture segment does the breaking-down.',
  ),

  /* ======================== business problem ========================== */
  'The bottleneck was never the code': L(
    'SITUATION: First business slide. Turn "I forget things" into "the ceremony around every change is where the hours go".',
    'ROOM: Diagram up. Have a marker ready — a number is going on the board and staying there.',
    'MOOD: Level and commercial. This segment gets clipped for social; keep syntax out of it entirely.',
    'OPEN: "Who has done all five of those, by hand, in the last week?"',
    'DO: Take the hands, then ask the follow-up that lands it — "how many times?" Somebody will say a number over ten. Write it on the board.',
    'NOTE: That number stays up until /ship exists in micro-build 1. You will point back at it.',
  ),
  'The reviewer is on vacation': L(
    'SITUATION: The recurring device of the week — the person who is not there. The analyst in Week 2, the one engineer in Week 6, now the reviewer on a beach.',
    'ROOM: Diagram up. This is a story slide; step away from the keyboard.',
    'MOOD: Understated. The detail that lands is the approval that was a rubber stamp because waiting cost more than reading.',
    'OPEN: "Here is the version of this you have actually lived."',
    'DO: Name the lineage out loud — Week 2, Week 6, tonight — so the room hears the same pattern repeating for the third time.',
    'NOTE: Set the hook for Thursday here: that PR gets a real review within ninety seconds of being opened, whether or not anybody is at a desk.',
  ),
  'An instruction is a request': L(
    'SITUATION: The thesis of the week. This is the slide people quote back in Week 10 and again at the Expo.',
    'ROOM: Diagram full screen — the two paths, model versus harness. Have your own CLAUDE.md open in a second window.',
    'MOOD: Slow. Deliberate. Two sentences, said like they matter, then silence.',
    'OPEN: "An instruction is a request. A hook is a guarantee."',
    'DO: Ask one person to read a rule out of their own CLAUDE.md. Then ask the room which side of the diagram it belongs on.',
    'NOTE: Do not answer for them. The argument IS the lesson. If the room agrees too fast, pick a harder rule yourself.',
  ),
  'Removing yourself from the loop removes your judgment': L(
    'SITUATION: The cost slide, and the last one before architecture. It stops the room treating automation as free.',
    'ROOM: Diagram up. This is the trust-ladder moment — say where they are on it.',
    'MOOD: Honest. You are naming a real loss before you sell the replacement.',
    'OPEN: "Week 1 you approved every keystroke. Tonight the system runs on a schedule and coordinates other agents."',
    'SAY: You are giving up the moment where you would have caught it. We are going to replace that moment with something that never gets tired.',
    'NOTE: Straight into the architecture segment from here. No break, no summary — the cost is the cue.',
  ),

  /* ============================ architecture ========================== */
  'All four surfaces live in your repository': L(
    'SITUATION: Segment opener for the biggest teaching block. Before any surface, the room needs to see that all of them are files in a repo.',
    'ROOM: A REAL repo on your screen with .claude/commands, .claude/settings.json, .claude/hooks and .github/workflows in it — yours, not the slide.',
    'MOOD: Matter-of-fact. This is a tour of a folder, not a concept.',
    'OPEN: "None of tonight lives in a settings screen on somebody’s laptop."',
    'DO: This block is READ TOGETHER. Put a finger on settings.json (committed) and settings.local.json (ignored). That split is the whole team-versus-personal design.',
    'NOTE: The line that makes it click — your automation is code, so it is reviewed like code, versioned like code, inherited like code. Nobody has to be told about your /ship. They just have it.',
  ),
  'A custom command is how a repeatable prompt becomes a verb': L(
    'SITUATION: Surface 1 of 4. The simplest surface, and the one everyone will build in micro-build 1.',
    'ROOM: Your session open beside the deck, ready to create ship.md live and type a slash.',
    'MOOD: Light. This one should feel almost too easy — that is the reaction you want.',
    'OPEN: "You have almost certainly typed the same long prompt four times this month."',
    'DO: Create the file live, then type a slash so the room watches /ship appear in the menu with no restart.',
    'DO: Point at allowed-tools and ask what this command can NOT do. Somebody will spot that push and commit are missing — that is the answer you want said out loud.',
    'NOTE: Scoping is a design decision, not a formality. Do not move on until someone in the room has said why the two git verbs are absent.',
  ),
  'A hook is a contract with the harness': L(
    'SITUATION: Surface 2 of 4. The one that feels mysterious until the protocol is on screen, and the protocol is three lines long.',
    'ROOM: Diagram full screen — JSON in, exit code out. Trace it once with your finger before you speak.',
    'MOOD: Demystifying. Slow the pace right down; you are removing fear, not adding information.',
    'OPEN: "The harness hands your script an envelope and asks a yes-or-no question. Your exit code is the answer."',
    'DO: Read the commit-guard block together — read stdin, decide, exit. Name the three events that matter: PreToolUse can veto, PostToolUse reacts, Stop decides whether the session may end.',
    'NOTE: Once a room owns this, hooks stop being scary and become the tool people over-use. That is the next slide’s problem — set it up with one sentence.',
  ),
  'Which of your rules deserve to be code': L(
    'SITUATION: The judgment call — the hard part of the night and the reason the week exists. This is where the theater poll runs.',
    'ROOM: Diagram up. Have four candidate rules ready to read aloud. The poll fires from this slide, not from the challenge segment.',
    'MOOD: Argumentative, in a good way. Let the room disagree with each other.',
    'OPEN: "Not every rule should be a hook — and a room that just learned about exit code 2 will try to make everything one."',
    'DO: Read the four rules one at a time and make the room vote hook or instruction BEFORE you reveal. The one that splits every room is "always add a test for new behaviour."',
    'SAY: Coverage is checkable. Usefulness is not.',
    'NOTE: Sit in that argument; do not resolve it early. Close on the right-hand branch of the diagram — a hook that fires wrongly gets turned off within a week, and a disabled hook protects nothing.',
  ),
  'Headless mode: the same agent': L(
    'SITUATION: Surface 3 of 4. The first time tonight something runs with nobody in the chair.',
    'ROOM: A terminal ready with a scoped -p run you have already tested, and a way to pretty-print the JSON that comes back.',
    'MOOD: Concrete. Run first, explain second.',
    'OPEN: "Nobody touched the keyboard, and it handed back a receipt."',
    'DO: Run it live. Pretty-print the JSON. Point at is_error and total_cost_usd — that receipt is the difference between automation and hoping.',
    'NOTE: Mention the SDK in ONE line — same engine as a library, query() from TypeScript or Python — and promise they wire it Thursday. Do not detour into SDK syntax.',
  ),
  'Permission mode is the single most consequential line': L(
    'SITUATION: The trust dial. It gets its own slide because this is exactly where unattended work goes wrong — and the 2 AM story in the next segment depends on it.',
    'ROOM: Diagram up — the four modes. Have the settings.json deny list ready to read aloud.',
    'MOOD: Serious but not scary. There is a right answer and the reasoning matters more than the answer.',
    'OPEN: "Your routine runs at 3 AM on your capstone repo. Which mode?"',
    'DO: Take votes on all four before you reveal. The answer is acceptEdits plus a deny on push.',
    'DO: Read the deny list out loud, slowly. This routine can build and commit; it cannot ship, cannot destroy history, cannot read a secret.',
    'NOTE: Land the reasoning, not the answer — what is the worst thing that happens if it goes wrong? An uncommitted mess you read over coffee. Least privilege turned a catastrophe into a Tuesday.',
  ),
  'A reviewer that is never on vacation': L(
    'SITUATION: Surface 4 of 4, and the keystone of the week. It closes the loop on the reviewer-on-vacation story from the business segment.',
    'ROOM: Diagram up. If you have a real PR with a Claude review comment and a green required check, have it in a tab.',
    'MOOD: Decisive. This is the sentence the week is built around; say it like a rule.',
    'OPEN: "The AI review talks. The test job votes."',
    'DO: Say why that split is not timidity — a reviewer that can approve its own work is a rubber stamp with extra steps.',
    'NOTE: Close the opening story here: the reviewer on vacation still gets to be the human who approves; they just no longer block the first read. Then straight into the 2 AM run.',
  ),

  /* ============================ deconstruct =========================== */
  'It ran at two in the morning': L(
    'SITUATION: The failure story. The whole deconstruct segment is forensics on this one run.',
    'ROOM: Diagram up. Step away from the keyboard — this is told, not shown.',
    'MOOD: Slow, and without a villain. That is what makes it frightening.',
    'OPEN: "Here is a real shape of failure, and it looks completely healthy the whole way through."',
    'SAY: Nobody wrote a bad prompt. Nobody was careless. The configuration was wrong, and configuration is invisible at 2 AM.',
    'NOTE: Set up the next slide as forensics rather than blame — we are going to find every place a five-line guardrail would have ended this.',
  ),
  'Four gates it walked straight past': L(
    'SITUATION: The forensics. Four cheap controls, and the failure only had to beat zero of them.',
    'ROOM: Timeline on the board. You will put a visible X at each of the four points as you name them.',
    'MOOD: Methodical. This is a checklist being built in front of them, gate by gate.',
    'OPEN: "Replay it, and mark the misses."',
    'DO: Draw the four X marks — permissions, PostToolUse typecheck, Stop gate, deny on push. Then ask: "which of these four would you personally have thought of before tonight?"',
    'NOTE: The honest answer is usually one. That gap is exactly what a checklist is for, and why this is forensics rather than a lecture on best practice.',
  ),
  'Probabilistic in the middle, deterministic on both sides': L(
    'SITUATION: The shape of safe — the founding principle of the whole program drawn as one picture. Last slide before hands go on keyboards.',
    'ROOM: Draw the sandwich on the board, literally: bread, filling, bread. Then the diagram.',
    'MOOD: Calm and a little triumphant. Everything tonight has been building to this picture.',
    'OPEN: "None of the four gates make the model smarter. Look at what they have in common instead."',
    'SAY: The filling is brilliant and unpredictable. The bread is boring and guaranteed. You do not fix unpredictability by making the model boring; you fix it by controlling the boundaries.',
    'NOTE: Tell them to keep this picture — on Thursday they build both slices with their own hands on their own repo. Then break, then build.',
  ),

  /* ============================ micro-build =========================== */
  'Open YOUR capstone repo': L(
    'SITUATION: Stage-setting for the build. Nothing is taught here; the only job is making sure every person is in their own project.',
    'ROOM: Walk the room. Screens, not the deck.',
    'MOOD: Brisk and practical. Two minutes, then move.',
    'OPEN: "This is not a sandbox exercise. Open the repository your build plan lives in."',
    'DO: Physically check that people are in their own capstone repo. Every cohort has three students who quietly do the whole night in a throwaway folder and keep nothing.',
    'NOTE: Catch them here, in the first two minutes, not at the break. Remind the room every block tonight is a prompt — Claude Code drives the terminal, they never do.',
  ),
  'Turn the prompt you keep retyping into a verb': L(
    'SITUATION: Micro-build 1 — the first custom command, on their own project. The number on the board from the business segment pays off here.',
    'ROOM: Prompt block on screen. Point at the number you wrote on the board earlier.',
    'MOOD: Encouraging. This is the easy win of the night; let them enjoy it.',
    'OPEN: "Pick the thing you have typed at Claude Code more than three times on this project."',
    'DO: Make everyone say their retyped prompt out loud to a neighbour BEFORE pasting. A vague answer here produces a useless command.',
    'DO: Have two people read theirs to the room. The specific ones produce visibly better files and the room notices — which saves you an argument.',
    'NOTE: Insist on allowed-tools. An unscoped command is a habit they will regret on Thursday when it inherits the routine’s permissions.',
  ),
  'Nine lines, and only one of them is a security decision': L(
    'SITUATION: Read-together slide. The room just generated a file; now they read it with you.',
    'ROOM: Open the REAL generated file on your screen, not this slide. The slide is your safety net if Claude Code drifted.',
    'MOOD: Focused. One question, one pause, one answer.',
    'OPEN: "There are only two things worth putting your finger on."',
    'DO: Ask, then wait: "if you deleted the allowed-tools line, what would this command be able to do?"',
    'NOTE: The answer — anything the session can — is the reason scoping is not optional. Do not supply it; let somebody in the room get there.',
  ),
  'a hook that fires on every single edit': L(
    'SITUATION: Micro-build 2 — the guarantee. This is the part that changes what their project IS, and it carries the sentence of the week.',
    'ROOM: Prompt block on screen. Have your own CLAUDE.md open so you can delete a formatting line live when the moment comes.',
    'MOOD: Build energy, then one full stop. The deletion is the teaching moment, not the hook.',
    'OPEN: "Commands are convenience. This is the part that changes what your project is."',
    'DO: When somebody removes a formatting line from their CLAUDE.md, STOP the room and have them read it out.',
    'SAY: That line has been a polite request for six weeks. It is now a fact.',
    'NOTE: That is the sentence that carries the week. Say it once, clearly, and do not explain it.',
  ),
  'One small unattended run on your own repo': L(
    'SITUATION: Micro-build 3, and the close. Seven weeks of nothing running without them ends here.',
    'ROOM: Prompt block on screen. Clock visible — this is the block that runs long, and the challenge and trivia still follow.',
    'MOOD: Quietly momentous. Do not oversell it; let the git diff do the talking.',
    'OPEN: "Last thing tonight: take yourself out of the loop for one small, safe, reversible task on your own project."',
    'DO: Have people run git diff afterwards and actually look at what a machine did to their project while they sat there. Their hook fired inside the run — point at the formatting nobody asked for.',
    'SAY: Seven weeks and nothing had ever run without you. Something just did.',
    'NOTE: Point at Thursday explicitly — a routine on a schedule, a hook that blocks a red commit, and a reviewer who is never on vacation. Tell them to bring the repo with Actions enabled.',
  ),
};

const TAGS = /^(SAY|DO|NOTE|SITUATION|ROOM|MOOD|OPEN):/;
const ARRIVAL = ['SITUATION', 'ROOM', 'MOOD', 'OPEN'];

/* Validate every script to the same contract applyWeekNotes.js enforces:
 * every line tagged, and every arrival category present. */
function lintScripts(scripts) {
  const bad = [];
  Object.entries(scripts).forEach(([key, v]) => {
    const lines = String(v).split('\n').filter(Boolean);
    const cats = new Set(lines.map((l) => (TAGS.exec(l.trim()) || [])[1]).filter(Boolean));
    if (lines.some((l) => !TAGS.test(l.trim()))) bad.push(key + ': untagged line');
    ARRIVAL.forEach((c) => { if (!cats.has(c)) bad.push(key + ': missing ' + c); });
  });
  return bad;
}

/* Overlay the tagged scripts on a list of teach slides, matched by title
 * fragment. Throws if any fragment matches no slide or matches more than one,
 * and if any slide is left without a tagged script — a silent partial apply
 * is exactly the failure this file exists to remove. */
function compose(teach) {
  const used = new Set();
  const out = teach.map((s) => {
    const hits = Object.keys(SCRIPTS).filter((frag) => (s.title || '').includes(frag));
    if (hits.length !== 1) {
      throw new Error(`slide "${s.title}" matched ${hits.length} script fragments (${hits.join(' | ')})`);
    }
    used.add(hits[0]);
    return { ...s, script: SCRIPTS[hits[0]] };
  });
  const unused = Object.keys(SCRIPTS).filter((k) => !used.has(k));
  if (unused.length) throw new Error('scripts with no slide: ' + unused.join(' | '));
  return out;
}

module.exports = { SID, SCRIPTS, compose, lintScripts };

/* Executed directly inside the container: compose, save, read back, report. */
if (require.main === module) {
  const dry = process.argv.includes('--dry');
  const lint = lintScripts(SCRIPTS);
  if (lint.length) {
    console.error('LINT FAIL\n  ' + lint.join('\n  '));
    process.exit(1);
  }

  const { WEEK8_PACK } = require('/app/dist/data/weeks/week8');
  const { getKitConfig, saveKitConfig } = require('/app/dist/services/sessionKitConfigService');
  const { splitScript } = require('/app/dist/services/classKit/kitHtml');

  (async () => {
    const before = await getKitConfig(SID);
    // Print the previous config so a rollback never depends on memory.
    console.log('BEFORE ' + JSON.stringify(before));

    const existing = before && before.teach && Array.isArray(before.teach.overrides) && before.teach.overrides.length
      ? before.teach.overrides
      : null;
    const base = existing || WEEK8_PACK.monday.teach;
    console.error(`base = ${existing ? 'saved teach.overrides' : 'authored WEEK8_PACK.monday.teach'} (${base.length} slides)`);

    const teach = compose(base);
    const config = {
      ...before,
      teach: { ...(before.teach || { enabled: true, max: null }), overrides: teach },
    };

    if (dry) {
      console.error('DRY RUN — not saving. ' + teach.length + ' slides would be written.');
      process.exit(0);
    }

    await saveKitConfig(SID, config);

    // Verify from the database, not from the object in memory.
    const after = await getKitConfig(SID);
    const saved = (after.teach && after.teach.overrides) || [];
    const untagged = saved.filter((s) => !TAGS.test(String(s.script || '').split('\n')[0] || ''));
    const shared = saved.filter((s) => {
      const sp = splitScript(s.script, s.body);
      return sp.setup && sp.say && sp.setup.includes(sp.say);
    });
    console.error(`SAVED teach=${saved.length} untagged=${untagged.length} screensShareText=${shared.length} `
      + `slideNotes=${Object.keys(after.slideNotes || {}).length}`);
    if (saved.length !== base.length || untagged.length || shared.length) {
      console.error('VERIFY FAIL');
      process.exit(1);
    }
    process.exit(0);
  })().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
}

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
    'DO: Run the prompt — it surveys THEIR repo and reports EXISTS/MISSING. Then put a finger on settings.json (committed) versus settings.local.json (ignored). That split is the whole team-versus-personal design.',
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
    'DO: Run the prompt — it writes commit-guard.sh and simulates a blocked and an allowed call. Point at the two exit codes when they appear. Name the three events that matter: PreToolUse can veto, PostToolUse reacts, Stop decides whether the session may end.',
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
    'ROOM: Prompt block on screen. Your own session open so you can show the composed command if theirs drifts.',
    'MOOD: Concrete. Run first, explain second.',
    'OPEN: "Nobody touched the keyboard, and it handed back a receipt."',
    'DO: Run the prompt — it COMPOSES the command and explains the five flags without executing it. Point at --allowedTools and --max-turns. The real run, and the JSON receipt, is micro-build 3 after the break.',
    'NOTE: Mention the SDK in ONE line — same engine as a library, query() from TypeScript or Python — and promise they wire it Thursday. Do not detour into SDK syntax.',
  ),
  'Permission mode is the single most consequential line': L(
    'SITUATION: The trust dial. It gets its own slide because this is exactly where unattended work goes wrong — and the 2 AM story in the next segment depends on it.',
    'ROOM: Diagram up — the four modes. Have the settings.json deny list ready to read aloud.',
    'MOOD: Serious but not scary. There is a right answer and the reasoning matters more than the answer.',
    'OPEN: "Your routine runs at 3 AM on your capstone repo. Which mode?"',
    'DO: Take votes on all four before you reveal. The answer is acceptEdits plus a deny on push. Then run the prompt — it writes that deny list into THEIR settings.json.',
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

/* Every code block is a Claude Code PROMPT. Ali, 2026-09-14, as class started:
 * "All the prompts should be prompts in the code section. I don't like these
 * review together scripts. They should all be prompts where we can at least
 * learn something." The seven `kind: 'review'` blocks Week 8 authored (the
 * repo map, ship.md, commit-guard.sh, the rule-two-ways, the headless anatomy,
 * the permissions block, the finished command file) become prompts that make
 * Claude Code build or inspect the same thing IN THE STUDENT'S OWN REPO and
 * explain it back. The teaching is inside the prompt. Keyed by the same title
 * fragments as SCRIPTS; slides not listed keep their authored code block. */
const CODE = {
  'All four surfaces live in your repository': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — map the automation layer of THIS repo',
    code: 'Show me the automation layer of this repository. Do not create or change anything — this is a survey.\n\nCheck each of these paths and report EXISTS or MISSING, with one line on what it would do if it existed:\n  .claude/settings.json          # hooks + permissions — COMMITTED, the team contract\n  .claude/settings.local.json    # my personal overrides — git-ignored\n  .claude/commands/              # one Markdown file per slash command; filename becomes the verb\n  .claude/hooks/                 # the guardrail scripts the harness runs\n  .github/workflows/             # the reviewer and the required check that run in CI\n\nThen answer three things plainly:\n1. Which of these would a teammate get automatically by cloning this repo, and which would they NOT get? (Check .gitignore to answer, do not guess.)\n2. Why is settings.json committed while settings.local.json is ignored? One sentence.\n3. Is there anything in this repo today that automates my workflow — or does every single thing still wait for me to type?\n\nRun the checks yourself. Do not print commands for me to copy.',
    expectedResult: 'A five-row EXISTS/MISSING table for your own repo, the committed-versus-ignored split explained, and an honest answer to question 3 — which for most of the room tonight is "nothing runs without you".',
    stopCondition: 'You can say which one file is the team contract and which one is personal, and why.',
    rescue: 'If it starts creating files, stop it — this is a survey. Re-paste and say "report only".',
  },
  'A custom command is how a repeatable prompt becomes a verb': {
    kind: 'paste', pasteWhere: 'Claude Code', ccMode: 'Plan Mode',
    label: 'Claude Code prompt — write /ship for this project, and scope it',
    code: 'Create a custom slash command at .claude/commands/ship.md for this project — the ceremony after every change, written down once.\n\nFrontmatter:\n  description: Test, format, and draft a PR for the current change\n  argument-hint: [pr-title]\n  allowed-tools: ONLY the tools the steps below literally need. Look at package.json (or the equivalent) and use this project\'s REAL test and format commands, not npm placeholders.\n\nBody, as numbered steps:\n  1. Run the test command. If anything fails, STOP and report the failures. Do not continue.\n     # WHY: verification is step one, and step one is allowed to say no.\n  2. On green, run the formatter and stage the changes.\n  3. Read the staged diff and draft a PR description titled $ARGUMENTS, with a Summary, a Test Evidence line quoting the passing output, and a Risk note.\n     # WHY: $ARGUMENTS is whatever I type after /ship — the title travels into the body.\n\nBefore you write the file: list every tool you will put in allowed-tools and justify each one. git push and git commit must NOT be in the list — this command prepares a change and must be structurally unable to ship one. Say that out loud.\n\nThen create it, and tell me how to confirm /ship now exists in my session without restarting.',
    expectedResult: 'A ~nine-line ship.md using your project\'s real commands, a justification for every tool, and /ship appearing in the slash menu the moment the file exists — no restart.',
    stopCondition: 'You typed / in your session and saw /ship in the menu, and you can say what this command CANNOT do.',
    rescue: 'If allowed-tools came back wide open, that is the normal first draft — tell it to remove every tool the three steps do not literally require. If /ship does not appear, check the file is at the repository root under .claude/commands/, not somewhere else.',
  },
  'A hook is a contract with the harness': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — write commit-guard.sh and prove the protocol',
    code: 'Create .claude/hooks/commit-guard.sh in this project and make it executable. Do NOT wire it into settings.json yet — that is the next step.\n\nThe protocol is three moving parts, and the script should be nothing more than them:\n  1. Read the JSON payload the harness pipes on stdin.\n     # WHY: the harness hands your script an envelope describing what is about to happen.\n  2. Pull out .tool_input.command and decide. If the command matches `git push --force` or `rm -rf /`, print one line to stderr saying why it is blocked and exit 2.\n     # WHY: exit 2 from a PreToolUse hook vetoes the tool call, and stderr becomes the reason Claude sees.\n  3. Otherwise exit 0.\n     # WHY: exit 0 means proceed. The exit code is the entire API.\n\nIf jq is not installed on this machine, use a dependency-free way to read the field (node, python, or plain shell) and tell me which you chose and why.\n\nThen prove it without wiring it: feed the script a fake payload containing a forbidden command and one containing a safe command, show me both exit codes and the stderr line, and explain what each exit code would have meant to the harness.\n\nRun everything yourself. Do not print commands for me to copy.',
    expectedResult: 'A short script, executable, and two simulated runs: exit 2 with a reason for the forbidden command, exit 0 for the safe one.',
    stopCondition: 'You can say the three moving parts out loud — read stdin, decide, exit — and what exit 2 does.',
    rescue: 'If the script is longer than about fifteen lines it is doing too much. Tell it to strip everything that is not read-decide-exit.',
  },
  'Which of your rules deserve to be code': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — wire the guard, then sort MY rules into words and code',
    code: 'Two jobs. First wire the hook, then sort my rules.\n\nJOB 1 — wire it. Add a PreToolUse hook to .claude/settings.json (create the file if needed; never touch settings.local.json) with matcher "Bash" that runs $CLAUDE_PROJECT_DIR/.claude/hooks/commit-guard.sh.\n  # WHY: $CLAUDE_PROJECT_DIR makes the path portable for everyone who clones the repo.\n  # WHY: it runs before EVERY Bash call, interactive and headless alike — the model has no vote.\nTell me plainly: do I need to review this in /hooks or restart the session before it takes effect? Check how hooks are loaded and give me a straight answer.\n\nJOB 2 — read my CLAUDE.md (if there is none, say so and use three typical rules instead). Put every rule in one of two columns:\n  CODE  — a script could check it without understanding intent (tests green, no secret in the diff, no push to main, files formatted)\n  WORDS — it needs a reader who understands intent (naming, tone, "explain the trade-off")\nFor each rule in CODE, name the hook event that would enforce it. For each rule in WORDS, say in one line why no script could grade it.\n\nThen the honest part: is there a rule in CODE that I have been leaving as words and hoping? Name it. That is the one I convert on Thursday.',
    expectedResult: 'A hooks block in settings.json pointing at your guard script, a straight answer on when it takes effect, and your own CLAUDE.md sorted into two columns — with the rule you have been hoping about named.',
    stopCondition: 'You can point at one of your own rules and say which column it belongs in and why.',
    rescue: 'If it puts "always add a test for new behaviour" in CODE, push back — coverage is checkable, usefulness is not. That argument is the lesson. If the hook does not fire later, open /hooks, review the change, or restart the session.',
  },
  'Headless mode: the same agent': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — compose (do not run) one scoped headless command',
    code: 'Compose — but do NOT run — the exact `claude -p` command for one small unattended task on this project. We run one for real after the break; right now I want to see the leash before anything is let off it.\n\nThe task: add a one-line doc comment to every exported function in ONE small source file of this project. Pick the file and tell me why you picked it.\n\nThe command must use all five of these, and you explain each one in one line — what it protects me from:\n  -p                    # WHY: no conversation. It runs to completion and exits.\n  --permission-mode acceptEdits   # WHY: nobody is here to approve anything, so say so up front.\n  --allowedTools "Read" "Edit"    # WHY: THE leash. Read and Edit only — it cannot run commands.\n  --output-format json            # WHY: a program has to read the result, not a person.\n  --max-turns 10                  # WHY: the stop. Without it "keep trying" has no upper bound.\n\nThen answer two questions: which single flag, if I deleted it, would let this run execute shell commands? And which one, if deleted, would let it loop forever?\n\nPrint the finished command. Do not execute it.',
    expectedResult: 'One complete five-flag command aimed at a real file in your repo, each flag explained as a protection, and the two "if you deleted this" answers — allowedTools and max-turns.',
    stopCondition: 'You can say what each of the five flags is protecting you from.',
    rescue: 'If it runs the command anyway, stop it and re-paste with "compose only" at the top. Watching the CLI get assembled is the lesson here; running it is micro-build 3.',
  },
  'Permission mode is the single most consequential line': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — write the least-privilege permissions for an unattended run',
    code: 'Add a permissions block to .claude/settings.json in this project for an unattended 3 AM run. Keep any hooks block already in the file. Never touch settings.local.json.\n\nallow:\n  Read, Edit\n  this project\'s real test command and real format command (check package.json or the equivalent; tell me what you found)\n  the git add and git commit commands\n  # WHY: it can build and it can commit. That is the whole job.\ndeny:\n  the commands git push, git reset --hard, and rm -rf\n  Read of .env and of any secrets folder\n  # WHY: it cannot ship, cannot destroy history, and cannot read a secret. Deny beats allow in every mode.\n\nUse the Bash(command:*) and Read(path) pattern syntax and show me the finished JSON.\n\nThen read the deny list back to me and, for each entry, one line: what goes wrong at 3 AM without it.\n\nLast question, answer yes or no first: with this file in place, can an unattended run on this repo push code to GitHub? Then explain which line makes that true.',
    expectedResult: 'A permissions block using your project\'s real commands, five "what goes wrong at 3 AM" lines, and a plain "no" — push is denied, so the worst case is an uncommitted mess you read over coffee.',
    stopCondition: 'You can read your own deny list out loud and say why each line is there.',
    rescue: 'If it adds bypassPermissions or drops the deny on git push, that is exactly the 2 AM story from the next segment. Tell it no and ask it to explain the worst case without that line.',
  },
  'Nine lines, and only one of them is a security decision': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — audit the command file you just wrote',
    code: 'Open the custom command file you just created in .claude/commands/ and audit it with me. Do not change the body.\n\n1. Print the file.\n2. Name the ONLY line in it that constrains anything.\n   # WHY: the body is just a prompt — plain English, nothing to learn. allowed-tools is the single enforcement line.\n3. Tell me exactly what this command could do if I deleted allowed-tools: list the tools it would inherit from this session right now.\n   # WHY: a command with no allowed-tools inherits the session\'s permissions, which grow over time — and on Thursday that means inheriting the unattended routine\'s permissions.\n4. If allowed-tools contains Edit or Write and my numbered steps never need to change a file, remove them and show me the diff. If the steps genuinely need them, say so and leave them.\n5. Finish with one sentence: what can this command physically NOT do now?',
    expectedResult: 'Your own file printed, allowed-tools named as the one enforcement line, the inherited-tools list that shows why omitting it is dangerous, and a tighter list if it was wider than the steps need.',
    stopCondition: 'You can say out loud what your command cannot do, and why deleting one line would change that.',
    rescue: 'If it says "the body is also a constraint", correct it — the body is a request; only allowed-tools is a guarantee. That is Monday’s thesis inside a file they just wrote.',
  },
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
    const code = CODE[hits[0]] ? { ...s.code, ...CODE[hits[0]] } : s.code;
    return { ...s, script: SCRIPTS[hits[0]], ...(code ? { code } : {}) };
  });
  const unused = Object.keys(SCRIPTS).filter((k) => !used.has(k));
  if (unused.length) throw new Error('scripts with no slide: ' + unused.join(' | '));
  const unusedCode = Object.keys(CODE).filter((k) => !used.has(k));
  if (unusedCode.length) throw new Error('code overrides with no slide: ' + unusedCode.join(' | '));
  const review = out.filter((x) => x.code && x.code.kind !== 'paste');
  if (review.length) throw new Error('non-prompt code blocks remain: ' + review.map((x) => x.title).join(' | '));
  const SHELL_LINE = new RegExp('(^|\\n)\\s*(npm |npx |cd |sudo |node |curl |git )');
  const terminal = out.filter((x) => x.code && (/TERMINAL/i.test(x.code.pasteWhere || '') || SHELL_LINE.test(x.code.code || '')));
  if (terminal.length) throw new Error('terminal-shaped code blocks: ' + terminal.map((x) => x.title).join(' | '));
  return out;
}

module.exports = { SID, SCRIPTS, CODE, compose, lintScripts };

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
    const nonPrompt = saved.filter((s) => s.code && s.code.kind !== 'paste');
    console.error(`SAVED teach=${saved.length} untagged=${untagged.length} screensShareText=${shared.length} `
      + `codeBlocks=${saved.filter((s) => s.code).length} nonPrompt=${nonPrompt.length} `
      + `slideNotes=${Object.keys(after.slideNotes || {}).length}`);
    if (saved.length !== base.length || untagged.length || shared.length || nonPrompt.length) {
      console.error('VERIFY FAIL');
      process.exit(1);
    }
    process.exit(0);
  })().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
}

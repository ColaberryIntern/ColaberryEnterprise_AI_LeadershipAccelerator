/**
 * session17-week8-thursday.js — Session 17, Thursday 2026-09-17,
 * "Week 8 · Build Day" (Claude Code Workflows + Automation). Brings the deck
 * to the same standard Session 16 reached on Monday:
 *
 *   1. Every teach slide's `script` is tagged (SITUATION · ROOM · MOOD · OPEN ·
 *      DO · SAY · NOTE) so the presenter phone paints the arrival screen in
 *      colour instead of one grey block. Week 8's authored scripts are prose.
 *   2. Every code block is a Claude Code PROMPT (Ali, 2026-09-14: "All the
 *      prompts should be prompts in the code section … where we can at least
 *      learn something"). Five blocks change: the three `kind: 'review'`
 *      read-alongs (the two command files, the guard script, the anti-pattern)
 *      and the two hand-pasted YAML workflow files, which hardcoded npm
 *      commands and would have been wrong for every non-Node project in the
 *      room. Claude Code now writes them against the project's real commands.
 *   3. Checkpoint numbering. The checkpoint rail is NOT overridable and reads
 *      CP0 Ready · CP1 commands + hook · CP2 headless · CP3 CI review. The
 *      authored eyebrows counted CP1 verbs · CP2 guard · CP3 headless · CP4 CI,
 *      so the slide and the rail would have disagreed all night. The eyebrows
 *      and the roadmap slide's checkpoint list now follow the rail.
 *
 * Composes, does not transcribe: takes what Session 17 currently renders (the
 * saved teach.overrides if any, else WEEK8_PACK.thursday.teach from dist) and
 * overlays only `script`, `code`, `eyebrow` and — for the roadmap slide alone —
 * `body`/`bullets`, matched by a fragment of each title. Everything else in the
 * KitConfig (slideNotes, interactions, story beats, opening) is preserved.
 *
 * Run inside the container:  node /app/session17-week8-thursday.js [--dry]
 * Rollback: the BEFORE line printed at the top of the run, or NULL the column.
 */

const SID = 'd0c174bd-15c5-44b7-b1f5-3b6fa764945d';

const L = (...lines) => lines.join('\n');

/* ------------------------------------------------------------ scripts ---- */
const SCRIPTS = {
  'your repo reviews its own pull requests': L(
    'SITUATION: The roadmap. Four checkpoints in a fixed order, and the order IS the lesson — guardrails before autonomy.',
    'ROOM: A finished pull request in a tab — one with a real AI review comment and a green required check. Show it BEFORE this slide is explained.',
    'MOOD: Decisive. This is a contract for the night, said like one.',
    'OPEN: "By 8:30 your repo reviews its own pull requests and refuses its own bad commits."',
    'DO: Put the checkpoints up as a progress bar and say the rule: we do not skip, and we do not reorder.',
    'NOTE: The rail counts CP0 ready · CP1 commands + hook · CP2 headless · CP3 CI. Use those numbers all night; the slides now match them.',
  ),
  'Five green lights': L(
    'SITUATION: CP0. Two minutes here saves an hour later — the headless and CI steps fail silently on a repo that is not quite right.',
    'ROOM: Pulse rail visible. This is a roll call, run from the phone, not a lecture.',
    'MOOD: Brisk and a little strict. Nobody starts CP1 red.',
    'OPEN: "Five green lights, or you lose the night to setup."',
    'DO: Read the counts aloud. The one people fake is the test command — ask two students to show real test output on screen.',
    'NOTE: A build day where half the room discovers at 7:45 that they have no test command is a build day you do not finish. Send mentors to that group first.',
  ),
  'Build /ship': L(
    'SITUATION: CP1, first verb. The ceremony they named in readiness becomes a command, and verification is step one of it.',
    'ROOM: Prompt block on screen. Your own /ship ready to run on a real change.',
    'MOOD: Energetic. This is the first thing they build tonight and it should feel quick.',
    'OPEN: "Start with the thing you named in readiness. That ritual becomes a verb."',
    'DO: Have everyone run /ship on a real change. Then break a test on purpose and run it again so the room watches it refuse.',
    'SAY: Verification is not a step at the end. It is step one, and step one can say no.',
    'NOTE: Watch for npm test on a Python project — it means the first instruction was skipped. Make Claude Code correct itself; nobody edits the file by hand.',
  ),
  'Build /review': L(
    'SITUATION: CP1, second verb. A reviewer that structurally cannot edit — the local rehearsal of what goes into CI at the end of the night.',
    'ROOM: Prompt block on screen. Something staged in your own repo so /review has a diff to read.',
    'MOOD: Socratic. There is one question on this slide and you wait for the answer.',
    'OPEN: "Your second command is a reviewer that changes nothing."',
    'DO: Ask, then wait: the body already says do not edit anything — why also remove the Edit tool?',
    'NOTE: Somebody will get there: an instruction is a request, the tool list is a guarantee. Monday’s thesis inside a file they just wrote — it lands harder here than on a slide.',
  ),
  'Two files, and the one line in each': L(
    'SITUATION: Audit stop after the two verbs. Ninety seconds, then straight to the hook — that is where the night turns.',
    'ROOM: The prompt opens THEIR two files, not the slide. Your own review.md open in case theirs drifted.',
    'MOOD: Quick and focused. Two fingers on two lines, then move.',
    'OPEN: "Before we go further, look at what you actually have."',
    'DO: Run the prompt. It prints both files and names the one enforcing line in each. Have two people read theirs out.',
    'NOTE: Do not line-by-line these files or you lose ten minutes of the build segment. The hook is what matters.',
  ),
  'The commit-guard: no green tests, no commit': L(
    'SITUATION: CP1, the guarantee. The most important thing they build tonight — it is what makes CP2’s autonomy defensible.',
    'ROOM: Prompt block on screen. Slow the room down before anyone pastes.',
    'MOOD: Weighty. Say the sentence and let it sit before hands move.',
    'OPEN: "The line you are about to write is the one that makes everything after it safe."',
    'SAY: From this moment a red build cannot become a commit in this repository. Not when you are tired. Not at 2 AM.',
    'DO: Make sure every single person makes the script executable. Ask for a show of hands that the chmod ran.',
    'NOTE: Silent hook failure is the number-one time-sink of this class, and it looks identical to success. A script without the executable bit lets everything through.',
  ),
  'Fourteen lines, and one of them is the whole safety model': L(
    'SITUATION: Read the guard they just wrote, together. The early exit is the design decision; the exit 2 is the guarantee.',
    'ROOM: The prompt prints THEIR script and simulates a blocked and an allowed call. Point at the two exit codes when they appear.',
    'MOOD: Reflective. This is the nuance that separates people who have run hooks in anger from people who have read about them.',
    'OPEN: "Look at what Claude Code wrote. Three moving parts, and one number that does all the work."',
    'DO: Point at the early exit 0 and ask why it is there.',
    'SAY: A hook that interrupts you constantly gets commented out within a week, and then it protects nothing at all.',
  ),
  'Break a test on purpose and watch your own repo refuse you': L(
    'SITUATION: CP1, prove it. A guardrail you have not seen fire is a guardrail you do not believe in yet.',
    'ROOM: Prompt block on screen. Clock visible — this is ninety seconds, not ten minutes.',
    'MOOD: Insistent. Nobody skips this.',
    'OPEN: "Break one test, ask for a commit, and watch your own sentence come back at you."',
    'DO: Show of hands on "I personally saw it refuse". Wait until it is nearly everybody before moving on.',
    'NOTE: The students who skip the proof are the ones who discover during CP2 that their hook was never running. Committed on red = not executable, or exiting 0. Check those two before the matcher.',
  ),
  'Decide what an unattended run may touch': L(
    'SITUATION: CP2 begins — hands off the wheel, but the first move is the scope, not the run.',
    'ROOM: Prompt block on screen. Have your own settings.json deny list ready to read aloud.',
    'MOOD: Sober. One question matters here and everyone answers it out loud.',
    'OPEN: "If this thing goes completely wrong tonight while I am asleep, what is the worst state I find in the morning?"',
    'DO: Make every student say their own worst-case sentence to a neighbour before moving on.',
    'NOTE: That sentence is what they will say to a manager who asks whether this is safe. It is more persuasive than the config block that produced it. If Claude Code proposed denying nothing project-specific, push back — every real project has a deploy or migration command.',
  ),
  'The permission mode is the decision': L(
    'SITUATION: CP2, let go. The theater poll fires here — the mode is chosen deliberately, not copied off the slide.',
    'ROOM: Full-screen theater. Lock the votes, show the spread, take ONE argument for bypassPermissions before revealing.',
    'MOOD: The one stop-everything moment of the night. Slow down.',
    'OPEN: "Nobody is awake. Choose the configuration — and be ready to say why."',
    'DO: After the reveal, run the prompt live on your own repo and read the receipt aloud: ok, turns, cost, and the commit you did not type.',
    'SAY: Nobody touched the keyboard, and it still could not commit a red build. That is not luck. That is the hook you built twenty minutes ago.',
    'NOTE: If someone stalls on a permission, the fix is ONE specific tool added to the leash. Never --dangerously-skip-permissions — that is how Monday’s story starts.',
  ),
  'Wrap the run in the SDK': L(
    'SITUATION: CP2, hand it to a scheduler. The one-liner becomes a component a program owns.',
    'ROOM: Prompt block on screen. Be ready to say "TypeScript or Python — the SDK is the same shape in both".',
    'MOOD: Composition energy. This is the actual definition of the job they are training for.',
    'OPEN: "Same task, now inside code you own."',
    'DO: Make the idempotency question do real work — have three people read their two-sentence answer aloud.',
    'NOTE: Week 9 is entirely about running things twice safely. Asking it here means they arrive next week already uncomfortable, which is where you want them. A retry loop inside the script is wrong — retries belong to the scheduler.',
  ),
  'Put a reviewer on every pull request': L(
    'SITUATION: CP3, the reviewer. The payoff for Monday’s opening story, and the emotional peak of the night.',
    'ROOM: Prompt block on screen. GitHub open in a tab so the room can watch comments land together.',
    'MOOD: Anticipation. Wait for the comments as a room; do not fill the silence.',
    'OPEN: "This is the payoff for the reviewer who was on vacation."',
    'DO: Everyone opens a throwaway PR and waits together for the review comments. When they land, close Monday’s loop out loud.',
    'SAY: The reviewer is still on vacation. The pull request got read anyway, in ninety seconds, and when she comes back she is reading a PR somebody already went through.',
    'NOTE: Workflow did not run? Actions tab not enabled, or ANTHROPIC_API_KEY missing from repository secrets. The run fails instantly and clearly if the secret is missing.',
  ),
  'The AI review talks': L(
    'SITUATION: CP3, the gate. The least glamorous file of the night and the one an executive will find most reassuring.',
    'ROOM: Prompt block on screen. Branch-protection settings open in a tab for the demonstration.',
    'MOOD: Plain. Say the line, let it sit, then show the grey button.',
    'OPEN: "The AI review talks. The test job votes."',
    'DO: Have somebody push a deliberately failing test to their open PR so the room watches the merge button go grey.',
    'NOTE: That grey button is the single most reassuring image you can give a nervous executive. The check only appears in the branch-protection list after it has run once — push a commit, then select it.',
  ),
  'Recreate the 2 AM disaster': L(
    'SITUATION: The BREAK segment. Everything built tonight is only convincing once they have seen its absence — on a branch they will throw away.',
    'ROOM: Do it live on your own screen first so nobody has to be brave. Throwaway branch, no real credentials in scope.',
    'MOOD: Quiet. Sit in it for a beat. This is the highest-retention ninety seconds of the week.',
    'OPEN: "Everything you built tonight is only convincing if you have seen what its absence looks like."',
    'DO: Run the prompt. It strips the guard on a throwaway branch, commits a broken change with a confident message, and shows a clean log. Then it shows the tests failing.',
    'SAY: No one wrote a bad prompt. The configuration was wrong, and configuration does not announce itself.',
    'NOTE: Do not rush past this into the fix. Nothing about it looks wrong while it is happening — that is the observation.',
  ),
  'One boring fix per break': L(
    'SITUATION: The HARDEN segment. Same task, same model, same prompt — and a completely different outcome, because the boundaries are code.',
    'ROOM: Prompt block on screen. Your own hardened run ready so the comparison is on one screen.',
    'MOOD: Unglamorous on purpose. The fixes are boring and that is the point.',
    'OPEN: "Now repair it, and notice how boring every fix is."',
    'DO: Ask the room which of the three fixes they would have thought of unprompted a week ago. Usually one, sometimes none.',
    'SAY: You did not make the model safer. You made the boundaries deterministic.',
    'NOTE: That is the sentence to leave with, and exactly the sentence Week 10 builds governance on top of. If it pushes anyway, settings.json is not denying push — that is the finding, write it down.',
  ),
  'turn one sentence in your CLAUDE.md into something that cannot be ignored': L(
    'SITUATION: The close. Four minutes: one rule they trust least becomes a hook before they leave.',
    'ROOM: Your own CLAUDE.md open — you run the conversion live first, DEAD rows included.',
    'MOOD: Honest and a little proud. Admitting some of your own governance is dead weight is the most credible thing you can do in this class.',
    'OPEN: "Open your CLAUDE.md. Find the rule you admitted on Monday you trust least."',
    'DO: Run the conversion on your own project so they see a real three-bucket table. Then they run theirs.',
    'SAY: Week 1 you approved every keystroke. Tonight it runs on a schedule and reviews other people’s work. Next week we find out what happens when it breaks — because nobody has ever tested that.',
    'NOTE: Stop the class clock before the last two lines. Then the demos and the broadcast.',
  ),
};

/* --------------------------------------------------- eyebrows (rail) ---- */
/* The checkpoint rail is generated from classSessionPlan and cannot be
 * overridden: CP0 Ready · CP1 Automated locally (commands + hook) ·
 * CP2 Headless · CP3 CI review. Eyebrows follow it. */
const EYEBROWS = {
  'Five green lights': '🧰 CP0 · Readiness',
  'Build /ship': '1️⃣ CP1 · The verb',
  'Build /review': '2️⃣ CP1 · The second verb',
  'Two files, and the one line in each': '👀 CP1 · Audit both',
  'The commit-guard: no green tests, no commit': '3️⃣ CP1 · The guarantee',
  'Fourteen lines, and one of them is the whole safety model': '👀 CP1 · Audit the guard',
  'Break a test on purpose and watch your own repo refuse you': '4️⃣ CP1 · Prove it',
  'Decide what an unattended run may touch': '5️⃣ CP2 · Scope it',
  'The permission mode is the decision': '6️⃣ CP2 · Let go',
  'Wrap the run in the SDK': '7️⃣ CP2 · Hand it to a scheduler',
  'Put a reviewer on every pull request': '8️⃣ CP3 · The reviewer',
  'The AI review talks': '9️⃣ CP3 · The gate',
};

/* The roadmap slide names the checkpoints in its body and bullets; those
 * follow the rail too. Only this one slide has its content touched. */
const ROADMAP = {
  body: 'Four checkpoints, in an order that is not negotiable. CP0 is readiness. CP1 is the local automation: two custom commands that encode the ceremony you do by hand, then the guarantee — a hook that blocks a commit on a red build, which is the thing that makes everything after it safe. CP2 is the autonomy: a scoped headless run and an SDK wrapper a scheduler can own. CP3 is the reach: automated review on every pull request, plus the deterministic check that actually decides whether anything merges. We build guardrails before autonomy because the reverse order is how the 2 AM story from Monday happens.',
  bullets: [
    'CP0 — readiness: repo on GitHub, Actions on, a test command that runs',
    'CP1 — automated locally: /ship and /review, then the commit-guard hook',
    'CP2 — headless: scoped permissions, an unattended run, an SDK routine',
    'CP3 — CI review on every PR + a required verification check',
    'Order is the lesson: guardrails first, then you let go of the wheel',
  ],
};

/* ------------------------------------------------------------- code ----- */
const CODE = {
  'Two files, and the one line in each': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — audit /ship and /review, the two files you just wrote',
    code: 'Open .claude/commands/ship.md and .claude/commands/review.md — the two files you just created in this project — and audit them with me. Do not change either body.\n\n1. Print both files.\n2. In each one, name the ONLY line that constrains anything.\n   # WHY: the body is plain English — nothing about it is programming. allowed-tools is the single enforcing line.\n3. Say plainly what each command physically cannot do: /ship cannot commit or push; /review cannot edit anything. If either allowed-tools line makes that untrue, fix the line and show me the diff.\n4. Tell me what each command would inherit if I deleted its allowed-tools line — list the tools this session has right now.\n   # WHY: a command with no allowed-tools inherits the session’s permissions, which grow over time. On CP2 that means inheriting the unattended routine’s permissions.\n5. Confirm both files are tracked by git, so a teammate inherits the standard and not a story about it.\n\nOne screen, ninety seconds. Run the checks yourself; do not print commands for me to copy.',
    expectedResult: 'Both files printed, allowed-tools named as the one enforcing line in each, both "cannot" statements true (or made true), the inherited-tools list, and both files tracked.',
    stopCondition: 'You can point at one line in each file and say out loud what that command cannot do.',
    rescue: 'If it says the body is also a constraint, correct it — the body is a request; only allowed-tools is a guarantee.',
  },
  'Fourteen lines, and one of them is the whole safety model': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — read the guard you wrote, then watch both exit codes',
    code: 'Open .claude/hooks/commit-guard.sh — the one you just wrote — and walk me through it. Do not change it unless step 4 says so.\n\n1. Print it. Name the three moving parts: read stdin, decide, exit.\n   # WHY: there is no framework here. The entire protocol is the number the script exits with.\n2. Point at the early exit 0 for anything that is not a git commit and explain why it is a design decision, not an optimisation.\n   # WHY: a hook that fires when it should not gets commented out by Friday, and then it protects nothing at all.\n3. Point at the exit 2 and at the stderr line. Say who reads that line.\n   # WHY: stderr is not logging — it is the message Claude sees and acts on.\n4. Confirm the script is executable and that it uses THIS project’s real test command, not a placeholder. Fix either if wrong and show me the diff.\n5. Now prove it without committing anything: feed the script a fake hook payload whose command is "git commit -m x" and one whose command is "ls", and show me both exit codes.\n\nRun everything yourself. Do not print commands for me to copy.',
    expectedResult: 'Your own script explained in three parts, the early exit and the exit 2 both pointed at, executable bit and real test command confirmed, and two simulated runs: exit 2 for the commit (on red) or 0 (on green), exit 0 for ls.',
    stopCondition: 'You can say which single line blocks anything, and why the early exit keeps the hook alive.',
    rescue: 'If the fake commit payload exits 0 while your tests are red, the script is exiting 0 instead of 2 — or it is not reading the command from stdin. Fix that before CP2; the whole safety model depends on it.',
  },
  'Put a reviewer on every pull request': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — write the CI reviewer workflow for THIS repo',
    code: 'Create .github/workflows/claude-review.yml in this repository — a reviewer on every pull request who is never on vacation.\n\nThe workflow must:\n1. Trigger on pull_request with types [opened, synchronize].\n   # WHY: every push to the branch gets read again, not just the first one.\n2. Set permissions to contents: read and pull-requests: write.\n   # WHY: it may comment. It may not change code.\n3. Check out with actions/checkout@v4 and fetch-depth: 0.\n   # WHY: a shallow clone cannot see the whole diff.\n4. Run anthropics/claude-code-action@v1 with anthropic_api_key from ${{ secrets.ANTHROPIC_API_KEY }} — NEVER a literal key in the file.\n   # WHY: a key in a YAML in a repo is a key that is already stolen.\n5. Use a review prompt in my words: review for correctness, security, and compliance with this repository’s CLAUDE.md; inline comments on specific lines; any committed secret flagged FIRST and as CRITICAL; recommend only — do NOT approve, do NOT merge.\n6. Scope claude_args to read tools only: --allowedTools Read,Grep,Glob,Bash(git diff:*).\n   # WHY: it comments and structurally cannot touch my code.\n\nShow me the file. Then tell me the two things I must do in the browser before it can run: enable the Actions tab, and add ANTHROPIC_API_KEY as a repository secret — or tell me how /install-github-app does both. Do not commit or push; I open the throwaway PR myself.',
    expectedResult: 'A committed-ready workflow file with the key as a secret and read-only tools, plus the two browser steps — and, after your throwaway PR, real review comments on the diff within a couple of minutes.',
    stopCondition: 'You are looking at an AI review comment on a pull request in your own repository.',
    rescue: 'Workflow did not run? Check the Actions tab is enabled and that ANTHROPIC_API_KEY exists in repository secrets — the run fails instantly and clearly if the secret is missing.',
  },
  'The AI review talks': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — write the deterministic merge gate, then protect the branch',
    code: 'Create .github/workflows/verify.yml in this repository — the job that actually decides whether anything merges. No AI in it at all.\n\n1. Look at this project and tell me its REAL install, typecheck and test commands (package.json, pyproject, Makefile — whatever this project uses). Do not assume npm.\n2. Write a workflow that triggers on pull_request [opened, synchronize], checks out, sets up the right runtime, installs, typechecks, and runs the tests. One job, named test.\n   # WHY: a reviewer that can approve its own work is a rubber stamp with extra steps. The merge decision goes to something completely deterministic.\n3. Show me the file.\n4. Then tell me exactly where in GitHub I make it a required status check: Settings → Branches → rule for the default branch → "Require status checks to pass before merging" → select test.\n   # WHY: now nothing merges on red — not my change, not a routine’s change, not a change the AI reviewer said looked great.\n5. Tell me why the check will not appear in that list until it has run once.\n\nDo not commit or push. I do that, and I turn on the rule myself.',
    expectedResult: 'A verify.yml using your project’s real commands, the exact branch-protection path, and — once the rule is on — a merge button that goes grey when the check is red.',
    stopCondition: 'You have seen the merge button blocked by a failing required check at least once.',
    rescue: 'Check not appearing in the branch-protection list? It only shows up after it has run once — push a commit to the PR, then go back and select it.',
  },
  'Recreate the 2 AM disaster': {
    kind: 'paste', pasteWhere: 'Claude Code',
    label: 'Claude Code prompt — recreate the 2 AM run on a throwaway branch, safely',
    code: 'We are going to reproduce Monday’s 2 AM disaster on a throwaway branch, so I can see what the absence of every guardrail looks like. Nothing leaves this machine.\n\n1. Create and switch to a branch called break-it-on-purpose.\n2. Temporarily take the commit-guard out of .claude/settings.json (keep a copy of the block — you put it back in step 6). Say out loud what is now missing.\n   # GAP 2 — nothing verifies. "Done" will mean "the model stopped", not "it works".\n3. Rename the main exported function in one file and update its callers — and deliberately miss ONE caller, so an import breaks at runtime.\n4. Commit it WITHOUT running the tests, with a clear, confident, well-written commit message. Show me git log -1 and tell me whether anything about it looks wrong.\n   # GAP 1 — nothing was scoped. Anything the model could reach, it could use.\n5. Now run the tests and show me the failure — the one the commit never consulted.\n   # GAP 3 — at 2 AM this commit would have been pushed. Do NOT push it. Tell me what a push here would have meant for a shared branch.\n6. Put the commit-guard block back exactly as it was, switch back to my previous branch, and confirm the guard is wired again.\n\nEnd with the three gaps named in one line each. Never use --dangerously-skip-permissions for any of this; the point is to see the gaps, not to open them for real.',
    expectedResult: 'A clean-looking commit with a confident message that hides a broken import, a red test run the commit never consulted, no push, and the guard restored — with the three gaps named.',
    stopCondition: 'Somebody can say why skipping permissions is not the same thing as a scope, and why nothing about the commit looked wrong while it was happening.',
    rescue: 'If the guard blocked the commit in step 4, the settings.json change did not take effect — the hook is still wired. That is good news about your guard; open /hooks to reload, or restart the session, and try again.',
  },
};

/* ----------------------------------------------------------- compose ---- */
const TAGS = /^(SAY|DO|NOTE|SITUATION|ROOM|MOOD|OPEN):/;
const ARRIVAL = ['SITUATION', 'ROOM', 'MOOD', 'OPEN'];
const SHELL_LINE = new RegExp('(^|\\n)\\s*(npm |npx |cd |sudo |node |curl |git )');

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

function compose(teach) {
  const used = new Set();
  const out = teach.map((s) => {
    const hits = Object.keys(SCRIPTS).filter((frag) => (s.title || '').includes(frag));
    if (hits.length !== 1) throw new Error(`slide "${s.title}" matched ${hits.length} script fragments (${hits.join(' | ')})`);
    const frag = hits[0];
    used.add(frag);
    const next = { ...s, script: SCRIPTS[frag] };
    if (CODE[frag]) next.code = { ...s.code, ...CODE[frag] };
    if (EYEBROWS[frag]) next.eyebrow = EYEBROWS[frag];
    if (frag === 'your repo reviews its own pull requests') Object.assign(next, ROADMAP);
    return next;
  });
  const unused = Object.keys(SCRIPTS).filter((k) => !used.has(k));
  if (unused.length) throw new Error('scripts with no slide: ' + unused.join(' | '));
  [CODE, EYEBROWS].forEach((m) => {
    const orphans = Object.keys(m).filter((k) => !used.has(k));
    if (orphans.length) throw new Error('override keys with no slide: ' + orphans.join(' | '));
  });
  const review = out.filter((x) => x.code && x.code.kind !== 'paste');
  if (review.length) throw new Error('non-prompt code blocks remain: ' + review.map((x) => x.title).join(' | '));
  const terminal = out.filter((x) => x.code && (/TERMINAL/i.test(x.code.pasteWhere || '') || SHELL_LINE.test(x.code.code || '')));
  if (terminal.length) throw new Error('terminal-shaped code blocks: ' + terminal.map((x) => x.title).join(' | '));
  return out;
}

module.exports = { SID, SCRIPTS, CODE, EYEBROWS, ROADMAP, compose, lintScripts };

if (require.main === module) {
  const dry = process.argv.includes('--dry');
  const lint = lintScripts(SCRIPTS);
  if (lint.length) { console.error('LINT FAIL\n  ' + lint.join('\n  ')); process.exit(1); }

  const { WEEK8_PACK } = require('/app/dist/data/weeks/week8');
  const { getKitConfig, saveKitConfig } = require('/app/dist/services/sessionKitConfigService');
  const { splitScript } = require('/app/dist/services/classKit/kitHtml');

  (async () => {
    const before = await getKitConfig(SID);
    console.log('BEFORE ' + JSON.stringify(before));
    const existing = before && before.teach && Array.isArray(before.teach.overrides) && before.teach.overrides.length
      ? before.teach.overrides : null;
    const base = existing || WEEK8_PACK.thursday.teach;
    console.error(`base = ${existing ? 'saved teach.overrides' : 'authored WEEK8_PACK.thursday.teach'} (${base.length} slides)`);

    const teach = compose(base);
    const config = { ...before, teach: { ...(before.teach || { enabled: true, max: null }), overrides: teach } };
    if (dry) { console.error('DRY RUN — not saving. ' + teach.length + ' slides would be written.'); process.exit(0); }

    await saveKitConfig(SID, config);
    const after = await getKitConfig(SID);
    const saved = (after.teach && after.teach.overrides) || [];
    const untagged = saved.filter((s) => !TAGS.test(String(s.script || '').split('\n')[0] || ''));
    const shared = saved.filter((s) => { const sp = splitScript(s.script, s.body); return sp.setup && sp.say && sp.setup.includes(sp.say); });
    const nonPrompt = saved.filter((s) => s.code && s.code.kind !== 'paste');
    console.error(`SAVED teach=${saved.length} untagged=${untagged.length} screensShareText=${shared.length} `
      + `codeBlocks=${saved.filter((s) => s.code).length} nonPrompt=${nonPrompt.length} slideNotes=${Object.keys(after.slideNotes || {}).length}`);
    if (saved.length !== base.length || untagged.length || shared.length || nonPrompt.length) { console.error('VERIFY FAIL'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
}

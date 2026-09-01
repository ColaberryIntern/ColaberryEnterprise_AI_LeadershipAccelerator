/**
 * session15-week7-combined.js — builds the KitConfig for Session 15,
 * Thursday 2026-09-10, "Week 7 · Architecture + Build Day".
 *
 * WHY A COMBINED SESSION
 * Monday 2026-09-07 is Labor Day. Rather than adding a makeup night, Week 7's
 * Architecture Day and Build Day run as one 150-minute class on the Thursday.
 * The Monday session is cancelled and is NOT being updated.
 *
 * HOW THIS IS BUILT
 * This composes rather than transcribes. It runs inside the backend container,
 * requires the authored WEEK7_PACK from dist, and assembles the combined deck
 * from slides that already exist:
 *
 *   • SIX architecture slides lifted from week7.monday, re-segmented to
 *     'guided-build' and placed FIRST, so the 63-minute guided-build block
 *     reads "learn subagents, then build them".
 *   • The authored week7.thursday build slides, minus two that the
 *     architecture block now covers.
 *
 * WHY guided-build AND NOT build-map
 * The run-of-show scales proportionally, so at 150 minutes `build-map` is only
 * 12 minutes while this architecture content needs ~25. Teaching it there
 * would show the instructor as badly behind for the whole first hour.
 * guided-build is 63 minutes and is one continuous block, so the pace tracker
 * stays honest.
 *
 * WHICH SIX, AND WHY
 * Monday authors 22 teach slides. These six are the ones Thursday's build
 * actually depends on — every other Monday slide is either motivation the
 * result-preview already covers, or a micro-build that Thursday's checkpoints
 * supersede:
 *   core idea      — what a subagent IS (nothing works without it)
 *   the real reason — a window you can throw away (the insight)
 *   three pillars   — schema / obstacles / leash → becomes CP1's contract
 *   least privilege — one frontmatter line → becomes CP2b and Break #1
 *   hub not chain   — they never talk to each other → becomes CP3
 *   the rule        — delegate a track, never an errand or the verification
 *
 * CHECKPOINTS
 * Week 7's buildMap is CP0-CP3 and all four checkpoints survive, so the
 * non-overridable checkpoint slides stay accurate. checkpointsEnabled is left
 * true deliberately.
 *
 * Run inside the container:  node session15-week7-combined.js
 */

/* Six architecture slides to lift, by a distinctive fragment of their title. */
const LIFT = [
  'A subagent is a separate Claude',
  'You are not buying more brains',
  'A subagent you can act on has a schema',
  'One line in the frontmatter',
  'Subagents never talk to each other',
  'Delegate a track',
];

/* Thursday build slides the architecture block now covers — dropped to make
 * room. Both are framing slides, not checkpoints; no checkpoint is lost. */
const DROP_FROM_BUILD = [
  'Three roles, deliberately unequal',   // the roster — covered by hub-not-chain
  'Before you build a team, decide',     // delegation budget — covered by the rule
];

/* Tagged presenter scripts for the six lifted slides. They arrive on Thursday
 * without Monday's run-up, so each needs direction written for THIS class.
 * Same vocabulary as everywhere else: SITUATION violet · ROOM blue ·
 * MOOD green · OPEN gold · SAY gold · DO blue · NOTE grey. */
const L = (...lines) => lines.join('\n');
const LIFTED_SCRIPTS = {
  'A subagent is a separate Claude': L(
    'SITUATION: First teaching slide of the combined class. Monday did not happen, so this is the room’s FIRST contact with subagents. Assume nothing.',
    'ROOM: Diagram up. Nobody has hands on keyboards yet — say that out loud so they stop typing.',
    'MOOD: Slow and plain. This is a definition, and everything tonight rests on it.',
    'OPEN: "A subagent is a separate Claude with its own context window. That is the entire definition. Everything else tonight is a consequence of that sentence."',
    'DO: Ask who has used /agents before. If more than a couple of hands go up, speed up; if none, slow down and take the next slide carefully.',
    'NOTE: Because Monday was Labor Day, do not reference "as we said on Monday" anywhere tonight. There is no Monday to refer back to.',
  ),
  'You are not buying more brains': L(
    'SITUATION: The insight slide. If only one idea survives tonight, it is this one.',
    'ROOM: Diagram up. Point at the context window filling with noise, then at it being discarded.',
    'MOOD: This is the "oh" moment — leave a beat after the line.',
    'OPEN: "Everyone assumes delegation is about getting more brains on the problem. It is not."',
    'SAY: You are not buying more brains. You are buying a window you can throw away.',
    'DO: Ask the room what happens to their main context after a long exploration. Take one answer, then land the line.',
  ),
  'A subagent you can act on has a schema': L(
    'SITUATION: The three pillars — this becomes the contract they build at CP1, so it has to land before the build starts.',
    'ROOM: Diagram up. Count the three pillars on your fingers as you name them.',
    'MOOD: Practical. This is the build spec, not philosophy.',
    'OPEN: "Three things separate a subagent you can act on from one that just talks at you."',
    'DO: Have the room say the three back to you — schema, obstacles, leash. They will write all three at CP1.',
    'NOTE: Obstacles is the one people skip. An agent that cannot tell you what blocked it is an agent you have to redo by hand.',
  ),
  'One line in the frontmatter': L(
    'SITUATION: Least privilege. This is the security control of the night and it pays off twice — at CP2b and again in Break #1.',
    'ROOM: Diagram up. Put a finger on the tools line in the frontmatter.',
    'MOOD: Firm. This one has a right answer.',
    'OPEN: "One line in the frontmatter decides whether an agent can hurt you."',
    'SAY: An explorer with write access is not an explorer. It is an editor you have not read yet.',
    'NOTE: Tell them now that you WILL take this line away later tonight and let their read-only agent write to a file. Flagging it early makes the drill land harder.',
  ),
  'Subagents never talk to each other': L(
    'SITUATION: The topology. Gets it right before CP3, where they orchestrate three agents.',
    'ROOM: Diagram up — hub and spokes. Trace every path THROUGH the centre with your hand.',
    'MOOD: Corrective. Most people assume a chain, and the picture does the arguing.',
    'OPEN: "Subagents never talk to each other. You are the only wire between them."',
    'DO: Ask what would have to be true for agent two to see agent one’s findings. The answer — you pass it — is the whole lesson.',
  ),
  'Delegate a track': L(
    'SITUATION: The judgement slide, and the last one before the build. It is what stops them delegating everything tonight.',
    'ROOM: Diagram up. This is the last slide before hands go on keyboards — say so.',
    'MOOD: Direct. This is a rule, delivered as a rule.',
    'OPEN: "Delegate a track. Never delegate an errand, and never delegate the verification."',
    'SAY: A subagent you did not need is the most expensive way to avoid two tool calls.',
    'DO: Ask for one example of an errand somebody was about to delegate. Correct it out loud, kindly.',
    'NOTE: Never delegate the verification is the half people drop. Checking the work is the job that stayed yours.',
  ),
};

/* Commentary for the generated slides — the eight that ship on boilerplate. */
const SLIDE_NOTES = {
  'segment:result-preview-0': L(
    'SITUATION: Opening slide of a combined class. Monday was a holiday, so this room has had nine days off and no architecture session. Reset them.',
    'ROOM: Have a WORKING three-agent run ready to demo on your screen.',
    'MOOD: Warm restart. Acknowledge the gap before you start teaching.',
    'OPEN: "No class Monday, so tonight is both halves of Week 7. We learn the team, then we build it. Two and a half hours, one break."',
    'DO: Say the shape of the night out loud — about 25 minutes of architecture, then we build, then we break it on purpose.',
    'NOTE: Tonight ends at 21:00, not 20:30. Say that at the top so nobody is surprised at 20:25.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening story beat. It frames the jump from one worker to a bench of them.',
    'ROOM: Story card full screen. Step away from the keyboard.',
    'MOOD: Unhurried. You have 150 minutes tonight — this does not need rushing.',
    'OPEN: "On Monday you had a worker. Tonight you get a bench."',
    'NOTE: Tell it, let it land, move. The architecture block starts right after and it is dense.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — the first subagent, with a real contract. The single biggest step of the night.',
    'ROOM: Your own explorer agent open, so you can show a real .md file rather than describe one.',
    'MOOD: Encouraging. The spread widens here more than anywhere else.',
    'OPEN: "Checkpoint one. One agent, pointed at the part of your project you could not explain."',
    'DO: VERIFY the contract, not the file — ask who got a report back in the shape they specified, not just who has an agent.',
    'NOTE: Do not advance on the pulse rail alone. An agent that runs and returns prose is not done; the schema is the checkpoint.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — three agents with scoped tools. The least-privilege lesson becomes real here.',
    'ROOM: Watch the clock. CP3 and the failure drills still have to fit.',
    'MOOD: Brisk. Two agents added, same pattern as the first.',
    'OPEN: "Checkpoint two. Three roles now, deliberately unequal — and only one of them can write."',
    'DO: Ask specifically who gave their editor a narrower tool list than their explorer. That inequality IS the checkpoint.',
    'NOTE: Anyone whose three agents all have the same tools has built one agent three times. Say that plainly.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — the coordinated run. This is the deliverable, and the one most likely to run long.',
    'ROOM: Clock visible. If the room is not here by 20:20, cut the third failure drill, not the harden step.',
    'MOOD: Steady. Do not let anyone panic about finishing.',
    'OPEN: "Checkpoint three. One real change from your build plan, driven through all three."',
    'DO: Have one person name the change they pushed through. Naming a real one makes it real for the room.',
    'NOTE: The orchestration is theirs, not the agents’. If someone says the agents coordinated themselves, correct it — they are the only wire.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The master-key story, sitting just before the build. It is the human version of least privilege.',
    'ROOM: Story card full screen. Sixty seconds.',
    'MOOD: Conversational. This one usually gets a nod.',
    'OPEN: "The surveyor does not carry the master key, and nobody thinks that is an insult."',
    'NOTE: This is the story to call back to during Break #1, when their read-only agent writes to a file.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: Opens the failure segment. You are about to break their agents on purpose — frame it as a drill, not a setback.',
    'ROOM: Story card up. Have your own unleashed agent ready to demonstrate.',
    'MOOD: Light. This segment should feel like play.',
    'OPEN: "The safest possible time for your read-only agent to escape is right now, while I am standing here."',
    'DO: Say plainly that everything they break in the next twenty minutes is intentional, so nobody thinks they have ruined their build.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: The most expensive failure of the night — believing a report that was never checked. Last beat before harden.',
    'ROOM: Story card full screen. If you have a real example of a confident-but-wrong agent report, show it.',
    'MOOD: Serious, briefly. This is the one that costs people money at work.',
    'OPEN: "It said it was done."',
    'SAY: Never delegate the verification. Checking the work is the job that stayed yours.',
    'NOTE: Ties straight back to the delegation rule from the architecture block. Point at it explicitly — that callback is why the rule was taught first.',
  ),
};

/* ------------------------------------------------------------------ build -- */
function compose(pack) {
  const pick = (slides, fragment) => slides.find((s) => (s.title || '').includes(fragment));

  const lifted = LIFT.map((frag) => {
    const s = pick(pack.monday.teach, frag);
    if (!s) throw new Error('architecture slide not found: ' + frag);
    return {
      ...s,
      segment: 'guided-build',
      eyebrow: '🏛️ Architecture · ' + (s.eyebrow || '').replace(/^[^\s]+\s*/, ''),
      script: LIFTED_SCRIPTS[frag] || s.script,
    };
  });

  const build = pack.thursday.teach.filter(
    (s) => !DROP_FROM_BUILD.some((frag) => (s.title || '').includes(frag)),
  );

  // Architecture first, then the build. Within guided-build the deck keeps
  // authored order, so prepending the lifted slides puts the teaching ahead of
  // CP0 without touching any checkpoint.
  const nonGuided = build.filter((s) => s.segment !== 'guided-build');
  const guided = build.filter((s) => s.segment === 'guided-build');
  return [...nonGuided, ...lifted, ...guided];
}

module.exports = { LIFT, DROP_FROM_BUILD, LIFTED_SCRIPTS, SLIDE_NOTES, compose };

/* Executed directly inside the container: compose, save, report. */
if (require.main === module) {
  const SID = '77c424c8-9ca7-4cbf-9c5f-c1a7ececfe4a';
  const { WEEK7_PACK } = require('/app/dist/data/weeks/week7');
  const { saveKitConfig } = require('/app/dist/services/sessionKitConfigService');

  const teach = compose(WEEK7_PACK);

  // Patch CP0 in case the container predates the week7.ts terminal fix, so the
  // combined session is prompt-only regardless of deploy order.
  const cp0 = teach.find((s) => (s.title || '').includes('Scaffold the folder'));
  if (cp0 && cp0.code && /TERMINAL/i.test(cp0.code.pasteWhere || '')) {
    cp0.code = {
      ...cp0.code,
      kind: 'paste',
      pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — create the home for your team',
      code: 'Set up the home for this project’s subagent team.\n\n1. First confirm where we are. Print the repository root and the current git remote, and tell me whether this is my capstone project rather than some other folder. If you are not confident, stop and ask me before creating anything.\n2. Create .claude/agents/ at the REPOSITORY ROOT — project scope, not ~/.claude/agents. Explain in one line why project scope is the right choice here.\n3. Confirm the folder exists and show me it is empty.\n4. Tell me whether this path is already covered by .gitignore. This folder is meant to be committed, so if it would be ignored, say so now.\n\nDo not create any agent files yet.',
      expectedResult: 'The repo root confirmed out loud, an empty .claude/agents/ inside YOUR project, and a clear answer on whether git will track it.',
      stopCondition: 'The folder exists at the repository root and you have seen the path printed back.',
      rescue: 'If it created the folder somewhere else, tell it to print the repo root first and try again.',
    };
  }

  const config = {
    storyBeats: { enabled: true, max: null, overrides: null },
    theaterEnabled: true,
    buildBayDetail: true,
    checkpointsEnabled: true,
    evidenceOverrides: null,
    teach: { enabled: true, max: null, overrides: teach },
    prompts: { enabled: true, max: null, overrides: null },
    interactions: { enabled: true, max: null, overrides: null },
    slideNotes: SLIDE_NOTES,
    opening: {
      coldOpen: { enabled: true, override: null },
      hook: { enabled: true, override: null },
      resultPreview: {
        enabled: true,
        override: {
          title: 'Tonight you get both halves of Week 7',
          body: 'No class Monday, so this is Architecture and Build in one sitting: your project gets a team of three specialised agents, scoped so only one of them can write, driving one real change from your own build plan.',
        },
      },
    },
  };

  saveKitConfig(SID, config)
    .then((m) => {
      const t = m.teach.overrides || [];
      const seg = {};
      t.forEach((s) => { seg[s.segment] = (seg[s.segment] || 0) + 1; });
      console.error('SAVED teach=' + t.length + ' slideNotes=' + Object.keys(m.slideNotes || {}).length);
      console.error('  lifted architecture: ' + t.filter((s) => (s.eyebrow || '').includes('Architecture ·')).length);
      console.error('  by segment: ' + JSON.stringify(seg));
      process.exit(0);
    })
    .catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
}

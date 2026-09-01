/**
 * session13-week6-thursday-notes.js — presenter commentary for the generated
 * slides in Session 13 (Week 6 · Build Day, 2026-09-03).
 *
 * Thursday needed far less of this than Monday did. Its authored content
 * already carries specific direction on nearly every slide — 35 of 43. Only
 * eight were still on boilerplate:
 *
 *   • the result-preview segment opener      ("Show the finished result first…")
 *   • all four story beats                   ("Change of pace — tell the story…")
 *   • three of the four checkpoint slides    (one identical line repeated)
 *
 * The checkpoint slides are the interesting case. CP1 is authored ("Everyone
 * starts here. Confirm CP0 before the first prompt.") but CP2/CP3/CP4 all
 * shared one line — "Wait for the pulse to catch up before the next
 * checkpoint." That is true of every checkpoint, which is what makes it
 * useless: it tells the instructor nothing about THIS checkpoint. Each now
 * says what to actually verify before letting the room move on.
 *
 * Same tagged vocabulary as everywhere else, so these colour-code on the
 * phone: SITUATION violet · ROOM blue · MOOD green · OPEN gold · SAY gold ·
 * DO blue · NOTE grey.
 *
 * Keyed `kind:id` — the deck's cover and the result-preview segment slide are
 * both `result-preview-0`.
 */

const L = (...lines) => lines.join('\n');

module.exports = {
  sessionId: '3a3e17cc-ad07-4d2b-82f1-06e167211492',

  slideNotes: {
    /* ----------------------------------------------------- result preview -- */
    'segment:result-preview-0': L(
      'SITUATION: First content slide of Build Day. Monday was the argument; tonight is the receipt. Show the finished thing before any theory.',
      'ROOM: Have a WORKING version of tonight’s end state on your screen, ready to demo — not a slide about it.',
      'MOOD: Confident and concrete. No hedging about what they will get done.',
      'OPEN: "By the end of tonight this exists: a server that borrows a model, reports while it works, stays in its folder, and touches a system your business actually uses."',
      'DO: Run the finished thing once, live, before you explain any of it. Thirty seconds.',
      'NOTE: Do not enumerate the four upgrades here — the build map does that on the next slides. Sell the outcome, not the agenda.',
    ),
    'storybeat:result-preview-900': L(
      'SITUATION: Opening story beat. It names the threshold the whole night is about — the first time something you built has a phone number attached.',
      'ROOM: Story card full screen. Step back from the keyboard.',
      'MOOD: Slow and slightly serious. This one is meant to land uncomfortably.',
      'OPEN: "There is a specific moment in every engineer’s career, and it is a slightly uncomfortable one."',
      'DO: Ask who has ever been on call. Take two hands, no discussion — you are marking the threshold, not opening a thread.',
      'SAY: You are not making it smarter tonight. You are making it something you would be willing to be responsible for.',
      'NOTE: Tell it, let it land, move. Do not over-explain — the build itself is the argument.',
    ),

    /* ---------------------------------------------------------- build map -- */
    'checkpoint:build-map-2': L(
      'SITUATION: CP1 — sampling and notifications are in. This is the biggest single jump of the night and where the room spreads out most.',
      'ROOM: Your Inspector visible, so you can show ticks arriving while you talk.',
      'MOOD: Encouraging. Some people will be behind here and that is expected.',
      'OPEN: "Checkpoint one. Your server should now be able to ask the client to think, and to tell you what it is doing while it works."',
      'DO: VERIFY, do not assume — ask for a show of hands on two specific things: a sampling call that returned, and progress ticks visible in the Inspector.',
      'NOTE: Do not advance on the pulse rail alone. Sampling can look done and still have no client half wired — that is the half everybody forgets.',
    ),
    'checkpoint:build-map-3': L(
      'SITUATION: CP2 — roots enforced and the transport decision built. The security checkpoint of the night.',
      'ROOM: Your fake-file setup ready, in case you want to show a denial.',
      'MOOD: Firm. This is the checkpoint with a right answer.',
      'OPEN: "Checkpoint two. Your server now refuses to leave its own folder, and it is running the transport you defended on Monday."',
      'DO: Ask specifically: has anyone RUN an escape attempt against their own server and watched it be denied? Not "did you add the check" — did you attack it.',
      'NOTE: If the code and their Monday decision record disagree, one of them is wrong. Say that out loud and make them reconcile it before CP3.',
    ),
    'checkpoint:build-map-4': L(
      'SITUATION: CP3 — the integration. This is the checkpoint that makes tonight real, and the one most likely to run long.',
      'ROOM: Watch the clock here. Failure and recovery still have to happen after this.',
      'MOOD: Steady. Do not let the room panic about the finish line.',
      'OPEN: "Checkpoint three. It is now touching something your business actually depends on."',
      'DO: Ask for one person to say out loud WHICH system theirs reaches. Naming it makes it real for the rest of the room.',
      'NOTE: If most of the room is not at CP3 with twenty minutes left, cut the second failure drill rather than the ship gate. The gate is the graded part.',
    ),
    'storybeat:build-map-900': L(
      'SITUATION: The handover story, sitting just before the build. It is the callback to Marcus from Monday and the reason the logging work matters.',
      'ROOM: Story card full screen. Hold it — resist jumping into the build.',
      'MOOD: Reflective, brief. Sixty seconds.',
      'OPEN: "The best compliment an integration ever gets is that somebody else fixed it."',
      'SAY: Marcus from Monday could not hand his integration over. Yours will hand itself over.',
      'NOTE: Anyone who was not here Monday needs one sentence of context on Marcus — the engineer whose nightly job nobody else could read.',
    ),

    /* ------------------------------------------------------------ failure -- */
    'storybeat:failure-900': L(
      'SITUATION: Opens the failure segment. You are about to deliberately break their servers, and this frames why that is a gift rather than a detour.',
      'ROOM: Story card up. Have your own fake environment file already planted for the demo that follows.',
      'MOOD: Light — this segment should feel like play, not punishment.',
      'OPEN: "Nobody runs a fire drill because they expect a fire on Tuesday."',
      'SAY: The first time your system fails should never be the first time you have seen it fail.',
      'DO: Say plainly that everything they break in the next fifteen minutes is intentional, so nobody thinks they have ruined their build.',
    ),
    'storybeat:failure-901': L(
      'SITUATION: The Act II closing beat. Last story of the intensive — it earns the ship gate that follows.',
      'ROOM: Story card full screen. Class clock still running; you have time, do not rush this.',
      'MOOD: Warm and genuinely proud. This is the emotional close of six weeks.',
      'OPEN: "Six weeks ago you were asking an AI for help. Tonight it reached a system your business depends on."',
      'DO: Walk the ladder out loud — approved every action, then a bounded job unattended, then judgement a team could reuse, now a real system.',
      'SAY: Apprentice in Act I. Journeyman with a crew in Act II. In Week 12, the one who signs the drawings.',
      'NOTE: Let the room sit in it for a beat before the ship gate. This is the payoff for the whole intensive — do not step on it.',
    ),
  },
};

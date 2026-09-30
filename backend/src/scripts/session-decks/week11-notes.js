/**
 * week11-notes.js — presenter commentary for the generated slides in Week 11.
 *   Mon 2026-10-05  Architecture Day  (12)
 *   Thu 2026-10-08  Build Day          (8)
 *
 * Week 11 is Systems Architecture + the Architecture Package. Its spine is the
 * signature on the drawings: ten weeks of building, and this is the week they
 * learn to sign — to justify decisions rather than just make them. Week 12 is
 * one week away, so every beat points at standing in front of a panel.
 */

const L = (...lines) => lines.join('\n');

const MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The single-sentence hook. First thing you say tonight.',
    'ROOM: Full screen, one sentence. Nothing else on the display.',
    'MOOD: Level. The sting is in the second half — do not rush to it.',
    'OPEN: "Your system works. Nobody can tell why it is the way it is — including you, in six months."',
    'NOTE: Three seconds of silence. "Including you" is the part that lands; let them get there.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show the finished architecture package before any theory.',
    'ROOM: Have a real package on screen — diagram, decision records, a scored self-assessment.',
    'MOOD: Concrete and a little formal. This is the artifact they defend next week.',
    'OPEN: "By Thursday you have the document you hand a panel — the drawing, the reasoning, and an honest score."',
    'DO: Open one decision record and read a single rationale line out loud. Ten seconds, before any explanation.',
    'NOTE: Sell the defensibility, not the format. Nobody is excited about documentation; they are excited about being able to answer.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: The signature beat. It reframes ten weeks of building as an apprenticeship that ends this week.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Weighty and warm. This is a rite-of-passage beat.',
    'OPEN: "On every building site, one set of drawings carries a signature."',
    'SAY: You have been building for ten weeks. This is the week you learn to sign.',
    'DO: Ask who has ever signed off on something professionally. Take two — most will say never, which is the point.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Turn from "it works" to why anyone needs the reasoning written down.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and commercial. Keep syntax out of this segment entirely.',
    'OPEN: "A system nobody can explain is a system nobody can change, and eventually nobody will."',
    'NOTE: Fifteen minutes. Stay on the business stakes — the package format comes after the break.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The binder-versus-memo story. It sets the standard for the package they build Thursday: short and interrogable.',
    'ROOM: Story card full screen.',
    'MOOD: Dry. There is a joke in here and it is allowed to land.',
    'OPEN: "The ninety-page binder nobody opened, and the two-page memo everybody did."',
    'SAY: A document is not measured by its length. It is measured by whether anybody ever interrogates it.',
    'NOTE: Aim this at anyone about to write forty pages on Thursday. Length is not the deliverable.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the main teaching block — the architecture package and its parts.',
    'ROOM: Diagram up. Walk it left to right, naming each part of the package once.',
    'MOOD: Settle in. This is the longest stretch of teaching tonight.',
    'OPEN: "Three things a panel actually asks for: what you built, why it is that way, and how good you think it is."',
    'DO: Ask which of the three they would find hardest to produce right now. Most say the second — that is the week.',
    'NOTE: Do not teach the parts here. This is the map; each gets its own slide.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: The tenant beat. It puts the model in its place — the AI is a component, not the achievement.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Slightly deflating, on purpose. This is the week the model stops being the headline.',
    'OPEN: "The smartest thing in the building is a tenant on the fourth floor."',
    'SAY: Nobody was ever impressed by a tenant. They are impressed by a building that stands up.',
    'NOTE: Anyone whose demo leads with "it uses Claude" needs this beat. The panel cares about the structure around it.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. You are about to autopsy decisions nobody recorded.',
    'ROOM: Opener on screen. Keep it short — the autopsies are the content.',
    'MOOD: Shift gear. Detective, not lecturer.',
    'OPEN: "Two systems that work. Neither one can tell you why it is the way it is."',
    'NOTE: The door into the segment, not the segment. Do not linger.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The eight-second-timeout story. This is why decision records exist, told as a loss rather than a rule.',
    'ROOM: Story card full screen.',
    'MOOD: Quiet. Everyone in the room has inherited a number like this.',
    'OPEN: "She left in March, and by June nobody could say why the timeout was eight seconds."',
    'SAY: A decision you cannot explain is a decision you no longer own. You just live with it.',
    'DO: Ask for one magic number in their own system that nobody can justify. There is always one.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens. The first decision record goes into their own project.',
    'ROOM: Your terminal and Claude Code visible. Mentors standing.',
    'MOOD: Energy change — stop presenting, start working alongside them.',
    'OPEN: "One decision you already made, written down so that in six months somebody can argue with it."',
    'DO: Say out loud that every block tonight is a prompt; Claude Code drives the terminal, nobody types shell.',
    'NOTE: The rationale must be theirs. A decision record written by the model is not a decision they can defend next week.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: The self-score beat, mid-build. It sets the honesty standard for the scored assessment.',
    'ROOM: Story card up. Sixty seconds — hands can stay on keyboards.',
    'MOOD: Wry and encouraging. Honesty scores better than optimism, and this beat proves it.',
    'OPEN: "The team that gave itself a five, and got asked to prove it."',
    'SAY: A number you cannot show is worth less than a low number you can.',
    'NOTE: This is your defence against everyone scoring themselves five out of five on Thursday. Use it before they start.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide. Close on the signature and point at Week 12.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Land it. This is the last ordinary Monday before the capstone.',
    'OPEN: "Thursday we build the package — the drawing, the reasoning, and a score you can defend."',
    'SAY: Next week is the dragon. Thursday you write the thing you will be holding.',
    'NOTE: End on the callback, not logistics.',
  ),
};

const THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: First content slide of Build Day, and the last build night before the capstone.',
    'ROOM: Have a complete package on screen — diagram, decision records, scored assessment.',
    'MOOD: Concrete and steady. Nerves about next week start showing up tonight.',
    'OPEN: "By tonight you are holding the document you defend next Thursday."',
    'DO: Show the finished package once, live, before explaining any of it.',
    'NOTE: Do not list checkpoints here — the build map does that next.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening beat. It separates the demo from the artifact that gets funded.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Brief and dry. Sixty seconds.',
    'OPEN: "You can love a house. The bank funds the inspection report."',
    'SAY: Nobody funds a tour. They fund a report — and tonight you write yours.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — mapped. The system diagram exists and lives in the repo.',
    'ROOM: Your own diagram open, in text form, so you can show it being diffed.',
    'MOOD: Encouraging. Some people will want to make it beautiful; steer them to accurate.',
    'OPEN: "Checkpoint one. There is a drawing, it is in your repository, and it matches what you actually built."',
    'DO: VERIFY it matches — ask who has a component on their diagram that does not exist in the code, or vice versa.',
    'NOTE: A pretty diagram that is wrong is worse than an ugly one that is right. Say that before they start decorating.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — justified. The decision records. This is the checkpoint that takes longest and matters most next week.',
    'ROOM: Watch the clock. The scoring checkpoint and the drills still need time.',
    'MOOD: Firm. This is what a panel actually interrogates.',
    'OPEN: "Checkpoint two. Every decision that could have gone another way now says why it went this way."',
    'DO: Ask one person to read a rationale out loud. If it does not name the option they REJECTED, it is not finished.',
    'NOTE: The rejected alternative is the tell. A record with only the chosen path is a description, not a justification.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — scored. Honest self-assessment, and the checkpoint people most want to inflate.',
    'ROOM: Clock visible. If the room is short on time, cut a drill rather than the harden step.',
    'MOOD: Steady and honest. Reward low scores that come with evidence.',
    'OPEN: "Checkpoint three. A number for each dimension, and something you can point at behind every one."',
    'DO: Ask for one person’s LOWEST score and what evidence it rests on. Praise that publicly — it sets the standard.',
    'NOTE: Call back to Monday: a number you cannot show is worth less than a low number you can.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The wiped-laptop beat, just before the build. It is why the diagram must be text in the repo.',
    'ROOM: Story card up. Hold it — resist jumping into CP0.',
    'MOOD: Matter-of-fact, brief.',
    'OPEN: "The diagram was right. It was right on a laptop that got wiped in March."',
    'SAY: A diagram that cannot be diffed will be wrong within a month, and nobody will be able to tell when it happened.',
    'NOTE: Use this on anyone about to draw their architecture in a design tool and screenshot it.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The prompt-injection beat, in the failure segment. It is the boundary they did not draw on their diagram.',
    'ROOM: Story card up. Have the poisoned-document example ready to show.',
    'MOOD: Alert rather than alarming. This is a gap, and gaps are findable.',
    'OPEN: "The poisoned document that asked, very politely, for a refund."',
    'SAY: The boundary you did not draw is the one they find first.',
    'DO: Send them back to their CP1 diagram to mark where untrusted input actually enters. Most diagrams do not show it.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: Closing beat of the last ordinary build night. It points directly at the panel, one week out.',
    'ROOM: Story card full screen. Clock still running; do not rush.',
    'MOOD: Warm and steadying. Nerves are real tonight — this beat is reassurance, not pressure.',
    'OPEN: "Next Thursday somebody who was not here asks you why."',
    'SAY: The package is not for the panel. It is for you, standing there, with an answer.',
    'NOTE: Let it sit before the ship gate. This is the last beat before capstone week.',
  ),
};

module.exports = {
  sessions: [
    { id: '5514d32b-0bec-4d32-8996-87d7c6b9c46b', label: 'Week 11 Mon 10/5', slideNotes: MONDAY },
    { id: '88aa0efd-973c-4c1c-88c5-000cd3f9957d', label: 'Week 11 Thu 10/8', slideNotes: THURSDAY },
  ],
};

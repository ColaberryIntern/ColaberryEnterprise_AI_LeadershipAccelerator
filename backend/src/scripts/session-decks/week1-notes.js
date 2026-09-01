/**
 * week1-notes.js — presenter commentary for the generated slides in Orientation
 * and Week 1.
 *   Thu 2026-07-23  Orientation  (4)
 *   Mon 2026-07-27  Week 1 Architecture Day  (12)
 *   Thu 2026-07-30  Week 1 Build Day  (10)
 *
 * These are the room's first three nights. Two things run through every note:
 * nobody is behind yet, and tonight's bar is one thing that actually ran. The
 * dragon gets promised here and is not paid off until Week 12, so the beats
 * that plant it are marked as such — an instructor who skips them removes a
 * callback twelve weeks of material depends on.
 *
 * Week 1 Build Day has FIVE checkpoints, not the usual three-plus-CP0. Its
 * notes are written for that.
 */

const L = (...lines) => lines.join('\n');

const ORIENTATION = {
  'storybeat:welcome-900': L(
    'SITUATION: Very first story beat of the entire program. Half the room is quietly deciding whether they belong here.',
    'ROOM: Story card full screen. Stand still. Nothing else on the display.',
    'MOOD: Warm and completely unhurried. Your calm is what people take home from tonight.',
    'OPEN: "Two kinds of people walk into a room like this one."',
    'SAY: Nobody in this room is behind yet. That only becomes true if you decide it is.',
    'NOTE: Somebody here is the least technical person in the cohort and already knows it. This beat is for them — deliver it to the room, mean it for them.',
  ),
  'storybeat:big-picture-900': L(
    'SITUATION: The dragon gets promised. This is the single most-referenced beat in the program — Weeks 6, 9, 11 and 12 all call back to it.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: A little ceremonial. You are making a promise, so make it like one.',
    'OPEN: "Every builder starts as an apprentice."',
    'SAY: You are not here to watch someone else fight it. You are here to fight it yourself, with a net.',
    'NOTE: Do NOT skip or compress this. Week 12 opens by saying "you were told about the dragon on your first night" — this is that night. If you cut it, that payoff has nothing to land on.',
  ),
  'storybeat:platform-900': L(
    'SITUATION: The compounding beat. It inoculates against the week-three slump before anyone feels it.',
    'ROOM: Story card full screen.',
    'MOOD: Steady and reassuring. This is preventative medicine.',
    'OPEN: "Nobody notices day 3. Everyone notices week 12."',
    'SAY: The summit is not visible from base camp. That is normal, not a warning sign.',
    'NOTE: Week 12 replays this beat almost word for word, as a look-back. Plant it cleanly now.',
  ),
  'storybeat:setup-900': L(
    'SITUATION: Last beat before hands-on setup. It sets tonight’s bar deliberately low, on purpose.',
    'ROOM: Story card up. Mentors should already be moving toward anyone who looks lost.',
    'MOOD: Light and permission-giving. Relief, not challenge.',
    'OPEN: "Everyone in this room feels behind their first week. That is the baseline, not a red flag."',
    'SAY: Tonight the goal is not mastery. It is one prompt, one plan, one thing that actually ran.',
    'DO: Say the bar out loud before setup starts, so nobody measures themselves against the fastest person in the room.',
  ),
};

const W1_MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The hook that opens Week 1 and names the whole program’s premise.',
    'ROOM: Full screen, one sentence. Nothing else.',
    'MOOD: Crisp. This is a turn, not a threat.',
    'OPEN: "You gave AI an answer to type. Now it can act."',
    'NOTE: Three seconds of silence. Most of this room has only ever used chat — the word "act" is the whole distinction.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show the finished workspace before any theory.',
    'ROOM: Have a real governed project open — CLAUDE.md, a plan, a run.',
    'MOOD: Concrete and encouraging. First week: sell that it is achievable.',
    'OPEN: "By Thursday you have a workspace with rules, a plan you approved, and something that actually ran."',
    'DO: Run one small real thing live before explaining anything. Ten seconds.',
    'NOTE: Do not oversell. Week 1 confidence is fragile — promise exactly what they will get.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: Right after the prediction poll. It makes being wrong safe, which is the whole culture of this program.',
    'ROOM: Story card up. Poll results still fresh in the room’s mind.',
    'MOOD: Playful. Being wrong tonight should feel like a game.',
    'OPEN: "You just made a prediction. Hold onto it — you will be wrong or right in about ten minutes, on purpose."',
    'SAY: Being wrong in the next two hours is the whole point. Being wrong in production next month is what we are training you to avoid.',
    'NOTE: Set this norm hard in Week 1. Every later failure drill depends on the room being comfortable being wrong out loud.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Turn from "the tool is cool" to why a business cares.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and commercial. Keep syntax out of this segment entirely.',
    'OPEN: "An assistant that answers is useful. An agent that acts is a different category of thing."',
    'NOTE: Fifteen minutes. This is the segment that gets clipped for social — stay on the business stakes.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The four-days story. It makes "acting" concrete rather than abstract.',
    'ROOM: Story card full screen.',
    'MOOD: Matter-of-fact. Everyone has been that customer.',
    'OPEN: "The chatbot gave the right answer. The customer waited four more days anyway."',
    'SAY: An agent does not just answer the ticket. It opens the tools, makes the change, and closes the loop.',
    'DO: Ask for one thing in their own work that stalls between "we know the answer" and "someone did it".',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the main teaching block — modes, context, and the workspace.',
    'ROOM: Diagram up. Walk it left to right, naming each part once.',
    'MOOD: Settle in. Longest teaching stretch of the night.',
    'OPEN: "Three things decide whether this works: what it can see, what it is allowed to do, and how much you trust it right now."',
    'DO: Ask who has already used Claude Code. Adjust pace on the answer — in Week 1 the spread is enormous.',
    'NOTE: Do not teach the modes here. This is the map; the next slides do the work.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: The trust-modes beat. It reframes Manual/Plan/Auto as judgement rather than preference.',
    'ROOM: Story card full screen.',
    'MOOD: Practical. This is the most immediately usable idea of the night.',
    'OPEN: "Manual, Plan and Auto are not settings. They are how much you trust the runway."',
    'SAY: The skill is not picking a favourite mode. It is reading the terrain correctly, every single time.',
    'NOTE: Anyone who asks "which mode should I always use" has missed it. That question is the teaching moment — take it.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. You are about to show it going wrong, in week one, on purpose.',
    'ROOM: Opener on screen. Keep it short.',
    'MOOD: Shift gear. Curious, not cautionary.',
    'OPEN: "Here is the same tool, doing the wrong thing confidently. This is not rare."',
    'NOTE: The door into the segment. Do not linger.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The dragon named for the first time in a technical context — the confident wrong answer.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Alert but calm. This is a named, survivable problem, not a reason to distrust the tool.',
    'OPEN: "This is the dragon almost every builder in this room will eventually meet."',
    'SAY: You do not slay this dragon by trusting it less. You slay it by being specific enough that it cannot wander.',
    'NOTE: Ties back to Orientation’s dragon promise and forward to Week 12. Say the word "dragon" deliberately — it is load-bearing vocabulary.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens. First hands-on moment of the entire program.',
    'ROOM: Your terminal and Claude Code visible. Mentors standing, not sitting.',
    'MOOD: Energy change, and be extra patient. Some people are installing software for the first time in years.',
    'OPEN: "One workspace, one rule file, one prompt that runs. That is tonight."',
    'DO: Say the bar out loud again — one thing that runs. Nobody is measured against the fastest person here.',
    'NOTE: Watch the pulse rail closely. Week 1 is where people silently fall behind and never say so.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: Mid-build reassurance beat, aimed at whoever is slowest in the room.',
    'ROOM: Story card up. Sixty seconds — hands can stay on keyboards.',
    'MOOD: Kind and genuinely meant. Do not throw this one away.',
    'OPEN: "The first person to get it working tonight will not be the best builder in this room."',
    'SAY: Tonight the goal is not mastery. It is one prompt, one plan, one thing that actually ran.',
    'NOTE: Deliver this while people are still visibly struggling, not after. It only helps if it arrives during the struggle.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide of the first real class. Set up Thursday and send them out confident.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Warm and definite. First impressions of the program get set right here.',
    'OPEN: "Thursday we build the foundation — rules, a plan you approve, and a project that runs."',
    'SAY: You came in tonight as somebody who asks AI for answers. You leave Thursday with something you directed.',
    'NOTE: End on the callback, not on homework. Logistics first, then the line, then stop.',
  ),
};

const W1_THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: First content slide of the first Build Day. Show the finished foundation before theory.',
    'ROOM: Have a governed project open — CLAUDE.md, an approved plan, a clean run.',
    'MOOD: Concrete. Week 1 Build Day is where confidence gets built or lost.',
    'OPEN: "By 8:30 you have a workspace with rules, an approved plan, and a foundation you can build on for eleven weeks."',
    'DO: Show the finished thing once, live, before explaining any of it.',
    'NOTE: Do not list checkpoints here — the build map does that next.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening beat. It argues that tonight’s unglamorous work decides how hard the rest of the program is.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Brief and matter-of-fact. Sixty seconds.',
    'OPEN: "Nobody ever praises a foundation. They only ever notice a bad one."',
    'SAY: You are not making folders tonight. You are deciding how hard the next eleven weeks are going to be.',
  ),
  'teach:build-map-200': L(
    'SITUATION: The night’s target, stated before any checkpoint. Week 1 has FIVE checkpoints, more than any other week.',
    'ROOM: Build map on screen. Count the five out loud with your hand.',
    'MOOD: Organised and calm. Five steps sounds like a lot — make it sound sequential, not overwhelming.',
    'OPEN: "Five checkpoints tonight, and they go in order. Nobody skips ahead, because each one is the input to the next."',
    'NOTE: Say explicitly that five is more than usual because this is the foundation everything else sits on.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — governance verified. The rules file exists and Claude Code is actually reading it.',
    'ROOM: Your own CLAUDE.md open so you can show a real one.',
    'MOOD: Encouraging. This is the first checkpoint of the program for most people.',
    'OPEN: "Checkpoint one. There are rules, and it is actually following them."',
    'DO: VERIFY it is being read — ask who has seen Claude Code obey something in their rules file. Having the file is not the checkpoint.',
    'NOTE: A CLAUDE.md that exists but has never changed behaviour is decoration. Push for the proof.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — architecture approved. The first time they say no to a plan.',
    'ROOM: Have a deliberately flawed plan ready to demo rejecting.',
    'MOOD: This is the important one. Slow down here.',
    'OPEN: "Checkpoint two. You read a plan and decided whether it was right — before anything got built."',
    'DO: Ask who CHANGED something in the plan before approving. Anyone who approved instantly did not do the exercise.',
    'NOTE: Approving without reading is the failure mode this checkpoint exists to catch. Name it out loud.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — foundation built. The plan becomes real files.',
    'ROOM: Watch the clock. Two checkpoints still to come.',
    'MOOD: Brisk. This one usually goes smoothly.',
    'OPEN: "Checkpoint three. The plan you approved now exists on disk."',
    'DO: Ask whether what got built matches what they approved. If it does not, that is tonight’s most valuable finding.',
  ),
  'checkpoint:build-map-5': L(
    'SITUATION: CP4 — foundation validated. The last checkpoint, and the one people want to skip.',
    'ROOM: Clock visible. Failure and recovery still need their time.',
    'MOOD: Firm but warm. Validation is the habit being installed here.',
    'OPEN: "Checkpoint four. You checked. Not it — you."',
    'DO: Ask one person what they checked and how. "It looked fine" is not validation, and week one is the right time to say so.',
    'NOTE: This is the seed of the verification discipline that runs through Weeks 9 and 12. Plant it properly.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The surveyor beat, just before the build. It defends the approval gate they are about to use.',
    'ROOM: Story card up. Hold it — resist jumping to CP0.',
    'MOOD: Matter-of-fact, brief.',
    'OPEN: "The surveyor walks the land before anyone brings a shovel."',
    'SAY: The approval gate is not ceremony. It is the last moment where changing your mind is free.',
    'NOTE: Keep this for anyone impatient with Plan Mode tonight. It is the cheapest argument you have.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The confident-wrong-answer beat, in the failure segment. Week 1’s version of the dragon.',
    'ROOM: Story card up. Ideally have a real confident-but-wrong output to show.',
    'MOOD: Alert, not alarming. This is a known, survivable failure.',
    'OPEN: "It did not hesitate, it did not warn you, and its reason sounded better than yours."',
    'SAY: The scary version of this is not the one that crashes. It is the one that sounds right.',
    'NOTE: This thread runs all the way to Week 8’s "succeeded at doing the wrong thing". Start it cleanly.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: Closing beat of the first build week. It names what they actually did tonight — direction, not typing.',
    'ROOM: Story card full screen. Clock still running; do not rush.',
    'MOOD: Warm and genuinely proud. First real win of the program.',
    'OPEN: "You read a plan, found the thing that was wrong with it, and said no."',
    'SAY: Directing an engineer is mostly this: knowing what you asked for well enough to notice when you did not get it.',
    'NOTE: Let it sit before the ship gate. For a lot of the room this is the moment the program clicks.',
  ),
};

module.exports = {
  sessions: [
    { id: '67286e2f-286e-4c97-8af6-84f6cb30c55e', label: 'Orientation 7/23', slideNotes: ORIENTATION },
    { id: '7963d352-b9c5-41de-9c77-e4a779678e10', label: 'Week 1 Mon 7/27', slideNotes: W1_MONDAY },
    { id: 'ff28f145-84d1-4844-af94-d7e8ef485520', label: 'Week 1 Thu 7/30', slideNotes: W1_THURSDAY },
  ],
};

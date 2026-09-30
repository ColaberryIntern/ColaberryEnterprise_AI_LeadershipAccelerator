/**
 * week12-notes.js — presenter commentary for the generated slides in Week 12.
 *   Mon 2026-10-12  Architecture Day  (12)
 *   Thu 2026-10-15  Build Day — the Architect Expo  (8)
 *
 * The last week. Its spine is the dragon promised at Orientation, now arriving
 * exactly as described. Monday is the freeze and the rehearsal; Thursday is the
 * Expo itself. Two things run through every beat: certainty is cheap, and the
 * panel is grading whether they know what happens when it fails — not whether
 * it fails.
 *
 * Tone note for the whole week: these people are nervous. Every beat here is
 * written to steady them rather than raise the stakes. The stakes are already
 * obvious to everyone in the room.
 */

const L = (...lines) => lines.join('\n');

const MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The single-sentence hook, and the hardest instruction of the program: stop building.',
    'ROOM: Full screen, one sentence. Nothing else on the display.',
    'MOOD: Calm and final. This is permission, not pressure — deliver it that way.',
    'OPEN: "Tonight you stop building. That is not a compromise. It is the last architecture decision of the program."',
    'NOTE: Somebody in the room is planning one more feature this week. This sentence is aimed at them; let the silence find them.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise, final week. Show what they will be holding on Thursday.',
    'ROOM: Have a complete expo-ready state on screen — frozen tag, package, and a clean run.',
    'MOOD: Steady and confident on their behalf. They are closer to ready than they feel.',
    'OPEN: "By Thursday you have a frozen system, a rehearsed defence, and evidence you can point at when someone asks why."',
    'DO: Run the frozen system once, live, before explaining anything. Let them see that it just works.',
    'NOTE: Do not add anything to the deliverable tonight. Everything from here is subtraction and rehearsal.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: The dragon arrives. Twelve weeks ago this was a metaphor; tonight it is on the calendar.',
    'ROOM: Story card full screen. Away from the keyboard. Take your time.',
    'MOOD: Warm and ceremonial. This is the emotional opening of the final week.',
    'OPEN: "Orientation told you there was a dragon in Week 12. This is Week 12."',
    'SAY: You were told this was coming on the first night. It was never a surprise. It was a promise.',
    'DO: Ask who remembers hearing it on night one. Hands will go up — let the room see how many.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Why a defensible system matters beyond passing the Expo.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and forward-looking. This is the week their work stops being coursework.',
    'OPEN: "What you defend on Thursday is the same thing you will defend in a review at work. Same questions, lower stakes here."',
    'NOTE: Fifteen minutes. Keep it on what happens after the program — that is what settles nerves.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The ruined-take story — the argument for freezing, told as craft rather than caution.',
    'ROOM: Story card full screen.',
    'MOOD: Knowing and a bit rueful. Everyone has over-polished something into the ground.',
    'OPEN: "Every recording engineer knows the take that got ruined by one more improvement."',
    'SAY: You are not freezing because it is finished. You are freezing because it works, and you would like it to keep working on Thursday.',
    'NOTE: This is the beat to point back at every time somebody proposes a change between now and Thursday.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener. Tonight is freeze, rehearse, and evidence — not construction.',
    'ROOM: Diagram up. Walk it once; this segment is shorter than usual by design.',
    'MOOD: Practical and calm. Give them a sense that the remaining work is small and known.',
    'OPEN: "Three things left: freeze it, rehearse it, and know where the evidence lives. Nothing gets built."',
    'DO: Ask what each person still thinks they need to finish. Most answers are things they should cut — say so gently.',
    'NOTE: Every "just one more thing" you hear here is a Thursday failure. Push back now, kindly and firmly.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: The look-back beat. Twelve weeks of progress is invisible from inside it.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Genuinely warm. Slow right down — this is the beat that steadies the nervous ones.',
    'OPEN: "Nobody notices day 3. It is week 12 now. Turn around and look back down."',
    'SAY: The summit is not visible from base camp. That was true in week one, and it is why you should look now.',
    'DO: Ask one person what they could not do in Week 1 that they did last week. Take two answers and let them land.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. You are about to deconstruct defences, not systems — what a good answer sounds like.',
    'ROOM: Opener on screen. Keep it short.',
    'MOOD: Shift gear. This segment is about presenting, not engineering.',
    'OPEN: "Two defences. Same quality of system. Only one of them survived the questions."',
    'NOTE: The door into the segment. The autopsies are the content.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The three-words beat, and the single most useful thing you can give them before Thursday.',
    'ROOM: Story card full screen.',
    'MOOD: Quiet and important. This is the line they will actually use on stage.',
    'OPEN: "The most senior person in the room said three words, and the room relaxed."',
    'SAY: Certainty is cheap, and everyone can hear that it is cheap. "I do not know, here is how I would find out" is the expensive one.',
    'DO: Have the room say "I do not know, here is how I would find out" out loud, once, together. It feels silly. Do it anyway.',
    'NOTE: This is the highest-value sentence of the entire week. Do not let it go by in ten seconds.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens — but tonight it is freeze and rehearsal, not construction.',
    'ROOM: Your terminal and Claude Code visible. Say the word "freeze" out loud before anyone starts.',
    'MOOD: Calm and procedural. No heroics tonight.',
    'OPEN: "Nothing new gets built in the next thirty minutes. You freeze what works and you rehearse defending it."',
    'DO: Say out loud that every block tonight is a prompt; Claude Code drives the terminal, nobody types shell.',
    'NOTE: Watch for anyone quietly adding a feature. Stop them personally — that is the failure mode of this exact segment.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: The full-circle beat. Week 2 said knowledge in one head is the enemy; twelve weeks later it lives in a system.',
    'ROOM: Story card up. Sixty seconds — hands can stay on keyboards.',
    'MOOD: Warm and quietly proud.',
    'OPEN: "In Week 2 the analyst was out, so the check nobody else knew how to run did not get run."',
    'SAY: Twelve weeks ago the knowledge lived in one head. It now lives in a system that can be read, tested, and handed to someone else.',
    'NOTE: This closes the thread that started in Week 2 and ran through Marcus in Week 6. Name that arc if the room was there for it.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide of the final Monday. Set up the Expo without raising the stakes.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Steady and warm. They are nervous; be the calmest person in the room.',
    'OPEN: "Thursday is the Expo. You present the frozen system, you answer the questions, and you certify."',
    'SAY: Bring the tag, the package, and the sentence we practised. That is all you need.',
    'NOTE: End on reassurance, not on requirements. Say the logistics first, then the reassurance, then stop.',
  ),
};

const THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: The Expo. Final class of the program. People are nervous before you say a word.',
    'ROOM: Everything ready before anyone arrives — no setup in front of the room tonight.',
    'MOOD: Calm, warm, and completely unhurried. Your steadiness is the deliverable in the first five minutes.',
    'OPEN: "Tonight you present a system you froze, defend the decisions you wrote down, and certify what you built."',
    'DO: Say the running order out loud and stick to it. Certainty about the format removes half the anxiety in the room.',
    'NOTE: Do not add anything to the bar tonight. Everyone here already knows what is at stake.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening beat of the final night. It tells them showing up was the differentiator.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Warm and genuine. Say it like you mean it, because it is true.',
    'OPEN: "Two kinds of people walked into that first room. Tonight decided which one you were."',
    'SAY: Nobody in this room is behind. You are the people who showed up for the week that decides it.',
    'NOTE: Somebody arrived tonight convinced they are the least prepared person here. This beat is for them.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — frozen run. Nothing proceeds until the tag runs green tonight.',
    'ROOM: Clock visible. This is a hard gate; presentations cannot start without it.',
    'MOOD: Procedural and calm. Treat a red run as information, not disaster.',
    'OPEN: "Checkpoint one. The tag runs, tonight, in front of you."',
    'DO: VERIFY tonight, not Monday — ask who has run it in the last hour. A Monday green is not evidence about now.',
    'NOTE: If someone is red at the tag, they present from the recording and say so honestly. That is a legitimate path, not a failure — tell them that before they panic.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — presented. The defence itself.',
    'ROOM: Timer visible for each presenter. Protect the schedule so everyone gets their full slot.',
    'MOOD: Generous. Be the friendliest face in the room while they are up there.',
    'OPEN: "Checkpoint two. You stand up, show the system, and answer what comes."',
    'DO: Ask at least one hard question of every presenter — a defence that was never tested is not a defence.',
    'NOTE: When someone says "I do not know, here is how I would find out", say out loud that it was the right answer. Reward it publicly the first time it happens.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — certified. The final checkpoint of the program.',
    'ROOM: Have the certification criteria on screen so it is visibly a standard, not an opinion.',
    'MOOD: Formal for a moment, then warm. This is a real credential.',
    'OPEN: "Checkpoint three. Certified — against a standard, not against how the evening felt."',
    'DO: Name each criterion as you certify, so everyone hears what was actually measured.',
    'NOTE: If someone falls short on one criterion, say exactly which and what closes it. Vague encouragement helps nobody at this point.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The net beat, right before presentations. Pure reassurance, deliberately placed.',
    'ROOM: Story card up. Hold it. Do not rush into the first presenter.',
    'MOOD: The calmest beat of the night. Slow your voice down.',
    'OPEN: "Orientation promised you would face the dragon with a net. This is the net."',
    'SAY: You are not being thrown at this. You have been walking toward it for twelve weeks with people who tested every part of the net.',
    'NOTE: Deliver this immediately before the first presenter stands up. That is where it does the most good.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The failed-demo beat. Says plainly that a broken demo can be the best presentation of the day.',
    'ROOM: Story card up. Ideally deliver this BEFORE anyone has failed, so it is reassurance rather than consolation.',
    'MOOD: Light and certain. This one removes real fear.',
    'OPEN: "The demo died at minute two, and it was the best presentation of the day."',
    'SAY: The panel is not grading whether your system fails. They are grading whether you know what happens when it does.',
    'NOTE: If a demo has already failed tonight, name that presenter and say they did the hard version well.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: The final beat of the entire program. Everything lands here.',
    'ROOM: Story card full screen. Stop the clock first. Nothing after this but the close.',
    'MOOD: Warm, proud, unhurried. Let the silence at the end sit longer than is comfortable.',
    'OPEN: "It is 2 AM. It ran. It worked. Nobody noticed. That is the whole point."',
    'SAY: You did not build something impressive. You built something boring at 2 AM, which is much harder and worth much more.',
    'NOTE: This closes the 2 AM thread that started in Week 3 and ran through Weeks 6, 9 and 10. Name that arc — twelve weeks of one question, answered.',
  ),
};

module.exports = {
  sessions: [
    { id: 'e75b3b23-c00f-40e2-adbd-bba35e7c3e1a', label: 'Week 12 Mon 10/12', slideNotes: MONDAY },
    { id: 'babd64c9-23ef-409e-aa56-11695ce1524a', label: 'Week 12 Thu 10/15', slideNotes: THURSDAY },
  ],
};
